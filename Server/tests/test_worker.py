"""Unit tests for the Redis background worker's job-processing loop."""

import logging
from collections.abc import Iterator
from typing import Any

import pytest

import worker


class FakeRedis:
    """Return queued payloads, then interrupt the otherwise infinite loop."""

    def __init__(self, payloads: list[str]):
        self.payloads: Iterator[str] = iter(payloads)
        self.blpop_calls: list[list[str]] = []

    def ping(self) -> None:
        pass

    def blpop(self, keys: list[str]) -> list[str]:
        self.blpop_calls.append(keys)
        try:
            raw = next(self.payloads)
        except StopIteration:
            raise KeyboardInterrupt from None
        return [keys[0], raw]


def run_worker(monkeypatch: pytest.MonkeyPatch, payloads: list[str]) -> FakeRedis:
    client = FakeRedis(payloads)
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379")
    monkeypatch.setattr(
        worker.redis.Redis,
        "from_url",
        lambda *_args, **_kwargs: client,
    )
    with pytest.raises(KeyboardInterrupt):
        worker.main()
    return client


def test_worker_dispatches_object_payloads(monkeypatch: pytest.MonkeyPatch):
    received: list[dict[str, Any]] = []

    def handler(payload: dict[str, Any]) -> str:
        received.append(payload)
        return "done"

    monkeypatch.setitem(worker.HANDLERS, "test_job", handler)
    client = run_worker(monkeypatch, ['{"type": "test_job", "value": 42}'])

    assert received == [{"type": "test_job", "value": 42}]
    assert client.blpop_calls == [[worker.QUEUE], [worker.QUEUE]]


@pytest.mark.parametrize(
    "payload",
    ["not JSON", "null", "[]", '"text"', "42"],
)
def test_worker_drops_malformed_payloads_and_continues(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    payload: str,
):
    received: list[dict[str, Any]] = []

    def handler(job: dict[str, Any]) -> str:
        received.append(job)
        return "done"

    monkeypatch.setitem(worker.HANDLERS, "test_job", handler)
    with caplog.at_level(logging.ERROR, logger="worker"):
        run_worker(monkeypatch, [payload, '{"type": "test_job"}'])

    assert received == [{"type": "test_job"}]
    assert "Dropping" in caplog.text


def test_worker_continues_after_unknown_jobs_and_handler_errors(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
):
    received: list[dict[str, Any]] = []

    def failing_handler(_payload: dict[str, Any]) -> str:
        raise ValueError("job failed")

    def handler(payload: dict[str, Any]) -> str:
        received.append(payload)
        return "done"

    monkeypatch.setitem(worker.HANDLERS, "failing_job", failing_handler)
    monkeypatch.setitem(worker.HANDLERS, "test_job", handler)
    with caplog.at_level(logging.ERROR, logger="worker"):
        run_worker(
            monkeypatch,
            [
                '{"type": "unknown_job"}',
                '{"type": "failing_job"}',
                '{"type": "test_job"}',
            ],
        )

    assert received == [{"type": "test_job"}]
    assert "No handler for job type" in caplog.text
    assert "Job failing_job failed" in caplog.text
