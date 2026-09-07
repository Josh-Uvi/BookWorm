"""
Environment-driven configuration for the AI Reading Assistant server.

Every knob is a plain environment variable (see `.env.example` at the repo
root). No cloud-specific constants live here — swapping the STT/LLM/TTS
provider is a configuration change, never a code change.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

try:  # python-dotenv (in requirements.txt); optional at runtime
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover
    pass


def _str(name: str, default: str) -> str:
    value = os.getenv(name)
    return default if value is None or value == "" else value


def _int(name: str, default: int) -> int:
    try:
        return int(_str(name, str(default)))
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(_str(name, str(default)))
    except ValueError:
        return default


def _bool(name: str, default: bool) -> bool:
    return _str(name, "true" if default else "false").lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    """All runtime settings, resolved from the environment."""

    # ── Networking ──────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8765                     # WebSocket (audio) endpoint
    media_port: int = 8766               # HTTP endpoint: /health, /books.json, /books/*
    serve_media: bool = True
    max_ws_message_bytes: int = 26_214_400  # 25 MB

    # ── Reading-assistant behaviour ──────────────────────────────────
    accumulation_window_seconds: float = 5.0   # how long text accumulates before LLM analysis
    stt_flush_interval: float = 4.0            # how often buffered audio is transcribed
    max_buffer_bytes: int = 20_971_520        # 20 MB audio per session epoch

    # ── Speech-to-text (STT_PROVIDER) ───────────────────────────────
    stt_provider: str = "faster_whisper"
    whisper_model: str = "base"          # tiny / base / small / medium / large-v3
    whisper_device: str = "cpu"          # cpu | cuda
    whisper_compute_type: str = "int8"   # int8 (cpu) or float16 (gpu default)

    # ── Language model (LLM_PROVIDER — any OpenAI-compatible API) ──
    llm_provider: str = "ollama"
    llm_base_url: str = "http://localhost:11434/v1"
    llm_api_key: str = "ollama"          # required by the SDK; unused by local servers
    llm_model: str = "llama3.2:1b"      # lightweight 1B model (~1.3 GB; served by the ollama container)
    llm_temperature: float = 0.3
    llm_max_tokens: int = 500
    llm_timeout: float = 30.0

    # ── Text-to-speech (TTS_PROVIDER) ───────────────────────────────
    tts_provider: str = "piper"             # "piper" (offline, containerized) or "edge_tts" (online)
    tts_voice: str = "en-GB-SoniaNeural"    # edge-tts voice id (used only when TTS_PROVIDER=edge_tts)
    piper_voice: str = "en_US-amy-medium"   # piper voice name
    piper_models_dir: str = "models"        # folder containing <voice>.onnx

    # ── Book/media storage (STORAGE_PROVIDER) ───────────────────────
    storage_provider: str = "local"         # "local" or "minio"
    media_dir: str = "media"
    minio_endpoint: str = ""
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_bucket: str = "books"
    minio_secure: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            host=_str("HOST", cls.host),
            port=_int("PORT", cls.port),
            media_port=_int("MEDIA_PORT", cls.media_port),
            serve_media=_bool("SERVE_MEDIA", cls.serve_media),
            max_ws_message_bytes=_int("MAX_WS_MESSAGE_BYTES", cls.max_ws_message_bytes),
            accumulation_window_seconds=_float("ACCUMULATION_WINDOW_SECONDS", cls.accumulation_window_seconds),
            stt_flush_interval=_float("STT_FLUSH_INTERVAL", cls.stt_flush_interval),
            max_buffer_bytes=_int("MAX_BUFFER_BYTES", cls.max_buffer_bytes),
            stt_provider=_str("STT_PROVIDER", cls.stt_provider),
            whisper_model=_str("WHISPER_MODEL", cls.whisper_model),
            whisper_device=_str("WHISPER_DEVICE", cls.whisper_device),
            whisper_compute_type=_str("WHISPER_COMPUTE_TYPE", cls.whisper_compute_type),
            llm_provider=_str("LLM_PROVIDER", cls.llm_provider),
            llm_base_url=_str("LLM_BASE_URL", cls.llm_base_url),
            llm_api_key=_str("LLM_API_KEY", cls.llm_api_key),
            llm_model=_str("LLM_MODEL", cls.llm_model),
            llm_temperature=_float("LLM_TEMPERATURE", cls.llm_temperature),
            llm_max_tokens=_int("LLM_MAX_TOKENS", cls.llm_max_tokens),
            llm_timeout=_float("LLM_TIMEOUT", cls.llm_timeout),
            tts_provider=_str("TTS_PROVIDER", cls.tts_provider),
            tts_voice=_str("TTS_VOICE", cls.tts_voice),
            piper_voice=_str("PIPER_VOICE", cls.piper_voice),
            piper_models_dir=_str("PIPER_MODELS_DIR", cls.piper_models_dir),
            storage_provider=_str("STORAGE_PROVIDER", cls.storage_provider),
            media_dir=_str("MEDIA_DIR", cls.media_dir),
            minio_endpoint=_str("MINIO_ENDPOINT", cls.minio_endpoint),
            minio_access_key=_str("MINIO_ACCESS_KEY", cls.minio_access_key),
            minio_secret_key=_str("MINIO_SECRET_KEY", cls.minio_secret_key),
            minio_bucket=_str("MINIO_BUCKET", cls.minio_bucket),
            minio_secure=_bool("MINIO_SECURE", cls.minio_secure),
        )


# Convenience singleton for scripts (app.py builds its own from the env).
settings = Settings.from_env()

