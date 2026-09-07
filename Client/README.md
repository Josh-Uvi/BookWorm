# AI Reading Assistant — Client

React 18 + Vite + TypeScript + Tailwind + shadcn/ui frontend for the AI Reading Assistant.

- **Docs**: [../docs/frontend.md](../docs/frontend.md)
- **Quickstart (monorepo)**: [../README.md](../README.md) → `make setup && make up`
- **Native dev**: `make dev-client` (http://localhost:8080, proxies `/ws` and `/media`)
- **Tests**: `make test-client`

The reading page captures microphone audio (`useAudioRecorder`), streams it to the Python
WebSocket server (`useReadingAssistant`), and plays spoken help messages back to the child.
