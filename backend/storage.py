"""Thread-safe JSON persistence with file locks and atomic writes."""
import json
import os
import time
from contextlib import contextmanager
from typing import Any, Callable, TypeVar

from pipeline import DATA_DIR

T = TypeVar("T")
DEFAULT_LIST: list[Any] = []


class JsonStore:
    """Read/modify/write JSON arrays or objects with exclusive file locking."""

    def __init__(self, filename: str, default: T | None = None):
        os.makedirs(DATA_DIR, exist_ok=True)
        self.path = os.path.join(DATA_DIR, filename)
        self.lock_path = self.path + ".lock"
        self.default: T = default if default is not None else []  # type: ignore[assignment]

    def _clear_stale_lock(self, max_age_sec: float = 120.0) -> None:
        if not os.path.exists(self.lock_path):
            return
        try:
            age = time.time() - os.path.getmtime(self.lock_path)
            if age > max_age_sec:
                os.remove(self.lock_path)
        except OSError:
            pass

    @contextmanager
    def _file_lock(self, timeout_sec: float = 30.0):
        deadline = time.time() + timeout_sec
        fd = None
        while time.time() < deadline:
            self._clear_stale_lock()
            try:
                fd = os.open(self.lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                break
            except FileExistsError:
                time.sleep(0.05)
        else:
            raise TimeoutError(f"Could not lock {self.path}")

        try:
            yield
        finally:
            if fd is not None:
                os.close(fd)
            try:
                os.remove(self.lock_path)
            except OSError:
                pass

    def read(self) -> T:
        with self._file_lock():
            if not os.path.exists(self.path):
                return json.loads(json.dumps(self.default))
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, OSError):
                return json.loads(json.dumps(self.default))

    def write(self, data: T) -> None:
        with self._file_lock():
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            os.replace(tmp, self.path)

    def modify(self, fn: Callable[[T], T]) -> T:
        with self._file_lock():
            if os.path.exists(self.path):
                try:
                    with open(self.path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                except (json.JSONDecodeError, OSError):
                    data = json.loads(json.dumps(self.default))
            else:
                data = json.loads(json.dumps(self.default))

            updated = fn(data)
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(updated, f, indent=2)
            os.replace(tmp, self.path)
            return updated
