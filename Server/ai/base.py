"""Provider-agnostic AI interfaces — the "plug-and-play" core.

Concrete implementations live in `ai/stt.py`, `ai/llm.py` and `ai/tts.py`
and are assembled by `providers.py` based on environment variables. Adding
a new provider means adding one class and registering it in the factory —
no business logic changes required.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, Sequence


@dataclass
class TranscriptSegment:
    """A span of transcribed speech (times are seconds within the audio file)."""

    start: float
    end: float
    text: str


@dataclass
class Transcript:
    """Result of transcribing one audio file."""

    segments: Sequence[TranscriptSegment] = field(default_factory=list)
    language: str = ""
    confidence: float = 0.0


class STTClient(Protocol):
    def transcribe(self, audio_path: str) -> Transcript:
        """Transcribe an audio file. Blocking — call via `asyncio.to_thread`."""
        ...


class LLMClient(Protocol):
    async def analyze(self, prompt: str) -> dict:
        """Run the reading-assistant prompt and return the parsed JSON verdict."""
        ...


class TTSClient(Protocol):
    async def synthesize(self, text: str) -> tuple[bytes, str]:
        """Synthesize speech; return `(audio_bytes, format)` e.g. `(b"...", "wav")`."""
        ...
