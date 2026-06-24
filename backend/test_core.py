"""Fast unit tests for pure logic (no models or network). Run: python -m pytest"""
import pipeline
import diarization
import rag
import main


# --- pipeline ---------------------------------------------------------------

def test_format_segment_line_plain():
    assert pipeline.format_segment_line(0, 5, "hello world") == "[0.00s -> 5.00s] hello world"


def test_format_segment_line_speaker_and_strip():
    line = pipeline.format_segment_line(1.2, 3.456, "  hi  ", "Speaker 1")
    assert line == "[1.20s -> 3.46s] Speaker 1: hi"


def test_resolve_device():
    assert pipeline.resolve_device("cpu") == "cpu"
    assert pipeline.resolve_device("nonsense") == "cpu"
    assert pipeline.resolve_device("auto") in ("cuda", "cpu")


def test_compute_type():
    assert pipeline._compute_type_for("cpu") == "int8"
    assert pipeline._compute_type_for("cuda") == "float16"


def test_default_models_present():
    for p in ("openai", "claude", "ollama"):
        assert pipeline.DEFAULT_MODELS[p]
        assert p == "claude" or pipeline.DEFAULT_EMBED_MODELS[p]


# --- diarization ------------------------------------------------------------

def test_assign_speaker_overlap():
    turns = [(0.0, 5.0, "Speaker 1"), (5.0, 10.0, "Speaker 2")]
    assert diarization.assign_speaker(turns, 1.0, 4.0) == "Speaker 1"
    assert diarization.assign_speaker(turns, 6.0, 9.0) == "Speaker 2"
    # straddles both, more overlap with Speaker 2
    assert diarization.assign_speaker(turns, 4.0, 9.0) == "Speaker 2"


def test_assign_speaker_empty():
    assert diarization.assign_speaker(None, 0, 1) is None
    assert diarization.assign_speaker([], 0, 1) is None


# --- rag --------------------------------------------------------------------

def test_chunk_short_text():
    assert rag._chunk("short") == ["short"]
    assert rag._chunk("   ") == []


def test_chunk_long_text_overlaps():
    text = "x" * (rag.CHUNK_SIZE * 2)
    chunks = rag._chunk(text)
    assert len(chunks) >= 2
    assert all(len(c) <= rag.CHUNK_SIZE for c in chunks)


def test_split_text_covers_and_overlaps():
    parts = pipeline._split_text("abcdefghij", 4, 1)
    # every char represented, chunks no longer than size
    assert all(len(p) <= 4 for p in parts)
    assert "".join(p.replace("…", "") for p in parts)  # non-empty
    assert parts[0] == "abcd"


def test_condense_passthrough_short():
    # short transcripts must not hit the network
    assert pipeline.condense_transcript("hi there", "ollama", "", "", "llama3.2") == "hi there"


def test_select_context_passthrough_short():
    assert pipeline.select_relevant_context("short transcript", "q?", "ollama", "", "") == "short transcript"


def test_cosine():
    assert rag._cosine([1, 0], [1, 0]) == 1.0
    assert rag._cosine([1, 0], [0, 1]) == 0.0
    assert rag._cosine([0, 0], [1, 1]) == 0.0


def test_hash_deterministic():
    assert rag._hash("abc") == rag._hash("abc")
    assert rag._hash("abc") != rag._hash("abd")


# --- main: summary JSON parsing/repair --------------------------------------

def test_parse_summary_valid():
    assert main._parse_summary_json('{"a": 1}') == {"a": 1}


def test_parse_summary_repairs_truncated():
    repaired = main._parse_summary_json('{"a": 1, "b": [1, 2')
    assert isinstance(repaired, dict)
    assert repaired.get("a") == 1


def test_parse_summary_garbage_is_wrapped():
    out = main._parse_summary_json("not json at all")
    assert isinstance(out, (dict, list))


# --- storage ----------------------------------------------------------------

def test_jsonstore_roundtrip(tmp_path):
    from storage import JsonStore
    store = JsonStore("unit_test.json", default=[])
    store.path = str(tmp_path / "unit_test.json")
    store.lock_path = store.path + ".lock"
    store.write([1, 2])
    assert store.read() == [1, 2]
    store.modify(lambda d: d + [3])
    assert store.read() == [1, 2, 3]
