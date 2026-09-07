"""Book/media storage backends.

- `LocalStorage`: serves books from `MEDIA_DIR` on disk (default).
- `MinioStorage`: S3-compatible object storage (self-hosted MinIO or any
  S3-compatible service) via the lightweight `minio` client.

Both satisfy the same simple contract consumed by `media_server.py`.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class StorageError(RuntimeError):
    """Raised when the configured storage backend cannot serve a request."""


class LocalStorage:
    def __init__(self, media_dir: str):
        self.root = Path(media_dir).resolve()

    def read_books_index(self) -> list[dict[str, Any]]:
        path = self.root / "books.json"
        if not path.is_file():
            return []
        return json.loads(path.read_text(encoding="utf-8"))

    def resolve_file(self, relative_path: str) -> Path:
        candidate = (self.root / relative_path).resolve()
        if not candidate.is_file():
            raise StorageError(f"Not found: {relative_path}")
        if self.root != candidate and self.root not in candidate.parents:
            raise StorageError("Path escapes the media root")
        return candidate


class MinioStorage:
    """Optional S3-compatible backend, selected with STORAGE_PROVIDER=minio."""

    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        bucket: str = "books",
        secure: bool = False,
    ):
        try:
            from minio import Minio
        except ImportError as exc:  # pragma: no cover
            raise StorageError(
                "Install the 'minio' package to use STORAGE_PROVIDER=minio"
            ) from exc
        if not endpoint:
            raise StorageError("MINIO_ENDPOINT is required when STORAGE_PROVIDER=minio")
        self._client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)
        self._bucket = bucket

    def read_books_index(self) -> list[dict[str, Any]]:
        response = self._client.get_object(self._bucket, "books.json")
        try:
            return json.loads(response.read())
        finally:
            response.close()
            response.release_conn()

    def resolve_presigned_url(self, relative_path: str, expires_days: int = 7) -> str:
        from datetime import timedelta

        return self._client.presigned_get_object(
            self._bucket, relative_path.lstrip("/"), expires=timedelta(days=expires_days)
        )


def build_storage(settings) -> LocalStorage | MinioStorage:
    if settings.storage_provider == "local":
        return LocalStorage(settings.media_dir)
    if settings.storage_provider == "minio":
        return MinioStorage(
            settings.minio_endpoint,
            settings.minio_access_key,
            settings.minio_secret_key,
            settings.minio_bucket,
            settings.minio_secure,
        )
    raise StorageError(f"Unknown STORAGE_PROVIDER: {settings.storage_provider!r}")
