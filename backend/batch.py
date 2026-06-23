"""Background batch transcription with shared Whisper model cache."""
import asyncio
import os
import shutil
import uuid
from datetime import datetime, timedelta
from typing import Any

from meetings import insert_meeting
from pipeline import DATA_DIR, extract_audio, transcribe_audio_with_cache, WhisperModelCache
from storage import JsonStore

_store = JsonStore("batches.json", default=[])
BATCH_DIR_PREFIX = "batch_"

_active_workers: dict[str, asyncio.Task] = {}
_cancel_requested: set[str] = set()


def _is_cancelled(batch_id: str) -> bool:
    if batch_id in _cancel_requested:
        return True
    batch = get_batch(batch_id)
    return bool(batch and batch.get("cancel_requested"))


def request_cancel(batch_id: str) -> bool:
    batch = get_batch(batch_id)
    if not batch:
        return False
    if batch.get("status") in ("completed", "cancelled", "failed"):
        return False
    _cancel_requested.add(batch_id)

    def mark(batch_list: list) -> list:
        for b in batch_list:
            if b["id"] == batch_id:
                b["cancel_requested"] = True
                if b.get("status") in ("queued", "processing"):
                    b["status"] = "cancelling"
                for item in b.get("items", []):
                    if item.get("status") == "pending":
                        item["status"] = "cancelled"
                        item["progress"] = "Cancelled"
        return batch_list

    _store.modify(mark)
    return True


def get_batch(batch_id: str) -> dict[str, Any] | None:
    batches = _store.read()
    return next((b for b in batches if b["id"] == batch_id), None)


def list_batches(limit: int = 20) -> list[dict[str, Any]]:
    return _store.read()[:limit]


def _update_batch(batch: dict[str, Any]) -> None:
    def replace(batches: list) -> list:
        for i, b in enumerate(batches):
            if b["id"] == batch["id"]:
                batches[i] = batch
                return batches
        batches.insert(0, batch)
        return batches

    _store.modify(replace)


def recover_stale_jobs() -> int:
    """Mark orphaned in-flight batches as failed after server restart."""
    recovered = 0
    cutoff = datetime.now() - timedelta(hours=2)

    def fix(batches: list) -> list:
        nonlocal recovered
        for batch in batches:
            if batch.get("status") not in ("queued", "processing", "cancelling"):
                continue
            if batch["id"] in _active_workers and not _active_workers[batch["id"]].done():
                continue
            try:
                created = datetime.fromisoformat(batch.get("created_at", ""))
            except ValueError:
                created = cutoff
            if batch["id"] not in _active_workers or created < cutoff:
                batch["status"] = "failed"
                batch["error"] = "Interrupted (server restarted or job orphaned)"
                for item in batch.get("items", []):
                    if item.get("status") in ("pending", "processing"):
                        item["status"] = "failed"
                        item["error"] = "Job interrupted"
                recovered += 1
        return batches

    _store.modify(fix)
    return recovered


def create_batch(filenames: list[str], asr_model: str, device: str) -> dict[str, Any]:
    batch_id = str(uuid.uuid4())
    batch_dir = os.path.join(DATA_DIR, f"{BATCH_DIR_PREFIX}{batch_id}")
    os.makedirs(batch_dir, exist_ok=True)

    items = []
    for filename in filenames:
        items.append({
            "id": str(uuid.uuid4()),
            "filename": filename,
            "status": "pending",
            "meeting_id": None,
            "error": None,
            "progress": "Waiting in queue...",
        })

    batch = {
        "id": batch_id,
        "created_at": datetime.now().isoformat(),
        "status": "queued",
        "asr_model": asr_model,
        "device": device,
        "batch_dir": batch_dir,
        "items": items,
        "completed_count": 0,
        "failed_count": 0,
        "cancel_requested": False,
    }
    _update_batch(batch)
    return batch


def save_uploaded_file(batch: dict[str, Any], filename: str, file_obj) -> str:
    safe_name = os.path.basename(filename.replace("\\", "/"))
    dest = os.path.join(batch["batch_dir"], safe_name)
    with open(dest, "wb") as buffer:
        shutil.copyfileobj(file_obj, buffer)
    return dest


def get_completed_meeting_ids(batch_id: str) -> list[str]:
    batch = get_batch(batch_id)
    if not batch:
        return []
    return [
        item["meeting_id"]
        for item in batch.get("items", [])
        if item.get("status") == "completed" and item.get("meeting_id")
    ]


def start_batch_worker(batch_id: str) -> None:
    if batch_id in _active_workers and not _active_workers[batch_id].done():
        return
    loop = asyncio.get_running_loop()
    _active_workers[batch_id] = loop.create_task(_process_batch(batch_id))


async def _process_batch(batch_id: str) -> None:
    batch = get_batch(batch_id)
    if not batch:
        return

    batch["status"] = "processing"
    _update_batch(batch)

    cache = WhisperModelCache()
    cancelled = False
    try:
        for item_stub in batch["items"]:
            if _is_cancelled(batch_id):
                cancelled = True
                break

            batch = get_batch(batch_id)
            if not batch:
                return

            item = next(i for i in batch["items"] if i["id"] == item_stub["id"])
            if item.get("status") == "cancelled":
                continue

            safe_name = os.path.basename(item["filename"].replace("\\", "/"))
            video_path = os.path.join(batch["batch_dir"], safe_name)

            if not os.path.exists(video_path):
                item["status"] = "failed"
                item["error"] = "Uploaded file not found on disk"
                batch["failed_count"] = batch.get("failed_count", 0) + 1
                _update_batch(batch)
                continue

            meeting_id = str(uuid.uuid4())
            audio_path = os.path.join(batch["batch_dir"], f"{meeting_id}.wav")

            item["status"] = "processing"
            item["progress"] = "Extracting audio..."
            _update_batch(batch)

            try:
                await asyncio.to_thread(extract_audio, video_path, audio_path)
                item["progress"] = "Transcribing..."
                _update_batch(batch)

                transcript_lines: list[str] = []
                last_progress_save = 0.0

                def on_segment(data: dict) -> None:
                    nonlocal last_progress_save
                    transcript_lines.append(
                        f"[{data['start']:.2f}s -> {data['end']:.2f}s] {data['text']}"
                    )
                    item["progress"] = f"[{data['start']:.2f}s] {data['text'][:80]}"
                    # Throttle disk writes — updating JSON on every segment blocks transcription
                    now = datetime.now().timestamp()
                    if now - last_progress_save >= 2.0:
                        last_progress_save = now
                        _update_batch(batch)

                await asyncio.to_thread(
                    transcribe_audio_with_cache,
                    audio_path,
                    batch["asr_model"],
                    batch["device"],
                    cache,
                    on_segment,
                )

                item["progress"] = "Saving meeting..."
                _update_batch(batch)

                transcript_text = "\n".join(transcript_lines)
                base_title = os.path.splitext(safe_name)[0]
                final_title = base_title or f"Meeting {datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}"

                await asyncio.to_thread(
                    insert_meeting,
                    meeting_id=meeting_id,
                    title=final_title,
                    transcript=transcript_text,
                )

                item["status"] = "completed"
                item["meeting_id"] = meeting_id
                item["progress"] = "Done"
                batch["completed_count"] = batch.get("completed_count", 0) + 1

                try:
                    if os.path.exists(audio_path):
                        os.remove(audio_path)
                    if os.path.exists(video_path):
                        os.remove(video_path)
                except OSError:
                    pass

            except Exception as e:
                item["status"] = "failed"
                item["error"] = str(e)
                item["progress"] = "Failed"
                batch["failed_count"] = batch.get("failed_count", 0) + 1

            _update_batch(batch)

        batch = get_batch(batch_id)
        if batch:
            if cancelled or _is_cancelled(batch_id):
                batch["status"] = "cancelled"
                for item in batch["items"]:
                    if item.get("status") == "pending":
                        item["status"] = "cancelled"
                        item["progress"] = "Cancelled"
            elif batch.get("status") != "failed":
                batch["status"] = "completed"
            _update_batch(batch)

    finally:
        cache.release()
        batch = get_batch(batch_id)
        if batch and os.path.isdir(batch.get("batch_dir", "")):
            try:
                shutil.rmtree(batch["batch_dir"], ignore_errors=True)
            except OSError:
                pass
        _active_workers.pop(batch_id, None)
        _cancel_requested.discard(batch_id)
