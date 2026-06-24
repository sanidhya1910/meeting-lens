import os
import subprocess
import site
import sys
import json
import shutil
import threading
import urllib.request
import urllib.error

# --- Add NVIDIA CUDA 12 DLLs to path for ctranslate2 (faster-whisper GPU support) ---
try:
    site_packages = site.getsitepackages()
    for sp in site_packages + [os.path.join(sys.prefix, 'Lib', 'site-packages')]:
        for lib in ["cublas", "cudnn", "cuda_nvrtc"]:
            bin_path = os.path.join(sp, "nvidia", lib, "bin")
            if os.path.exists(bin_path):
                os.environ["PATH"] = bin_path + os.pathsep + os.environ["PATH"]
                if hasattr(os, 'add_dll_directory'):
                    os.add_dll_directory(bin_path)
except Exception as e:
    print(f"Warning: Failed to setup NVIDIA DLL paths: {e}")
# ------------------------------------------------------------------------------------

# pyrefly: ignore [missing-import]
from faster_whisper import WhisperModel
# pyrefly: ignore [missing-import]
from openai import OpenAI
# pyrefly: ignore [missing-import]
from anthropic import Anthropic

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, "models")
DATA_DIR = os.path.join(BASE_DIR, "data")
AUDIO_DIR = os.path.join(DATA_DIR, "audio")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)


def playback_audio_path(meeting_id: str) -> str:
    return os.path.join(AUDIO_DIR, f"{meeting_id}.mp3")


def has_playback_audio(meeting_id: str) -> bool:
    return os.path.exists(playback_audio_path(meeting_id))


def save_playback_audio(src_audio_path: str, meeting_id: str) -> bool:
    """Transcode the source audio to a compact mp3 we keep for in-app playback."""
    try:
        dest = playback_audio_path(meeting_id)
        subprocess.run(
            ["ffmpeg", "-y", "-i", src_audio_path, "-vn", "-ac", "1",
             "-c:a", "libmp3lame", "-q:a", "5", dest],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        return True
    except Exception as e:
        print(f"[WARN] Could not save playback audio for {meeting_id}: {e}")
        return False


def delete_playback_audio(meeting_id: str) -> None:
    try:
        path = playback_audio_path(meeting_id)
        if os.path.exists(path):
            os.remove(path)
    except OSError:
        pass

def extract_audio(video_path: str, audio_path: str):
    command = [
        "ffmpeg",
        "-y",
        "-i", video_path,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        audio_path
    ]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


_cuda_available_cache: bool | None = None


def cuda_available() -> bool:
    """Detect CUDA support for ctranslate2 (faster-whisper) without importing torch."""
    global _cuda_available_cache
    if _cuda_available_cache is None:
        try:
            import ctranslate2  # pyrefly: ignore [missing-import]
            _cuda_available_cache = ctranslate2.get_cuda_device_count() > 0
        except Exception:
            _cuda_available_cache = False
    return _cuda_available_cache


def resolve_device(requested: str) -> str:
    """Map a requested device ('auto'|'cuda'|'cpu') to one that actually works here.

    Local-first: defaults to CPU and silently falls back to CPU when CUDA is
    requested but unavailable, so the app runs on any machine.
    """
    requested = (requested or "auto").lower()
    if requested == "cpu":
        return "cpu"
    if requested in ("auto", "cuda", "gpu"):
        return "cuda" if cuda_available() else "cpu"
    return "cpu"


def _compute_type_for(device: str) -> str:
    return "float16" if device == "cuda" else "int8"


OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
# Keep the model resident in Ollama between requests so summaries/chat respond
# instantly instead of paying a cold model-load each time. Set "-1" to keep forever.
OLLAMA_KEEP_ALIVE = os.environ.get("OLLAMA_KEEP_ALIVE", "30m")


def _ollama_extra(provider: str) -> dict:
    """Extra request body to keep the Ollama model loaded. No-op for other providers."""
    return {"extra_body": {"keep_alive": OLLAMA_KEEP_ALIVE}} if provider == "ollama" else {}


def get_ollama_status() -> dict:
    """Probe a local Ollama server for availability and installed models."""
    try:
        req = urllib.request.Request(f"{OLLAMA_BASE_URL}/api/tags")
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        models = [m.get("name", "") for m in data.get("models", []) if m.get("name")]
        return {"available": True, "models": models, "base_url": OLLAMA_BASE_URL}
    except Exception:
        return {"available": False, "models": [], "base_url": OLLAMA_BASE_URL}


def get_system_info() -> dict:
    """Report local capabilities so the UI can guide the user toward a working setup."""
    has_cuda = cuda_available()
    try:
        import diarization
        diarize_ok = diarization.diarization_available()
    except Exception:
        diarize_ok = False
    try:
        import urlimport
        url_ok = urlimport.url_import_available()
    except Exception:
        url_ok = False
    return {
        "cuda_available": has_cuda,
        "default_device": "cuda" if has_cuda else "cpu",
        "ollama": get_ollama_status(),
        "diarization_available": diarize_ok,
        "url_import_available": url_ok,
        "ffmpeg_available": shutil.which("ffmpeg") is not None,
    }


def format_segment_line(start: float, end: float, text: str, speaker: str | None = None) -> str:
    prefix = f"{speaker}: " if speaker else ""
    return f"[{start:.2f}s -> {end:.2f}s] {prefix}{text.strip()}"

def _unload_whisper_model(model) -> None:
    import gc
    try:
        del model
    except Exception:
        pass
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:
        pass


def _unload_whisper_model_async(model) -> None:
    """Unload model in background so SSE stream can finish without blocking."""
    threading.Thread(target=_unload_whisper_model, args=(model,), daemon=True).start()


class WhisperModelCache:
    """Reuse a loaded Whisper model across multiple files in a batch."""

    def __init__(self):
        self._model = None
        self._key: tuple[str, str] | None = None

    def get_model(self, model_size: str, device: str):
        device = resolve_device(device)
        key = (model_size, device)
        if self._key != key or self._model is None:
            self.release()
            compute_type = _compute_type_for(device)
            print(f"[DEBUG] Loading Whisper model {model_size} on {device} (cached)...")
            self._model = WhisperModel(
                model_size, device=device, compute_type=compute_type, download_root=MODELS_DIR
            )
            self._key = key
        return self._model

    def release(self) -> None:
        if self._model is not None:
            print("[DEBUG] Releasing cached Whisper model...")
            _unload_whisper_model(self._model)
            self._model = None
            self._key = None


def transcribe_audio_with_cache(
    audio_path: str,
    model_size: str,
    device: str,
    cache: WhisperModelCache,
    on_segment=None,
    speaker_turns=None,
    translate=False,
) -> str:
    """Transcribe audio using a shared model cache. Optional on_segment callback per segment."""
    from diarization import assign_speaker
    model = cache.get_model(model_size, device)
    task = "translate" if translate else "transcribe"
    segments, _info = model.transcribe(audio_path, beam_size=5, vad_filter=True, task=task)
    lines: list[str] = []
    for segment in segments:
        speaker = assign_speaker(speaker_turns, segment.start, segment.end) if speaker_turns else None
        data = {
            "start": segment.start,
            "end": segment.end,
            "text": segment.text,
            "speaker": speaker,
        }
        lines.append(format_segment_line(segment.start, segment.end, segment.text, speaker))
        if on_segment:
            on_segment(data)
    return "\n".join(lines)


def transcribe_audio_stream(audio_path: str, model_size: str, device: str, speaker_turns=None, translate=False):
    from diarization import assign_speaker
    device = resolve_device(device)
    compute_type = _compute_type_for(device)
    print(f"[DEBUG] Loading Whisper model {model_size} into memory on {device}...")
    model = WhisperModel(model_size, device=device, compute_type=compute_type, download_root=MODELS_DIR)
    print(f"[DEBUG] Model loaded successfully. Starting transcription for {audio_path}...")

    try:
        task = "translate" if translate else "transcribe"
        segments, info = model.transcribe(audio_path, beam_size=5, vad_filter=True, task=task)
        yield f"data: {json.dumps({'event': 'language', 'language': info.language, 'device': device})}\n\n"
        for segment in segments:
            speaker = assign_speaker(speaker_turns, segment.start, segment.end) if speaker_turns else None
            data = {
                "start": segment.start,
                "end": segment.end,
                "text": segment.text,
                "speaker": speaker,
            }
            print(f"[DEBUG] Transcribed chunk: [{segment.start:.2f}s - {segment.end:.2f}s] {segment.text}")
            yield f"data: {json.dumps(data)}\n\n"
        yield "data: [DONE]\n\n"
    finally:
        print("[DEBUG] Transcription finished. Scheduling model unload in background...")
        _unload_whisper_model_async(model)

# OpenAI-compatible providers all share the chat.completions surface.
OPENAI_COMPATIBLE = {"openai", "lmstudio", "openai_compatible", "ollama"}

DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "claude": "claude-haiku-4-5",
    "ollama": "llama3.2",
    "lmstudio": "local-model",
    "openai_compatible": "local-model",
}

DEFAULT_EMBED_MODELS = {
    "openai": "text-embedding-3-small",
    "ollama": "nomic-embed-text",
    "lmstudio": "nomic-embed-text",
    "openai_compatible": "nomic-embed-text",
}


def get_embeddings(texts, provider, api_key, base_url, embed_model=""):
    """Embed a list of texts. Anthropic has no embeddings API, so Claude users
    fall back to a local Ollama embedding model."""
    if provider == "claude":
        provider, api_key, base_url = "ollama", "", ""
    if provider not in OPENAI_COMPATIBLE:
        provider = "ollama"
    client, prov = get_llm_client(provider, api_key, base_url)
    model = embed_model or DEFAULT_EMBED_MODELS.get(prov, "nomic-embed-text")
    resp = client.embeddings.create(model=model, input=texts, **_ollama_extra(prov))
    return [d.embedding for d in resp.data]


def get_llm_client(provider, api_key, base_url):
    if provider in OPENAI_COMPATIBLE:
        if provider == "ollama":
            base_url = base_url or f"{OLLAMA_BASE_URL}/v1"
            api_key = api_key or "ollama"
        client_args = {"api_key": api_key if api_key else "lm-studio"}
        if base_url:
            client_args["base_url"] = base_url
        return OpenAI(**client_args), provider
    elif provider == "claude":
        return Anthropic(api_key=api_key), provider
    raise ValueError(f"Unknown provider: {provider}")

def call_llm(client, provider, system_prompt, user_prompt, model_name, force_json=False, max_tokens=4000):
    if provider in OPENAI_COMPATIBLE:
        extra_args = {}
        # OpenAI and Ollama both honor the JSON response_format flag; LM Studio/others vary.
        if force_json and provider in ("openai", "ollama"):
            extra_args["response_format"] = {"type": "json_object"}
        extra_body = _ollama_extra(provider)
        if extra_body and "extra_body" in extra_args:
            extra_args["extra_body"].update(extra_body["extra_body"])
        else:
            extra_args.update(extra_body)

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        response = client.chat.completions.create(
            model=model_name or DEFAULT_MODELS.get(provider, "gpt-4o-mini"),
            messages=messages,
            temperature=0.3,
            **extra_args
        )
        return response.choices[0].message.content
    elif provider == "claude":
        kwargs = {
            "model": model_name or DEFAULT_MODELS["claude"],
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": user_prompt}]
        }
        if system_prompt:
            kwargs["system"] = system_prompt
        response = client.messages.create(**kwargs)
        return response.content[0].text

# Keep prompts within reach of small local models (Ollama often defaults to a
# ~4k token context). Beyond this we condense or retrieve instead of truncating.
MAX_CONTEXT_CHARS = 12000


def _split_text(text: str, size: int, overlap: int) -> list[str]:
    parts: list[str] = []
    start = 0
    while start < len(text):
        parts.append(text[start:start + size])
        start += size - overlap
        if start <= 0:
            break
    return parts


def condense_transcript(transcript, provider, api_key, base_url, model_name, _depth=0):
    """Map-reduce a long transcript into dense notes that fit a small context window.
    Short transcripts pass through unchanged."""
    transcript = transcript or ""
    if len(transcript) <= MAX_CONTEXT_CHARS or _depth >= 2:
        return transcript

    client, prov = get_llm_client(provider, api_key, base_url)
    system_prompt = (
        "You compress meeting transcript excerpts into dense factual notes. Preserve "
        "speaker names, decisions, action items, owners, dates, numbers, and key quotes. "
        "Output concise bullet points only — no preamble."
    )
    notes = []
    for chunk in _split_text(transcript, 8000, 200):
        out = call_llm(
            client, prov, system_prompt,
            f"Transcript excerpt:\n{chunk}\n\nDense notes:",
            model_name, force_json=False, max_tokens=1000,
        )
        if out:
            notes.append(out.strip())
    condensed = "\n".join(notes)
    # If still too long, condense the notes again.
    return condense_transcript(condensed, provider, api_key, base_url, model_name, _depth + 1)


def select_relevant_context(transcript, question, provider, api_key, base_url):
    """For long transcripts in chat, retrieve the chunks most relevant to the
    question via embeddings. Falls back to head+tail truncation if embeddings
    aren't available."""
    if len(transcript or "") <= MAX_CONTEXT_CHARS:
        return transcript
    chunks = _split_text(transcript, 1500, 150)
    try:
        import math
        vectors = get_embeddings(chunks + [question], provider, api_key, base_url)
        q_vec = vectors[-1]
        chunk_vecs = vectors[:-1]

        def cos(a, b):
            dot = sum(x * y for x, y in zip(a, b))
            na = math.sqrt(sum(x * x for x in a))
            nb = math.sqrt(sum(y * y for y in b))
            return dot / (na * nb) if na and nb else 0.0

        ranked = sorted(zip(chunks, chunk_vecs), key=lambda cv: cos(q_vec, cv[1]), reverse=True)
        selected, total = [], 0
        for chunk, _ in ranked:
            if total + len(chunk) > MAX_CONTEXT_CHARS:
                break
            selected.append(chunk)
            total += len(chunk)
        return "\n...\n".join(selected)
    except Exception as e:
        print(f"[WARN] context retrieval failed, truncating: {e}")
        half = MAX_CONTEXT_CHARS // 2
        return transcript[:half] + "\n...\n" + transcript[-half:]


def summarize_transcript(transcript: str, json_template: str, provider: str, api_key: str, base_url: str, model_name: str):
    transcript = condense_transcript(transcript, provider, api_key, base_url, model_name)
    # Pre-process: convert the template into a simple skeleton the LLM just fills in
    try:
        tmpl = json.loads(json_template)
    except:
        tmpl = {}
    
    skeleton = {}
    if "name" in tmpl:
        skeleton["name"] = tmpl["name"]
    if "description" in tmpl:
        skeleton["description"] = tmpl["description"]
    
    if "sections" in tmpl:
        skeleton["sections"] = []
        for section in tmpl["sections"]:
            s = {"title": section.get("title", "")}
            hint = section.get("instruction", "")
            fmt = section.get("format", "paragraph")
            if fmt == "string":
                s["content"] = f"<Fill: {hint}>"
            elif fmt == "paragraph":
                s["content"] = f"<Write a paragraph: {hint}>"
            elif fmt == "list":
                item_fmt = section.get("item_format", "")
                if item_fmt:
                    s["content"] = f"<Create a markdown table: {hint}. Use columns: {item_fmt}>"
                else:
                    s["content"] = f"<Write a bullet list: {hint}>"
            else:
                s["content"] = f"<Fill: {hint}>"
            skeleton["sections"].append(s)
    
    skeleton_str = json.dumps(skeleton, indent=2)
    
    system_prompt = "You are an expert meeting summarizer. You MUST respond with ONLY a valid JSON object. No markdown code fences, no explanations, no preamble. Just pure JSON."
    user_prompt = f"""Fill in the following JSON skeleton using information from the transcript below.
Replace every placeholder (text inside < >) with actual content from the transcript.
For table placeholders, generate a proper markdown table string.
Return the completed JSON and nothing else.

JSON skeleton to fill:
{skeleton_str}

Transcript:
{transcript}"""
    client, prov = get_llm_client(provider, api_key, base_url)
    return call_llm(client, prov, system_prompt, user_prompt, model_name, force_json=True)

def generate_meeting_title(transcript: str, provider: str, api_key: str, base_url: str, model_name: str):
    short_transcript = transcript[:2000]
    system_prompt = "You are a professional assistant. Output ONLY the title text, nothing else."
    user_prompt = f"Read the following meeting transcript snippet and generate a short, descriptive, professional title for it (maximum 6 words).\n\nTranscript snippet: {short_transcript}"
    client, prov = get_llm_client(provider, api_key, base_url)
    return call_llm(client, prov, system_prompt, user_prompt, model_name, force_json=False).strip().strip('"')

def generate_custom_template(description: str, provider: str, api_key: str, base_url: str, model_name: str):
    system_prompt = "You are an expert JSON template designer. You MUST return ONLY valid JSON and absolutely no other text."
    user_prompt = f"""Create a JSON structure template for summarizing a meeting based on this user description:
"{description}"

The JSON values should be empty strings, empty arrays, or descriptive placeholders."""
    client, prov = get_llm_client(provider, api_key, base_url)
    return call_llm(client, prov, system_prompt, user_prompt, model_name, force_json=True)


def warmup(provider, api_key, base_url, model_name):
    """Preload the local model into memory so the first real request is instant.
    Only meaningful for Ollama; a no-op for cloud providers (avoids spending tokens)."""
    if provider != "ollama":
        return {"warmed": False}
    try:
        client, prov = get_llm_client(provider, api_key, base_url)
        client.chat.completions.create(
            model=model_name or DEFAULT_MODELS["ollama"],
            messages=[{"role": "user", "content": "ok"}],
            max_tokens=1,
            **_ollama_extra(prov),
        )
        return {"warmed": True}
    except Exception as e:
        print(f"[WARN] warmup failed: {e}")
        return {"warmed": False}


def suggest_tags(transcript, provider, api_key, base_url, model_name):
    """Suggest a few short topical tags for a meeting. Returns raw model text."""
    transcript = condense_transcript(transcript, provider, api_key, base_url, model_name)
    system_prompt = (
        "You label meetings with short topical tags. Respond with ONLY a JSON object "
        '{"tags": ["...", "..."]} containing 3-6 lowercase tags (1-2 words each, no '
        "punctuation) capturing the meeting's topics, project, or type. No prose."
    )
    client, prov = get_llm_client(provider, api_key, base_url)
    return call_llm(client, prov, system_prompt, f"Transcript:\n{transcript}", model_name, force_json=True, max_tokens=200)


def extract_action_items(transcript, provider, api_key, base_url, model_name):
    """Ask the LLM for action items as JSON. Returns the raw model text (caller parses)."""
    transcript = condense_transcript(transcript, provider, api_key, base_url, model_name)
    system_prompt = (
        "You extract action items from meeting transcripts. Find EVERY task, follow-up, "
        "commitment, or to-do mentioned by anyone — list each as a separate item. "
        'Respond with ONLY a JSON object of the form '
        '{"action_items": [{"task": "...", "owner": "...", "due": "..."}]}. '
        "'owner' is the person responsible; 'due' is any date or timeframe. Use an empty "
        'string when not stated. If there are genuinely none, return {"action_items": []}. '
        "No prose, no code fences."
    )
    user_prompt = f"Transcript:\n{transcript}"
    client, prov = get_llm_client(provider, api_key, base_url)
    return call_llm(client, prov, system_prompt, user_prompt, model_name, force_json=True, max_tokens=1500)


def chat_with_transcript(
    transcript: str,
    question: str,
    history: list[dict],
    provider: str,
    api_key: str,
    base_url: str,
    model_name: str,
):
    """Answer a free-form question grounded in a single meeting transcript."""
    transcript = select_relevant_context(transcript, question, provider, api_key, base_url)
    system_prompt = (
        "You are a helpful meeting assistant. Answer the user's questions using ONLY the "
        "meeting transcript provided below. If the answer is not in the transcript, say so "
        "plainly. Be concise and cite specific moments or quotes when helpful.\n\n"
        f"=== TRANSCRIPT ===\n{transcript}\n=== END TRANSCRIPT ==="
    )

    client, prov = get_llm_client(provider, api_key, base_url)

    if prov in OPENAI_COMPATIBLE:
        messages = [{"role": "system", "content": system_prompt}]
        for turn in history[-10:]:
            role = turn.get("role")
            content = turn.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": question})
        response = client.chat.completions.create(
            model=model_name or DEFAULT_MODELS.get(prov, "gpt-4o-mini"),
            messages=messages,
            temperature=0.3,
            **_ollama_extra(prov),
        )
        return response.choices[0].message.content

    # Claude: history goes in messages, transcript stays in the system prompt.
    msgs = []
    for turn in history[-10:]:
        role = turn.get("role")
        content = turn.get("content", "")
        if role in ("user", "assistant") and content:
            msgs.append({"role": role, "content": content})
    msgs.append({"role": "user", "content": question})
    response = client.messages.create(
        model=model_name or DEFAULT_MODELS["claude"],
        max_tokens=2000,
        system=system_prompt,
        messages=msgs,
    )
    return response.content[0].text
