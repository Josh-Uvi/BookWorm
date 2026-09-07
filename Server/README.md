# AI Reading Assistant — Server

Python 3.11 asyncio WebSocket server: streams browser audio through open-source AI providers —
**faster-whisper** (STT) → **any OpenAI-compatible LLM** (Ollama `llama3.2:1b` by default) →
**Piper** (TTS, offline — voice baked into the Docker image; `edge-tts` online fallback)
— and speaks encouraging help back to the child. No cloud SDKs, no vendor credentials.

- **Docs**: [../docs/backend.md](../docs/backend.md)
- **Quickstart (monorepo)**: [../README.md](../README.md) → `make setup && make up`
- **Native dev**: `make dev-server` (ws://localhost:8765, media http://localhost:8766)
- **Tests**: `make test-server` (15 tests incl. E2E WebSocket pipeline)
- **Verify setup**: `make healthcheck`

## Endpoints

| Endpoint | Purpose |
|---|---|
| `ws://…:8765` | Audio pipeline (see [docs/backend.md](../docs/backend.md) for the message protocol) |
| `http://…:8765/health` | WebSocket server liveness |
| `http://…:8766/books.json` / `/books/*` | Media library |
