"""Per-connection reading session.

Accumulates streamed audio, transcribes it in periodic flushes (returning
only *new* transcript segments — whisper is given the whole buffer each
time, and segment timestamps identify what has not been delivered yet),
buffers the transcript for the LLM, and tracks when the next help
analysis is due.
"""
from __future__ import annotations

import tempfile
import time

from ai.base import STTClient, TranscriptSegment


class ReadingSession:
    def __init__(
        self,
        accumulation_window_seconds: float = 5.0,
        max_buffer_bytes: int = 20_971_520,
    ):
        self.accumulation_window_seconds = accumulation_window_seconds
        self.max_buffer_bytes = max_buffer_bytes

        # ── Audio buffering ─────────────────────────────────────────
        self._first_chunk: bytes | None = None  # WebM/Matroska container header chunk
        self._buffer = bytearray()
        self._pending = False        # new audio arrived since the last flush
        self._last_end = 0.0         # last transcribed offset within this epoch
        self.epoch = 0               # bumped whenever the buffer is rotated

        # ── Transcript accumulation for the LLM ──────────────────────
        self._accumulated: list[str] = []
        self._last_analysis_time: float | None = None

        # ── Guardrail state ──────────────────────────────────────────────
        # The book passage the child is reading (shared by the client), used
        # to tell "reading aloud" apart from "talking to the assistant".
        self.expected_text: str | None = None
        self._last_help_at: float | None = None
        # Silenced by the child ("stop", "shh"…): no interruptions until the
        # next direct question re-engages the assistant.
        self._muted = False

    # ── Audio ────────────────────────────────────────────────────────

    def add_audio(self, data: bytes) -> None:
        if self._first_chunk is None:
            # The first MediaRecorder chunk carries the container header;
            # keep it so rotated buffers remain decodable.
            self._first_chunk = bytes(data)
        self._buffer.extend(data)
        self._pending = True

    @property
    def has_pending_audio(self) -> bool:
        return self._pending and len(self._buffer) > 0

    def flush(self, stt: STTClient) -> tuple[list[TranscriptSegment], float]:
        """Transcribe buffered audio; return (new segments, overall confidence).

        Blocking (whisper runs on CPU/GPU) — call via `asyncio.to_thread`.
        """
        if not self.has_pending_audio:
            return [], 0.0
        self._pending = False

        with tempfile.NamedTemporaryFile(suffix=".webm") as tmp:
            tmp.write(bytes(self._buffer))
            tmp.flush()
            transcript = stt.transcribe(tmp.name)

        new_segments = [s for s in transcript.segments if s.end > self._last_end + 0.05]
        if transcript.segments:
            self._last_end = max(s.end for s in transcript.segments)
        self._rotate_if_needed()
        return new_segments, transcript.confidence

    def _rotate_if_needed(self) -> None:
        """Reset the buffer once it grows too large, keeping the container header."""
        if len(self._buffer) >= self.max_buffer_bytes:
            self._buffer = bytearray(self._first_chunk or b"")
            self._last_end = 0.0
            self.epoch += 1

    # ── Transcript / analysis ─────────────────────────────────────────

    def add_text(self, text: str) -> None:
        self._accumulated.append(text)

    def get_accumulated_text(self) -> str:
        return " ".join(self._accumulated)

    def should_analyze(self) -> bool:
        if not self._accumulated:
            return False
        if self._last_analysis_time is None:
            return True
        return (time.monotonic() - self._last_analysis_time) >= self.accumulation_window_seconds

    def mark_analyzed(self) -> None:
        self._last_analysis_time = time.monotonic()
        self._accumulated.clear()

    # ── Guardrails ────────────────────────────────────────────────────

    def set_expected_text(self, text: str) -> None:
        """Remember the passage the child is reading (blank clears it)."""
        self.expected_text = text or None

    @property
    def last_help_at(self) -> float | None:
        """Monotonic timestamp of the last delivered help message, if any."""
        return self._last_help_at

    def mark_help_delivered(self) -> None:
        self._last_help_at = time.monotonic()

    @property
    def muted(self) -> bool:
        """Silenced by the child ("stop") — no interruptions until the
        next direct question re-engages the assistant."""
        return self._muted

    def set_muted(self, muted: bool) -> None:
        self._muted = bool(muted)
