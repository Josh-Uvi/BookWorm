"""PostgreSQL persistence for the reading-level book catalogue."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

CREATE_BOOKS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS books (
    book_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    level INTEGER NOT NULL CHECK (level IN (2, 3)),
    description TEXT NOT NULL,
    author VARCHAR(255) NOT NULL,
    pages INTEGER NOT NULL CHECK (pages > 0),
    genre VARCHAR(120) NOT NULL,
    published_year INTEGER NOT NULL,
    pdf_url TEXT NOT NULL DEFAULT '',
    cover_url TEXT NOT NULL DEFAULT '',
    sample_text TEXT NOT NULL DEFAULT ''
)
"""

UPSERT_BOOK_SQL = """
INSERT INTO books (
    book_id, name, level, description, author, pages, genre,
    published_year, pdf_url, cover_url, sample_text
) VALUES (
    %(book_id)s, %(name)s, %(level)s, %(description)s, %(author)s, %(pages)s,
    %(genre)s, %(published_year)s, %(pdf_url)s, %(cover_url)s, %(sample_text)s
)
ON CONFLICT (book_id) DO UPDATE SET
    name = EXCLUDED.name,
    level = EXCLUDED.level,
    description = EXCLUDED.description,
    author = EXCLUDED.author,
    pages = EXCLUDED.pages,
    genre = EXCLUDED.genre,
    published_year = EXCLUDED.published_year,
    pdf_url = EXCLUDED.pdf_url,
    cover_url = EXCLUDED.cover_url,
    sample_text = EXCLUDED.sample_text
"""


class PostgresBooksRepository:
    """Small repository with short-lived, thread-safe psycopg connections."""

    def __init__(self, database_url: str):
        if not database_url:
            raise ValueError("DATABASE_URL is required for PostgreSQL book storage")
        self.database_url = database_url

    def _connect(self):
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:  # pragma: no cover - exercised by development fallback
            raise RuntimeError("Install psycopg[binary] to use PostgreSQL book storage") from exc
        return psycopg.connect(self.database_url, connect_timeout=3, row_factory=dict_row)

    def setup(self, books: Iterable[dict[str, Any]]) -> int:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(CREATE_BOOKS_TABLE_SQL)
            for book in books:
                cursor.execute(UPSERT_BOOK_SQL, book)
            cursor.execute("SELECT COUNT(*) AS count FROM books WHERE level IN (2, 3)")
            row = cursor.fetchone()
        return int(row["count"] if row else 0)

    def list_books(self, level: int) -> list[dict[str, Any]]:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                    SELECT book_id, name, level, description, author, pages, genre,
                           published_year, pdf_url, cover_url, sample_text
                    FROM books
                    WHERE level = %s
                    ORDER BY name
                    """,
                (level,),
            )
            rows = cursor.fetchall()
        return [dict(row) for row in rows]

    def counts_by_level(self) -> dict[int, int]:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT level, COUNT(*) AS count FROM books GROUP BY level ORDER BY level"
            )
            rows = cursor.fetchall()
        return {int(row["level"]): int(row["count"]) for row in rows}