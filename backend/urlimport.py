"""Optional audio import from a URL (YouTube, etc.) via yt-dlp.

Enable with:  pip install -r requirements-url.txt
(yt-dlp also needs ffmpeg, which Meeting Lens already requires.)
"""
import os
import uuid


def url_import_available() -> bool:
    try:
        import yt_dlp  # noqa: F401  pyrefly: ignore [missing-import]
        return True
    except Exception:
        return False


def download_audio(url: str, dest_dir: str) -> tuple[str, str]:
    """Download the best audio track from `url` into dest_dir.

    Returns (filepath, title). Raises if yt-dlp isn't installed or download fails.
    """
    import yt_dlp  # pyrefly: ignore [missing-import]

    token = uuid.uuid4().hex
    outtmpl = os.path.join(dest_dir, f"url_{token}.%(ext)s")
    opts = {
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        # Re-encode to a uniform m4a so the rest of the pipeline is happy.
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "m4a"}],
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
    title = (info.get("title") or "").strip()

    # The post-processor renames to .m4a; find the produced file.
    produced = os.path.join(dest_dir, f"url_{token}.m4a")
    if not os.path.exists(produced):
        # Fall back to whatever extension landed on disk.
        for name in os.listdir(dest_dir):
            if name.startswith(f"url_{token}."):
                produced = os.path.join(dest_dir, name)
                break
    if not os.path.exists(produced):
        raise RuntimeError("Download succeeded but no audio file was produced")
    return produced, title
