# AI Reading Assistant — background worker image.
# Layers the Redis job consumer (Server/worker.py) onto the server image, so it
# inherits the same Python deps and modules.
#
# Build from the REPO ROOT (the COPY path is relative to the context):
#   docker build -f deploy/worker/Dockerfile -t ghcr.io/josh-uvi/bookworm-worker:latest .
FROM ghcr.io/josh-uvi/bookworm-server:latest

COPY Server/worker.py /app/worker.py

CMD ["python", "worker.py"]