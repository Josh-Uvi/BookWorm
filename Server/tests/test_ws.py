"""End-to-end WebSocket protocol tests against fake AI providers.

These spin up the real `ReadingAssistantServer` (real websockets server,
real session orchestration) with FakeSTT/FakeLLM/FakeTTS injected, then
drive it with a real WebSocket client — proving the whole
audio → transcription → help_needed pipeline works.
"""

import asyncio
import base64
import json

from conftest import FakeLLM, FakeSTT, FakeTTS, make_settings
from websockets.asyncio.client import connect

from ai.base import Transcript, TranscriptSegment
from app import ReadingAssistantServer


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


# ── Guardrails: reading aloud vs. asking a question ─────────────────────

PASSAGE = (
    "Once upon a time there was a little dragon named Pip who lived in a "
    "cozy cave at the top of a mountain. He used his trunk to carry logs."
)


class ScriptedSTT:
    """Returns the same canned text each call, with timestamps that grow so
    every call counts as *new* audio (exercises the dedup + repeat analysis)."""

    def __init__(self, text: str):
        self.text = text
        self.calls = 0

    def transcribe(self, audio_path: str) -> Transcript:
        self.calls += 1
        end = self.calls * 4.0
        return Transcript(
            segments=[TranscriptSegment(0.0, end, self.text)],
            language="en",
            confidence=0.9,
        )


class SequenceSTT:
    """Returns the given utterances in order (last one repeats) — for
    multi-utterance conversation tests over a single connection."""

    def __init__(self, texts: list[str]):
        self.texts = list(texts)
        self.calls = 0

    def transcribe(self, audio_path: str) -> Transcript:
        text = self.texts[min(self.calls, len(self.texts) - 1)]
        self.calls += 1
        end = self.calls * 4.0
        return Transcript(
            segments=[TranscriptSegment(0.0, end, text)],
            language="en",
            confidence=0.9,
        )


def _guarded_server(stt) -> "ReadingAssistantServer":
    """The real server with a scripted STT and an LLM that ALWAYS wants to interrupt."""
    return ReadingAssistantServer(
        make_settings(), stt=stt, llm=FakeLLM(), tts=FakeTTS()
    )


async def test_reading_aloud_is_not_interrupted():
    """The transcript matches the shared passage → the assistant stays quiet,
    even though the LLM verdict (if asked) would demand help."""
    import pytest
    from websockets.asyncio.server import serve

    server = _guarded_server(ScriptedSTT("Once upon a time there was a little dragon named Pip"))
    async with serve(
        server.handle_connection, "127.0.0.1", 0, process_request=server.process_request
    ) as ws_server:
        port = ws_server.sockets[0].getsockname()[1]
        async with connect(f"ws://127.0.0.1:{port}") as ws:
            await ws.send(json.dumps({"type": "context", "text": PASSAGE}))
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"audio").decode()}))

            transcription = await _receive_until(ws, "transcription")
            assert "dragon" in transcription["text"]

            # No help message may arrive — and the LLM must never be called.
            with pytest.raises(asyncio.TimeoutError):
                await _receive_until(ws, "help_needed", timeout=1.0)
            assert server.llm.prompts == []


async def test_question_while_reading_is_answered():
    """The child stops reading and asks a question → help is delivered."""
    from websockets.asyncio.server import serve

    server = _guarded_server(ScriptedSTT("What does this word mean?"))
    async with serve(
        server.handle_connection, "127.0.0.1", 0, process_request=server.process_request
    ) as ws_server:
        port = ws_server.sockets[0].getsockname()[1]
        async with connect(f"ws://127.0.0.1:{port}") as ws:
            await ws.send(json.dumps({"type": "context", "text": PASSAGE}))
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"audio").decode()}))

            transcription = await _receive_until(ws, "transcription")
            assert "word" in transcription["text"]

            help_needed = await _receive_until(ws, "help_needed")
            assert help_needed["intent"] == "question"
            assert help_needed["help_message"]
            # The question prompt must include the passage AND the question.
            assert "little dragon" in server.llm.prompts[0]
            assert "What does this word mean?" in server.llm.prompts[0]


async def test_word_question_is_answered_from_the_passage():
    """The child reads "trunk" and asks what it is → the LLM is asked to answer
    (not to judge), grounded in the passage."""
    from websockets.asyncio.server import serve

    answer_llm = FakeLLM(
        verdict={
            "needs_help": True,
            "help_message": "A trunk is an elephant's long nose!",
            "confidence": 0.9,
            "reason": "explained a word from the passage",
        }
    )
    server = ReadingAssistantServer(
        make_settings(), stt=ScriptedSTT("What is a trunk?"), llm=answer_llm, tts=FakeTTS()
    )
    async with serve(
        server.handle_connection, "127.0.0.1", 0, process_request=server.process_request
    ) as ws_server:
        port = ws_server.sockets[0].getsockname()[1]
        async with connect(f"ws://127.0.0.1:{port}") as ws:
            await ws.send(json.dumps({"type": "context", "text": PASSAGE}))
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"audio").decode()}))

            help_needed = await _receive_until(ws, "help_needed")
            assert help_needed["help_message"] == "A trunk is an elephant's long nose!"
            assert help_needed["intent"] == "question"
            # The answer prompt carries both the question and the passage.
            assert "What is a trunk?" in answer_llm.prompts[0]
            assert "little dragon" in answer_llm.prompts[0]


async def test_out_of_context_question_gets_out_of_context_reply():
    """A question unrelated to the story → deterministic "outside our story"
    reply; the LLM is never even asked."""
    from websockets.asyncio.server import serve

    from guardrails import OUT_OF_CONTEXT_ANSWER

    server = _guarded_server(ScriptedSTT("How do rockets fly to the moon?"))
    async with serve(
        server.handle_connection, "127.0.0.1", 0, process_request=server.process_request
    ) as ws_server:
        port = ws_server.sockets[0].getsockname()[1]
        async with connect(f"ws://127.0.0.1:{port}") as ws:
            await ws.send(json.dumps({"type": "context", "text": PASSAGE}))
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"audio").decode()}))

            transcription = await _receive_until(ws, "transcription")
            assert "rockets" in transcription["text"]

            help_needed = await _receive_until(ws, "help_needed")
            assert help_needed["help_message"] == OUT_OF_CONTEXT_ANSWER
            assert help_needed["intent"] == "question"
            assert server.llm.prompts == []


async def test_llm_failure_still_answers_the_question():
    """The model crashing must not leave the child's question unanswered —
    the deterministic "I'm not sure" answer is delivered instead."""

    class FailingLLM:
        async def analyze(self, prompt: str) -> dict:
            raise RuntimeError("model is down")

    from websockets.asyncio.server import serve

    from guardrails import NOT_SURE_ANSWER

    server = ReadingAssistantServer(
        make_settings(), stt=ScriptedSTT("What is a trunk?"), llm=FailingLLM(), tts=FakeTTS()
    )
    async with serve(
        server.handle_connection, "127.0.0.1", 0, process_request=server.process_request
    ) as ws_server:
        port = ws_server.sockets[0].getsockname()[1]
        async with connect(f"ws://127.0.0.1:{port}") as ws:
            await ws.send(json.dumps({"type": "context", "text": PASSAGE}))
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"audio").decode()}))

            help_needed = await _receive_until(ws, "help_needed")
            assert help_needed["help_message"] == NOT_SURE_ANSWER


async def test_empty_llm_answer_falls_back_to_not_sure():
    """A model that answers with nothing still gets the honest fallback."""
    from websockets.asyncio.server import serve

    from guardrails import NOT_SURE_ANSWER

    empty_llm = FakeLLM(verdict={"needs_help": True, "help_message": "", "confidence": 0.9})
    server = ReadingAssistantServer(
        make_settings(), stt=ScriptedSTT("What is a trunk?"), llm=empty_llm, tts=FakeTTS()
    )
    async with serve(
        server.handle_connection, "127.0.0.1", 0, process_request=server.process_request
    ) as ws_server:
        port = ws_server.sockets[0].getsockname()[1]
        async with connect(f"ws://127.0.0.1:{port}") as ws:
            await ws.send(json.dumps({"type": "context", "text": PASSAGE}))
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"audio").decode()}))

            help_needed = await _receive_until(ws, "help_needed")
            assert help_needed["help_message"] == NOT_SURE_ANSWER


async def test_renamed_answer_key_is_still_delivered():
    """Tiny local models sometimes emit "answer" instead of "help_message"
    even when the prompt example says otherwise — the answer must reach the
    child, not fall back to "I'm not sure"."""
    from websockets.asyncio.server import serve

    renamed_llm = FakeLLM(
        verdict={"needs_help": True, "answer": "A trunk is an elephant's long nose.", "confidence": 0.9}
    )
    server = ReadingAssistantServer(
        make_settings(), stt=ScriptedSTT("What is a trunk?"), llm=renamed_llm, tts=FakeTTS()
    )
    async with serve(
        server.handle_connection, "127.0.0.1", 0, process_request=server.process_request
    ) as ws_server:
        port = ws_server.sockets[0].getsockname()[1]
        async with connect(f"ws://127.0.0.1:{port}") as ws:
            await ws.send(json.dumps({"type": "context", "text": PASSAGE}))
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"audio").decode()}))

            help_needed = await _receive_until(ws, "help_needed")
            assert help_needed["help_message"] == "A trunk is an elephant's long nose."


async def test_meta_answer_is_replaced_with_honest_fallback():
    """When the model describes the question instead of answering it
    ("The child is asking about…"), the child must never hear that — the
    honest "I'm not sure" fallback is delivered instead."""
    from websockets.asyncio.server import serve

    from guardrails import NOT_SURE_ANSWER

    meta_llm = FakeLLM(
        verdict={
            "needs_help": True,
            "help_message": "The child is asking about a trunk in the passage.",
            "confidence": 0.9,
        }
    )
    server = ReadingAssistantServer(
        make_settings(), stt=ScriptedSTT("What is a trunk?"), llm=meta_llm, tts=FakeTTS()
    )
    async with serve(
        server.handle_connection, "127.0.0.1", 0, process_request=server.process_request
    ) as ws_server:
        port = ws_server.sockets[0].getsockname()[1]
        async with connect(f"ws://127.0.0.1:{port}") as ws:
            await ws.send(json.dumps({"type": "context", "text": PASSAGE}))
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"audio").decode()}))

            help_needed = await _receive_until(ws, "help_needed")
            assert help_needed["help_message"] == NOT_SURE_ANSWER


async def test_saying_stop_mutes_until_the_next_question():
    """The full "stop" conversation over one connection:
    1. "stop" → muted (sidebar ack only — no TTS, no LLM);
    2. unclear speech while muted → total silence (LLM never called, even
       though its verdict would demand help);
    3. a direct question → answered, and the mute is lifted."""
    import pytest
    from websockets.asyncio.server import serve

    llm = FakeLLM()
    tts = FakeTTS()
    server = ReadingAssistantServer(
        make_settings(),
        stt=SequenceSTT([
            "stop",
            "the wind is howling tonight",  # unclear — would normally trigger help
            "What is a trunk?",              # direct question → answer + unmute
        ]),
        llm=llm,
        tts=tts,
    )
    async with serve(
        server.handle_connection, "127.0.0.1", 0, process_request=server.process_request
    ) as ws_server:
        port = ws_server.sockets[0].getsockname()[1]
        async with connect(f"ws://127.0.0.1:{port}") as ws:
            await ws.send(json.dumps({"type": "context", "text": PASSAGE}))
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"one").decode()}))

            # 1. The mute ack is displayed but never spoken.
            ack = await _receive_until(ws, "help_needed")
            assert ack["intent"] == "mute_command"
            assert ack["audio"] is None  # no speech — that would be ironic
            assert tts.texts == []
            assert llm.prompts == []

            # 2. Muted: unclear speech stays silent — no LLM, no help message.
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"two").decode()}))
            with pytest.raises(asyncio.TimeoutError):
                await _receive_until(ws, "help_needed", timeout=1.0)
            assert llm.prompts == []

            # 3. A direct question is answered and clears the mute.
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"three").decode()}))
            answered = await _receive_until(ws, "help_needed")
            assert answered["intent"] == "question"
            assert answered["help_message"]
            assert answered["audio"] is not None  # answers are spoken again
            assert len(llm.prompts) == 1
            assert "What is a trunk?" in llm.prompts[0]


async def test_thanks_after_answer_mutes_until_the_next_question():
    """The ideal Q&A flow the product wants:
    question → answered → "thank you" → silent reading (no interruptions)
    → next question → answered again."""
    import pytest
    from websockets.asyncio.server import serve

    llm = FakeLLM()
    tts = FakeTTS()
    server = ReadingAssistantServer(
        make_settings(),
        stt=SequenceSTT([
            "What is a trunk?",                # 1. question → answered
            "thank you",                        # 2. gratitude → muted again
            "She wrapped her trunk around a log",  # 3. reading → must stay silent
            "the wind is howling tonight",      # 4. unclear → must stay silent
            "What does the little dragon do?",  # 5. new question (relates to the passage) → answered
        ]),
        llm=llm,
        tts=tts,
    )
    async with serve(
        server.handle_connection, "127.0.0.1", 0, process_request=server.process_request
    ) as ws_server:
        port = ws_server.sockets[0].getsockname()[1]
        async with connect(f"ws://127.0.0.1:{port}") as ws:
            await ws.send(json.dumps({"type": "context", "text": PASSAGE}))
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"a").decode()}))

            # 1. The question is answered (spoken).
            first = await _receive_until(ws, "help_needed")
            assert first["intent"] == "question"
            assert first["audio"] is not None
            assert len(llm.prompts) == 1

            # 2. "Thank you" → you're-welcome ack, unspoken, muted again.
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"b").decode()}))
            ack = await _receive_until(ws, "help_needed")
            assert ack["intent"] == "thanks_command"
            assert ack["audio"] is None  # never speaks the acknowledgement
            assert ack["help_message"].startswith("You're welcome")
            assert tts.texts == [first["help_message"]]  # no TTS for the ack

            # 3.-4. Reading and unclear speech: total silence, no LLM calls.
            # (Sleep between sends so each utterance gets its own flush —
            # the real client streams chunks every second.)
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"c").decode()}))
            await asyncio.sleep(0.6)
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"d").decode()}))
            with pytest.raises(asyncio.TimeoutError):
                await _receive_until(ws, "help_needed", timeout=1.5)
            assert len(llm.prompts) == 1

            # 5. The next question is answered and lifts the mute.
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"e").decode()}))
            second = await _receive_until(ws, "help_needed")
            assert second["intent"] == "question"
            assert second["audio"] is not None
            assert len(llm.prompts) == 2
            assert "What does the little dragon do?" in llm.prompts[1]


async def test_help_cooldown_suppresses_repeat_nagging():
    """After one help message, an unclear transcript cannot trigger another."""
    import pytest
    from websockets.asyncio.server import serve

    llm = FakeLLM()
    server = ReadingAssistantServer(
        make_settings(accumulation_window_seconds=0.05),
        stt=ScriptedSTT("the wind is howling tonight"),
        llm=llm,
        tts=FakeTTS(),
    )
    async with serve(
        server.handle_connection, "127.0.0.1", 0, process_request=server.process_request
    ) as ws_server:
        port = ws_server.sockets[0].getsockname()[1]
        async with connect(f"ws://127.0.0.1:{port}") as ws:
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"audio").decode()}))

            # First analysis delivers help ("unknown" intent, no cooldown yet).
            help_needed = await _receive_until(ws, "help_needed")
            assert help_needed["needs_help"] is True

            # More audio → a new analysis, but the cooldown blocks delivery.
            await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(b"more").decode()}))
            with pytest.raises(asyncio.TimeoutError):
                await _receive_until(ws, "help_needed", timeout=1.0)
