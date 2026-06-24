"""Meeting library persistence."""
from datetime import datetime
from typing import Any, Callable

from errors import MeetingNotFoundError, MeetingNoTranscriptError
from storage import JsonStore

_store = JsonStore("meetings.json", default=[])


def load_meetings() -> list[dict[str, Any]]:
    meetings = _store.read()
    # Backfill fields added after a meeting was first stored.
    for m in meetings:
        m.setdefault("tags", [])
        m.setdefault("summary", None)
        m.setdefault("action_items", [])
    return meetings


def save_meetings(meetings: list[dict[str, Any]]) -> None:
    _store.write(meetings)


def insert_meeting(meeting_id: str, title: str, transcript: str) -> dict[str, Any]:
    record = {
        "id": meeting_id,
        "title": title,
        "date": datetime.now().isoformat(),
        "transcript": transcript,
        "summary": None,
        "tags": [],
        "action_items": [],
    }

    def add(meetings: list) -> list:
        meetings.insert(0, record)
        return meetings

    _store.modify(add)
    return record


def get_meeting(meeting_id: str) -> dict[str, Any]:
    meetings = load_meetings()
    meeting = next((m for m in meetings if m["id"] == meeting_id), None)
    if not meeting:
        raise MeetingNotFoundError(meeting_id)
    return meeting


def delete_meeting(meeting_id: str) -> bool:
    removed = False

    def remove(meetings: list) -> list:
        nonlocal removed
        new_list = [m for m in meetings if m["id"] != meeting_id]
        removed = len(new_list) < len(meetings)
        return new_list

    _store.modify(remove)
    return removed


def update_meeting(meeting_id: str, mutator: Callable[[dict[str, Any]], None]) -> dict[str, Any]:
    result: dict[str, Any] | None = None

    def apply(meetings: list) -> list:
        nonlocal result
        for m in meetings:
            if m["id"] == meeting_id:
                mutator(m)
                result = m
                break
        if result is None:
            raise MeetingNotFoundError(meeting_id)
        return meetings

    _store.modify(apply)
    return result  # type: ignore[return-value]
