"""Text-to-speech implementations.

- `EdgeTTS`: free Microsoft neural voices — zero setup, needs internet.
- `PiperTTS`: fully offline neural TTS — requires voice files, fetched by
  `Server/scripts/download_piper_voice.py`.

Both satisfy the `TTSClient` protocol, so either can be selected with
`TTS_PROVIDER` without any other change.
"""
from __future__ import annotations

import asyncio
import io
import wave
from pathlib import Path


class EdgeTTS:
    def __init__(self, voice: str = "en-GB-SoniaNeural"):
        self.voice = voice

    async def synthesize(self, text: str) -> tuple[bytes, str]:
        import edge_tts  # lazy import

        communicate = edge_tts.Communicate(text, self.voice)
        buffer = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buffer.extend(chunk["data"])
        if not buffer:
            raise RuntimeError(f"edge-tts produced no audio for voice {self.voice!r}")
        return bytes(buffer), "mp3"


class PiperTTS:
    def __init__(self, voice: str = "en_US-amy-medium", models_dir: str = "models"):
        from piper import PiperVoice  # lazy import

        # Relative model dirs are resolved against the Server root (this
        # file lives at Server/ai/tts.py), not the CWD — `make dev-server`
        # runs from the repo root, where ./models does not exist. Absolute
        # paths (Docker's /app/models) are untouched.
        server_root = Path(__file__).resolve().parent.parent
        model_path = Path(models_dir) / f"{voice}.onnx"
        if not model_path.is_absolute():
            model_path = server_root / model_path
        if not model_path.exists():
            raise FileNotFoundError(
                f"Piper voice not found: {model_path}\n"
                "Download it with:\n"
                f"  python Server/scripts/download_piper_voice.py "
                f"--voice {voice} --out-dir Server/models"
            )
        self._voice = PiperVoice.load(str(model_path))

    async def synthesize(self, text: str) -> tuple[bytes, str]:
        audio = await asyncio.to_thread(self._synthesize_sync, text)
        return audio, "wav"

    def _synthesize_sync(self, text: str) -> bytes:
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav_file:
            # piper-tts >= 1.3 removed WAV-header handling from synthesize()
            # (raw frames only) — use synthesize_wav(), which writes the header
            # itself. Older releases wrote the header inside synthesize().
            if hasattr(self._voice, "synthesize_wav"):
                self._voice.synthesize_wav(text, wav_file)
            else:  # piper-tts < 1.3
                # Old piper took the wav file as argument 2; the modern stubs
                # describe only the >= 1.3 signature, so silence the checker.
                self._voice.synthesize(text, wav_file)  # type: ignore[arg-type]
        return buffer.getvalue()
