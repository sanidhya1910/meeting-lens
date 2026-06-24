"""Optional speaker diarization via pyannote.audio.

This is intentionally lazy and best-effort: if pyannote isn't installed or no
Hugging Face token is configured, the app keeps working without speaker labels.

To enable:
  1. pip install -r requirements-diarize.txt
  2. Accept the model license at https://hf.co/pyannote/speaker-diarization-3.1
  3. Set HF_TOKEN (or HUGGINGFACE_TOKEN) in the environment.
A GPU is strongly recommended; on CPU diarization is slow.
"""
import os

_pipeline = None
_load_failed = False


def _hf_token() -> str:
    return os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN") or ""


def diarization_available() -> bool:
    """True if pyannote is importable and a HF token is present."""
    if not _hf_token():
        return False
    try:
        import pyannote.audio  # noqa: F401  pyrefly: ignore [missing-import]
        return True
    except Exception:
        return False


def _get_pipeline():
    global _pipeline, _load_failed
    if _pipeline is not None or _load_failed:
        return _pipeline
    try:
        from pyannote.audio import Pipeline  # pyrefly: ignore [missing-import]
        _pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1", use_auth_token=_hf_token()
        )
        try:
            import torch  # pyrefly: ignore [missing-import]
            if torch.cuda.is_available():
                _pipeline.to(torch.device("cuda"))
        except Exception:
            pass
    except Exception as e:
        print(f"[WARN] Failed to load diarization pipeline: {e}")
        _load_failed = True
    return _pipeline


def diarize(audio_path: str):
    """Return a list of (start, end, speaker_label) turns, or None if unavailable."""
    pipeline = _get_pipeline()
    if pipeline is None:
        return None
    try:
        diarization = pipeline(audio_path)
        turns = []
        # Map raw labels (SPEAKER_00, ...) to friendly "Speaker 1", "Speaker 2", ...
        label_map: dict[str, str] = {}
        for turn, _, label in diarization.itertracks(yield_label=True):
            if label not in label_map:
                label_map[label] = f"Speaker {len(label_map) + 1}"
            turns.append((turn.start, turn.end, label_map[label]))
        return turns
    except Exception as e:
        print(f"[WARN] Diarization failed: {e}")
        return None


def assign_speaker(turns, start: float, end: float):
    """Pick the speaker whose turn overlaps a [start, end] segment the most."""
    if not turns:
        return None
    best_label, best_overlap = None, 0.0
    for t_start, t_end, label in turns:
        overlap = min(end, t_end) - max(start, t_start)
        if overlap > best_overlap:
            best_overlap = overlap
            best_label = label
    return best_label
