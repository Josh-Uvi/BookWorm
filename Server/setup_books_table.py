"""Create, seed, and verify the PostgreSQL books table."""

from __future__ import annotations

import logging
import os

from dotenv import load_dotenv

from book_data import SAMPLE_BOOKS
from books_repository import PostgresBooksRepository

logger = logging.getLogger("books-setup")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    load_dotenv()
    database_url = os.getenv(
        "DATABASE_URL", "postgresql://reader:reader@localhost:5432/reading_assistant"
    )

    repository = PostgresBooksRepository(database_url)
    total = repository.setup(SAMPLE_BOOKS)
    counts = repository.counts_by_level()
    expected = {2: 5, 3: 5}
    if total < len(SAMPLE_BOOKS) or any(counts.get(level, 0) < count for level, count in expected.items()):
        raise RuntimeError(
            f"Book seed verification failed: expected {expected}, found {counts} (total={total})"
        )
    logger.info("Books table ready: %s", counts)


if __name__ == "__main__":
    main()