import os
import subprocess
import site
import sys
import json

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
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)

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

def transcribe_audio_stream(audio_path: str, model_size: str, device: str):
    import gc
    compute_type = "float16" if device == "cuda" else "int8"
    print(f"[DEBUG] Loading Whisper model {model_size} into memory on {device}...")
    model = WhisperModel(model_size, device=device, compute_type=compute_type, download_root=MODELS_DIR)
    print(f"[DEBUG] Model loaded successfully. Starting transcription for {audio_path}...")
    
    try:
        segments, info = model.transcribe(audio_path, beam_size=5)
        for segment in segments:
            data = {
                "start": segment.start,
                "end": segment.end,
                "text": segment.text
            }
            print(f"[DEBUG] Transcribed chunk: [{segment.start:.2f}s - {segment.end:.2f}s] {segment.text}")
            yield f"data: {json.dumps(data)}\n\n"
        yield "data: [DONE]\n\n"
    finally:
        print("[DEBUG] Transcription completed or interrupted. Unloading model to free VRAM...")
        del model
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                print("[DEBUG] Cleared PyTorch CUDA cache.")
        except ImportError:
            pass
        print("[DEBUG] Model unloaded successfully.")

def get_llm_client(provider, api_key, base_url):
    if provider in ["openai", "lmstudio", "openai_compatible"]:
        client_args = {"api_key": api_key if api_key else "lm-studio"}
        if base_url:
            client_args["base_url"] = base_url
        return OpenAI(**client_args), provider
    elif provider == "claude":
        return Anthropic(api_key=api_key), provider
    raise ValueError(f"Unknown provider: {provider}")

def call_llm(client, provider, system_prompt, user_prompt, model_name, force_json=False):
    if provider in ["openai", "lmstudio", "openai_compatible"]:
        extra_args = {}
        if provider == "openai" and force_json:
            extra_args["response_format"] = {"type": "json_object"}
            
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})
            
        response = client.chat.completions.create(
            model=model_name or "gpt-3.5-turbo",
            messages=messages,
            temperature=0.3,
            **extra_args
        )
        return response.choices[0].message.content
    elif provider == "claude":
        kwargs = {
            "model": model_name or "claude-3-haiku-20240307",
            "max_tokens": 4000,
            "messages": [{"role": "user", "content": user_prompt}]
        }
        if system_prompt:
            kwargs["system"] = system_prompt
        response = client.messages.create(**kwargs)
        return response.content[0].text

def summarize_transcript(transcript: str, json_template: str, provider: str, api_key: str, base_url: str, model_name: str):
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
