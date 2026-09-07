#!/usr/bin/env python3
"""Verify that the reading-assistant configuration and providers are usable.

Replaces the old AWS credential checker: no cloud account needed — it
validates the *local* setup (media library, TTS voice files, LLM endpoint).

Usage:
    python healthcheck.py [--deep]

`--deep` also loads the STT model (downloading it on first use).
"""
from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

from config import Settings
from storage import LocalStorage, build_storage

OK = "✅"
FAIL = "❌"
WARN = "⚠️ "


def check_media(settings: Settings) -> bool:
    if settings.storage_provider == "local":
        root = Path(settings.media_dir)
        if not root.is_dir():
            print(f"{FAIL} MEDIA_DIR does not exist: {root}")
            return False
        books = LocalStorage(settings.media_dir).read_books_index()
        if not books:
            print(f"{WARN} MEDIA_DIR exists but books.json is missing or empty ({root}/books.json)")
            return True
        print(f"{OK} Media library: {len(books)} book(s) in {root}")
        return True
    try:
        books = build_storage(settings).read_books_index()
        print(f"{OK} Media library ({settings.storage_provider}): {len(books)} book(s)")
        return True
    except Exception as exc:
        print(f"{FAIL} Storage backend ({settings.storage_provider}): {exc}")
        return False


def check_llm_endpoint(settings: Settings) -> bool:
    if not settings.llm_base_url.startswith("http"):
        print(f"{WARN} LLM_BASE_URL is not HTTP(S): {settings.llm_base_url} (skipping probe)")
        return True
    url = settings.llm_base_url.rstrip("/") + "/models"
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            status = response.status
    except Exception as exc:
        print(f"{WARN} Could not reach LLM endpoint {url}: {exc}")
        print("       (fine if the server container simply isn't running yet)")
        return False
    print(f"{OK} LLM endpoint reachable (HTTP {status}): {url}")
    return True


def check_tts(settings: Settings) -> bool:
    if settings.tts_provider == "piper":
        voice = Path(settings.piper_models_dir) / f"{settings.piper_voice}.onnx"
        if voice.exists():
            print(f"{OK} Piper voice found: {voice}")
            return True
        print(f"{FAIL} Piper voice missing: {voice}")
        print(
            f"       Fix: python Server/scripts/download_piper_voice.py "
            f"--voice {settings.piper_voice} --out-dir {settings.piper_models_dir}"
        )
        return False
    print(f"{OK} TTS provider: {settings.tts_provider} (voice {settings.tts_voice})")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Reading Assistant setup verification")
    parser.add_argument(
        "--deep", action="store_true", help="Also load the STT model (downloads it if needed)"
    )
    args = parser.parse_args()

    settings = Settings.from_env()
    print("🔧 Reading Assistant setup verification")
    print("=" * 60)
    print(f"STT = {settings.stt_provider} ({settings.whisper_model}/{settings.whisper_device})")
    print(f"LLM = {settings.llm_provider} ({settings.llm_model} @ {settings.llm_base_url})")
    print(f"TTS = {settings.tts_provider} (voice={settings.tts_voice or settings.piper_voice})")
    print("=" * 60)

    healthy = all(
        [
            check_media(settings),
            check_llm_endpoint(settings),
            check_tts(settings),
        ]
    )

    if args.deep:
        try:
            from providers import build_stt

            build_stt(settings)
            print(f"{OK} STT model loaded ({settings.whisper_model})")
        except Exception as exc:
            print(f"{FAIL} STT model load failed: {exc}")
            healthy = False

    print()
    if healthy:
        print("🎉 Setup verification complete — start the server with: python app.py")
        return 0
    print("Some checks failed — see the messages above.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
