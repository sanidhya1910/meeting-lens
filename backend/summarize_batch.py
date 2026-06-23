"""Background batch LLM summarization for multiple meetings."""
import asyncio
import uuid
from datetime import datetime, timedelta
from typing import Any, Callable

from storage import JsonStore

_store = JsonStore("summarize_batches.json", default=[])

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


def create_batch(items: list[dict[str, str]], config: dict[str, Any]) -> dict[str, Any]:
    batch_id = str(uuid.uuid4())
    batch_items = []
    for item in items:
        batch_items.append({
            "id": str(uuid.uuid4()),
            "meeting_id": item["meeting_id"],
            "title": item["title"],
            "status": "pending",
            "error": None,
            "progress": "Waiting in queue...",
        })

    batch = {
        "id": batch_id,
        "created_at": datetime.now().isoformat(),
        "status": "queued",
        "config": config,
        "items": batch_items,
        "completed_count": 0,
        "failed_count": 0,
        "skipped_count": 0,
        "cancel_requested": False,
    }
    _update_batch(batch)
    return batch


def start_batch_worker(
    batch_id: str,
    summarize_fn: Callable[[str, dict[str, Any]], None],
    should_skip_fn: Callable[[str, dict[str, Any]], bool],
) -> None:
    if batch_id in _active_workers and not _active_workers[batch_id].done():
        return
    loop = asyncio.get_running_loop()
    _active_workers[batch_id] = loop.create_task(
        _process_batch(batch_id, summarize_fn, should_skip_fn)
    )


async def _process_batch(
    batch_id: str,
    summarize_fn: Callable[[str, dict[str, Any]], None],
    should_skip_fn: Callable[[str, dict[str, Any]], bool],
) -> None:
    batch = get_batch(batch_id)
    if not batch:
        return

    batch["status"] = "processing"
    _update_batch(batch)
    config = batch["config"]
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

            meeting_id = item["meeting_id"]

            if should_skip_fn(meeting_id, config):
                item["status"] = "skipped"
                item["progress"] = "Already has a summary"
                batch["skipped_count"] = batch.get("skipped_count", 0) + 1
                _update_batch(batch)
                continue

            item["status"] = "processing"
            item["progress"] = "Calling LLM..."
            _update_batch(batch)

            try:
                await asyncio.to_thread(summarize_fn, meeting_id, config)
                item["status"] = "completed"
                item["progress"] = "Summary saved"
                batch["completed_count"] = batch.get("completed_count", 0) + 1
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
        _active_workers.pop(batch_id, None)
        _cancel_requested.discard(batch_id)
