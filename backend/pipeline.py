import os
import subprocess
from faster_whisper import WhisperModel
from openai import OpenAI
from anthropic import Anthropic

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

def transcribe_audio(audio_path: str, model_size: str, device: str):
    # device is "cuda" or "cpu"
    # compute_type can be float16 for cuda, int8 for cpu
    compute_type = "float16" if device == "cuda" else "int8"
    model = WhisperModel(model_size, device=device, compute_type=compute_type)
    segments, info = model.transcribe(audio_path, beam_size=5)
    transcript = ""
    for segment in segments:
        transcript += f"[{segment.start:.2f}s -> {segment.end:.2f}s] {segment.text}\n"
    return transcript

def summarize_transcript(transcript: str, json_template: str, provider: str, api_key: str, base_url: str, model_name: str):
    prompt = f"""You are an expert summarizer. Please summarize the following transcript using the provided JSON structure template. 
Return ONLY valid JSON that matches the template. Do not include any markdown formatting like ```json.

Transcript:
{transcript}

JSON Template to follow:
{json_template}
"""
    
    if provider == "openai" or provider == "lmstudio" or provider == "openai_compatible":
        client_args = {"api_key": api_key if api_key else "lm-studio"}
        if base_url:
            client_args["base_url"] = base_url
        client = OpenAI(**client_args)
        
        # Don't use response_format for general compatible APIs as they might not support it
        extra_args = {}
        if provider == "openai":
            extra_args["response_format"] = {"type": "json_object"}
            
        response = client.chat.completions.create(
            model=model_name or "gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            **extra_args
        )
        return response.choices[0].message.content
    elif provider == "claude":
        client = Anthropic(api_key=api_key)
        response = client.messages.create(
            model=model_name or "claude-3-haiku-20240307",
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.content[0].text
    else:
        raise ValueError(f"Unknown provider: {provider}")
