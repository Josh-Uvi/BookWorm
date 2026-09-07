"""OpenAI-compatible LLM client.

Works with any endpoint implementing the OpenAI Chat Completions API —
Ollama, vLLM, LM Studio, Groq, OpenAI, and friends. Switching provider is
pure configuration: point `LLM_BASE_URL` / `LLM_MODEL` at the new endpoint.
"""
from __future__ import annotations

import json
import re


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
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }
        try:
            response = await self._client.chat.completions.create(
                response_format={"type": "json_object"}, **payload
            )
        except Exception:
            # Some OpenAI-compatible endpoints reject response_format — retry without it.
            response = await self._client.chat.completions.create(**payload)
        content = response.choices[0].message.content or ""
        return parse_llm_json(content)
