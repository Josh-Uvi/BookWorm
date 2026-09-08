# AI Reading Assistant — one-command workflows.
# Run `make help` to list all targets. Requires Docker (and Node/Python for native dev).

SHELL := /bin/bash

# Auto-detect the compose implementation (plugin or standalone binary).
COMPOSE_IMPL := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")
COMPOSE ?= $(COMPOSE_IMPL)
PYTHON ?= python3
SERVER_PYTHON ?= Server/.venv/bin/python
OLLAMA_MODEL ?= qwen2.5:3b
PIPER_VOICE ?= en_US-amy-medium

.DEFAULT_GOAL := help
.PHONY: help setup setup-venv setup-models up down restart seed logs ps dev-client dev-server \
	healthcheck test test-server test-client lint lint-server lint-client typecheck-server build prod clean \
	deploy-gcp deploy-aws

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ── Setup ────────────────────────────────────────────────────────────

setup: ## First-run setup: .env, dirs, Python venv, AI models
	@test -f .env || (cp .env.example .env && echo "✔ Created .env from .env.example")
	@mkdir -p media/books Server/models
	@$(MAKE) --no-print-directory setup-venv
	@$(MAKE) --no-print-directory setup-models

setup-venv: ## Create/refresh the Server virtualenv with all dependencies
	@test -x Server/.venv/bin/python || $(PYTHON) -m venv Server/.venv
	@Server/.venv/bin/pip install -q --upgrade pip
	@Server/.venv/bin/pip install -q -r Server/requirements.txt -r Server/requirements-dev.txt \
		|| { echo "⚠️  Some optional AI deps failed to install (native STT/TTS may be limited); tests still work."; \
		     Server/.venv/bin/pip install -q websockets python-dotenv openai edge-tts numpy; }
	@echo "✔ Server venv ready (Server/.venv)"

setup-models: ## Pull the Ollama model and the offline Piper voice
	@echo "→ Pulling Ollama model: $(OLLAMA_MODEL)"
	@if docker info >/dev/null 2>&1; then \
		$(COMPOSE) up -d ollama && \
		$(COMPOSE) exec -T ollama ollama pull $(OLLAMA_MODEL) && \
		echo "✔ Ollama model ready"; \
	else \
		echo "⚠️  Docker not running — skipping compose pull."; \
		command -v ollama >/dev/null 2>&1 && ollama pull $(OLLAMA_MODEL) || \
		echo "⚠️  No local Ollama found either — start one before using the assistant."; \
	fi
	@echo "→ Downloading Piper voice: $(PIPER_VOICE) (only needed for TTS_PROVIDER=piper)"
	@Server/.venv/bin/python Server/scripts/download_piper_voice.py \
		--voice $(PIPER_VOICE) --out-dir Server/models \
		|| echo "⚠️  Piper voice download skipped."

# ── Docker lifecycle ────────────────────────────────────────────────

up: ## Build & start the full stack (detached), then seed media/models
	$(COMPOSE) up -d --build
	@$(MAKE) --no-print-directory seed

down: ## Stop the stack
	$(COMPOSE) down

restart: ## Stop then start the stack
	@$(MAKE) down && $(MAKE) up

seed: ## Copy host media/ and Piper voices into the running containers
	@$(COMPOSE) cp media/. server:/data/media/ \
		&& echo "✔ Seeded media (books.json + PDFs)" \
		|| echo "⚠️  Could not seed media — is the stack running? (make up)"
	@$(COMPOSE) cp Server/models/. server:/app/models/ \
		&& echo "✔ Seeded Piper voice models" \
		|| echo "⚠️  Could not seed models — run `make up` first."

logs: ## Tail all service logs
	$(COMPOSE) logs -f

ps: ## Show service status
	$(COMPOSE) ps

prod: ## Start the production compose stack (client on :80 only)
	$(COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml up -d --build
	@$(MAKE) --no-print-directory seed

clean: ## Remove containers, volumes and build caches
	$(COMPOSE) down -v --remove-orphans || true
	rm -rf Client/dist Server/.pytest_cache Server/.ruff_cache
	@echo "✔ Cleaned (Server/.venv and model files are kept)"

# ── Native development (hot reload, no Docker) ───────────────────────

dev-client: ## Run the client with hot reload (http://localhost:8080)
	cd Client && npm run dev

dev-server: ## Run the server natively (ws://localhost:8765, media :8766)
	$(SERVER_PYTHON) Server/app.py

healthcheck: ## Verify the local setup (media, LLM endpoint, TTS voice)
	$(SERVER_PYTHON) Server/healthcheck.py

# ── Quality ──────────────────────────────────────────────────────────

test: test-server test-client ## Run all tests (server + client)

test-server: ## Run the server pytest suite
	cd Server && .venv/bin/python -m pytest -q

test-client: ## Run the client vitest suite
	cd Client && npm test

lint: lint-server lint-client ## Lint both apps

lint-server: ## Ruff (Python)
	cd Server && .venv/bin/ruff check .

typecheck-server: ## Mypy (Python types)
	cd Server && .venv/bin/mypy .

lint-client: ## ESLint (client)
	cd Client && npm run lint

build: ## Production builds (client dist + Docker images)
	cd Client && npm run build
	$(COMPOSE) build

# ── Deployment (CI/CD) ────────────────────────────────────────────────

deploy-gcp: ## Deploy to Google Cloud (GitHub Actions — see docs/deployment-gcp.md)
	@echo "→ Triggering GitHub Actions deploy-gcp workflow (requires the gh CLI)."
	@command -v gh >/dev/null 2>&1 && gh workflow run deploy-gcp.yml --ref main \
		|| echo "⚠️  gh CLI not available — push a v* tag or run the workflow from GitHub."

deploy-aws: ## Deploy to AWS (GitHub Actions — see docs/deployment-aws.md)
	@echo "→ Triggering GitHub Actions deploy-aws workflow (requires the gh CLI)."
	@command -v gh >/dev/null 2>&1 && gh workflow run deploy-aws.yml --ref main \
		|| echo "⚠️  gh CLI not available — push a v* tag or run the workflow from GitHub."
