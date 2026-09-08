# Backend documentation

The server is a Python 3.11 asyncio application: a **WebSocket** endpoint for the audio
pipeline plus a tiny **HTTP** server for health and the media library (books). Every AI
capability sits behind a swappable provider interface — there are no cloud SDKs.

## Architecture

```
ws://…:8765  handle_connection()
     │  {"type":"audio","data":"<base64>"}      ← client chunks (WebM/Opus…)
     ▼
ReadingSession  (session.py)
     │  buffers bytes; flushes every STT_FLUSH_INTERVAL seconds
     ▼
STTClient.transcribe(file)          (ai/stt.py — faster-whisper, offline)
     │  new transcript segments (timestamp-based de-duplication)
     ▼
session.add_text() → when ACCUMULATION_WINDOW_SECONDS elapsed
     ▼
LLMClient.analyze(prompt)          (ai/llm.py — any OpenAI-compatible endpoint)
     │  JSON verdict {needs_help, help_message, confidence, reason}
     ▼  if needs_help
TTSClient.synthesize(help_message) (ai/tts.py — piper | edge_tts)
     ▼
{"type":"help_needed", …, "audio":"<base64>"}   → client (spoken back to the child)
```

## Module layout

| File | Responsibility |
|---|---|
| `app.py` | `ReadingAssistantServer` — connection lifecycle, flush loop, analysis, `/health` |
| `config.py` | `Settings` dataclass built from environment variables |
| `providers.py` | Factory: `build_stt` / `build_llm` / `build_tts` from `Settings` |
| `ai/base.py` | `STTClient`, `LLMClient`, `TTSClient` protocols + `Transcript` types |
| `ai/stt.py` | `FasterWhisperSTT` (CTranslate2, VAD-filtered) |
| `ai/llm.py` | `OllamaLLM` (OpenAI-compatible Chat Completions) + robust JSON parsing |
| `ai/tts.py` | `PiperTTS` (offline, default — voice baked into the Docker image) and `EdgeTTS` (online fallback) |
| `session.py` | Per-client audio buffer, epoch rotation, transcript accumulation, analysis timing |
| `media_server.py` | stdlib HTTP: `/health`, `/api/books?level=2|3`, `/books.json`, `/books/*` |
| `books_repository.py` | PostgreSQL access for level-filtered book metadata |
| `setup_books_table.py` | Idempotent table creation, sample seeding, and verification |
| `storage.py` | `LocalStorage` (disk) / `MinioStorage` (S3-compatible) |
| `prompts.py` | The reading-assistant prompt and its strict JSON contract |
| `healthcheck.py` | Setup verification (replaces the old AWS credential checker) |
| `scripts/download_piper_voice.py` | Fetches Piper voice files from HuggingFace |
| `scripts/e2e_smoke.py` | CLI smoke test: sends an audio file through the live pipeline |

## WebSocket protocol

```jsonc
// client → server
{ "type": "audio",   "data": "<base64 audio chunk>" }
{ "type": "control", "action": "start" }              // optional
{ "type": "control", "action": "stop" }               // flush pending audio immediately

// server → client
{ "type": "transcription", "text": "…", "confidence": 0.98, "is_partial": false, "timestamp": "…" }
{ "type": "help_needed", "needs_help": true, "help_message": "…",
  "audio": "<base64>", "audio_format": "wav|mp3", "confidence": 0.9, "reason": "…", "timestamp": "…" }
{ "type": "error", "message": "…" }
```

Bare base64 strings are also accepted (legacy support). Audio can be any format PyAV decodes
(WebM/Opus from `MediaRecorder`, WAV, MP4…). The first chunk of a recording contains the
container header; the session retains it so buffer rotations stay decodable.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `HOST` / `PORT` | `0.0.0.0` / `8765` | WebSocket bind address |
| `MEDIA_PORT` / `SERVE_MEDIA` | `8766` / `true` | HTTP media server |
| `ACCUMULATION_WINDOW_SECONDS` | `5` | Transcript collected per LLM analysis |
| `STT_FLUSH_INTERVAL` | `4` | Seconds between transcription flushes |
| `MAX_BUFFER_BYTES` | `20971520` | Audio bytes per session epoch before rotation |
| `STT_PROVIDER` | `faster_whisper` | STT implementation |
| `WHISPER_MODEL` / `WHISPER_DEVICE` / `WHISPER_COMPUTE_TYPE` | `base` / `cpu` / `int8` | faster-whisper tuning (`float16` on GPU) |
| `LLM_PROVIDER` | `ollama` | LLM implementation (any OpenAI-compatible endpoint) |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | `http://localhost:11434/v1` / `ollama` / `qwen2.5:3b` | endpoint + model (recommended ~2 GB; ~4 GB RAM to run) |
| `LLM_TEMPERATURE` / `LLM_MAX_TOKENS` / `LLM_TIMEOUT` | `0.3` / `500` / `30` | inference settings |
| `TTS_PROVIDER` | `piper` | `piper` (offline, default) or `edge_tts` (online) |
| `TTS_VOICE` | `en-GB-SoniaNeural` | edge-tts voice id — child-friendly: `en-US-AnaNeural` (child voice), `en-US-JennyNeural` |
| `PIPER_VOICE` / `PIPER_MODELS_DIR` | `en_US-amy-medium` / `models` | piper voice + folder — friendlier alternatives: `en_US-lessac-medium`, `en_GB-alan-low` (browse [piper-voices](https://huggingface.co/rhasspy/piper-voices)) |
| `STORAGE_PROVIDER` | `local` | `local` or `minio` |
| `MEDIA_DIR` | `media` | Location of `books.json` + `books/` |
| `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET` / `MINIO_SECURE` | — | for `STORAGE_PROVIDER=minio` |

## Swapping providers (plug-and-play)

`providers.py` maps env values to classes. Example — pointing the analysis at Groq instead of
local Ollama, with **zero code changes**:

```bash
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_…
LLM_MODEL=llama-3.1-8b-instant
```

### Adding a new provider

1. Implement the relevant protocol from `ai/base.py` in a new module (heavy imports lazy).
2. Register it in `providers.py`.
3. Add its config knobs to `Settings` (and `.env.example`).
4. Extend the tests with a fake of it (see `tests/conftest.py` for the pattern).

## Health endpoints

- `GET http://…:8765/health` — WebSocket server liveness (used by the Docker `HEALTHCHECK`)
- `GET http://…:8766/health` — media server liveness
- `python healthcheck.py [--deep]` — verifies media library, LLM endpoint reachability, TTS
  voice presence; `--deep` also loads the Whisper model

## Running

```bash
make dev-server        # native: python Server/app.py (uses root .env)
make up                # docker: server + client + ollama
make logs              # follow
```

## Tests

```bash
cd Server && .venv/bin/python -m pytest -q
```

- `test_session.py` — buffering, de-duplication, epoch rotation, analysis window
- `test_llm.py` — JSON parsing (fences/prose), `response_format` negotiation with retry
- `test_ws.py` — **E2E**: real websockets server + client with fake STT/LLM/TTS providers,
  exercising audio → transcription → help_needed, error handling, `/health`, and control-stop

`tests/conftest.py` contains the fake providers (`FakeSTT`, `FakeLLM`, `FakeTTS`) and
`make_settings()` — reuse them when testing new providers.

