from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import uuid
import tempfile
import shutil
from pipeline import extract_audio, transcribe_audio, summarize_transcript
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ASR_MODELS = [
    {"id": "tiny", "name": "Tiny (fastest, lowest accuracy, ~39MB)"},
    {"id": "base", "name": "Base (~74MB)"},
    {"id": "small", "name": "Small (~241MB)"},
    {"id": "medium", "name": "Medium (~769MB)"},
    {"id": "large-v3", "name": "Large v3 (slowest, highest accuracy, ~1.5GB)"}
]

@app.get("/api/asr-models")
def get_asr_models():
    return {"models": ASR_MODELS}

@app.get("/api/templates")
def get_templates():
    templates_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "templates")
    templates = []
    if os.path.exists(templates_dir):
        for filename in os.listdir(templates_dir):
            if filename.endswith(".json"):
                file_path = os.path.join(templates_dir, filename)
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()
                    templates.append({
                        "name": filename,
                        "content": content
                    })
                except Exception as e:
                    print(f"Error reading {filename}: {e}")
    return {"templates": templates}

@app.post("/api/process")
async def process_video(
    file: UploadFile = File(...),
    asr_model: str = Form("base"),
    device: str = Form("cuda"),
    llm_provider: str = Form("openai"),
    llm_api_key: str = Form(""),
    llm_base_url: str = Form(""),
    llm_model: str = Form(""),
    json_template: str = Form("{}")
):
    try:
        # Save uploaded file
        temp_dir = tempfile.mkdtemp()
        video_path = os.path.join(temp_dir, file.filename)
        audio_path = os.path.join(temp_dir, "audio.wav")
        
        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        print(f"Extracting audio to {audio_path}...")
        extract_audio(video_path, audio_path)
        
        print(f"Transcribing using {asr_model} on {device}...")
        transcript = transcribe_audio(audio_path, asr_model, device)
        
        print("Summarizing transcript...")
        summary_text = summarize_transcript(
            transcript=transcript,
            json_template=json_template,
            provider=llm_provider,
            api_key=llm_api_key,
            base_url=llm_base_url,
            model_name=llm_model
        )
        
        try:
            summary_json = json.loads(summary_text)
        except json.JSONDecodeError:
            summary_json = {"raw_text": summary_text, "error": "LLM did not return valid JSON"}
            
        # Cleanup
        os.remove(video_path)
        os.remove(audio_path)
        os.rmdir(temp_dir)
        
        return {
            "transcript": transcript,
            "summary": summary_json
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
