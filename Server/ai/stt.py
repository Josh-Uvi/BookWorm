"""faster-whisper speech-to-text (offline, CTranslate2, MIT licence).

faster-whisper decodes browser audio (WebM/Opus, MP4, ...) through PyAV,
so no manual format conversion is needed. On CPU use the `int8` compute
type; on GPU the implementation falls back to `float16`.
"""
from __future__ import annotations

from .base import Transcript, TranscriptSegment


class FasterWhisperSTT:
    def __init__(self, model_size: str = "base", device: str = "cpu", compute_type: str = "int8"):
        # Lazy import keeps module loading cheap and testable without the dep.
        from faster_whisper import WhisperModel

        if device != "cpu" and compute_type == "int8":
            compute_type = "float16"  # sensible GPU default
        self._model = WhisperModel(model_size, device=device, compute_type=compute_type)

    def transcribe(self, audio_path: str) -> Transcript:
        segments_iter, info = self._model.transcribe(audio_path, vad_filter=True)
        segments = [
            TranscriptSegment(start=float(s.start), end=float(s.end), text=s.text.strip())
            for s in segments_iter
        ]
        segments = [segment for segment in segments if segment.text]
        return Transcript(
            segments=segments,
            language=getattr(info, "language", "") or "",
            confidence=float(getattr(info, "language_probability", 0.0) or 0.0),
        )
