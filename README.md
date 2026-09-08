# AI Reading Assistant

A platform-agnostic reading companion for children. The child opens a book, reads it aloud,
and the assistant **listens in real time** — transcribing their speech, noticing when they
struggle, and speaking a friendly, encouraging help message back.

The assistant has **guardrails against interrupting**: it always knows the passage the child
is reading (shared by the client), so it can tell *reading aloud* apart from *talking to the
assistant*. While the child reads the book — even slowly or stumbling — it stays quiet; and
when the child **asks a question about the story** ("what is a trunk?"), it answers directly
and simply, grounded in the passage. It answers honestly: "I'm not sure" when it can't know,
and "that's outside our story" for questions unrelated to the book. When the child says
**"stop"** (or "shh" / "be quiet"), or says **"thank you"** after an answer — meaning "got it,
I'm reading again" — the assistant goes silent immediately: no interruptions at all until the
next direct question, which is answered and lifts the mute. Tunable via
`READING_MATCH_THRESHOLD`, `HELP_COOLDOWN_SECONDS` and `HELP_MIN_CONFIDENCE`.

Everything runs on **open-source, self-hostable components** — no cloud account or vendor
credentials required:

| Capability | Default implementation | Swap via |
|---|---|---|
| Speech-to-text | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (offline) | `STT_PROVIDER`, `WHISPER_MODEL` |
| Help analysis (LLM) | [Ollama](https://ollama.com) `qwen2.5:3b` — any OpenAI-compatible endpoint (vLLM, LM Studio, Groq, OpenAI…) | `LLM_BASE_URL`, `LLM_MODEL` |
| Text-to-speech | [Piper](https://github.com/rhasspy/piper) (offline, default) or [edge-tts](https://github.com/rany2/edge_tts) (online fallback) | `TTS_PROVIDER`, `PIPER_VOICE` / `TTS_VOICE` |
| Book storage | Local folder or [MinIO](https://min.io) (S3-compatible) | `STORAGE_PROVIDER` |

```
┌───────────────────────────┐       ws://…/ws       ┌────────────────────────────┐
│ Client (React + Vite)     │ ── audio (base64) ──▶ │ Server (Python, asyncio)   │
│ getUserMedia +            │ ── chapter context ─▶ │ faster-whisper STT         │
│ MediaRecorder            │ ◀── transcript ────── │ guardrails: reading vs.     │
│ plays spoken help         │ ◀── help + MP3/WAV ── │ asking? + LLM “needs help?”│
└───────────────────────────┘                       │ Piper / edge-tts TTS       │
        │  loads books.json + PDFs from /media     │ books: local / MinIO       │
        ▼                                            └────────────────────────────┘
   Nginx (SPA + /ws + /media proxy)
```

## Quickstart (Docker)

```bash
make setup   # .env, Python venv, Ollama model + Piper voice
make up      # build & start server, client and Ollama
```

Then open **http://localhost:8080**, choose a student and book, press **“Start Reading Session”** and grant microphone
access. As you read (or pretend to struggle: *“I don’t know this word… help!”*), the live
transcript appears in the sidebar and the assistant speaks an encouraging reply.

### Student reading flow

The default route now guides children through **Student Login → Level-based Book Selection →
Reading Session**. StudentA receives Level 2 beginning-reader support with the Tiffany voice,
while StudentB receives Level 3 comprehension support with the Amy voice. Book metadata comes
from `GET /api/books?level=2|3`, backed by PostgreSQL in Docker and built-in mock data when the
database or API is unavailable.

The reading route is session-protected and intentionally omitted from the navbar. During an
active student session, the navbar shows that student's profile and disables the Bookworm home
link; use **Switch Student** inside the reading session to clear the session.

### Reading controls

- **Microphone / “Start Reading Session”** streams the child's voice to the reading
  assistant. Both microphone controls are disabled while the WebSocket is connecting,
  reconnecting, offline, or in an error state; active recording stops if the connection drops.
- **Headphones / read-along** narrates chapter-based books locally with the browser's Web
  Speech API, highlights the current word, and works even when the server is offline. It selects
  a clear natural/premium voice when available and uses an elapsed-time, punctuation-aware
  fallback on browsers that do not emit word-boundary events.
- The floating controls can be collapsed. When the assistant panel is open, the toolbar moves
  left (or above the footer on small screens) so it does not cover **Clear transcript**.
- **Reader settings** is shown only for chapter-based books, where font size affects the page.
  PDF books render inside an iframe, so the settings and highlighted read-along controls are
  hidden because the app cannot restyle or tokenize the embedded PDF text.

> Heads-up on model size: the default `qwen2.5:3b` (~2 GB weights, ~4 GB RAM to run) is too
> big for Docker Desktop's default ~2 GB VM — the Ollama container gets OOM-killed. Either
> raise the VM memory, point the server at a host-native Ollama via `LLM_BASE_URL_DOCKER`
> (see `.env.example`), or use a lighter model such as `qwen2.5:1.5b` (~1 GB) — set
> `LLM_MODEL` and `OLLAMA_MODEL` in `.env`. See [Troubleshooting](#troubleshooting).

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
LLM_MODEL=qwen2.5:3b          # recommended; qwen2.5:1.5b for tiny VMs

# Text-to-speech — fully offline (default) or zero-setup online fallback
TTS_PROVIDER=piper            # or: edge_tts (online; voice set via TTS_VOICE)
# Friendly voices for a child audience:
#   piper:   en_US-amy-medium (default) · en_US-lessac-medium · en_GB-alan-low
#   edge-tts (TTS_PROVIDER=edge_tts): en-US-AnaNeural (child voice) ·
#   en-GB-SoniaNeural (teacher-like)
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
│   ├── src/hooks/        #   useAudioRecorder, useReadingAssistant, useSpeechReader
│   ├── src/components/   #   HighlightedText + shared UI components
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
| LLM errors like `llama-server process terminated: signal killed` | The model doesn't fit in RAM: `qwen2.5:3b` needs ~4 GB (the Docker Desktop default VM has ~2 GB). Give Docker more memory (Docker Desktop → Settings → Resources; colima: `colima stop && colima start --memory 4 --cpu 4`), or set `LLM_BASE_URL_DOCKER=http://host.docker.internal:11434/v1` to use a host-native Ollama, or use `LLM_MODEL=qwen2.5:1.5b` (~1 GB). |
| Piper error “voice not found” | The Docker image bakes the voice in at build time; for **native** dev run `make setup` (downloads the voice to `Server/models`). |
| `error while creating mount source path … operation not permitted` (macOS) | Docker can't bind-mount `~/Documents` (TCC). The default compose uses named volumes — that's fine. Prefer live host files? Grant Full Disk Access to your VM runtime, or use `docker-compose.bind.yml`. |
| Microphone button disabled | The assistant WebSocket must be connected, and the page must be served over `http://localhost` or HTTPS; `getUserMedia` is blocked on plain-HTTP LAN IPs. Read-along narration remains available offline because it runs entirely in the browser. |
| Read-along voice sounds robotic | Install/download a higher-quality system voice if the browser exposes only compact voices. The app prefers Natural, Neural, Premium, Google, Microsoft Aria/Jenny/Ana, and clear macOS voices such as Samantha. |
| Read-along highlighting drifts | Native word-boundary events are used when available; otherwise the app uses elapsed-time, word-length, speech-rate, and punctuation-aware timing. Restart narration after changing operating-system voices. |
| No transcript while reading | Check `make logs`; first run downloads the Whisper model (~150 MB). Speak a full sentence — audio is transcribed every `STT_FLUSH_INTERVAL` seconds. |
| `docker compose` not found | The Makefile auto-detects; standalone `docker-compose` v2 also works. |

