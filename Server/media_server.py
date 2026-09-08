"""A tiny stdlib HTTP server that exposes the media library.

Endpoints:
  GET /health          -> liveness probe
  GET /books.json      -> book catalogue
  GET /books/<file...> -> book files (PDFs, covers, audio, ...)
  GET /api/books?level=2|3 -> reading-level catalogue (media/PostgreSQL/mock)

Runs in a daemon thread next to the WebSocket server. In Docker, Nginx
proxies `/media/*` here (prefix stripped); in native dev, the Vite dev
server proxies `/media/*` the same way — so the client always uses one
canonical URL prefix.
"""
from __future__ import annotations

import json
import logging
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from book_data import books_for_level

logger = logging.getLogger("reading-assistant.books-api")

CONTENT_TYPES = {
    ".json": "application/json",
    ".pdf": "application/pdf",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


class MediaServer:
    def __init__(
        self,
        storage,
        host: str = "0.0.0.0",
        port: int = 8766,
        books_repository=None,
    ):
        handler = _make_handler(storage, books_repository)
        self._httpd = ThreadingHTTPServer((host, port), handler)
        self._httpd.daemon_threads = True
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._thread = threading.Thread(
            target=self._httpd.serve_forever, name="media-server", daemon=True
        )
        self._thread.start()

    @property
    def port(self) -> int:
        return self._httpd.server_address[1]


def _make_handler(storage, books_repository=None):
    class MediaRequestHandler(BaseHTTPRequestHandler):
        server_version = "ReadingAssistantMedia/1.0"

        def do_GET(self):
            self._serve(with_body=True)

        def do_HEAD(self):
            self._serve(with_body=False)

        def do_OPTIONS(self):
            self.send_response(204)
            self._send_cors_headers()
            self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Content-Length", "0")
            self.end_headers()

        # pylint: disable=protected-access
        def _serve(self, with_body: bool) -> None:
            parsed_url = urlparse(self.path)
            path = unquote(parsed_url.path)

            if path in ("/health", "/"):
                self._respond(200, b"healthy\n", "text/plain", with_body)
                return
            try:
                if path == "/api/books":
                    self._serve_books_api(parsed_url.query, with_body)
                    return
                if path == "/books.json":
                    books = storage.read_books_index()
                    self._respond(
                        200, json.dumps(books).encode("utf-8"), "application/json", with_body
                    )
                    return
                if path.startswith("/books/"):
                    # URL paths mirror the media root layout: /books/<file>
                    # serves MEDIA_DIR/books/<file> (catalogue pdfUrl values
                    # like "books/<file>.pdf" are root-relative).
                    file_path = storage.resolve_file(path.lstrip("/"))
                    data = file_path.read_bytes()
                    media_type = CONTENT_TYPES.get(
                        file_path.suffix.lower(), "application/octet-stream"
                    )
                    self._respond(200, data, media_type, with_body)
                    return
            except Exception as exc:  # noqa: BLE001 — HTTP handler turns *any* error into a 4xx/5xx
                status = 404 if "Not found" in str(exc) else 500
                self._respond(status, f"{exc}\n".encode(), "text/plain", with_body)
                return
            self._respond(404, b"not found\n", "text/plain", with_body)

        def _serve_books_api(self, query: str, with_body: bool) -> None:
            raw_level = parse_qs(query).get("level", [""])[0]
            try:
                level = int(raw_level)
            except (TypeError, ValueError):
                self._respond_json(
                    400,
                    {"error": "The level query parameter is required and must be 2 or 3."},
                    with_body,
                )
                return
            if level not in (2, 3):
                self._respond_json(
                    400,
                    {"error": "Reading level must be either 2 or 3."},
                    with_body,
                )
                return

            source = "media"
            try:
                # Prefer books backed by real files in MEDIA_DIR. PostgreSQL
                # remains the next source for levels without local media.
                books = self._media_books_for_level(level)
                if not books:
                    source = "postgres"
                    books = books_repository.list_books(level) if books_repository else []
                if not books:
                    source = "mock"
                    books = books_for_level(level)
            except Exception:
                logger.exception(
                    "Media catalogue lookup failed for level %s; trying PostgreSQL", level
                )
                try:
                    source = "postgres"
                    books = books_repository.list_books(level) if books_repository else []
                except Exception:
                    logger.exception("PostgreSQL book lookup failed for level %s", level)
                    books = []
                if not books:
                    source = "mock"
                    books = books_for_level(level)

            logger.info("Books API level=%s count=%s source=%s", level, len(books), source)
            self._respond_json(
                200,
                {"books": books, "level": level, "count": len(books), "source": source},
                with_body,
            )

        def _media_books_for_level(self, level: int) -> list[dict]:
            """Normalize media/books.json entries to the public API schema."""

            books = []
            for book in storage.read_books_index():
                if book.get("level") != level:
                    continue
                chapters = book.get("chapters") or []
                sample_text = chapters[0].get("content", "") if chapters else ""
                books.append(
                    {
                        "book_id": str(book.get("id", "")),
                        "name": str(book.get("title", "Untitled book")),
                        "level": level,
                        "description": str(book.get("description", "")),
                        "author": str(book.get("author", "Unknown author")),
                        "pages": int(book.get("pages") or 1),
                        "genre": str(book.get("genre", "Children's Fiction")),
                        "published_year": book.get("publishedYear"),
                        "pdf_url": str(book.get("pdfUrl", "")),
                        "cover_url": str(book.get("coverUrl", "")),
                        "sample_text": str(sample_text),
                    }
                )
            return books

        def _respond_json(self, status: int, payload: dict, with_body: bool) -> None:
            self._respond(
                status,
                json.dumps(payload).encode("utf-8"),
                "application/json",
                with_body,
            )

        def _respond(self, status: int, body: bytes, content_type: str, with_body: bool) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self._send_cors_headers()
            self.end_headers()
            if with_body:
                self.wfile.write(body)

        def _send_cors_headers(self) -> None:
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Vary", "Origin")

        def log_message(self, format, *args):  # keep stdout clean
            return

    return MediaRequestHandler
