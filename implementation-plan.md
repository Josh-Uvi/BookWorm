# Implementation Plan — AI Reading Assistant

| | |
|---|---|
| **Date** | 2026-09-07 |
| **Status** | ✅ Implemented — see the git history for the milestone commits |
| **Scope** | Platform-agnostic refactor · E2E client↔server integration · Docker + Make · Documentation · CI/CD & production (GCP/AWS) |

---

## 1. Executive Summary

The AI Reading Assistant is a two-part system: a **React/Vite client** (`Client/`) that displays
children's books (PDF) and a **Python WebSocket server** (`Server/`) that listens to a child read
aloud, transcribes the speech, detects when the child is struggling, and speaks an encouraging
help message back.

Today the two halves are **not connected** (the client has no microphone capture or WebSocket
client) and **every AI capability is hard-wired to AWS** (Transcribe, Bedrock, Polly, CloudFront).
There is no containerization, no Make tooling, no CI/CD, no git repository, and no root
documentation.

This plan delivers five workstreams:

1. **Platform-agnostic refactor** — replace AWS services with open-source, self-hostable
   alternatives behind clean provider interfaces ("plug and play": swap STT/LLM/TTS/storage via
   environment variables only).
2. **Full E2E integration** — microphone → WebSocket → STT → LLM → TTS → audio playback.
3. **Containerization** — Dockerfiles + `docker-compose` (dev & prod), with **Make** as the single
   entry-point for setup/startup.
4. **Documentation** — `docs/backend.md`, `docs/frontend.md`, root `README.md`, `.env.example`.
5. **Path to production** — GitHub Actions CI + deployment guides for **GCP** and **AWS**.

---

## 2. Current-State Analysis (As-Is)

### 2.1 Repository layout

```
ai-reading-assistant/
├── Client/            # React 18 + Vite + TypeScript + Tailwind + shadcn/ui
│   ├── src/
│   │   ├── pages/         # Landing, Interests, Reading, Profile, NotFound
│   │   ├── components/    # Navbar, BookCard, ThemeToggle, ui/* (shadcn)
│   │   ├── services/      # bookService.ts
│   │   ├── config/        # books.ts (hardcoded CloudFront PDF URLs)
│   │   ├── data/          # sampleBooks.ts (local fallback)
│   │   ├── hooks/         # useLocalStorage, useTheme, use-mobile
│   │   └── types/         # Book, Chapter, ChatMessage, ...
│   ├── vite.config.ts     # dev server on port 8080
│   └── package.json       # socket.io-client declared but UNUSED
└── Server/           # Python 3.13 + websockets
    ├── app.py             # AudioWebSocketServer (ws://localhost:8765)
    ├── config.py          # hardcoded AWS Bedrock/Polly settings
    ├── setup_aws.py       # AWS credential checker (to be removed)
    └── requirements.txt   # websockets, amazon-transcribe, boto3, botocore
```

### 2.2 Client — key findings

- `Reading.tsx` renders the book PDF in an `<iframe>` and a **simulated** chat (canned
  `setTimeout` responses). There is **no** `getUserMedia`, `MediaRecorder`, `WebSocket`, or audio
  playback logic anywhere in `src/`.
- Books come from `src/config/books.ts`, which hardcodes an AWS CloudFront distribution
  (`https://datfi4tnj5vc7.cloudfront.net/books-pdf/...`).
- `socket.io-client@^4.8.3` is installed but never imported — the server actually speaks **raw
  WebSocket** (`websockets` lib), not Socket.IO.
- No `.env` handling exists; `VITE_*` variables are referenced only in `CLOUDFRONT_SETUP.md`.
- Tests: one placeholder vitest suite (`src/test/example.test.ts`).

### 2.3 Server — key findings

- `app.py` (~450 lines, monolith) contains `ReadingAssistant` (Bedrock + Polly),
  `TranscriptHandler` (amazon-transcribe), `AudioWebSocketServer` (websockets on port 8765).
- Audio flow: WS `{"type":"audio","data":"<base64>"}` → Transcribe streaming → final transcripts →
  accumulate 5 s → Bedrock `converse()` → JSON verdict → Polly MP3 → `{"type":"help_needed", ...}`
  back to the client.
- AWS region defaults to `us-east-1`; credentials resolved via a boto3 session at startup.
- Python pinned to 3.13 (`.python-version`) — newer than some AI libraries' wheel support.

### 2.4 AWS dependency inventory

| # | AWS service | Where used | Open-source replacement |
|---|---|---|---|
| 1 | Amazon Transcribe (STT) | `Server/app.py` streaming transcription | **faster-whisper** + Silero VAD |
| 2 | Amazon Bedrock Nova Lite (LLM) | `Server/app.py` `converse()` | **Ollama** (OpenAI-compatible API) |
| 3 | Amazon Polly (TTS) | `Server/app.py` `synthesize_speech()` | **Piper** (offline) / **edge-tts** fallback |
| 4 | CloudFront + S3 (book PDFs) | `Client/src/config/books.ts` | Local `media/` volume or **MinIO** |
| 5 | boto3 / botocore / amazon-transcribe | `Server/requirements.txt` | removed entirely |

### 2.5 Gaps & issues

1. **No E2E integration** — the product's core feature does not work end to end.
2. **Vendor lock-in** — the AI pipeline is unusable without AWS credentials.
3. **Hardcoded infra** — the CloudFront domain is baked into the client bundle.
4. **No tooling** — no git, Docker, Make, CI/CD, health checks, or root README.
5. **Dead dependency** — `socket.io-client`.
6. **No tests** beyond a placeholder.

---

## 3. Goals & Success Criteria

| Goal | Success criterion |
|---|---|
| Platform-agnostic | App runs fully offline with zero cloud credentials; providers swappable via `.env` only |
| E2E integration | Child reads aloud → live transcript appears → struggle detected → spoken help plays back |
| Containerized | `make up` brings the whole stack up on any machine with Docker |
| Documented | A new developer is productive from `README.md` alone |
| Production-ready | CI green; one-command deploys to GCP and AWS, documented and automated |

---

## 4. Target Architecture (To-Be)

### 4.1 System diagram

```
┌────────────────────────────┐      ws://server:8765      ┌─────────────────────────────┐
│  Client (React/Vite)       │ ── audio (base64) ──────▶ │  Server (Python/asyncio)    │
│  ─────────────────────     │                           │  ────────────────────────  │
│  getUserMedia +            │ ◀─ transcription events ── │  VAD → STTClient            │
│  MediaRecorder            │ ◀─ help_needed + audio ── │     (faster-whisper)        │
│  Audio playback            │                           │  LLMClient (Ollama)        │
│  VITE_WS_URL env           │                           │  TTSClient (Piper/edge-tts)│
└────────────┬───────────────┘                           │  StorageBackend            │
             │  fetch books.json + PDFs                  │    (MinIO / local volume)  │
             ▼                                           └──────────┬─────────────────┘
      Nginx (static dist)                                          ▲
      /media ← MinIO or volume          Ollama container (qwen2.5) ─┘
```

### 4.2 Open-source replacement matrix

| Concern | AWS (today) | Recommended | Alternatives (same interface) |
|---|---|---|---|
| Speech-to-Text | Amazon Transcribe | `faster-whisper` (CTranslate2, MIT) + Silero VAD | whisper.cpp, WhisperX, Vosk |
| LLM analysis | Bedrock Nova Lite | **Ollama** `qwen2.5:3b` via OpenAI-compatible API | vLLM, LM Studio, Groq, OpenAI |
| Text-to-Speech | Amazon Polly (Amy) | **Piper** (`en_US-amy-medium`) | edge-tts (free MS voices), Coqui |
| Book/PDF storage | CloudFront + S3 | **MinIO** (S3-compatible) or plain volume | any static file server |
| Realtime transport | raw websockets | **raw websockets** (browser `WebSocket`) | socket.io (later, if rooms needed) |

### 4.3 Provider abstraction (the "plug-and-play" core)

All AI capabilities sit behind small Python protocols. `providers.py` builds concrete instances
from environment variables — **swapping a provider never requires touching business logic.**

```python
# Server/ai/base.py
from typing import Protocol

class STTClient(Protocol):
    def transcribe(self, wav_path: str) -> "Transcript": ...

class LLMClient(Protocol):
    async def analyze(self, prompt: str) -> dict: ...   # parsed JSON verdict

class TTSClient(Protocol):
    async def synthesize(self, text: str) -> bytes:      # WAV/MP3 audio bytes
        ...
```

`providers.py` factory:

```python
def build_stt(cfg) -> STTClient:
    if cfg.stt_provider == "faster_whisper":
        return FasterWhisperSTT(cfg.whisper_model, cfg.whisper_device)
    raise ValueError(f"Unknown STT provider: {cfg.stt_provider}")
# analogous build_llm() and build_tts()
```

### 4.4 WebSocket protocol (client ↔ server contract)

```jsonc
// client → server
{ "type": "audio", "data": "<base64 audio chunk>" }
{ "type": "control", "action": "start" }            // optional session signal

// server → client
{ "type": "transcription", "text": "...", "confidence": 0.92,
  "is_partial": false, "timestamp": "..." }
{ "type": "help_needed", "needs_help": true, "help_message": "...",
  "audio": "<base64 wav/mp3>", "confidence": 0.9, "reason": "...",
  "timestamp": "..." }
{ "type": "error", "message": "..." }
```

The message shapes intentionally match the current AWS implementation, so the client contract
stays stable across the refactor.

---

## 5. Phase 1 — Backend: Platform-Agnostic Refactor

### 5.1 New layout

```
Server/
├── app.py                 # thin WS entrypoint + session orchestration (rewritten)
├── config.py              # env-driven settings (python-dotenv)
├── providers.py           # factory: build STT/LLM/TTS/Storage from env
├── ai/
│   ├── base.py            # STTClient / LLMClient / TTSClient protocols
│   ├── stt.py             # FasterWhisperSTT
│   ├── llm.py             # OllamaLLM (openai SDK against LLM_BASE_URL)
│   └── tts.py             # PiperTTS, EdgeTTS
├── storage.py             # StorageBackend: LocalStorage, MinioStorage
├── session.py             # per-client reading session (replaces ReadingAssistant)
├── prompts.py             # READING_ASSISTANT_PROMPT (moved from config.py)
├── healthcheck.py         # replaces setup_aws.py — checks providers & storage
├── requirements.txt       # rewritten (no AWS SDKs)
├── requirements-dev.txt   # pytest, ruff
├── Dockerfile
└── tests/
    ├── test_session.py     # accumulation window + verdict parsing
    ├── test_llm.py         # mocked OpenAI-compatible responses
    └── test_ws.py          # end-to-end WS protocol test with a fake STT
```

### 5.2 Key implementation sketches

**STT — `ai/stt.py`** (faster-whisper, chunked with VAD):

```python
class FasterWhisperSTT:
    def __init__(self, model_size="base", device="cpu"):
        from faster_whisper import WhisperModel
        self.model = WhisperModel(model_size, device=device, compute_type="int8")

    def transcribe(self, wav_path):
        segments, info = self.model.transcribe(wav_path, vad_filter=True)
        text = " ".join(s.text for s in segments).strip()
        return {"text": text, "language": info.language,
                "confidence": info.language_probability}
```

**LLM — `ai/llm.py`** (OpenAI SDK — works with Ollama, vLLM, Groq, OpenAI, ...):

```python
class OllamaLLM:
    def __init__(self, base_url, model, temperature=0.3, max_tokens=500):
        from openai import OpenAI
        self.client = OpenAI(base_url=base_url, api_key="not-needed")
        self.model, self.temperature, self.max_tokens = model, temperature, max_tokens

    async def analyze(self, prompt: str) -> dict:
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=self.temperature, max_tokens=self.max_tokens,
            response_format={"type": "json_object"},
        )
        return json.loads(resp.choices[0].message.content)
```

**TTS — `ai/tts.py`** (Piper primary, edge-tts fallback):

```python
class PiperTTS:
    def __init__(self, voice="en_US-amy-medium"):
        from piper import PiperVoice
        self.voice = PiperVoice.load(f"/models/{voice}.onnx")

    async def synthesize(self, text: str) -> bytes:      # returns WAV bytes
        buf = io.BytesIO()
        self.voice.synthesize(text, buf, wav_file=True)
        return buf.getvalue()

class EdgeTTS:                                          # zero-setup fallback
    async def synthesize(self, text: str) -> bytes:     # returns MP3 bytes
        import edge_tts
        return await edge_tts.synthesize(text, "en-GB-SoniaNeural")
```

**Orchestration — `app.py`** keeps the current product behaviour: accumulate transcripts for
`ACCUMULATION_WINDOW_SECONDS`, call `LLMClient.analyze(READING_ASSISTANT_PROMPT.format(...))`,
and if the verdict says `needs_help`, `TTSClient.synthesize()` the help message and send it back
as base64. AWS-specific code (boto3 session, region resolution, Transcribe handler) is deleted.

### 5.3 Environment configuration (replaces all AWS config)

| Variable | Default | Purpose |
|---|---|---|
| `HOST` / `PORT` | `0.0.0.0` / `8765` | WS bind address |
| `ACCUMULATION_WINDOW_SECONDS` | `5` | text accumulation window |
| `STT_PROVIDER` | `faster_whisper` | STT implementation |
| `WHISPER_MODEL` | `base` | `tiny` / `base` / `small` / `medium` / `large-v3` |
| `WHISPER_DEVICE` | `cpu` | `cpu` or `cuda` |
| `LLM_PROVIDER` | `ollama` | any OpenAI-compatible implementation |
| `LLM_BASE_URL` | `http://ollama:11434/v1` | endpoint (swap = reconfigure only) |
| `LLM_MODEL` | `qwen2.5:3b` | model served at the endpoint |
| `LLM_TEMPERATURE` / `LLM_MAX_TOKENS` | `0.3` / `500` | inference config |
| `TTS_PROVIDER` | `piper` | `piper` or `edge_tts` |
| `TTS_VOICE` | `en_US-amy-medium` | Piper voice or edge-tts voice id |
| `STORAGE_PROVIDER` | `local` | `local` or `minio` |
| `MEDIA_DIR` | `/data/media` | books/PDF location |
| `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | — | when `STORAGE_PROVIDER=minio` |

### 5.4 Requirements changes

```diff
- websockets==12.0
- amazon-transcribe==0.6.2
- boto3==1.34.0
- botocore==1.34.0
+ websockets>=13,<14
+ faster-whisper>=1.0
+ openai>=1.40            # OpenAI-compatible client (Ollama/vLLM/Groq/OpenAI)
+ piper-tts>=1.2
+ edge-tts>=6.1
+ python-dotenv>=1.0
+ numpy>=1.26
```

Pin Python to **3.11** (in `Dockerfile` and `.python-version`) for the best wheel coverage of
faster-whisper / CTranslate2 / onnxruntime / piper. Dev extras (`requirements-dev.txt`):
`pytest`, `pytest-asyncio`, `ruff`.

### 5.5 Removals

- `Server/setup_aws.py` → replaced by `healthcheck.py` (verifies STT/LLM/TTS/storage are
  reachable and models are downloaded).
- All `boto3` / `amazon_transcribe` imports, `aws_region` resolution, credential checks.

---

## 6. Phase 2 — Client Refactor + E2E Integration

### 6.1 New hooks

**`src/hooks/useAudioRecorder.ts`**

- `getUserMedia({ audio: true })` + `MediaRecorder` (Opus/WebM).
- `start(timeslice=250)` → `Blob` → base64 → invokes an `onChunk(base64)` callback.
- Exposes `isRecording`, `start()`, `stop()`, and microphone-permission error state.

**`src/hooks/useReadingAssistant.ts`**

- Opens a native `WebSocket` at `import.meta.env.VITE_WS_URL`.
- Sends chunks as `{"type":"audio","data":...}`.
- Handles `transcription` → live transcript state; `help_needed` → decodes the base64 audio
  (`new Audio("data:audio/wav;base64,...")`) and plays it, surfacing the help text.
- Exponential-backoff auto-reconnect; exposes `status: "idle" | "connected" | "error"`.

### 6.2 `Reading.tsx` changes

1. Add a **"Read aloud"** mic toggle (floating control beside the chat/settings buttons).
2. Add a **live transcript strip** showing partial/final transcriptions.
3. Add an **assistant panel** that shows `help_needed` messages while the child reads.
4. Remove the fake `setTimeout` chat bot; keep the chat UI shell as a future feature.

### 6.3 Book data — de-CloudFront

- `bookService.ts` fetches `books.json` from `VITE_BOOKS_API_URL` (served from `MEDIA_DIR` by
  Nginx/the server), falling back to `sampleBooks` on failure.
- `config/books.ts` CloudFront URLs are removed; `pdfUrl` becomes a relative path resolved
  against `VITE_MEDIA_URL` (e.g. `/media/books/monkey-business.pdf`).

### 6.4 Client environment (`.env.example`)

```bash
VITE_WS_URL=ws://localhost:8765      # WebSocket server
VITE_API_URL=http://localhost:8080   # app origin
VITE_MEDIA_URL=/media                # book PDFs & covers
```

### 6.5 Cleanup

- Remove the unused `socket.io-client` dependency.
- Add real tests: `useReadingAssistant` message parsing + reconnection, `bookService` fallback.
- Fix `index.html` Lovable placeholder `<title>`/meta tags.

---

## 7. Phase 3 — Containerization (Docker)

### 7.1 `Server/Dockerfile`

```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s \
  CMD curl -sf http://localhost:8765/health || exit 1
CMD ["python", "app.py"]
```

### 7.2 `Client/Dockerfile` (multi-stage) + Nginx

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_WS_URL
ARG VITE_MEDIA_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`Client/nginx.conf` — serves the SPA (`try_files $uri /index.html`), proxies `/ws` →
`server:8765` with WebSocket `Upgrade` headers so the browser can use a same-origin
`ws(s)://` URL, and serves `/media` from the shared volume.

### 7.3 `docker-compose.yml` (dev)

```yaml
services:
  server:
    build: ./Server
    ports: ["8765:8765"]
    environment:
      LLM_BASE_URL: http://ollama:11434/v1
      MEDIA_DIR: /data/media
    volumes:
      - ./media:/data/media
      - model-cache:/root/.cache        # whisper + piper model cache
    depends_on: [ollama]
  client:
    build:
      context: ./Client
      args: { VITE_WS_URL: "ws://localhost:8765", VITE_MEDIA_URL: "/media" }
    ports: ["8080:80"]
    depends_on: [server]
  ollama:
    image: ollama/ollama:latest
    ports: ["11434:11434"]
    volumes: [ollama:/root/.ollama]
  minio:                                # optional: STORAGE_PROVIDER=minio
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]
    volumes: [minio:/data]
volumes: { model-cache: {}, ollama: {}, minio: {} }
```

`docker-compose.prod.yml` (override) — remove public port bindings for internal services, add
`restart: unless-stopped`, resource limits, and an optional GPU profile
(`deploy.resources.reservations.devices` for `ollama`/`server`).

### 7.4 First-run model provisioning

`make setup` runs `ollama pull qwen2.5:3b` (via a one-shot `docker compose exec`) and downloads
the Piper voice into the named volume, so subsequent `make up` starts are instant.

---

## 8. Phase 4 — Makefile (single entry point)

```makefile
.DEFAULT_GOAL := help

setup:       ## First-run: .env, media dirs, pull AI models
up:          ## Build & start the full stack (detached)
down:        ## Stop the stack
restart:     ## down + up
logs:        ## Tail all service logs
ps:          ## Service status
dev-client:  ## Run client natively with hot reload
dev-server:  ## Run server natively (python app.py)
test:        ## pytest (Server) + vitest (Client)
lint:        ## eslint (Client) + ruff (Server)
build:       ## Production builds (client dist + server image)
prod:        ## Start the production compose stack
clean:       ## Remove containers, volumes, build caches
deploy-gcp:  ## Push images & deploy to GCP (CI)
deploy-aws:  ## Push images & deploy to AWS (CI)
help:        ## Show this help
```

Conventions: all targets `.PHONY`; `##` comments power a self-documenting `help` target;
compose invocations use `COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1`; dev targets fall back
to local Node/Python for contributors who prefer running without Docker.

---

## 9. Phase 5 — Documentation

| File | Contents |
|---|---|
| **`README.md`** (root) | Project overview, feature list, architecture diagram, prerequisites (just Docker), quickstart (`make setup && make up`), Make target reference, env-var tables, provider swap matrix, repo layout, troubleshooting |
| **`docs/backend.md`** | Server architecture, WS message protocol, provider interfaces + how to add a new STT/LLM/TTS provider, all env vars, model provisioning, running/debugging, test guide |
| **`docs/frontend.md`** | Component/page structure, routing, hooks (`useAudioRecorder`, `useReadingAssistant`), the audio pipeline explained, env vars, build & deploy (Docker/Nginx), test guide |
| **`docs/deployment-gcp.md`** | Step-by-step GCP deployment (§10.2) |
| **`docs/deployment-aws.md`** | Step-by-step AWS deployment (§10.3) |
| **`.env.example`** | Every knob, documented inline; copied to `.env` by `make setup` |

Also: replace the Lovable boilerplate `Client/README.md` and the AWS-centric `Server/README.md`
with short files pointing to the root docs.

---

## 10. Phase 6 — Path to Production (CI/CD)

### 10.1 `.github/workflows/ci.yml` — every PR + push to `main`

```yaml
name: CI
on: [push, pull_request]
jobs:
  client:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: Client } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: Client/package-lock.json }
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
  server:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: Server } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install -r requirements.txt -r requirements-dev.txt
      - run: ruff check .
      - run: pytest
```

### 10.2 Deploy — GCP (`.github/workflows/deploy-gcp.yml`)

Trigger: tag `v*` or manual dispatch. Auth via **Workload Identity Federation** (OIDC — no
long-lived keys).

1. **Auth** — `google-github-actions/auth` → Artifact Registry writer + Cloud Run developer.
2. **Build & push** — `server` and `client` images to
   `<region>-docker.pkg.dev/<project>/reading-assistant/*`.
3. **Deploy server** — `google-github-actions/deploy-cloudrun` with env vars (`LLM_BASE_URL`,
   `LLM_MODEL`, ...). Cloud Run supports WebSockets; add `--gpu=nvidia-l4 --gpu-count=1` when
   faster-whisper needs GPU (or move to GKE for sustained GPU workloads). Ollama either ships as
   a baked-in sidecar image (model embedded) or is replaced by any hosted OpenAI-compatible
   endpoint — again just `LLM_BASE_URL`.
4. **Deploy client** — upload `dist/` to a **Cloud Storage** bucket fronted by **Cloud CDN**.
5. **DNS/TLS** — map the custom domain; steps captured in `docs/deployment-gcp.md`.

### 10.3 Deploy — AWS (`.github/workflows/deploy-aws.yml`)

Trigger: tag `v*` or manual dispatch. Auth via `aws-actions/configure-aws-credentials` with a
GitHub **OIDC provider** (no static keys).

1. **Auth** — OIDC role with ECR push + ECS update permissions.
2. **Build & push** — images to **ECR** (`reading-assistant/server`, `reading-assistant/client`).
3. **Deploy server** — **ECS Fargate** service (task definition with env vars; GPU variant
   optional on EC2 launch type), behind an **ALB with a WebSocket target group** (idle timeout
   raised to ~300 s).
4. **Deploy client** — sync `dist/` to **S3** + **CloudFront** invalidation. (CloudFront now
   hosts only the static SPA; the AWS *AI* lock-in is gone — using AWS for hosting is optional.)
5. **DNS/TLS** — ACM certificate + Route 53; steps in `docs/deployment-aws.md`.

### 10.4 Production checklist

- [ ] Secrets in GCP Secret Manager / AWS Secrets Manager — never in the repo
- [ ] `wss://` everywhere (TLS terminated at CDN/ALB/Nginx)
- [ ] `/health` HTTP endpoint on the WS server wired to container + cloud health checks
- [ ] Resources tuned (faster-whisper ≥ 2 vCPU; Ollama ≥ 4 GB RAM)
- [ ] Log aggregation (Cloud Logging / CloudWatch) and alerting
- [ ] Image tagging: git SHA + semver tags; never deploy `latest`

---

## 11. Complete File Inventory

### New files

| Path | Purpose |
|---|---|
| `README.md` | Root documentation hub |
| `Makefile` | One-command workflows |
| `docker-compose.yml` / `docker-compose.prod.yml` | Dev & prod stacks |
| `.env.example` | All configuration knobs |
| `.gitignore` | Root ignore (node_modules, .venv, dist, .env, media, models) |
| `media/books/` | Book PDFs (replaces CloudFront) |
| `docs/backend.md`, `docs/frontend.md` | Per-app docs |
| `docs/deployment-gcp.md`, `docs/deployment-aws.md` | Cloud guides |
| `.github/workflows/ci.yml` | Lint / test / build |
| `.github/workflows/deploy-gcp.yml`, `.github/workflows/deploy-aws.yml` | CD pipelines |
| `Server/ai/{base,stt,llm,tts}.py` | Provider implementations |
| `Server/{providers,storage,session,prompts,healthcheck}.py` | Refactored backend modules |
| `Server/Dockerfile`, `Server/requirements-dev.txt`, `Server/tests/*` | Backend infra & tests |
| `Client/Dockerfile`, `Client/nginx.conf` | Frontend container |
| `Client/src/hooks/useAudioRecorder.ts`, `Client/src/hooks/useReadingAssistant.ts` | Mic capture + WS client |

### Modified files

| Path | Change |
|---|---|
| `Server/app.py` | Rewritten as a thin orchestrator over provider interfaces |
| `Server/config.py` | Env-driven settings; AWS constants removed |
| `Server/requirements.txt` | New dependency set (no AWS SDKs) |
| `Server/.python-version` | `3.11` |
| `Client/src/pages/Reading.tsx` | Mic toggle, transcript strip, assistant panel; fake bot removed |
| `Client/src/services/bookService.ts` | Fetch from `VITE_BOOKS_API_URL`; de-CloudFront |
| `Client/src/config/books.ts` | Relative media paths instead of CloudFront URLs |
| `Client/package.json` | Drop `socket.io-client`; test/lint scripts |
| `Client/index.html` | Real title/meta (remove Lovable placeholders) |
| `Client/README.md`, `Server/README.md` | Point to root docs |

### Deleted files

| Path | Reason |
|---|---|
| `Server/setup_aws.py` | AWS credential checker → `healthcheck.py` |
| `Server/Architecture.pptx` | Binary artifact — move out of the repo |
| `Client/CLOUDFRONT_SETUP.md` | Superseded by `docs/frontend.md` |

---

## 12. Implementation Order & Estimates

| Step | Deliverable | Est. |
|---|---|---|
| 0 | `git init`, root `.gitignore`, initial commit | 0.25 d |
| 1 | Provider interfaces + faster-whisper / Ollama / Piper implementations | 2 d |
| 2 | Server rewrite (`app.py` orchestrator) + pytest suite | 1.5 d |
| 3 | Client hooks + `Reading.tsx` integration + book service refactor | 2 d |
| 4 | Dockerfiles + compose (dev/prod) + Nginx WS proxy | 1 d |
| 5 | Makefile + `.env.example` + first-run setup | 0.5 d |
| 6 | Docs (README, `docs/*.md`) | 1 d |
| 7 | CI + GCP/AWS deploy workflows + deploy docs | 1.5 d |
| 8 | E2E validation: `make up` → read aloud → spoken help; prod stack | 1 d |
| | **Total** | **~10.75 d** |

Dependency order: 1 → 2 → (3 ∥ 4) → 5 → 6 → 7 → 8. Steps 3 and 4 can run in parallel after 2.

---

## 13. Risks & Tradeoffs

| Risk | Impact | Mitigation |
|---|---|---|
| faster-whisper is chunk-based, not true streaming | ~1–2 s transcript latency | VAD-chunked processing; acceptable for the reading flow; whisper.cpp streaming later |
| Ollama latency on CPU | Slow "needs help" verdicts | GPU compose profile; or point `LLM_BASE_URL` at vLLM/Groq/OpenAI — zero code change |
| Piper voice quality below Polly neural | Less natural help voice | `edge-tts` fallback (needs internet); Piper stays strictly offline |
| Large model downloads on first run | Slow first `make up` | `make setup` pre-pulls; named Docker volumes cache models |
| WebSocket through CDN/ALB | Dropped connections | Same-origin Nginx proxy locally; ALB idle timeout + heartbeat ping in prod |
| Whisper accuracy on children's voices | Wrong transcripts | Document tuning (`WHISPER_MODEL=small/medium`) in `docs/backend.md` |

---

## 14. Acceptance Criteria (Definition of Done)

1. `grep -rE "boto3|amazon.transcribe|polly|bedrock|cloudfront" Server/ Client/src/` → **no matches**.
2. `make setup && make up` on a clean machine → client at `http://localhost:8080`, server healthy.
3. In the app: open a book → toggle mic → read aloud → live transcript appears → after struggling
   ("help... I don't know this word") a spoken help message plays automatically.
4. Swapping `LLM_BASE_URL`/`LLM_MODEL` or `TTS_PROVIDER` in `.env` requires **no code changes**.
5. `make test` and `make lint` pass; CI is green on GitHub.
6. The `README.md` quickstart works for a developer with no prior context.
7. Tagging `v1.0.0` triggers both deploy pipelines; `docs/deployment-*.md` walk a new user
   through GCP and AWS deploys successfully.

---

## 15. Open Questions (non-blocking)

1. Keep the social "Live Chat" panel (needs a chat backend) or replace it with the assistant feed
   only? → **Assumed assistant-only for this milestone.**
2. Multi-language support? (Prompt/STT are en-US only today.)
3. Auth & multi-tenancy — none exists today; out of scope for this milestone.
4. Book content pipeline — who uploads PDFs to `media/`? → **Manual for now.**






