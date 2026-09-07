"""Factory that assembles the AI pipeline from environment settings.

Adding a new provider = write a class in `ai/` (or `storage.py`) and
register it here. Nothing else in the codebase needs to change.
"""
from __future__ import annotations

from config import Settings
from ai.llm import OllamaLLM
from ai.stt import FasterWhisperSTT
from ai.tts import EdgeTTS, PiperTTS
from storage import build_storage  # noqa: F401  (re-exported for convenience)


def build_stt(settings: Settings):
    if settings.stt_provider == "faster_whisper":
        return FasterWhisperSTT(
            settings.whisper_model, settings.whisper_device, settings.whisper_compute_type
        )
    raise ValueError(
        f"Unknown STT_PROVIDER {settings.stt_provider!r} (available: faster_whisper)"
    )


def build_llm(settings: Settings):
    if settings.llm_provider == "ollama":
        # Works with ANY OpenAI-compatible endpoint (Ollama, vLLM, Groq, OpenAI...).
        return OllamaLLM(
            settings.llm_base_url,
            settings.llm_model,
            api_key=settings.llm_api_key,
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
            timeout=settings.llm_timeout,
        )
    raise ValueError(
        f"Unknown LLM_PROVIDER {settings.llm_provider!r} "
        "(available: ollama — i.e. any OpenAI-compatible endpoint)"
    )


def build_tts(settings: Settings):
    if settings.tts_provider == "piper":
        return PiperTTS(settings.piper_voice, settings.piper_models_dir)
    if settings.tts_provider == "edge_tts":
        return EdgeTTS(settings.tts_voice)
    raise ValueError(
        f"Unknown TTS_PROVIDER {settings.tts_provider!r} (available: piper, edge_tts)"
    )
