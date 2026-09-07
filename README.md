# AI Reading Assistant

A platform-agnostic reading companion for children. The child opens a book, reads it aloud,
and the assistant **listens in real time** — transcribing their speech, noticing when they
struggle, and speaking a friendly, encouraging help message back.

Everything runs on **open-source, self-hostable components** — no cloud account or vendor
credentials required:

| Capability | Default implementation | Swap via |
|---|---|---|
| Speech-to-text | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (offline) | `STT_PROVIDER`, `WHISPER_MODEL` |
| Help analysis (LLM) | [Ollama](https://ollama.com) — any OpenAI-compatible endpoint (vLLM, LM Studio, Groq, OpenAI…) | `LLM_BASE_URL`, `LLM_MODEL` |
| Text-to-speech | [edge-tts](https://github.com/rany2/edge_tts) or [Piper](https://github.com/rhasspy/piper) (offline) | `TTS_PROVIDER`, `TTS_VOICE` |
| Book storage | Local folder or [MinIO](https://min.io) (S3-compatible) | `STORAGE_PROVIDER` |

```
┌───────────────────────────┐       ws://…/ws       ┌────────────────────────────┐
│ Client (React + Vite)     │ ── audio (base64) ──▶ │ Server (Python, asyncio)   │
│ getUserMedia +            │                       │ faster-whisper STT         │
│ MediaRecorder             │ ◀── transcript ────── │ Ollama LLM “needs help?”   │
│ plays spoken help         │ ◀── help + MP3/WAV ── │ edge-tts / Piper TTS       │
└───────────────────────────┘                       │ books: local / MinIO       │
        │  loads books.json + PDFs from /media      └────────────────────────────┘
        ▼
   Nginx (SPA + /ws + /media proxy)
```

## Quickstart (Docker)

```bash
make setup   # .env, Python venv, Ollama model + Piper voice
make up      # build & start server, client and Ollama
```

Then open **http://localhost:8080**, pick a book, press **“Read aloud”** and grant microphone
access. As you read (or pretend to struggle: *“I don’t know this word… help!”*), the live
transcript appears in the sidebar and the assistant speaks an encouraging reply.

> Heads-up on model size: `llama3.2` (the recommended default) needs an Ollama container with
> **≥ 6 GB RAM**. On constrained machines (e.g. a default 2 GiB colima VM) use a smaller model
> such as `qwen2.5:0.5b` — set `LLM_MODEL` and `OLLAMA_MODEL` in `.env`. See
> [Troubleshooting](#troubleshooting).

## Prerequisites

- **Docker** (Docker Desktop, or colima/Rancher Desktop with the compose plugin or standalone
  `docker-compose` binary — auto-detected)
- Optional, for native development: Node 20+ and Python 3.11+ (installed by `make setup`)

## Make targets

| Target | What it does |
|---|---|
| `make setup` | First-run setup: `.env`, Python venv, Ollama model, Piper voice |
| `make up` / `make down` / `make restart` | Start / stop the Docker stack (auto-seeds books & models) |
| `make prod` | Production compose stack (only the client exposed, on port 80) |
| `make logs` / `make ps` | Follow logs / show status |
| `make dev-client` / `make dev-server` | Native hot-reload development (no Docker) |
| `make test` | Server (pytest) + client (vitest) suites |
| `make lint` | ruff (server) + eslint (client) |
| `make healthcheck` | Verify media library, LLM endpoint and TTS voice |
| `make deploy-gcp` / `make deploy-aws` | Trigger the GitHub Actions deployments |
| `make help` | List everything |

## Configuration

All knobs live in **`.env`** (created from `.env.example` by `make setup`) — swapping a provider
is a configuration change, never a code change:

```bash
# Speech-to-text — offline, swappable model size
STT_PROVIDER=faster_whisper
WHISPER_MODEL=base            # tiny | base | small | medium | large-v3

# Language model — ANY OpenAI-compatible endpoint
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.2

# Text-to-speech — zero-setup (online) or fully offline
TTS_PROVIDER=edge_tts         # or: piper (offline; voice downloaded by `make setup`)
```

Full reference: [docs/backend.md](docs/backend.md) · [docs/frontend.md](docs/frontend.md).

## Adding books

Book PDFs live in `media/books/` and are described by `media/books.json` (each entry's `pdfUrl`
is relative to the media root). PDFs are git-ignored — commit only `books.json`. With the stack
running, `make up` / `make seed` copies them into the media volume automatically.

## Project layout

```
.
├── Client/               # React 18 + Vite + TS + Tailwind + shadcn/ui
│   ├── src/hooks/        #   useAudioRecorder, useReadingAssistant
│   ├── src/pages/        #   Landing, Interests, Reading, Profile
│   ├── src/services/     #   bookService, wsMessages
│   ├── Dockerfile        #   node build → nginx (proxies /ws, /media)
│   └── nginx.conf
├── Server/               # Python 3.11, asyncio
│   ├── app.py            #   WebSocket orchestrator (+ /health)
│   ├── ai/               #   provider interfaces: stt.py, llm.py, tts.py
│   ├── providers.py      #   factory wired from env vars
│   ├── session.py        #   audio buffer, transcript dedup, analysis window
│   ├── media_server.py   #   stdlib HTTP: /books.json, /books/*
│   ├── storage.py        #   local | minio
│   ├── scripts/          #   download_piper_voice.py, e2e_smoke.py
│   ├── tests/            #   15 tests incl. E2E WS pipeline
│   └── Dockerfile
├── media/                # books.json + books/ (PDFs)
├── docs/                 # backend, frontend, deployment guides
├── docker-compose*.yml   # dev / prod / gpu / bind-mount variants
├── Makefile
└── .github/workflows/    # CI + GCP/AWS deploys
```

## Native development (no Docker)

```bash
make setup          # once — venv with all dependencies
make dev-server     # ws://localhost:8765 + media http://localhost:8766
make dev-client     # http://localhost:8080 (proxies /ws and /media)
```

You need a reachable LLM endpoint — either a local Ollama or any hosted OpenAI-compatible API
(set `LLM_BASE_URL` / `LLM_API_KEY` accordingly).

## Testing

```bash
make test           # Server: pytest (unit + E2E WebSocket with fake providers)
                    # Client: vitest (message parsing, book service fallback)
Server/.venv/bin/python Server/scripts/e2e_smoke.py --audio my-voice.wav \
    # optional live smoke test against a running server
```

## Deployment

CI runs on every push/PR (`make test` + `make lint` + builds). Production deployments are
automated via GitHub Actions on `v*` tags (or manual dispatch):

- **Google Cloud** — server → Cloud Run, client → Cloud Storage + Cloud CDN:
  [docs/deployment-gcp.md](docs/deployment-gcp.md)
- **AWS** — server → ECS Fargate behind an ALB, client → S3 + CloudFront:
  [docs/deployment-aws.md](docs/deployment-aws.md)

## Troubleshooting

| Symptom | Fix |
|---|---|
| LLM errors like `llama-server process terminated: signal killed` | The model doesn't fit in RAM. Give Docker ≥ 6 GB (colima: `colima stop && colima start --memory 6 --cpu 4`) or use a smaller model (`LLM_MODEL=qwen2.5:0.5b`). |
| `error while creating mount source path … operation not permitted` (macOS) | Docker can't bind-mount `~/Documents` (TCC). The default compose uses named volumes — that's fine. Prefer live host files? Grant Full Disk Access to your VM runtime, or use `docker-compose.bind.yml`. |
| Microphone button disabled | The page must be served over `http://localhost` or HTTPS; `getUserMedia` is blocked on plain-HTTP LAN IPs. |
| No transcript while reading | Check `make logs`; first run downloads the Whisper model (~150 MB). Speak a full sentence — audio is transcribed every `STT_FLUSH_INTERVAL` seconds. |
| Piper error “voice not found” | Run `make setup` (downloads the voice) and restart with `make up` — voices are seeded into the container automatically. |
| `docker compose` not found | The Makefile auto-detects; standalone `docker-compose` v2 also works. |

