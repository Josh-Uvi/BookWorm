# Frontend documentation

React 18 single-page app (Vite + TypeScript + Tailwind CSS + shadcn/ui) that renders the
library and the reading experience, captures microphone audio, and talks to the Python
server over a native WebSocket.

## Stack

- **Vite 5** dev server (port 8080) with `/ws` and `/media` dev proxies
- **react-router-dom** routes: `/` (Landing), `/interests`, `/reading`, `/profile`, 404
- **@tanstack/react-query**, **framer-motion**, **lucide-react**, shadcn/ui components
- **vitest** + **@testing-library** for tests

## The audio pipeline (E2E)

```
useAudioRecorder                        useReadingAssistant
  getUserMedia({audio:true})              new WebSocket(resolveWsUrl())
  MediaRecorder (webm/opus)   base64  →   send {"type":"audio","data":…}
  1-second timeslice chunks               ← {"type":"transcription", …}   live transcript
                                           ← {"type":"help_needed", …, "audio":…}
                                             plays data:audio/<fmt>;base64,… via Audio
```

The `Reading` page composes both hooks: `useAudioRecorder({ onChunk: assistant.sendAudio })`.
One mic toggle starts/stops streaming; the sidebar shows the transcript and the assistant's
spoken help messages.

## Key modules

| Module | Responsibility |
|---|---|
| `src/hooks/useAudioRecorder.ts` | Mic permission, MediaRecorder lifecycle, blob → base64, mime negotiation (`webm;codecs=opus` → fallbacks) |
| `src/hooks/useReadingAssistant.ts` | WebSocket connection with exponential-backoff reconnect, transcript state, help playback, `resolveWsUrl()` |
| `src/services/wsMessages.ts` | Pure parser for server messages (unit-tested) |
| `src/services/bookService.ts` | Loads `/media/books.json`; resolves relative `pdfUrl`s; falls back to bundled `sampleBooks` |
| `src/pages/Reading.tsx` | PDF branch (iframe) and chapter branch + assistant sidebar & floating controls |
| `src/types/index.ts` | Domain types incl. `TranscriptionEvent`, `HelpEvent`, `AssistantStatus` |

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `VITE_WS_URL` | *(same-origin `/ws`)* | WebSocket endpoint override (`ws://host:8765`) |
| `VITE_MEDIA_URL` | `/media` | Media root for `books.json` + PDFs |

The same-origin defaults work everywhere because the proxies match:

| Environment | Who serves `/ws` and `/media` |
|---|---|
| Native dev | Vite dev proxies (`vite.config.ts` → `:8765` / `:8766`) |
| Docker / prod | Nginx (`nginx.conf` → `server:8765` / `server:8766`) |
| Cloud | ALB / CDN / ingress rules (see deployment docs) — keep `/ws` routed to the server |

## Development

```bash
cd Client && npm install
npm run dev          # http://localhost:8080 (proxies to the native server)
npm test             # vitest
npm run lint         # eslint
npm run build        # production bundle → dist/
```

Notes:

- `getUserMedia` requires a secure context — use `http://localhost:8080` or HTTPS.
- Books without `pdfUrl` render the chapter branch (bundled sample books have chapters).
- Books with `pdfUrl` render in an `<iframe>`; the PDF itself is served by the backend media
  server, never from a third-party CDN.

## Tests

| File | Covers |
|---|---|
| `src/test/wsMessages.test.ts` | Server-message parsing: transcription / help / error / invalid / unknown |
| `src/test/wsUrl.test.ts` | `resolveWsUrl` default and override behaviour |
| `src/test/bookService.test.ts` | Media fetch + `pdfUrl` resolution, sample fallback, empty catalogue |
