# Deploying the free demo (Netlify + Render + Contentful + hosted LLM)

A fully-free, publicly reachable demo of the reading assistant, split across
platforms so that every layer sits inside a free plan:

| Layer | Platform | Plan | What it does |
|---|---|---|---|
| SPA + assets | **Netlify** (`netlify.toml`) | free | Builds `Client/`, serves the static bundle over HTTPS |
| Book catalogue + PDFs + covers | **Contentful** (`Client/src/services/contentfulService.ts`) | free | Entries + asset CDN; replaces the media server, PostgreSQL and MinIO |
| Audio pipeline (STT → LLM → TTS) | **Render** (`render.yaml`, root) | free | One WebSocket service (`/ws`, `/health`) |
| Language model | any hosted OpenAI-compatible API (default: Groq) | free tier | `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` |

```
Browser ──https──▶ Netlify (SPA)                     ┌─ Contentful CDA  (entries: title, level, sampleText…)
   │                    │                            │
   │                    └────── catalogue ───────────┘
   └──wss://…onrender.com/ws──▶ Render bookworm-server ──▶ hosted OpenAI-compatible LLM
                                  faster-whisper (tiny) · guardrails · Piper TTS
```

The client already degrades gracefully, so any layer can be absent:
**Contentful → `/api/books` → `/media/books.json` → bundled sample books**
(`Client/src/services/bookService.ts`). PDFs are rendered in an `<iframe>`, so
they load straight from the Contentful asset CDN.

> Prefer everything inside one platform? `deploy/render/full-stack.yaml` is the
> self-contained variant (client nginx + media server + MinIO + Redis worker +
> PostgreSQL). Two of its services cannot be free — see §8.

## 0. Free-plan reality check

- **Render free web services** run 512 MB RAM / 0.1 CPU and **spin down after
  ~15 min idle**. The next microphone session pays a 30–60 s cold start, and an
  active WebSocket dies when the instance sleeps (the SPA auto-reconnects with
  exponential backoff, so this is a demo-grade tradeoff).
- **Whisper must be `tiny`** on 512 MB (`WHISPER_MODEL=tiny`, int8). If the
  instance still runs out of memory, set `TTS_PROVIDER=edge_tts` to take Piper
  out of the equation (it then needs outbound internet, which Render provides).
- **No persistent anything.** Reading history, preferences and the student
  session live in the browser (`localStorage`/`sessionStorage`) — the server
  keeps only in-memory audio buffers per WebSocket connection. Nothing is lost
  on spin-down.
- **Netlify free**: 100 GB bandwidth/month (hard cap), 300 build minutes/month,
  free HTTPS. Mic access requires HTTPS — Netlify provides it, so `getUserMedia`
  works out of the box.
- **Contentful free**: check the current Community-plan quotas (entries, CDA
  calls, asset bandwidth) against your library before you commit — the app makes
  **one** CDA call per page load (cached in memory) and then loads PDFs/covers
  from the asset CDN, which is what consumes bandwidth.
- **Security**: the Contentful **delivery** token is embedded in the SPA bundle
  by design. Use a read-only Content Delivery API token — never a management,
  preview, or personal token.

## 1. Prerequisites

- The repo on GitHub, a Netlify account, a Render account, a Contentful space.
- Docker (or CI) to build and push the server image to GHCR:
  `docker login ghcr.io -u <github-username>` (PAT with `write:packages`), and
  the `bookworm-server` package set to **public** so Render can pull it
  anonymously.

## 2. Build & push the WebSocket server image

Only the server image is needed for the demo (Netlify builds the client from
source; Contentful hosts the content):

```bash
ORG=josh-uvi   # your GitHub username/org (lowercase)

docker build -t ghcr.io/$ORG/bookworm-server:latest ./Server
docker push ghcr.io/$ORG/bookworm-server:latest
```

Pin a version tag (e.g. `:v1.4.2`) and update `image.url` in `render.yaml` for
reproducible deploys — Render caches mutable tags such as `latest`.

## 3. Contentful: content model & content

Create a space, then a content type with id **`book`** (override with
`VITE_CONTENTFUL_CONTENT_TYPE`). Field ids must match
`Client/src/services/contentfulService.ts`:

| Field id | Type | Required | Notes |
|---|---|---|---|
| `title` | Short text | ✅ | Book title |
| `author` | Short text | ✅ | Author |
| `bookId` | Short text | | Falls back to the entry id; keeps deep links stable |
| `level` | Integer | | `2` or `3` (used by the level picker; other values are ignored) |
| `description` | Long text | | Shown on the book card |
| `genre` | Short text | | Defaults to "Children's Fiction" |
| `pages` | Integer | | Card metadata |
| `publishedYear` | Integer | | Card metadata |
| `sampleText` | Long text | | Becomes the reader's "Reading Practice" chapter |
| `pdf` | Media (single) | | The PDF shown in the reader iframe |
| `cover` | Media (single) | | Cover image |
| `interests` | Short text (list) | | e.g. `rhymes`, `animals` |

Then publish ~one entry per book (10 seeds the two reading levels) and upload
the PDFs/covers as assets. Entries whose `title`/`author` are empty are skipped
by the normalizer, so half-finished drafts never break the demo.

Verify the API before touching the frontend:

```bash
curl -s "https://cdn.contentful.com/spaces/$SPACE_ID/environments/master/entries?content_type=book&limit=2" \
  -H "Authorization: Bearer $CONTENT_DELIVERY_TOKEN" | head -40
```

## 4. Render: deploy the blueprint

1. Render Dashboard → **New → Blueprint** → select this repo (the root
   `render.yaml` is the free demo: one service, `bookworm-server`).
2. When prompted, fill the `sync: false` variable: **`LLM_API_KEY`** (see §5).
3. Apply and wait for the service to go live. Health check: `/health` on
   `8765`; the public URL is `https://bookworm-server.onrender.com` and the
   WebSocket endpoint is `wss://bookworm-server.onrender.com/ws`.

Notes on the blueprint:

- `SERVE_MEDIA=false` — the media server, PostgreSQL and object storage are not
  needed because Contentful owns the content; `app.py` then never builds a
  storage backend (`Server/app.py`, `run()`).
- `WHISPER_MODEL=tiny` + `WHISPER_COMPUTE_TYPE=int8` — sized for 512 MB RAM.
- `TTS_PROVIDER=piper` — the voice is baked into the image; switch to
  `edge_tts` if the instance gets OOM-killed under load.
- Guardrail knobs (`ACCUMULATION_WINDOW_SECONDS`, `HELP_COOLDOWN_SECONDS`,
  `HELP_MIN_CONFIDENCE`, …) keep their `.env.example` defaults.
- Uncomment the `bookworm-ollama` service only if you want the LLM
  self-hosted — it needs ≥ 2 GB RAM, so it is **not** free (§8).

## 5. LLM options

| Option | Set on `bookworm-server` | Cost |
|---|---|---|
| Hosted API (default in `render.yaml`) | `LLM_BASE_URL=https://api.groq.com/openai/v1`, `LLM_MODEL=llama-3.1-8b-instant`, `LLM_API_KEY=<free key>` | free tier of the provider |
| Self-hosted Ollama | uncomment `bookworm-ollama`; then `LLM_BASE_URL=https://bookworm-ollama.onrender.com/v1`, `LLM_MODEL=qwen2.5:1.5b`, `LLM_API_KEY=ollama` | paid (`standard`, 2 GB) |

Any OpenAI-compatible endpoint works (`LLM_PROVIDER` is informational); the
server only needs `LLM_BASE_URL`, `LLM_MODEL` and a non-empty `LLM_API_KEY`.
Keep the model choice aligned with `Server/prompts.py` — it expects strict JSON
back, so avoid hybrid "thinking" models.

## 6. Netlify: deploy the SPA

1. Netlify → **Add new site → Import an existing project** → pick the repo.
   `netlify.toml` already sets the base (`Client`), build command
   (`npm ci && npm run build`), publish dir (`dist`) and the SPA rewrite
   (`/* → /index.html`, status 200).
2. Set the build-time variables (Site configuration → Environment variables):

   | Variable | Value |
   |---|---|
   | `VITE_WS_URL` | `wss://bookworm-server.onrender.com/ws` |
   | `VITE_CONTENTFUL_SPACE_ID` | your Contentful space id |
   | `VITE_CONTENTFUL_ACCESS_TOKEN` | read-only Content Delivery API token |
   | `VITE_CONTENTFUL_ENVIRONMENT` | `master` (optional) |
   | `VITE_CONTENTFUL_CONTENT_TYPE` | `book` (optional) |
   | `VITE_MEDIA_URL` / `VITE_API_URL` | *(leave unset)* — the Contentful source wins and replaces both |

   `VITE_*` values are baked into the bundle, so **a change requires a redeploy**
   (not just a restart).
3. Deploy. From the CLI instead of the UI: `make deploy-netlify`
   (builds `Client/` and runs `netlify deploy --dir=dist --prod`), or
   `netlify env:set VITE_WS_URL …` once and let Git pushes rebuild.

Netlify brings HTTPS, so `wss://` and `getUserMedia` both work; the WebSocket
goes cross-origin straight to Render (no Netlify proxy involved — 200-rewrite
proxies are not reliable for WebSocket upgrades).

## 7. Verify

1. `https://<site>.netlify.app/` loads the SPA (students log in from the bundled
   demo profiles — no backend needed).
2. Book selection lists **your Contentful entries** (level 2/3). If it shows the
   bundled sample books instead, the CDA call failed — check the browser console
   for the request and re-check the token/space id.
3. Opening a book shows the PDF in the reader iframe (served by
   `images.ctfassets.net`). If it is blank, check the asset's Content-Type and
   any `Content-Security-Policy` on the Netlify side.
4. Tap the assistant / allow the microphone → the browser opens
   `wss://bookworm-server.onrender.com/ws`; the first session after idle takes
   ~30–60 s while Render cold-starts. Render → Logs shows
   `WebSocket server listening`, `providers: stt=faster_whisper llm=… tts=piper`
   and the transcription/help pipeline.
5. `https://bookworm-server.onrender.com/health` returns `healthy`.

## 8. Costs, alternatives & day-2 notes

**Two services can never be free on Render** — the demo blueprint is designed
around that:

1. **Background workers** (Redis-queue jobs, `Server/worker.py`) are paid-only
   (`starter`). The demo needs no worker: the audio pipeline runs inline in the
   WebSocket service and content comes from Contentful.
2. **Ollama** needs ≥ 2 GB RAM (`standard`), so the demo uses a hosted
   OpenAI-compatible API instead. `deploy/render/full-stack.yaml` includes the
   Ollama image plus the Redis worker/MinIO/Postgres wiring if you want the
   self-contained variant (and are prepared to pay for those two).

Other notes:

- **Cache/CDN**: Contentful's asset CDN fronts PDFs and covers; Netlify fronts
  the SPA. The only per-request server work left is the WebSocket pipeline.
- **Cold starts**: keep an eye on the Render free instance. A tiny uptime ping
  (e.g. a scheduled GitHub Action hitting `/health` every 10 min) keeps it warm
  at the cost of your Render free hours — decide which tradeoff you want.
- **Local development is unchanged**: `docker compose up` still runs the full
  stack (server + nginx client + Postgres + MinIO + Ollama). Only set the
  Contentful variables when you want to develop against the CMS catalogue:
  `VITE_CONTENTFUL_SPACE_ID=… VITE_CONTENTFUL_ACCESS_TOKEN=…` in `.env`
  (see `.env.example`) — the Contentful source takes priority over the local
  media server, and removing the variables restores the compose behaviour.
- **Swapping content sources**: the resolution chain in
  `Client/src/services/bookService.ts` is
  Contentful → `/api/books` → `/media/books.json` → bundled samples. Because
  Contentful wins when configured, you can point the Netlify build at either
  backend without touching code.
- **Security**: the delivery token is public by design (it ships in the bundle)
  — treat it as read-only, and rotate it if it is ever used with wider scopes.
  The Render service has no auth either: it is a demo endpoint that accepts
  audio and proxies it to your LLM API key, so keep an eye on your LLM quota.
