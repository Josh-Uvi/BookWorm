"""Unit tests for the OpenAI-compatible LLM client."""

import json
from types import SimpleNamespace
from typing import Any, cast

import pytest

from ai.llm import OllamaLLM, parse_llm_json

# ── parse_llm_json ─────────────────────────────────────────────────────


def test_parse_plain_json():
    assert parse_llm_json('{"needs_help": true}') == {"needs_help": True}


def test_parse_fenced_json():
    raw = 'Sure!\n```json\n{"needs_help": false, "reason": "reading well"}\n```'
    assert parse_llm_json(raw) == {"needs_help": False, "reason": "reading well"}


def test_parse_json_with_surrounding_prose():
    raw = 'The verdict is: {"needs_help": true, "confidence": 0.8} hope that helps!'
    assert parse_llm_json(raw) == {"needs_help": True, "confidence": 0.8}


def test_parse_invalid_raises():
    with pytest.raises(json.JSONDecodeError):
        parse_llm_json("there is no json here")


# ── OllamaLLM.analyze (with a stubbed OpenAI client) ───────────────────


class _FakeCompletions:
    def __init__(self, responses):
        self.responses = list(responses)  # str content or Exception
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        message = SimpleNamespace(message=SimpleNamespace(content=response))
        return SimpleNamespace(choices=[message])


class _FakeOpenAIClient:
    def __init__(self, responses):
        self.chat = SimpleNamespace(completions=_FakeCompletions(responses))


def _make_llm(responses) -> OllamaLLM:
    llm = OllamaLLM("http://test/v1", "fake-model", api_key="test")
    # A test double standing in for the SDK client — that's the point.
    llm._client = cast(Any, _FakeOpenAIClient(responses))
    return llm


async def test_analyze_requests_json_response_format():
    llm = _make_llm(['{"needs_help": true}'])

    verdict = await llm.analyze("analyze this prompt")

    assert verdict == {"needs_help": True}
    call = llm._client.chat.completions.calls[0]
    assert call["response_format"] == {"type": "json_object"}
    assert call["model"] == "fake-model"
    assert call["messages"][0]["content"] == "analyze this prompt"
    assert call["temperature"] == 0.3


async def test_analyze_retries_without_response_format_when_unsupported():
    llm = _make_llm(
        [
            RuntimeError("response_format is not supported"),
            '{"needs_help": false, "reason": "all good"}',
        ]
    )

    verdict = await llm.analyze("prompt")

    assert verdict == {"needs_help": False, "reason": "all good"}
    calls = llm._client.chat.completions.calls
    assert len(calls) == 2
    assert "response_format" in calls[0]
    assert "response_format" not in calls[1]


async def test_analyze_tolerates_fenced_json_output():
    llm = _make_llm(['```json\n{"needs_help": true, "help_message": "Try again!"}\n```'])

    verdict = await llm.analyze("prompt")

    assert verdict == {"needs_help": True, "help_message": "Try again!"}
