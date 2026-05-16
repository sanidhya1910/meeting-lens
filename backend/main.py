from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import os
import uuid
import tempfile
import shutil
from datetime import datetime
from pipeline import extract_audio, transcribe_audio_stream, summarize_transcript, generate_meeting_title, generate_custom_template, DATA_DIR, TEMPLATES_DIR
import json
import asyncio
import threading

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MEETINGS_FILE = os.path.join(DATA_DIR, "meetings.json")

def load_meetings():
    if os.path.exists(MEETINGS_FILE):
        try:
            with open(MEETINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return []
    return []

def save_meetings(meetings):
    with open(MEETINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(meetings, f, indent=2)

@app.get("/api/asr-models")
def get_asr_models():
    return {"models": [
        {"id": "tiny", "name": "Tiny (fastest, lowest accuracy, ~39MB)"},
        {"id": "base", "name": "Base (~74MB)"},
        {"id": "small", "name": "Small (~241MB)"},
        {"id": "medium", "name": "Medium (~769MB)"},
        {"id": "large-v3", "name": "Large v3 (slowest, highest accuracy, ~1.5GB)"}
    ]}

@app.get("/api/templates")
def get_templates():
    templates = []
    if os.path.exists(TEMPLATES_DIR):
        for filename in os.listdir(TEMPLATES_DIR):
            if filename.endswith(".json"):
                file_path = os.path.join(TEMPLATES_DIR, filename)
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()
                    templates.append({
                        "name": filename,
                        "content": content
                    })
                except Exception as e:
                    pass
    return {"templates": templates}

@app.post("/api/templates/generate")
async def create_template(
    description: str = Form(...),
    template_name: str = Form(...),
    llm_provider: str = Form("openai"),
    llm_api_key: str = Form(""),
    llm_base_url: str = Form(""),
    llm_model: str = Form("")
):
    try:
        template_json_str = generate_custom_template(description, llm_provider, llm_api_key, llm_base_url, llm_model)
        # Verify JSON
        try:
            parsed = json.loads(template_json_str)
            template_json_str = json.dumps(parsed, indent=2)
        except Exception:
            pass # save as is if parsing fails, but hopefully valid
            
        filename = template_name.replace(" ", "_").lower()
        if not filename.endswith(".json"):
            filename += ".json"
            
        filepath = os.path.join(TEMPLATES_DIR, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(template_json_str)
            
        return {"success": True, "filename": filename, "content": template_json_str}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/meetings")
def get_all_meetings():
    return {"meetings": load_meetings()}

@app.post("/api/transcribe")
async def transcribe_video(
    file: UploadFile = File(...),
    asr_model: str = Form("base"),
    device: str = Form("cuda"),
    title: str = Form("")
):
    try:
        meeting_id = str(uuid.uuid4())
        video_path = os.path.join(DATA_DIR, f"{meeting_id}_{file.filename}")
        audio_path = os.path.join(DATA_DIR, f"{meeting_id}.wav")
        
        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        print(f"Extracting audio to {audio_path}...")
        await asyncio.to_thread(extract_audio, video_path, audio_path)
        
        print(f"Streaming transcription using {asr_model} on {device}...")
        
        async def event_stream():
            loop = asyncio.get_running_loop()
            q = asyncio.Queue()
            
            def worker():
                try:
                    for chunk in transcribe_audio_stream(audio_path, asr_model, device):
                        asyncio.run_coroutine_threadsafe(q.put(chunk), loop)
                    asyncio.run_coroutine_threadsafe(q.put(None), loop)
                except Exception as e:
                    import traceback
                    traceback.print_exc()
                    error_chunk = f"data: {json.dumps({'error': str(e)})}\n\n"
                    asyncio.run_coroutine_threadsafe(q.put(error_chunk), loop)
                    asyncio.run_coroutine_threadsafe(q.put(None), loop)
                finally:
                    # Clean up huge temporary files to save space
                    try:
                        if os.path.exists(audio_path):
                            os.remove(audio_path)
                        if os.path.exists(video_path):
                            os.remove(video_path)
                    except Exception as cleanup_err:
                        print(f"Error cleaning up files: {cleanup_err}")

            threading.Thread(target=worker, daemon=True).start()
            
            transcript_text = ""
            while True:
                chunk = await q.get()
                if chunk is None:
                    break
                    
                if chunk.startswith("data: ") and "[DONE]" not in chunk:
                    data_str = chunk[6:].strip()
                    try:
                        data_json = json.loads(data_str)
                        if "error" not in data_json:
                            transcript_text += f"[{data_json['start']:.2f}s -> {data_json['end']:.2f}s] {data_json['text']}\n"
                    except:
                        pass
                yield chunk
                
            # Save meeting to library
            try:
                meetings = load_meetings()
                final_title = title if title else f"Meeting {datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}"
                meetings.insert(0, {
                    "id": meeting_id,
                    "title": final_title,
                    "date": datetime.now().isoformat(),
                    "transcript": transcript_text,
                    "summary": None
                })
                save_meetings(meetings)
                yield f"data: {json.dumps({'event': 'completed', 'meeting_id': meeting_id})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                
        return StreamingResponse(event_stream(), media_type="text/event-stream")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/meetings/{meeting_id}/summarize")
async def summarize_meeting(
    meeting_id: str,
    llm_provider: str = Form("openai"),
    llm_api_key: str = Form(""),
    llm_base_url: str = Form(""),
    llm_model: str = Form(""),
    json_template: str = Form("{}"),
    auto_title: str = Form("true")
):
    try:
        meetings = load_meetings()
        meeting = next((m for m in meetings if m["id"] == meeting_id), None)
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
            
        summary_text = summarize_transcript(
            transcript=meeting["transcript"],
            json_template=json_template,
            provider=llm_provider,
            api_key=llm_api_key,
            base_url=llm_base_url,
            model_name=llm_model
        )
        
        from json_repair import repair_json
        try:
            summary_json = json.loads(summary_text)
        except (json.JSONDecodeError, ValueError):
            try:
                repaired = repair_json(summary_text, return_objects=True)
                if isinstance(repaired, (dict, list)):
                    summary_json = repaired
                else:
                    summary_json = {"raw_text": summary_text, "error": "LLM did not return a valid JSON structure"}
            except Exception as ex:
                summary_json = {"raw_text": summary_text, "error": f"Failed to repair JSON: {ex}"}
            
        meeting["summary"] = summary_json
        
        if auto_title == "true" and meeting["title"].startswith("Meeting 202"):
            try:
                new_title = generate_meeting_title(
                    meeting["transcript"], llm_provider, llm_api_key, llm_base_url, llm_model
                )
                if new_title:
                    meeting["title"] = new_title
            except Exception as e:
                print("Failed to auto-generate title:", e)
                
        save_meetings(meetings)
        
        return {"summary": summary_json, "title": meeting["title"]}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/meetings/{meeting_id}/transcript")
async def update_transcript(meeting_id: str, transcript: str = Form(...)):
    try:
        meetings = load_meetings()
        meeting = next((m for m in meetings if m["id"] == meeting_id), None)
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        meeting["transcript"] = transcript
        save_meetings(meetings)
        return {"success": True}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
