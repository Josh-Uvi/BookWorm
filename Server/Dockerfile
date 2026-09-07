# AI Reading Assistant — Python server
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV MEDIA_DIR=/data/media \
    PIPER_MODELS_DIR=/app/models

EXPOSE 8765 8766

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -sf http://localhost:8765/health || exit 1

CMD ["python", "app.py"]
