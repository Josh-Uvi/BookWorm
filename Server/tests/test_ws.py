"""End-to-end WebSocket protocol tests against fake AI providers.

These spin up the real `ReadingAssistantServer` (real websockets server,
real session orchestration) with FakeSTT/FakeLLM/FakeTTS injected, then
drive it with a real WebSocket client — proving the whole
audio → transcription → help_needed pipeline works.
"""

import asyncio
import base64
import json

from websockets.asyncio.client import connect

from app import ReadingAssistantServer
from conftest import FakeLLM, FakeSTT, FakeTTS, make_settings


async def _receive_until(ws, wanted_type: str, timeout: float = 10.0) -> dict:
    async def _drain():
        async for message in ws:
            payload = json.loads(message)
            if payload.get("type") == wanted_type:
                return payload
        raise AssertionError(f"connection closed before receiving {wanted_type!r}")

    return await asyncio.wait_for(_drain(), timeout)


async def test_health_endpoint(test_server):
    _, port = test_server
    reader, writer = await asyncio.open_connection("127.0.0.1", port)
    writer.write(b"GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
    await writer.drain()
    headers = await reader.readuntil(b"\r\n\r\n")
    assert headers.startswith(b"HTTP/1.1 200")
    writer.close()
    await writer.wait_closed()


async def test_audio_to_help_pipeline(test_server):
    _, port = test_server
    async with connect(f"ws://127.0.0.1:{port}") as ws:
        await ws.send(json.dumps({"type": "control", "action": "start"}))
        await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"chunk-one").decode()}))
        await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"chunk-two").decode()}))

        transcription = await _receive_until(ws, "transcription")
        assert transcription["text"] == "hello there"
        assert transcription["is_partial"] is False
        assert transcription["timestamp"]

        help_needed = await _receive_until(ws, "help_needed")
        assert help_needed["needs_help"] is True
        assert help_needed["help_message"]
        assert help_needed["audio"] == base64.b64encode(b"FAKE-AUDIO").decode()
        assert help_needed["audio_format"] == "wav"
        assert help_needed["reason"]


async def test_invalid_messages_return_errors(test_server):
    _, port = test_server
    async with connect(f"ws://127.0.0.1:{port}") as ws:
        await ws.send(json.dumps({"type": "audio", "data": "!!!not-base64!!!"}))
        error = await _receive_until(ws, "error")
        assert "base64" in error["message"]

        await ws.send(json.dumps({"type": "banana"}))
        error = await _receive_until(ws, "error")
        assert "banana" in error["message"]


async def test_control_stop_flushes_pending_audio():
    """The 'stop' control immediately transcribes buffered audio."""
    from websockets.asyncio.server import serve

    settings = make_settings(stt_flush_interval=30.0)  # loop effectively disabled
    server = ReadingAssistantServer(settings, stt=FakeSTT(), llm=FakeLLM(), tts=FakeTTS())
    async with serve(
        server.handle_connection, "127.0.0.1", 0, process_request=server.process_request
    ) as ws_server:
        port = ws_server.sockets[0].getsockname()[1]
        async with connect(f"ws://127.0.0.1:{port}") as ws:
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"audio").decode()}))
            await ws.send(json.dumps({"type": "control", "action": "stop"}))

            transcription = await _receive_until(ws, "transcription")
            assert transcription["text"] == "hello there"
