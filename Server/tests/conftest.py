"""Shared fixtures: fake AI providers and a test Settings factory."""

from typing import Any

import pytest

from ai.base import Transcript, TranscriptSegment
from config import Settings


class FakeSTT:
    """Returns canned transcript segments; later calls include older ones so the
    timestamp-based de-duplication in ReadingSession can be exercised."""

    def __init__(self):
        self.calls = 0
        self.results = [
            [TranscriptSegment(0.0, 2.0, "hello there")],
            [
                TranscriptSegment(0.0, 2.0, "hello there"),
                TranscriptSegment(2.0, 4.0, "help me please"),
            ],
        ]

    def transcribe(self, audio_path: str) -> Transcript:
        segments = self.results[min(self.calls, len(self.results) - 1)]
        self.calls += 1
        return Transcript(segments=segments, language="en", confidence=0.9)


class FakeLLM:
    def __init__(self, verdict=None):
        self.verdict = verdict or {
            "needs_help": True,
            "help_message": "You're doing great! Let's sound it out together.",
            "confidence": 0.95,
            "reason": "child asked for help",
        }
        self.prompts = []

    async def analyze(self, prompt: str) -> dict:
        self.prompts.append(prompt)
        return self.verdict


class FakeTTS:
    def __init__(self):
        self.texts = []

    async def synthesize(self, text: str) -> tuple[bytes, str]:
        self.texts.append(text)
        return b"FAKE-AUDIO", "wav"


def make_settings(**overrides) -> Settings:
    values: dict[str, Any] = {
        "host": "127.0.0.1",
        "port": 0,
        "media_port": 0,
        "serve_media": False,
        "stt_flush_interval": 0.15,
        "accumulation_window_seconds": 0.05,
        "media_dir": "media",
    }
    values.update(overrides)
    return Settings(**values)


@pytest.fixture
async def test_server():
    """A real WebSocket server wired to fake AI providers on an ephemeral port."""
    from websockets.asyncio.server import serve

    from app import ReadingAssistantServer

    server = ReadingAssistantServer(
        make_settings(), stt=FakeSTT(), llm=FakeLLM(), tts=FakeTTS()
    )
    async with serve(
        server.handle_connection,
        "127.0.0.1",
        0,
        process_request=server.process_request,
        max_size=2**22,
    ) as ws_server:
        port = ws_server.sockets[0].getsockname()[1]
        yield server, port
