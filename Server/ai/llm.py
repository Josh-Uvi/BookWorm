"""OpenAI-compatible LLM client.

Works with any endpoint implementing the OpenAI Chat Completions API —
Ollama, vLLM, LM Studio, Groq, OpenAI, and friends. Switching provider is
pure configuration: point `LLM_BASE_URL` / `LLM_MODEL` at the new endpoint.
"""
from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # type-only: openai stays a lazy runtime import
    from openai.types.chat import ChatCompletionUserMessageParam


def parse_llm_json(raw: str) -> dict:
    """Parse an LLM reply that is expected to contain a JSON object.

    Tolerates markdown fences and surrounding prose, which small local
    models sometimes emit even when asked for JSON-only output.
    """
    text = (raw or "").strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise


class OllamaLLM:
    """Chat-completions client used for the reading-assistant verdict."""

    def __init__(
        self,
        base_url: str,
        model: str,
        api_key: str = "ollama",
        temperature: float = 0.3,
        max_tokens: int = 500,
        timeout: float = 30.0,
    ):
        from openai import AsyncOpenAI  # lazy heavy import

        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self._client = AsyncOpenAI(
            base_url=base_url, api_key=api_key or "ollama", timeout=timeout
        )

    async def analyze(self, prompt: str) -> dict:
        # Explicit keyword arguments keep the heavily-overloaded
        # completions.create() type-checkable (a **payload dict is not).
        messages: list[ChatCompletionUserMessageParam] = [
            {"role": "user", "content": prompt}
        ]
        try:
            response = await self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                response_format={"type": "json_object"},
            )
        except Exception:  # noqa: BLE001 — any endpoint error means retry without response_format
            # Some OpenAI-compatible endpoints reject response_format — retry without it.
            response = await self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )
        content = response.choices[0].message.content or ""
        return parse_llm_json(content)
