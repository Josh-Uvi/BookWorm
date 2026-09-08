"""Unit tests for the per-client reading session."""

import time

from conftest import FakeSTT

from session import ReadingSession


def test_flush_returns_only_new_segments():
    session = ReadingSession()
    stt = FakeSTT()

    session.add_audio(b"chunk-one")
    segments, confidence = session.flush(stt)
    assert [segment.text for segment in segments] == ["hello there"]
    assert confidence == 0.9

    # No new audio since the last flush -> nothing new is delivered.
    segments, _ = session.flush(stt)
    assert segments == []

    # More audio: only the segment beyond the last transcribed offset is new.
    session.add_audio(b"chunk-two")
    segments, _ = session.flush(stt)
    assert [segment.text for segment in segments] == ["help me please"]


def test_flush_without_pending_audio_is_noop():
    session = ReadingSession()
    segments, confidence = session.flush(FakeSTT())
    assert segments == []
    assert confidence == 0.0


def test_buffer_rotation_keeps_container_header():
    session = ReadingSession(max_buffer_bytes=8)
    session.add_audio(b"header")  # first chunk = container header
    session.add_audio(b"123456")  # pushes the buffer over the limit

    session.flush(FakeSTT())

    assert session.epoch == 1
    assert session._last_end == 0.0  # rotated epoch starts from zero
    assert bytes(session._buffer) == b"header"  # header retained for decodability


def test_should_analyze_window():
    session = ReadingSession(accumulation_window_seconds=60.0)
    assert session.should_analyze() is False  # nothing accumulated yet

    session.add_text("hello")
    assert session.should_analyze() is True  # first analysis is immediate

    session.mark_analyzed()
    assert session.should_analyze() is False  # window has not elapsed

    session.add_text("more")
    assert session.should_analyze() is False  # still inside the window

    quick = ReadingSession(accumulation_window_seconds=0.01)
    quick.add_text("hello")
    quick.mark_analyzed()
    time.sleep(0.05)
    quick.add_text("help me")
    assert quick.should_analyze() is True  # window elapsed


def test_guardrail_state_expected_text():
    session = ReadingSession()
    assert session.expected_text is None

    session.set_expected_text("chapter one text")
    assert session.expected_text == "chapter one text"

    session.set_expected_text("")  # blank clears the passage
    assert session.expected_text is None


def test_guardrail_state_help_cooldown():
    session = ReadingSession()
    assert session.last_help_at is None

    session.mark_help_delivered()
    first = session.last_help_at
    assert first is not None

    time.sleep(0.01)
    session.mark_help_delivered()
    assert session.last_help_at >= first  # timestamp advances


def test_guardrail_state_muted():
    session = ReadingSession()
    assert session.muted is False

    session.set_muted(True)  # the child said "stop"
    assert session.muted is True

    session.set_muted(False)  # a direct question re-engaged the assistant
    assert session.muted is False
