# AI Reading Assistant — Client

React 18 + Vite + TypeScript + Tailwind + shadcn/ui frontend for the AI Reading Assistant.

- **Docs**: [../docs/frontend.md](../docs/frontend.md)
- **Quickstart (monorepo)**: [../README.md](../README.md) → `make setup && make up`
- **Native dev**: `make dev-client` (http://localhost:8080, proxies `/ws` and `/media`)
- **Tests**: `make test-client`

The reading page supports two separate audio experiences:

- **Reading assistant:** `useAudioRecorder` captures the child's microphone and
  `useReadingAssistant` streams it to the Python WebSocket server. Microphone controls are
  enabled only when the WebSocket is connected, and recording stops if the connection drops.
- **Offline read-along:** `useSpeechReader` uses the browser's `speechSynthesis` API to narrate
  chapter text while `HighlightedText` follows the spoken word. It prefers clear natural or
  premium voices, uses native word-boundary events when available, and falls back to an
  elapsed-time, word-length, and punctuation-aware schedule. It does not require the server.

The reading page has a collapsible floating toolbar. With the assistant sidebar open, the
toolbar moves left on desktop and above the sidebar footer on smaller screens so it never
covers **Clear transcript**. Reader settings and read-along highlighting are available only
for chapter-based books; PDF books live in an iframe, so the app cannot restyle or tokenize
their embedded text and hides the ineffective settings button.
