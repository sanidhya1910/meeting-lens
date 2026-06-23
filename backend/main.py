from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import os
import uuid
import shutil
from datetime import datetime

from pipeline import (
    extract_audio,
    transcribe_audio_stream,
    summarize_transcript,
    generate_meeting_title,
    generate_custom_template,
    chat_with_transcript,
    get_system_info,
    DATA_DIR,
    TEMPLATES_DIR,
)
import batch as batch_service
import summarize_batch as summarize_batch_service
import meetings as meetings_service
from errors import MeetingNotFoundError, MeetingNoTranscriptError
import json
import asyncio
import threading


class SummarizeBatchRequest(BaseModel):
    meeting_ids: list[str]
    json_template: str = "{}"
    llm_provider: str = "ollama"
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = ""
    auto_title: bool = True
    skip_existing: bool = True


class ChatRequest(BaseModel):
    question: str
    history: list[dict] = []
    llm_provider: str = "ollama"
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = ""


ALLOWED_MEDIA_EXTENSIONS = {
    ".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v",
    ".mp3", ".wav", ".m4a", ".flac", ".ogg", ".wma", ".aac",
}

MAX_UPLOAD_BYTES = int(os.environ.get("MEETING_LENS_MAX_UPLOAD_MB", "500")) * 1024 * 1024


def _validate_media_filename(filename: str) -> None:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_MEDIA_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_MEDIA_EXTENSIONS))}",
        )


def _parse_summary_json(summary_text: str) -> dict:
    from json_repair import repair_json
    try:
        return json.loads(summary_text)
    except (json.JSONDecodeError, ValueError):
        try:
            repaired = repair_json(summary_text, return_objects=True)
            if isinstance(repaired, (dict, list)):
                return repaired
            return {"raw_text": summary_text, "error": "LLM did not return a valid JSON structure"}
        except Exception as ex:
            return {"raw_text": summary_text, "error": f"Failed to repair JSON: {ex}"}


def _summarize_meeting_by_id(meeting_id: str, config: dict) -> None:
    meeting = meetings_service.get_meeting(meeting_id)
    if not (meeting.get("transcript") or "").strip():
        raise MeetingNoTranscriptError(meeting_id)

    summary_text = summarize_transcript(
        transcript=meeting["transcript"],
        json_template=config["json_template"],
        provider=config["llm_provider"],
        api_key=config["llm_api_key"],
        base_url=config["llm_base_url"],
        model_name=config["llm_model"],
    )
    summary_json = _parse_summary_json(summary_text)

    def apply(m: dict) -> None:
        m["summary"] = summary_json
        if config.get("auto_title") and m["title"].startswith("Meeting 202"):
            try:
                new_title = generate_meeting_title(
                    m["transcript"],
                    config["llm_provider"],
                    config["llm_api_key"],
                    config["llm_base_url"],
                    config["llm_model"],
                )
                if new_title:
                    m["title"] = new_title
            except Exception as e:
                print("Failed to auto-generate title:", e)

    meetings_service.update_meeting(meeting_id, apply)


def _should_skip_summarize(meeting_id: str, config: dict) -> bool:
    if not config.get("skip_existing"):
        return False
    try:
        meeting = meetings_service.get_meeting(meeting_id)
    except MeetingNotFoundError:
        return False
    return meeting.get("summary") is not None


def _map_domain_error(exc: Exception) -> HTTPException:
    if isinstance(exc, MeetingNotFoundError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, MeetingNoTranscriptError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


@asynccontextmanager
async def lifespan(app: FastAPI):
    t = batch_service.recover_stale_jobs()
    s = summarize_batch_service.recover_stale_jobs()
    if t or s:
        print(f"[startup] Recovered stale jobs: transcribe={t}, summarize={s}")
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("MEETING_LENS_CORS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/system")
def system_info():
    return get_system_info()


@app.get("/api/asr-models")
def get_asr_models():
    return {"models": [
        {"id": "tiny", "name": "Tiny — fastest, runs great on CPU (~39MB)", "recommended": True},
        {"id": "base", "name": "Base — good balance on CPU (~74MB)"},
        {"id": "small", "name": "Small — better accuracy (~241MB)"},
        {"id": "medium", "name": "Medium — high accuracy, slow on CPU (~769MB)"},
        {"id": "large-v3", "name": "Large v3 — best accuracy, GPU recommended (~1.5GB)"},
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
                    templates.append({"name": filename, "content": content})
                except Exception:
                    pass
    return {"templates": templates}


@app.post("/api/templates/generate")
async def create_template(
    description: str = Form(...),
    template_name: str = Form(...),
    llm_provider: str = Form("ollama"),
    llm_api_key: str = Form(""),
    llm_base_url: str = Form(""),
    llm_model: str = Form(""),
):
    try:
        template_json_str = generate_custom_template(
            description, llm_provider, llm_api_key, llm_base_url, llm_model
        )
        try:
            parsed = json.loads(template_json_str)
            template_json_str = json.dumps(parsed, indent=2)
        except Exception:
            pass

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
    return {"meetings": meetings_service.load_meetings()}


@app.delete("/api/meetings/{meeting_id}")
def delete_meeting(meeting_id: str):
    if not meetings_service.delete_meeting(meeting_id):
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"success": True}


@app.get("/api/transcribe/batches")
def list_transcription_batches():
    return {"batches": batch_service.list_batches()}


@app.get("/api/transcribe/batch/{batch_id}")
def get_transcription_batch(batch_id: str):
    batch = batch_service.get_batch(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return {"batch": batch}


@app.get("/api/transcribe/batch/{batch_id}/meeting-ids")
def get_transcription_batch_meeting_ids(batch_id: str):
    batch = batch_service.get_batch(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return {
        "meeting_ids": batch_service.get_completed_meeting_ids(batch_id),
        "batch_id": batch_id,
        "status": batch.get("status"),
    }


@app.post("/api/transcribe/batch/{batch_id}/cancel")
def cancel_transcription_batch(batch_id: str):
    if not batch_service.request_cancel(batch_id):
        raise HTTPException(status_code=404, detail="Batch not found or already finished")
    return {"success": True}


@app.post("/api/transcribe/batch")
async def transcribe_batch(
    files: list[UploadFile] = File(...),
    asr_model: str = Form("tiny"),
    device: str = Form("auto"),
):
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    for f in files:
        _validate_media_filename(f.filename or "")
        if f.size and f.size > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File {f.filename} exceeds max size ({MAX_UPLOAD_BYTES // (1024*1024)} MB)",
            )

    filenames = [f.filename or f"file_{i}" for i, f in enumerate(files)]
    batch = batch_service.create_batch(filenames, asr_model, device)

    for upload, item in zip(files, batch["items"]):
        batch_service.save_uploaded_file(batch, item["filename"], upload.file)

    batch_service.start_batch_worker(batch["id"])

    return {
        "batch_id": batch["id"],
        "total": len(batch["items"]),
        "items": [{"id": i["id"], "filename": i["filename"]} for i in batch["items"]],
    }


@app.post("/api/transcribe")
async def transcribe_video(
    file: UploadFile = File(...),
    asr_model: str = Form("tiny"),
    device: str = Form("auto"),
    title: str = Form(""),
):
    try:
        _validate_media_filename(file.filename or "")
        meeting_id = str(uuid.uuid4())
        video_path = os.path.join(DATA_DIR, f"{meeting_id}_{file.filename}")
        audio_path = os.path.join(DATA_DIR, f"{meeting_id}.wav")

        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if os.path.getsize(video_path) > MAX_UPLOAD_BYTES:
            os.remove(video_path)
            raise HTTPException(status_code=413, detail="File exceeds maximum upload size")

        await asyncio.to_thread(extract_audio, video_path, audio_path)

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
                    try:
                        if os.path.exists(audio_path):
                            os.remove(audio_path)
                        if os.path.exists(video_path):
                            os.remove(video_path)
                    except OSError:
                        pass

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
                        if "error" not in data_json and "start" in data_json:
                            transcript_text += (
                                f"[{data_json['start']:.2f}s -> {data_json['end']:.2f}s] {data_json['text']}\n"
                            )
                    except json.JSONDecodeError:
                        pass
                yield chunk

            try:
                final_title = title if title else f"Meeting {datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}"
                await asyncio.to_thread(
                    meetings_service.insert_meeting,
                    meeting_id,
                    final_title,
                    transcript_text,
                )
                yield f"data: {json.dumps({'event': 'completed', 'meeting_id': meeting_id})}\n\n"
            except Exception as e:
                import traceback
                traceback.print_exc()
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/summarize/batch")
async def summarize_batch_create(body: SummarizeBatchRequest):
    if not body.meeting_ids:
        raise HTTPException(status_code=400, detail="At least one meeting_id is required")

    items = []
    for mid in body.meeting_ids:
        try:
            meeting = meetings_service.get_meeting(mid)
        except MeetingNotFoundError:
            raise HTTPException(status_code=404, detail=f"Meeting not found: {mid}")
        items.append({"meeting_id": mid, "title": meeting.get("title", mid)})

    config = {
        "json_template": body.json_template,
        "llm_provider": body.llm_provider,
        "llm_api_key": body.llm_api_key,
        "llm_base_url": body.llm_base_url,
        "llm_model": body.llm_model,
        "auto_title": body.auto_title,
        "skip_existing": body.skip_existing,
    }

    batch = summarize_batch_service.create_batch(items, config)
    summarize_batch_service.start_batch_worker(
        batch["id"],
        _summarize_meeting_by_id,
        _should_skip_summarize,
    )

    return {
        "batch_id": batch["id"],
        "total": len(batch["items"]),
        "items": [
            {"id": i["id"], "meeting_id": i["meeting_id"], "title": i["title"]}
            for i in batch["items"]
        ],
    }


@app.get("/api/summarize/batch/{batch_id}")
def get_summarize_batch(batch_id: str):
    batch = summarize_batch_service.get_batch(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return {"batch": batch}


@app.post("/api/summarize/batch/{batch_id}/cancel")
def cancel_summarize_batch(batch_id: str):
    if not summarize_batch_service.request_cancel(batch_id):
        raise HTTPException(status_code=404, detail="Batch not found or already finished")
    return {"success": True}


@app.post("/api/meetings/{meeting_id}/summarize")
async def summarize_meeting(
    meeting_id: str,
    llm_provider: str = Form("ollama"),
    llm_api_key: str = Form(""),
    llm_base_url: str = Form(""),
    llm_model: str = Form(""),
    json_template: str = Form("{}"),
    auto_title: str = Form("true"),
):
    try:
        config = {
            "json_template": json_template,
            "llm_provider": llm_provider,
            "llm_api_key": llm_api_key,
            "llm_base_url": llm_base_url,
            "llm_model": llm_model,
            "auto_title": auto_title == "true",
            "skip_existing": False,
        }
        _summarize_meeting_by_id(meeting_id, config)
        meeting = meetings_service.get_meeting(meeting_id)
        return {"summary": meeting["summary"], "title": meeting["title"]}
    except (MeetingNotFoundError, MeetingNoTranscriptError) as e:
        raise _map_domain_error(e)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/meetings/{meeting_id}/transcript")
async def update_transcript(meeting_id: str, transcript: str = Form(...)):
    try:
        def apply(m: dict) -> None:
            m["transcript"] = transcript

        meetings_service.update_meeting(meeting_id, apply)
        return {"success": True}
    except MeetingNotFoundError as e:
        raise _map_domain_error(e)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/meetings/{meeting_id}/title")
async def update_title(meeting_id: str, title: str = Form(...)):
    title = title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    try:
        def apply(m: dict) -> None:
            m["title"] = title

        meetings_service.update_meeting(meeting_id, apply)
        return {"success": True, "title": title}
    except MeetingNotFoundError as e:
        raise _map_domain_error(e)


@app.put("/api/meetings/{meeting_id}/tags")
async def update_tags(meeting_id: str, body: dict):
    tags = body.get("tags", [])
    if not isinstance(tags, list):
        raise HTTPException(status_code=400, detail="tags must be a list")
    clean = sorted({str(t).strip() for t in tags if str(t).strip()})
    try:
        def apply(m: dict) -> None:
            m["tags"] = clean

        meetings_service.update_meeting(meeting_id, apply)
        return {"success": True, "tags": clean}
    except MeetingNotFoundError as e:
        raise _map_domain_error(e)


@app.post("/api/meetings/{meeting_id}/chat")
async def chat_meeting(meeting_id: str, body: ChatRequest):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="A question is required")
    try:
        meeting = meetings_service.get_meeting(meeting_id)
    except MeetingNotFoundError as e:
        raise _map_domain_error(e)

    transcript = (meeting.get("transcript") or "").strip()
    if not transcript:
        raise _map_domain_error(MeetingNoTranscriptError(meeting_id))

    try:
        answer = await asyncio.to_thread(
            chat_with_transcript,
            transcript,
            body.question,
            body.history,
            body.llm_provider,
            body.llm_api_key,
            body.llm_base_url,
            body.llm_model,
        )
        return {"answer": answer}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
