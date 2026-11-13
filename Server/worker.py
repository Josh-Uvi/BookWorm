"""Redis-backed background worker for the AI Reading Assistant.

Consumes JSON jobs from a Redis list and executes them. Deployed as the Render
``bookworm-worker`` service (see render.yaml / docs/deployment-render.md).

Enqueue a job from any service that shares the Redis instance::

    redis-cli -u "$REDIS_URL" LPUSH bookworm:jobs '{"type": "setup_books"}'

Jobs are acked by completion: the entry is removed when it is picked up and a
failure is logged (not retried). Extend ``HANDLERS`` to add job types.
"""

from __future__ import annotations

import json
import logging
import os
from collections.abc import Callable
from typing import Any, cast

import redis

from setup_books_table import main as setup_books

QUEUE = os.getenv("WORKER_QUEUE", "bookworm:jobs")


def _job_setup_books(_payload: dict[str, Any]) -> str:
    """Create/seed the PostgreSQL books table (idempotent)."""
    setup_books()
    return "books table created and seeded"


HANDLERS: dict[str, Callable[[dict[str, Any]], str]] = {
    "setup_books": _job_setup_books,
}


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    logger = logging.getLogger("worker")

    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        raise RuntimeError(
            "REDIS_URL is required (set it to the Render Key Value connection string)"
        )
    client = redis.Redis.from_url(redis_url, decode_responses=True)
    client.ping()

    logger.info("Worker online — waiting for jobs on %s", QUEUE)
    while True:
        # redis-py shares response annotations between its sync and async clients.
        response = cast(list[str], client.blpop([QUEUE]))
        _key, raw = response
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            logger.error("Dropping malformed job payload: %.200s", raw)
            continue

        if not isinstance(payload, dict):
            logger.error("Dropping non-object job payload: %.200s", raw)
            continue

        job_type = payload.get("type")
        handler = HANDLERS.get(str(job_type))
        if handler is None:
            logger.error("No handler for job type %r (payload: %.200s)", job_type, raw)
            continue

        logger.info("Running job %s", job_type)
        try:
            result = handler(payload)
        except Exception:
            logger.exception("Job %s failed", job_type)
        else:
            logger.info("Job %s finished: %s", job_type, result)


if __name__ == "__main__":
    main()