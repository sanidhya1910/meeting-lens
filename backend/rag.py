"""Library-wide retrieval-augmented chat: embed every meeting transcript once,
then answer questions grounded in the most relevant chunks across all meetings."""
import hashlib
import math
from typing import Any

import meetings as meetings_service
from pipeline import get_embeddings, get_llm_client, call_llm, DEFAULT_MODELS
from storage import JsonStore

_store = JsonStore("embeddings.json", default={})

CHUNK_SIZE = 1200
CHUNK_OVERLAP = 150


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _chunk(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        chunks.append(text[start:end])
        start = end - CHUNK_OVERLAP
        if start <= 0:
            break
    return chunks


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _embed_batched(texts: list[str], cfg: dict, batch: int = 32) -> list[list[float]]:
    vectors: list[list[float]] = []
    for i in range(0, len(texts), batch):
        vectors.extend(
            get_embeddings(
                texts[i:i + batch],
                cfg["provider"], cfg["api_key"], cfg["base_url"], cfg["embed_model"],
            )
        )
    return vectors


def index_library(cfg: dict) -> dict[str, int]:
    """Embed any meeting whose transcript changed since last indexed. Returns counts."""
    index = _store.read()
    indexed, skipped = 0, 0
    all_meetings = meetings_service.load_meetings()
    # Drop embeddings for meetings that no longer exist.
    live_ids = {m["id"] for m in all_meetings}
    for stale_id in [mid for mid in index if mid not in live_ids]:
        del index[stale_id]
    for m in all_meetings:
        transcript = (m.get("transcript") or "").strip()
        if not transcript:
            continue
        h = _hash(transcript)
        existing = index.get(m["id"])
        if existing and existing.get("hash") == h and existing.get("model") == cfg["embed_model"]:
            skipped += 1
            continue
        chunks = _chunk(transcript)
        if not chunks:
            continue
        vectors = _embed_batched(chunks, cfg)
        index[m["id"]] = {
            "hash": h,
            "model": cfg["embed_model"],
            "title": m.get("title", ""),
            "chunks": [{"text": c, "vector": v} for c, v in zip(chunks, vectors)],
        }
        indexed += 1
    _store.write(index)
    return {"indexed": indexed, "skipped": skipped}


def retrieve(question: str, cfg: dict, top_k: int = 6) -> list[dict[str, Any]]:
    index = _store.read()
    q_vec = _embed_batched([question], cfg)[0]
    scored: list[dict[str, Any]] = []
    for meeting_id, entry in index.items():
        for chunk in entry.get("chunks", []):
            scored.append({
                "meeting_id": meeting_id,
                "title": entry.get("title", ""),
                "text": chunk["text"],
                "score": _cosine(q_vec, chunk["vector"]),
            })
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]


def answer_library_question(question: str, history: list[dict], cfg: dict) -> dict[str, Any]:
    index_library(cfg)
    hits = retrieve(question, cfg)
    if not hits:
        return {"answer": "I couldn't find any transcribed meetings to search. Transcribe a meeting first.", "sources": []}

    context_blocks = []
    seen_titles = {}
    for i, h in enumerate(hits, 1):
        context_blocks.append(f"[{i}] From meeting \"{h['title']}\":\n{h['text']}")
        seen_titles.setdefault(h["meeting_id"], h["title"])

    system_prompt = (
        "You are a meeting intelligence assistant. Answer the user's question using ONLY the "
        "excerpts below, which are drawn from across multiple meetings. Cite the meetings you "
        "used by their bracketed number, e.g. [1]. If the excerpts don't contain the answer, say so.\n\n"
        + "\n\n".join(context_blocks)
    )

    convo = ""
    for turn in history[-6:]:
        role = turn.get("role")
        content = turn.get("content", "")
        if role in ("user", "assistant") and content:
            convo += f"{role.upper()}: {content}\n"
    user_prompt = f"{convo}USER QUESTION: {question}"

    client, prov = get_llm_client(cfg["provider"], cfg["api_key"], cfg["base_url"])
    answer = call_llm(
        client, prov, system_prompt, user_prompt,
        cfg["model"] or DEFAULT_MODELS.get(prov, ""), force_json=False, max_tokens=1500,
    )
    sources = [{"meeting_id": mid, "title": title} for mid, title in seen_titles.items()]
    return {"answer": answer, "sources": sources}
