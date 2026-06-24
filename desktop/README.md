# Meeting Lens — Desktop (Electron)

A native window that launches the local backend and serves the app — no terminal, no
browser tab. The backend (which also serves the built frontend) runs as a child process
and is shut down when you close the window.

## Prerequisites (one-time)

The desktop shell drives your existing local install — it does **not** bundle Python.

1. Backend deps installed: `cd backend && pip install -r requirements.txt`
2. Frontend built so the backend can serve it: `cd frontend && npm install && npm run build`
3. (Optional) Ollama running with a model: `ollama pull llama3.2`

## Run it

```bash
cd desktop
npm install
npm start          # launches backend + opens the app window
```

## Package an installer

```bash
cd desktop
npm run build      # electron-builder → installer in desktop/dist/
```

This produces an NSIS installer on Windows, a `.dmg` on macOS, or an `AppImage` on Linux.
The packaged app still expects the `backend/` (with its venv) and `frontend/dist` alongside
it — bundling a self-contained Python runtime is out of scope for this shell.

## Develop

Run the backend (`uvicorn main:app --reload`) and Vite (`npm run dev`) yourself, then:

```bash
cd desktop
npm run dev        # opens a window pointed at the Vite dev server (localhost:5173)
```
