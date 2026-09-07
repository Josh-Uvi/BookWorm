"""Regression tests for the media HTTP server.

The /books/<file> URL route must map to MEDIA_DIR/books/<file> — catalogue
pdfUrl values ("books/<file>.pdf") are root-relative. An earlier version
stripped the URL prefix before resolving, so /books/x.pdf looked for
MEDIA_DIR/x.pdf instead of MEDIA_DIR/books/x.pdf and every PDF 404'd.
"""

import json
import urllib.error
import urllib.request

from media_server import MediaServer
from storage import LocalStorage


def _make_server(tmp_path):
    (tmp_path / "books").mkdir()
    (tmp_path / "books" / "sample.pdf").write_bytes(b"%PDF-1.4 fake-book")
    (tmp_path / "books.json").write_text(
        json.dumps([{"id": "1", "title": "Sample", "pdfUrl": "books/sample.pdf"}]),
        encoding="utf-8",
    )
    server = MediaServer(LocalStorage(str(tmp_path)), host="127.0.0.1", port=0)
    server.start()
    return server


def test_books_route_serves_files_from_the_books_folder(tmp_path):
    server = _make_server(tmp_path)
    try:
        url = f"http://127.0.0.1:{server.port}/books/sample.pdf"
        with urllib.request.urlopen(url) as response:
            assert response.status == 200
            assert response.read() == b"%PDF-1.4 fake-book"
    finally:
        server._httpd.shutdown()
        server._thread.join(timeout=5)


def test_books_json_is_served(tmp_path):
    server = _make_server(tmp_path)
    try:
        url = f"http://127.0.0.1:{server.port}/books.json"
        with urllib.request.urlopen(url) as response:
            assert json.loads(response.read()) == [
                {"id": "1", "title": "Sample", "pdfUrl": "books/sample.pdf"}
            ]
    finally:
        server._httpd.shutdown()
        server._thread.join(timeout=5)


def test_missing_book_returns_404(tmp_path):
    server = _make_server(tmp_path)
    try:
        url = f"http://127.0.0.1:{server.port}/books/missing.pdf"
        try:
            urllib.request.urlopen(url)
            raise AssertionError("expected HTTP 404")
        except urllib.error.HTTPError as exc:
            assert exc.code == 404
    finally:
        server._httpd.shutdown()
        server._thread.join(timeout=5)
