# AI Reading Assistant — self-contained OpenAI-compatible LLM endpoint.
# Ollama with a lightweight model baked in at build time, so the container
# needs no model downloads (or persistent storage) at runtime.
#
# Build & push:  docker build -t ghcr.io/josh-uvi/bookworm-ollama:latest deploy/ollama
# Override the model with --build-arg OLLAMA_MODEL=<tag> (see
# https://ollama.com/library — qwen2.5:1.5b is the repo's lightweight default).
#
# NOTE (Render free plan): 512 MB free instances cannot load even a 1 B model —
# deploy this on a plan with ≥ 2 GB RAM (see render.yaml / docs §6).
FROM ollama/ollama:latest

ENV OLLAMA_HOST=0.0.0.0:11434 \
    OLLAMA_MODELS=/models

ARG OLLAMA_MODEL=qwen2.5:1.5b

# Start the server just long enough to pull the model into the image layer.
RUN (ollama serve &) && \
    for i in $(seq 1 30); do \
      ollama ls >/dev/null 2>&1 && break || sleep 2; \
    done && \
    ollama pull "${OLLAMA_MODEL}" && \
    ollama ls