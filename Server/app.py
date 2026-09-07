"""AI Reading Assistant — platform-agnostic WebSocket server.

Pipeline: browser audio → STT (faster-whisper) → transcript accumulation →
LLM "needs help?" verdict (any OpenAI-compatible endpoint) → TTS help
message (Piper / edge-tts) → spoken back to the child.

No cloud SDKs are involved: every AI capability is provided by a swappable
open-source implementation selected via environment variables (config.py).
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import contextlib
import json
import logging
from datetime import datetime, timezone

from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed

from config import Settings
from media_server import MediaServer
from prompts import READING_ASSISTANT_PROMPT
from providers import build_llm, build_stt, build_tts, build_storage
from session import ReadingSession

logger = logging.getLogger("reading-assistant")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ReadingAssistantServer:
    """Owns the provider instances and orchestrates per-client sessions."""

    def __init__(self, settings: Settings, stt=None, llm=None, tts=None):
        # Providers are injectable, which keeps tests fast and dependency-free.
        self.settings = settings
        self.stt = stt or build_stt(settings)
        self.llm = llm or build_llm(settings)
        self.tts = tts or build_tts(settings)

    # ── Connection lifecycle ─────────────────────────────────────────

    async def handle_connection(self, connection) -> None:
        address = connection.remote_address
        client_id = f"{address[0]}:{address[1]}" if address else "unknown"
        session = ReadingSession(
            accumulation_window_seconds=self.settings.accumulation_window_seconds,
            max_buffer_bytes=self.settings.max_buffer_bytes,
        )
        logger.info("Client connected: %s", client_id)

        flush_task = asyncio.create_task(self._flush_loop(connection, session, client_id))
        try:
            async for message in connection:
                await self._process_message(message, session, connection, client_id)
        except ConnectionClosed:
            pass
        finally:
            flush_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await flush_task
            try:
                await self._flush_once(connection, session, client_id)
            except Exception:
                logger.exception("Final flush failed for %s", client_id)
            logger.info("Client disconnected: %s", client_id)

    # ── Inbound messages ─────────────────────────────────────────────

    async def _process_message(self, message, session, connection, client_id) -> None:
        if isinstance(message, bytes):
            message = message.decode("utf-8", errors="replace")
        text = message.strip()
        if not text:
            return

        payload = None
        if text.startswith("{"):
            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                payload = None
        if isinstance(payload, dict):
            await self._process_json(payload, session, connection, client_id)
            return

        # Legacy support: a bare base64 audio string.
        await self._ingest_audio(text, session, connection)

    async def _process_json(self, payload: dict, session, connection, client_id) -> None:
        kind = payload.get("type")
        if kind == "audio":
            data = payload.get("data")
            if isinstance(data, str) and data:
                await self._ingest_audio(data, session, connection)
        elif kind == "control":
            action = payload.get("action")
            if action == "stop":
                await self._flush_once(connection, session, client_id)
            elif action != "start":
                await self._send(
                    connection,
                    {"type": "error", "message": f"Unknown control action: {action!r}"},
                )
        else:
            await self._send(
                connection, {"type": "error", "message": f"Unknown message type: {kind!r}"}
            )

    async def _ingest_audio(self, base64_text: str, session, connection) -> None:
        try:
            audio = base64.b64decode(base64_text, validate=True)
        except (binascii.Error, ValueError):
            await self._send(
                connection, {"type": "error", "message": "Invalid base64 audio payload"}
            )
            return
        if audio:
            session.add_audio(audio)

    # ── Periodic STT + analysis ──────────────────────────────────────

    async def _flush_loop(self, connection, session, client_id) -> None:
        interval = self.settings.stt_flush_interval
        try:
            while True:
                await asyncio.sleep(interval)
                if session.has_pending_audio:
                    await self._flush_once(connection, session, client_id)
        except asyncio.CancelledError:
            raise

    async def _flush_once(self, connection, session, client_id) -> None:
        segments, confidence = await asyncio.to_thread(session.flush, self.stt)
        for segment in segments:
            logger.info("Transcription (%s): %s", client_id, segment.text)
            session.add_text(segment.text)
            await self._send(
                connection,
                {
                    "type": "transcription",
                    "text": segment.text,
                    "confidence": confidence if confidence > 0 else None,
                    "is_partial": False,
                    "timestamp": _now(),
                },
            )
        if segments and session.should_analyze():
            await self._analyze(connection, session, client_id)

    async def _analyze(self, connection, session, client_id) -> None:
        accumulated = session.get_accumulated_text()
        if not accumulated.strip():
            return
        prompt = READING_ASSISTANT_PROMPT.format(text=accumulated)
        try:
            verdict = await self.llm.analyze(prompt)
        except Exception:
            logger.exception("LLM analysis failed for %s", client_id)
            return
        session.mark_analyzed()
        if not verdict.get("needs_help"):
            return

        help_message = str(verdict.get("help_message") or "")
        audio_base64 = None
        audio_format = None
        if help_message:
            try:
                audio, audio_format = await self.tts.synthesize(help_message)
                audio_base64 = base64.b64encode(audio).decode("ascii")
            except Exception:
                logger.exception("TTS synthesis failed for %s", client_id)

        logger.info("Help needed (%s): %s", client_id, help_message)
        await self._send(
            connection,
            {
                "type": "help_needed",
                "needs_help": True,
                "help_message": help_message,
                "audio": audio_base64,
                "audio_format": audio_format,
                "confidence": verdict.get("confidence", 0),
                "reason": verdict.get("reason", ""),
                "timestamp": _now(),
            },
        )

    # ── Plumbing ──────────────────────────────────────────────────────

    async def _send(self, connection, payload: dict) -> None:
        try:
            await connection.send(json.dumps(payload))
        except ConnectionClosed:
            pass

    def process_request(self, connection, request):
        """Answer plain HTTP GET /health on the WebSocket port (liveness probe)."""
        if request.path == "/health":
            return connection.respond(200, "healthy\n")
        return None

    async def run(self) -> None:
        settings = self.settings
        if settings.serve_media:
            storage = build_storage(settings)
            media = MediaServer(storage, host=settings.host, port=settings.media_port)
            media.start()
            logger.info("Media server listening on http://%s:%s", settings.host, media.port)

        async with serve(
            self.handle_connection,
            settings.host,
            settings.port,
            process_request=self.process_request,
            max_size=settings.max_ws_message_bytes,
            ping_interval=20,
            ping_timeout=20,
        ):
            logger.info(
                "WebSocket server listening on ws://%s:%s", settings.host, settings.port
            )
            logger.info(
                "Providers: stt=%s llm=%s(%s) tts=%s storage=%s",
                settings.stt_provider,
                settings.llm_provider,
                settings.llm_model,
                settings.tts_provider,
                settings.storage_provider,
            )
            await asyncio.Future()  # run forever


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    server = ReadingAssistantServer(Settings.from_env())
    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        logger.info("Server stopped by user")


if __name__ == "__main__":
    main()

