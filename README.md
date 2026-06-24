# Meeting Lens

A local-first, full-stack app for turning meetings into searchable, summarized notes. Record or upload audio/video, transcribe it **on your own machine** with a tiny Whisper model, and summarize the transcript with a **local LLM (Ollama)** — or any cloud provider you prefer. No data leaves your computer unless you choose a cloud model.

## Highlights

- **Runs fully local & offline.** Transcription uses `faster-whisper` (defaults to the tiny model on CPU). Summaries can run on a local Ollama model with **zero API keys**.
- **Auto hardware detection.** Uses your NVIDIA GPU if CUDA is available, otherwise falls back to CPU automatically — the app works on any machine.
- **Live recording.** Capture microphone audio in the browser and transcribe it on the spot.
- **Upload & bulk transcription.** Drop in one or many audio/video files; a shared Whisper model processes batches sequentially.
- **AI summaries from dynamic templates.** Inject your own JSON template to control exactly what gets extracted (decisions, action items, scorecards, etc.).
- **Bulk summarize.** Apply one template across your whole library; skip already-summarized meetings.
- **Chat with a transcript.** Ask free-form questions about any meeting; answers are grounded in its transcript.
- **Ask your whole library.** Library-wide RAG chat across every meeting at once, with citations — powered by local embeddings.
- **Action-item tracker.** Extract action items from a transcript into a checklist (owner, due, done/open), exportable to Markdown or a calendar **.ics** file.
- **Handles long meetings.** Long transcripts are map-reduce condensed before summarizing and retrieved chunk-by-chunk for chat, so they don't overflow a small local model's context.
- **Audio playback + clickable timestamps.** Meetings keep a compact audio copy; click any transcript line to jump to that moment. Export subtitles as **SRT/VTT**.
- **Speaker diarization (optional).** Label who said what and rename speakers across the transcript.
- **Import from a URL (optional).** Paste a YouTube/podcast link to fetch and transcribe it, with a one-click **translate-to-English** option for non-English audio.
- **Global search (⌘K / Ctrl+K).** Instantly search across titles, transcripts, summaries, and tags.
- **Organized library.** Filter, sort, rename inline, and tag meetings.
- **Export anywhere.** Download summaries as PDF or Markdown, copy Markdown, or export subtitles.
- **Polished UI.** Light / dark / system theme toggle, toast notifications, and live batch progress.
- **Multiple LLM providers.** Ollama (local, default), LM Studio, OpenAI, Anthropic (Claude), or any OpenAI-compatible endpoint.
- **Reliable storage.** Locked JSON persistence with atomic writes; stale batch jobs recovered on restart.

## Requirements

- Python 3.9+
- Node.js 18+
- [FFmpeg](https://ffmpeg.org/download.html) (on your `PATH`)
- *Optional, for local summaries:* [Ollama](https://ollama.com)
- *Optional, for faster transcription:* an [NVIDIA GPU](https://developer.nvidia.com/cuda-downloads) with the CUDA toolkit and cuDNN

## Setup

### 1. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows  (use: source venv/bin/activate on macOS/Linux)
pip install -r requirements.txt

# Optional — only if you have an NVIDIA GPU and want acceleration:
# pip install -r requirements-gpu.txt

uvicorn main:app --reload
```

The API runs on `http://localhost:8000`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

The UI is available at `http://localhost:5173`.

### 3. Local summaries with Ollama (recommended)

For fully offline, key-free summaries:

```bash
# Install Ollama from https://ollama.com, then:
ollama pull llama3.2
```

Meeting Lens auto-detects a running Ollama server and uses it by default. The
**Settings** panel shows live GPU and Ollama status and lets you switch providers
(LM Studio, OpenAI, Claude, or any OpenAI-compatible endpoint).

### 4. "Ask Your Library" (optional, local embeddings)

The library-wide chat needs an embedding model. With Ollama:

```bash
ollama pull nomic-embed-text
```

(With OpenAI selected as your provider, it uses `text-embedding-3-small` instead.)
Your library is embedded once on the first question and cached, so later questions are fast.

### 5. Speaker diarization (optional, heavy)

Who-said-what labeling is off by default and requires extra setup:

```bash
pip install -r requirements-diarize.txt          # pulls in PyTorch
# Accept the license at https://hf.co/pyannote/speaker-diarization-3.1
setx HF_TOKEN "hf_your_token_here"                # then open a new terminal
```

When detected, transcription dialogs show a **"Detect & label speakers"** toggle. A
CUDA GPU is strongly recommended — diarization is slow on CPU. Without this setup the
app simply transcribes without speaker labels.

### 6. Import from a URL (optional)

To transcribe YouTube/podcast links, install yt-dlp:

```bash
pip install -r requirements-url.txt
```

When detected, the Transcribe dialog gains a **"From URL"** tab. yt-dlp uses the same
ffmpeg you already have.

## One command to run everything

From the repo root:

```bash
python run.py        # starts backend + frontend (or use start.ps1 / start.sh)
```

It preflight-checks ffmpeg/Node, starts both servers, and prints the URL. Ctrl+C stops both.

## Single-server / desktop mode

Build the frontend once and the backend will serve the whole app on one port — no Vite
process, no CORS, just `http://localhost:8000`:

```bash
cd frontend && npm run build      # produces frontend/dist
cd ../backend && uvicorn main:app --port 8000
```

For a real native window (no terminal, no browser tab), there's an Electron shell in
[`desktop/`](desktop/) that launches the backend and opens the app — see
[desktop/README.md](desktop/README.md). It drives your existing local install (it does
not bundle Python).

## Running the backend tests

```bash
cd backend
python -m pytest        # fast unit tests for the pure logic (no models needed)
```

## ASR (Whisper) models

Models download automatically on first use into `models/`:

| Model      | Notes                                          |
| ---------- | ---------------------------------------------- |
| `tiny`     | Fastest, runs great on CPU (~39 MB) — default  |
| `base`     | Good balance on CPU (~74 MB)                   |
| `small`    | Better accuracy (~241 MB)                      |
| `medium`   | High accuracy, slow on CPU (~769 MB)           |
| `large-v3` | Best accuracy, GPU recommended (~1.5 GB)       |

> **CPU vs GPU:** Transcription defaults to CPU. If an NVIDIA GPU with CUDA/cuDNN
> is detected, the transcription dialog offers a "Use GPU if available" toggle.
> Large models are slow on CPU — stick to `tiny`/`base` unless you have a GPU.

## Configuration (environment variables)

| Variable                     | Default                                            | Purpose                          |
| ---------------------------- | -------------------------------------------------- | -------------------------------- |
| `OLLAMA_BASE_URL`            | `http://localhost:11434`                           | Where to reach the Ollama server |
| `OLLAMA_KEEP_ALIVE`          | `30m`                                              | How long Ollama keeps the model loaded (`-1` = forever) |
| `MEETING_LENS_MAX_UPLOAD_MB` | `500`                                              | Max upload size per file (MB)    |
| `MEETING_LENS_CORS`          | `http://localhost:5173,http://127.0.0.1:5173`      | Allowed CORS origins             |
| `HF_TOKEN`                   | *(unset)*                                          | Hugging Face token to enable speaker diarization |
