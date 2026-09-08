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
import time
from datetime import datetime, timezone

from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed

from books_repository import PostgresBooksRepository
from config import Settings
from guardrails import (
    NOT_SURE_ANSWER,
    OUT_OF_CONTEXT_ANSWER,
    classify_intent,
    decide_interrupt,
    is_gratitude_command,
    is_meta_answer,
    is_mute_command,
    question_relates_to_passage,
)
from media_server import MediaServer
from prompts import QUESTION_ANSWER_PROMPT, READING_ASSISTANT_PROMPT
from providers import build_llm, build_storage, build_stt, build_tts
from session import ReadingSession

logger = logging.getLogger("reading-assistant")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _optional_string(value) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


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
        elif kind == "context":
            # The on-screen chapter text — lets the server tell "reading
            # aloud" apart from "asking a question" (see guardrails.py).
            text = payload.get("text")
            if isinstance(text, str):
                raw_level = payload.get("reading_level")
                try:
                    reading_level = int(raw_level) if raw_level is not None else None
                except (TypeError, ValueError):
                    reading_level = None
                session.set_reading_context(
                    text=text,
                    student_name=_optional_string(payload.get("student_name")),
                    profile_id=_optional_string(payload.get("profile_id")),
                    reading_level=reading_level,
                    voice=_optional_string(payload.get("voice")),
                    system_prompt=_optional_string(payload.get("system_prompt")),
                    book_title=_optional_string(payload.get("book_title")),
                )
                logger.info(
                    "Context (%s): student=%s level=%s book=%s passage=%d chars",
                    client_id,
                    session.student_name or "unknown",
                    session.reading_level or "unknown",
                    session.book_title or "unknown",
                    len(text),
                )
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
        # CancelledError (from flush_task.cancel() on disconnect) propagates
        # out of the loop; handle_connection already suppresses it while
        # awaiting the task, so no handler is needed here.
        interval = self.settings.stt_flush_interval
        while True:
            await asyncio.sleep(interval)
            if session.has_pending_audio:
                await self._flush_once(connection, session, client_id)

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

        # Voice-command guardrail — the child asked for silence ("stop",
        # "shh", "be quiet"…). Mute the assistant until the next direct
        # question. The ack is displayed in the sidebar but never spoken
        # (replying out loud would be the interruption they just refused).
        if is_mute_command(accumulated):
            session.mark_analyzed()
            session.set_muted(True)
            logger.info(
                "Guardrail (%s): mute command — going quiet until the next question",
                client_id,
            )
            await self._deliver_help(
                connection,
                session,
                client_id,
                message="Okay, I'll stay quiet while you read. Ask me anything whenever you like!",
                intent="mute_command",
                reason="asked to be quiet",
                speak=False,
            )
            return

        # Gratitude guardrail — "thank you" after an answer means "got it,
        # I'm going back to reading". Same muted state as "stop", but with a
        # warmer (still unspoken) ack — the child will keep reading until
        # their next direct question, which is answered and lifts the mute.
        if is_gratitude_command(accumulated):
            session.mark_analyzed()
            session.set_muted(True)
            logger.info(
                "Guardrail (%s): thanks after answer — going quiet until the next question",
                client_id,
            )
            await self._deliver_help(
                connection,
                session,
                client_id,
                message="You're welcome! I'll be quiet while you read — ask me anything whenever you like.",
                intent="thanks_command",
                reason="thanked for the answer",
                speak=False,
            )
            return

        # Muted mode — stay silent for everything except direct questions.
        # A question means the child is engaging again: answer it and unmute.
        # (No LLM call while muted — quiet means quiet.)
        if session.muted:
            intent = classify_intent(
                accumulated,
                session.expected_text,
                match_threshold=self.settings.reading_match_threshold,
            )
            if intent.intent != "question":
                session.mark_analyzed()
                logger.info(
                    "Guardrail (%s): muted — staying quiet (%r)",
                    client_id,
                    accumulated[:60],
                )
                return
            session.set_muted(False)
            logger.info("Guardrail (%s): question while muted — unmuting", client_id)
            await self._answer_question(connection, session, client_id, accumulated, intent)
            return

        # Guardrail 1 — deterministic intent: if the transcript matches the
        # passage the child is reading, the child is reading aloud, so stay
        # quiet. Don't even call the LLM (small models hallucinate "needs
        # help" for ordinary book text and would interrupt constantly).
        intent = classify_intent(
            accumulated,
            session.expected_text,
            match_threshold=self.settings.reading_match_threshold,
        )
        if intent.intent == "reading":
            session.mark_analyzed()
            logger.info(
                "Guardrail (%s): reading aloud (passage match %.0f%%) — staying quiet",
                client_id,
                intent.match_score * 100,
            )
            return

        if intent.intent == "question":
            # The child stopped reading and is talking to the assistant —
            # answer the question (with honest fallbacks), never stay silent.
            await self._answer_question(connection, session, client_id, accumulated, intent)
            return

        prompt = READING_ASSISTANT_PROMPT.format(
            text=accumulated,
            passage=session.expected_text or "(not available — no passage shared)",
            student_context=session.prompt_context(),
        )
        try:
            verdict = await self.llm.analyze(prompt)
        except Exception:
            logger.exception("LLM analysis failed for %s", client_id)
            return
        session.mark_analyzed()

        # Guardrail 2 — gate the LLM verdict by confidence, and — for
        # anything that isn't an explicit question — by a cooldown so the
        # assistant cannot keep nagging while the child reads.
        decision = decide_interrupt(
            intent,
            verdict,
            now=time.monotonic(),
            last_help_at=session.last_help_at,
            cooldown_seconds=self.settings.help_cooldown_seconds,
            min_confidence=self.settings.help_min_confidence,
        )
        if not decision.send_help:
            logger.info("Guardrail (%s): help suppressed — %s", client_id, decision.reason)
            return

        await self._deliver_help(
            connection,
            session,
            client_id,
            message=str(verdict.get("help_message") or ""),
            intent=decision.intent,
            confidence=verdict.get("confidence", 0),
            reason=str(verdict.get("reason") or ""),
        )

    async def _answer_question(
        self, connection, session, client_id, question: str, intent
    ) -> None:
        """Answer a question the child asked about what they are reading.

        Guarantees, in order:
        - out-of-context questions get a deterministic "outside our story"
          reply (no LLM call — small models happily hallucinate answers);
        - related questions are answered by the LLM, grounded in the passage;
        - if the LLM fails or has nothing to say, the child still gets an
          honest "I'm not sure" — silence is never an option for a question.
        """
        session.mark_analyzed()

        if not question_relates_to_passage(question, session.expected_text):
            logger.info("Guardrail (%s): question out of reading context — %r", client_id, question)
            await self._deliver_help(
                connection,
                session,
                client_id,
                message=OUT_OF_CONTEXT_ANSWER,
                intent=intent.intent,
                reason="outside the reading context",
            )
            return

        prompt = QUESTION_ANSWER_PROMPT.format(
            question=question,
            passage=session.expected_text or "(not available — no passage shared)",
            student_context=session.prompt_context(),
        )
        try:
            verdict = await self.llm.analyze(prompt)
        except Exception:
            logger.exception("LLM question answering failed for %s", client_id)
            await self._deliver_help(
                connection,
                session,
                client_id,
                message=NOT_SURE_ANSWER,
                intent=intent.intent,
                reason="LLM failed to answer",
            )
            return

        # Tiny local models sometimes rename the JSON key ("answer" instead of
        # "help_message") even when the example says otherwise — accept both
        # so a real answer is never thrown away.
        answer = str(
            verdict.get("help_message") or verdict.get("answer") or ""
        ).strip()
        if not answer or is_meta_answer(answer):
            # No usable answer (or the model described the question instead
            # of answering it) — be honest with the child.
            answer = NOT_SURE_ANSWER
        await self._deliver_help(
            connection,
            session,
            client_id,
            message=answer,
            intent=intent.intent,
            confidence=verdict.get("confidence", 0),
            reason=str(verdict.get("reason") or ""),
        )

    async def _deliver_help(
        self,
        connection,
        session,
        client_id,
        *,
        message: str,
        intent: str,
        confidence=None,
        reason: str = "",
        speak: bool = True,
    ) -> None:
        """Send the message to the client, synthesized to speech unless
        ``speak=False`` (used for the mute ack, which must stay silent)."""
        session.mark_help_delivered()

        audio_base64 = None
        audio_format = None
        if message and speak:
            try:
                audio, audio_format = await self.tts.synthesize(message)
                audio_base64 = base64.b64encode(audio).decode("ascii")
            except Exception:
                logger.exception("TTS synthesis failed for %s", client_id)

        logger.info("Help needed (%s, intent=%s): %s", client_id, intent, message)
        await self._send(
            connection,
            {
                "type": "help_needed",
                "needs_help": True,
                "intent": intent,
                "help_message": message,
                "audio": audio_base64,
                "audio_format": audio_format,
                "confidence": confidence,
                "reason": reason,
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
            books_repository = None
            if settings.database_url:
                books_repository = PostgresBooksRepository(settings.database_url)
            media = MediaServer(
                storage,
                host=settings.host,
                port=settings.media_port,
                books_repository=books_repository,
            )
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

