#!/usr/bin/env python3
"""Download a Piper TTS voice from the HuggingFace voice repository.

Uses only the standard library, so it works before pip requirements are
installed.

Usage:
    python scripts/download_piper_voice.py [--voice en_US-amy-medium] [--out-dir models]

Voice names follow the `<locale>-<name>-<quality>` convention, e.g.
en_US-amy-medium, en_GB-alan-low. Browse available voices at:
https://huggingface.co/rhasspy/piper-voices
"""
from __future__ import annotations

import argparse
import urllib.request
from pathlib import Path

BASE_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main"


def voice_urls(voice: str) -> tuple[str, str]:
    parts = voice.split("-")
    if len(parts) != 3:
        raise SystemExit(
            f"Voice name must look like <locale>-<name>-<quality>, got: {voice!r}"
        )
    locale, name, quality = parts
    lang = locale.split("_")[0]
    prefix = f"{BASE_URL}/{lang}/{locale}/{name}/{quality}/{voice}"
    return f"{prefix}.onnx", f"{prefix}.onnx.json"


def main() -> int:
    parser = argparse.ArgumentParser(description="Download a Piper TTS voice")
    parser.add_argument("--voice", default="en_US-amy-medium", help="Piper voice name")
    parser.add_argument("--out-dir", default="models", help="Directory to save voice files")
    args = parser.parse_args()

    onnx_url, json_url = voice_urls(args.voice)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for url in (onnx_url, json_url):
        target = out_dir / url.rsplit("/", 1)[1]
        if target.exists() and target.stat().st_size > 0:
            print(f"✔ already present: {target}")
            continue
        print(f"⬇ downloading {url}")
        urllib.request.urlretrieve(url, target)  # noqa: S310
        print(f"✔ saved {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
