"""A tiny stdlib HTTP server that exposes the media library.

Endpoints:
  GET /health          -> liveness probe
  GET /books.json      -> book catalogue
  GET /books/<file...> -> book files (PDFs, covers, audio, ...)

Runs in a daemon thread next to the WebSocket server. In Docker, Nginx
proxies `/media/*` here (prefix stripped); in native dev, the Vite dev
server proxies `/media/*` the same way — so the client always uses one
canonical URL prefix.
"""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

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
    def __init__(self, storage, host: str = "0.0.0.0", port: int = 8766):
        handler = _make_handler(storage)
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


def _make_handler(storage):
    class MediaRequestHandler(BaseHTTPRequestHandler):
        server_version = "ReadingAssistantMedia/1.0"

        def do_GET(self):
            self._serve(with_body=True)

        def do_HEAD(self):
            self._serve(with_body=False)

        # pylint: disable=protected-access
        def _serve(self, with_body: bool) -> None:
            path = unquote(urlparse(self.path).path)

            if path in ("/health", "/"):
                self._respond(200, b"healthy\n", "text/plain", with_body)
                return
            try:
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
            except Exception as exc:
                status = 404 if "Not found" in str(exc) else 500
                self._respond(status, f"{exc}\n".encode("utf-8"), "text/plain", with_body)
                return
            self._respond(404, b"not found\n", "text/plain", with_body)

        def _respond(self, status: int, body: bytes, content_type: str, with_body: bool) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if with_body:
                self.wfile.write(body)

        def log_message(self, format, *args):  # keep stdout clean
            return

    return MediaRequestHandler
