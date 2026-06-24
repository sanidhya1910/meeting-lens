#!/usr/bin/env python3
"""One-command launcher for Meeting Lens: starts the backend and frontend together.

    python run.py

Press Ctrl+C to stop both. On Windows you can also double-click start.ps1.
"""
import os
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(ROOT, "backend")
FRONTEND = os.path.join(ROOT, "frontend")
IS_WIN = os.name == "nt"


def backend_python() -> str:
    venv = os.path.join(BACKEND, "venv", "Scripts" if IS_WIN else "bin", "python.exe" if IS_WIN else "python")
    return venv if os.path.exists(venv) else sys.executable


def preflight() -> bool:
    ok = True
    if shutil.which("ffmpeg") is None:
        print("⚠  ffmpeg not found on PATH — transcription needs it. https://ffmpeg.org/download.html")
        ok = False
    if shutil.which("npm") is None:
        print("✖  npm not found — install Node.js 18+ to run the frontend. https://nodejs.org")
        ok = False
    if not os.path.exists(os.path.join(FRONTEND, "node_modules")):
        print("✖  frontend/node_modules missing — run:  cd frontend && npm install")
        ok = False
    if not os.path.exists(os.path.join(BACKEND, "venv")):
        print("ℹ  No backend/venv found — using the current Python. Make sure deps are installed:")
        print("     cd backend && pip install -r requirements.txt")
    return ok


def main() -> int:
    print("Meeting Lens launcher\n" + "-" * 40)
    if not preflight():
        print("\nResolve the items above, then re-run. (ffmpeg-only warnings are non-fatal.)")
        # ffmpeg missing is a warning; npm/node_modules missing is fatal.
        if shutil.which("npm") is None or not os.path.exists(os.path.join(FRONTEND, "node_modules")):
            return 1

    npm = shutil.which("npm") or "npm"
    procs = []
    try:
        print("→ starting backend on http://localhost:8000 …")
        procs.append(subprocess.Popen(
            [backend_python(), "-m", "uvicorn", "main:app", "--port", "8000"], cwd=BACKEND,
        ))
        time.sleep(1.0)
        print("→ starting frontend on http://localhost:5173 …")
        procs.append(subprocess.Popen([npm, "run", "dev"], cwd=FRONTEND, shell=IS_WIN))
        print("\nMeeting Lens is starting. Open http://localhost:5173\nPress Ctrl+C to stop.\n")
        while True:
            for p in procs:
                if p.poll() is not None:
                    raise RuntimeError("A process exited; shutting down.")
            time.sleep(0.5)
    except (KeyboardInterrupt, RuntimeError) as e:
        if isinstance(e, RuntimeError):
            print(f"\n{e}")
        print("Stopping…")
    finally:
        for p in procs:
            try:
                p.terminate()
            except Exception:
                pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
