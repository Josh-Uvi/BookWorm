# Architecture

Interactive diagrams (GitHub renders Mermaid natively). **§1** is the logical system,
**§2** the data model (ERD), **§3–§6** the four deployment topologies.

## 1. System overview

```mermaid
flowchart LR
    subgraph Browser["Browser · React 18 SPA (Vite + TS)"]
        UI["Pages: / · /login · /books · /reading · /profile"]
        Flow["ReadingFlowContext<br/>sessionStorage + localStorage"]
        Rec["useAudioRecorder<br/>getUserMedia + MediaRecorder"]
        Asst["useReadingAssistant<br/>WebSocket + help audio playback"]
        Speak["useSpeechReader<br/>Web Speech read-along"]
        Books["bookService / contentfulService<br/>catalogue resolution chain"]
    end

    subgraph Server["Python 3.11 server · asyncio"]
        WS["app.py · ReadingAssistantServer<br/>:8765 /ws + /health"]
        Session["session.py<br/>audio buffer · transcript dedup · epochs"]
        Guard["guardrails.py<br/>reading-vs-asking · mute · cooldown"]
        STT["ai/stt.py<br/>faster-whisper (offline)"]
        LLM["ai/llm.py<br/>OpenAI-compatible client"]
        TTS["ai/tts.py<br/>Piper (offline) / edge-tts"]
        Media["media_server.py<br/>:8766 /health /api/books /books.json /books/*"]
        Storage["storage.py<br/>local | MinIO"]
        Repo["books_repository.py<br/>PostgreSQL"]
        Worker["worker.py<br/>Redis queue consumer"]
        Prompts["prompts.py<br/>strict-JSON contract"]
    end

    LLMEnd[("LLM endpoint<br/>Ollama · vLLM · Groq · OpenAI")]
    PG[("PostgreSQL<br/>books")]
    Obj[("MinIO / media volume<br/>books.json + PDFs")]
    RQ[("Redis / Key Value<br/>bookworm:jobs")]
    CMS[("Contentful CMS<br/>book entries + assets")]

    Rec --> Asst
    Asst -->|"wss /ws · audio base64"| WS
    WS --> Session --> STT
    WS --> Guard
    WS --> LLM
    Guard --> LLM
    LLM --> Prompts
    WS --> TTS
    LLM --> LLMEnd
    Books --> Media
    Books -.->|"optional source · wins when configured"| CMS
    Media --> Storage
    Media --> Repo
    Storage --> Obj
    Repo --> PG
    Worker --> RQ
    Worker --> Repo
    UI --- Flow
    Speak --- UI
```

Only the WebSocket service and the optional media server hold state; everything the child
does between page loads lives in the browser (see the client ERD below).

## 2. Data model (ERD)

**2a. Server-side catalogue & jobs** — PostgreSQL is the relational store; Contentful is the
alternative document source the client can read directly. Only one of them is ever active for
a given deployment (see §6).

```mermaid
erDiagram
    BOOKS {
        varchar book_id PK "catalogue primary key"
        varchar name "display title"
        integer level "2 or 3 (CHECK)"
        text description
        varchar author
        integer pages "CHECK > 0"
        varchar genre
        integer published_year
        text pdf_url "relative media path or absolute URL"
        text cover_url
        text sample_text "practice passage"
    }

    CONTENTFUL_BOOK {
        string entry_id PK "sys.id"
        string bookId "falls back to entry_id"
        string title
        string author
        integer level "2 or 3"
        text description
        string genre
        integer pages
        integer publishedYear
        text sampleText "becomes the practice chapter"
        string_list interests
    }

    CONTENTFUL_ASSET {
        string asset_id PK
        string url "images.ctfassets.net/…"
        string file_name
        string content_type
    }

    WORKER_JOB {
        string type PK "setup_books (extensible)"
    }

    CONTENTFUL_BOOK ||--o| CONTENTFUL_ASSET : "pdf (0..1)"
    CONTENTFUL_BOOK ||--o| CONTENTFUL_ASSET : "cover (0..1)"
    WORKER_JOB ||--o| BOOKS : "seeds via setup_books_table.py"
```

`media_server.py` exposes the same catalogue shape three ways — media index → PostgreSQL →
built-in mock (`book_data.SAMPLE_BOOKS`) — which is why the client can fall back safely.
Redis holds jobs as a JSON list (`WORKER_QUEUE`, default `bookworm:jobs`); `worker.py`
`BLPOP`s them and dispatches on `type`.

**2b. Client-side session state** — per-browser, no accounts: everything survives the Render
free-tier spin-down but is scoped to one browser profile (and cleared by `switchStudent`).

```mermaid
erDiagram
    STUDENT_PROFILE {
        string id PK "student-a | student-b"
        string displayName
        integer readingLevel "2 | 3"
        string voice "Tiffany | Amy"
        string systemPrompt "teaching guidance"
    }

    READING_FLOW_SESSION {
        string storage_key PK "sessionStorage: reading-flow-session"
        string currentStudent FK
    }

    BOOK {
        string id PK
        string title
        string author
        string coverUrl
        string pdfUrl "absolute (CMS) or /media path"
        string_chapters chapters
    }

    READING_PROGRESS {
        string bookId FK
        string chapterId
        integer progress
        string lastRead
        string bookTitle "snapshot"
        string bookAuthor "snapshot"
        string chapterTitle "snapshot"
    }

    USER_PREFERENCES {
        string storage_key PK "localStorage: user-preferences"
        integer fontSize
        integer lineSpacing
        string theme "dark | light"
    }

    USER_INTERESTS {
        string storage_key PK "localStorage: user-interests"
        string_list interests
    }

    STUDENT_PROFILE ||--o| READING_FLOW_SESSION : "logs in"
    READING_FLOW_SESSION ||--o| BOOK : "selected book"
    READING_FLOW_SESSION ||--o{ READING_PROGRESS : "history (upsert by book+chapter)"
    READING_FLOW_SESSION ||--o| STUDENT_PROFILE : "clears on logout / switch"
```

Storage keys and reducers live in `Client/src/contexts/readingFlowState.ts` (pure, unit-tested);
profile/interests/preferences are written through `useLocalStorage`
(`user-interests`, `user-preferences`, `theme`).



## 3. Local stack (Docker Compose / native dev)

```mermaid
flowchart TB
    subgraph Host["Host machine · http://localhost:8080"]
        Browser["Browser<br/>getUserMedia + WebSocket"]
        Native["Native dev alternative<br/>make dev-client :8080 · make dev-server :8765/:8766"]
    end

    subgraph Compose["docker compose up (dev)"]
        Client["client · nginx :80 → host :8080<br/>SPA + /ws + /media + /api proxies"]
        Srv["server · :8765 WS · :8766 media<br/>Piper voice baked into the image"]
        Ollama["ollama :11434<br/>qwen2.5:3b"]
        Pg["postgres :16 :5432"]
        Seed["books-setup · one-off<br/>setup_books_table.py"]
        Minio["minio :9000/:9001<br/>profile: minio"]
    end

    Vols[("named volumes<br/>media · piper-models · model-cache · ollama · postgres-data · minio")]

    Browser -->|"/ws · /media · /api"| Client
    Client -->|"SERVER_WS_UPSTREAM http://server:8765"| Srv
    Client -->|"SERVER_MEDIA_UPSTREAM http://server:8766"| Srv
    Srv -->|"LLM_BASE_URL http://ollama:11434/v1"| Ollama
    Srv -->|"DATABASE_URL · /api/books"| Pg
    Srv -.->|"STORAGE_PROVIDER=local or minio"| Minio
    Seed --> Pg
    Srv --- Vols
    Ollama --- Vols
    Pg --- Vols
    Native -.->|"vite proxy → localhost:8765/:8766"| Srv
```

`make up` also seeds the media and Piper volumes from `./media` and `./Server/models`.
`docker-compose.prod.yml` exposes only nginx on port 80; `docker-compose.bind.yml` swaps named
volumes for host bind mounts; `docker-compose.gpu.yml` enables `WHISPER_DEVICE=cuda`.

## 4. GCP production stack (`.github/workflows/deploy-gcp.yml`)

```mermaid
flowchart LR
    subgraph GH["GitHub Actions · tag v* or manual dispatch"]
        WIF["Workload Identity Federation<br/>no static keys"]
        Build["docker build Server/ · npm run build Client/"]
    end

    subgraph GCP["Google Cloud"]
        AR[("Artifact Registry<br/>reading-assistant/server")]
        CR["Cloud Run · reading-assistant-server<br/>:8765 WS + media · 2 vCPU / 4 GiB<br/>allow-unauthenticated"]
        GCS[("Cloud Storage<br/>Client/dist")]
        CDN["Cloud CDN + HTTPS load balancer"]
    end

    Users["Browser"]
    LLM[("LLM endpoint<br/>GCP_LLM_BASE_URL")]

    WIF --> Build --> AR --> CR
    Build --> GCS --> CDN
    Users -->|"https + wss"| CDN
    Users -->|"wss://…run.app/ws or LB /ws rule"| CR
    CR --> LLM
```

Setup details: [docs/deployment-gcp.md](docs/deployment-gcp.md). Books live on the Cloud Run
instance volume (`/data/media`) or a GCS mount.

## 5. AWS production stack (`.github/workflows/deploy-aws.yml`)

```mermaid
flowchart LR
    subgraph GH2["GitHub Actions · tag v* or manual dispatch"]
        Build2["docker build Server/ · npm run build Client/"]
    end

    subgraph AWS["AWS"]
        ECR[("Amazon ECR<br/>reading-assistant/server")]
        ALB["Application Load Balancer<br/>WebSocket target group + idle timeout"]
        ECS["ECS Fargate task (awsvpc)<br/>:8765 WS · :8766 media<br/>2 vCPU / 4 GiB · CloudWatch logs"]
        S3[("Amazon S3<br/>Client/dist")]
        CF["CloudFront"]
    end

    Users2["Browser"]
    LLM2[("LLM endpoint")]

    Build2 --> ECR --> ECS
    Build2 --> S3 --> CF
    Users2 -->|"https"| CF
    Users2 -->|"wss via listener rule"| ALB --> ECS
    ECS --> LLM2
```

Task definition: [`deploy/aws/ecs-task-definition.json`](deploy/aws/ecs-task-definition.json)
(ports 8765/8766, `/health` container health check, `SERVE_MEDIA=true`).
Setup details: [docs/deployment-aws.md](docs/deployment-aws.md).

## 6. Hybrid free demo — Netlify + Render + Contentful

Every layer sits inside a free plan; see
[docs/deployment-render.md](docs/deployment-render.md) for the walkthrough.

```mermaid
flowchart LR
    subgraph Netlify["Netlify · free"]
        SPA["Static SPA build<br/>netlify.toml · base Client/ · publish dist/<br/>/* → /index.html (200)"]
    end

    subgraph RenderHost["Render · free"]
        WSSrv["web bookworm-server · GHCR image<br/>:8765 /ws + /health · SERVE_MEDIA=false<br/>faster-whisper tiny · Piper TTS<br/>512 MB · spins down when idle"]
    end

    CF[("Contentful · free<br/>book entries + PDF/cover assets<br/>CDN: images.ctfassets.net")]
    LLMHost[("Hosted OpenAI-compatible API<br/>LLM_API_KEY · provider free tier")]
    OllamaOpt["Optional: bookworm-ollama · Render PAID (>= 2 GB)<br/>self-hosted qwen2.5:1.5b endpoint"]
    MediaSrc["Optional: Render media service<br/>/api/books + /media/books.json + MinIO"]

    Users3["Browser"]

    Users3 -->|"https"| SPA
    SPA -->|"VITE_CONTENTFUL_* · CDA, cached 1 call/page"| CF
    SPA -.->|"fallback: /api/books · /media/books.json"| MediaSrc
    SPA -->|"VITE_WS_URL wss://…onrender.com/ws"| WSSrv
    WSSrv -->|"LLM_BASE_URL"| LLMHost
    WSSrv -.-> OllamaOpt
```

`bookService.ts` resolves the catalogue in order — **Contentful → `/api/books` →
`/media/books.json` → bundled samples** — so the demo keeps working if the CMS or the WebSocket
service is cold or unreachable. Two services can never be free on Render (background workers,
and Ollama needs ≥ 2 GB RAM), which is exactly why the demo pushes the catalogue to Contentful
and the LLM to a hosted API.

Replacing Netlify with Render's own nginx image (or moving everything onto one platform) is the
**full-stack variant**: [`deploy/render/full-stack.yaml`](deploy/render/full-stack.yaml)
(client + WebSocket + media + MinIO + Redis worker + PostgreSQL).

## Topology comparison

| Concern | Local (compose) | GCP | AWS | Hybrid free demo | Full-stack Render |
|---|---|---|---|---|---|
| SPA hosting | nginx container `:8080` | GCS + Cloud CDN | S3 + CloudFront | Netlify | client nginx web service |
| WebSocket API | `server:8765` | Cloud Run `:8765` | ECS Fargate behind ALB | Render free `:8765` | `bookworm-server-ws` |
| Media/API (`:8766`) | same container | same Cloud Run service | same ECS task | Contentful (or media service) | `bookworm-server-media` |
| Catalogue | PostgreSQL (compose) | `/data/media` volume | `/data/media` volume | Contentful entries | PostgreSQL + media + MinIO |
| Object storage | local volume / MinIO | GCS mount | S3 / EFS | Contentful assets | MinIO (ephemeral on free) |
| LLM | Ollama container | hosted or Ollama sidecar | hosted or `__LLM_BASE_URL__` | hosted API (free tier) | Ollama image (`standard`, paid) |
| Background jobs | `books-setup` one-off | — | — | — | Redis worker (`starter`, paid) |
| `/ws` path | nginx proxy | LB URL-map or direct `wss://` | ALB listener rule | direct cross-origin `wss://` | nginx proxy |
