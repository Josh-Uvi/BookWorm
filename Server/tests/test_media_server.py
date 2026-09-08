"""Regression tests for the media HTTP server.

The /books/<file> URL route must map to MEDIA_DIR/books/<file> — catalogue
pdfUrl values ("books/<file>.pdf") are root-relative. An earlier version
stripped the URL prefix before resolving, so /books/x.pdf looked for
MEDIA_DIR/x.pdf instead of MEDIA_DIR/books/x.pdf and every PDF 404'd.
"""

import json
import urllib.error
import urllib.request
from dataclasses import dataclass

from media_server import MediaServer
from storage import LocalStorage


def _make_server(tmp_path, books_repository=None):
    (tmp_path / "books").mkdir()
    (tmp_path / "books" / "sample.pdf").write_bytes(b"%PDF-1.4 fake-book")
    (tmp_path / "books.json").write_text(
        json.dumps([{"id": "1", "title": "Sample", "pdfUrl": "books/sample.pdf"}]),
        encoding="utf-8",
    )
    server = MediaServer(
        LocalStorage(str(tmp_path)),
        host="127.0.0.1",
        port=0,
        books_repository=books_repository,
    )
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


@dataclass
class FakeBooksRepository:
    books: list
    fail: bool = False

    def list_books(self, level):
        if self.fail:
            raise RuntimeError("database unavailable")
        return [book for book in self.books if book["level"] == level]


def test_books_api_filters_by_level_and_sets_cors(tmp_path):
    repository = FakeBooksRepository(
        [{"book_id": "db-book", "name": "Database Book", "level": 2}]
    )
    server = _make_server(tmp_path, repository)
    try:
        request = urllib.request.Request(
            f"http://127.0.0.1:{server.port}/api/books?level=2",
            headers={"Origin": "http://localhost:8080"},
        )
        with urllib.request.urlopen(request) as response:
            payload = json.loads(response.read())
            assert response.headers["Access-Control-Allow-Origin"] == "*"
            assert payload == {
                "books": [{"book_id": "db-book", "name": "Database Book", "level": 2}],
                "level": 2,
                "count": 1,
                "source": "postgres",
            }
    finally:
        server._httpd.shutdown()
        server._thread.join(timeout=5)


def test_books_api_prefers_real_media_books_over_database_rows(tmp_path):
    repository = FakeBooksRepository(
        [{"book_id": "db-book", "name": "Database Book", "level": 2}]
    )
    server = _make_server(tmp_path, repository)
    (tmp_path / "books.json").write_text(
        json.dumps(
            [
                {
                    "id": "media-book",
                    "title": "Real Media Book",
                    "level": 2,
                    "description": "Stored in media/books",
                    "author": "Media Author",
                    "pages": 12,
                    "genre": "Children's Fiction",
                    "pdfUrl": "books/sample.pdf",
                    "coverUrl": "cover.jpg",
                    "chapters": [],
                }
            ]
        ),
        encoding="utf-8",
    )
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{server.port}/api/books?level=2"
        ) as response:
            payload = json.loads(response.read())
            assert payload["source"] == "media"
            assert payload["count"] == 1
            assert payload["books"][0]["book_id"] == "media-book"
            assert payload["books"][0]["pdf_url"] == "books/sample.pdf"
    finally:
        server._httpd.shutdown()
        server._thread.join(timeout=5)


def test_books_api_uses_mock_data_when_database_fails(tmp_path):
    server = _make_server(tmp_path, FakeBooksRepository([], fail=True))
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{server.port}/api/books?level=3"
        ) as response:
            payload = json.loads(response.read())
            assert payload["level"] == 3
            assert payload["count"] == 5
            assert payload["source"] == "mock"
            assert all(book["level"] == 3 for book in payload["books"])
    finally:
        server._httpd.shutdown()
        server._thread.join(timeout=5)


def test_books_api_rejects_invalid_levels(tmp_path):
    server = _make_server(tmp_path)
    try:
        for query in ("", "?level=1", "?level=banana"):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{server.port}/api/books{query}")
                raise AssertionError("expected HTTP 400")
            except urllib.error.HTTPError as exc:
                assert exc.code == 400
                assert json.loads(exc.read())["error"]
    finally:
        server._httpd.shutdown()
        server._thread.join(timeout=5)
