"""Unit tests for the TTS provider path handling."""

from pathlib import Path

import pytest

from ai.tts import PiperTTS


def test_relative_models_dir_resolves_against_server_root():
    """`make dev-server` runs from the repo root, so a relative
    PIPER_MODELS_DIR (e.g. "models") must resolve to Server/models —
    not against the CWD, where ./models does not exist."""
    server_root = Path(__file__).resolve().parent.parent

    with pytest.raises(FileNotFoundError) as excinfo:
        PiperTTS(voice="nonexistent-voice", models_dir="models")

    # The error must point at the Server-rooted path, not a CWD-relative one.
    expected = server_root / "models" / "nonexistent-voice.onnx"
    assert str(expected) in str(excinfo.value)


def test_absolute_models_dir_is_untouched(tmp_path: Path):
    """Absolute paths (Docker's /app/models) must be used as-is."""
    with pytest.raises(FileNotFoundError) as excinfo:
        PiperTTS(voice="nonexistent-voice", models_dir=str(tmp_path))

    expected = tmp_path / "nonexistent-voice.onnx"
    assert str(expected) in str(excinfo.value)
