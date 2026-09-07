#!/usr/bin/env python3
"""Send an audio file through the reading-assistant WebSocket pipeline.

Usage:
    python scripts/e2e_smoke.py --audio path/to/audio.wav [--url ws://localhost:8765]

Sends the file as one audio message and prints transcription / help_needed
messages as they arrive — a quick end-to-end check of the live server that
needs no browser or microphone.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import sys
from pathlib import Path


async def run(url: str, audio_path: Path, timeout: float) -> int:
    from websockets.asyncio.client import connect

    data = base64.b64encode(audio_path.read_bytes()).decode("ascii")
    async with connect(url, max_size=2**22) as ws:
        await ws.send(json.dumps({"type": "control", "action": "start"}))
        await ws.send(json.dumps({"type": "audio", "data": data}))
        print(f"→ sent {audio_path.name} ({audio_path.stat().st_size} bytes)")

        saw_transcription = False
        saw_help = False
        try:
            while True:
                message = await asyncio.wait_for(ws.recv(), timeout=timeout)
                payload = json.loads(message)
                kind = payload.get("type")

                if kind == "transcription":
                    saw_transcription = True
                    print(
                        f"← transcription: {payload.get('text')!r} "
                        f"(confidence={payload.get('confidence')})"
                    )
                elif kind == "help_needed":
                    saw_help = True
                    audio = payload.get("audio")
                    audio_note = "none"
                    if audio:
                        audio_note = f"{len(base64.b64decode(audio))} bytes ({payload.get('audio_format')})"
                    print(f"← HELP: {payload.get('help_message')!r}")
                    print(f"  audio: {audio_note}")
                    break
                elif kind == "error":
                    print(f"← error: {payload.get('message')}")
                else:
                    print(f"← {payload}")
        except (asyncio.TimeoutError, TimeoutError):
            print("… no more messages (timeout reached)")
        except Exception as exc:  # connection closed by server, etc.
            print(f"… connection closed: {exc}")

        print()
        print("RESULT:", "PASS" if saw_transcription else "FAIL (no transcription)")
        return 0 if saw_transcription else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Reading assistant E2E smoke test")
    parser.add_argument("--audio", required=True, help="Audio file (wav/webm/mp3) to send")
    parser.add_argument("--url", default="ws://localhost:8765", help="WebSocket server URL")
    parser.add_argument("--timeout", type=float, default=90.0, help="Seconds to wait between messages")
    args = parser.parse_args()
    return asyncio.run(run(args.url, Path(args.audio), args.timeout))


if __name__ == "__main__":
    sys.exit(main())
