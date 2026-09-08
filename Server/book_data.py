"""Development catalogue shared by PostgreSQL seeding and API fallback."""

from __future__ import annotations

from typing import Any

SAMPLE_BOOKS: list[dict[str, Any]] = [
    {
        "book_id": "book_2_1",
        "name": "The Cat in the Hat",
        "level": 2,
        "description": "A playful rhyming story for practicing short words and word families.",
        "author": "Dr. Seuss",
        "pages": 62,
        "genre": "Rhyming Picture Book",
        "published_year": 1957,
        "pdf_url": "books/Cat-in-the-Hat.pdf",
        "cover_url": "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&h=800&fit=crop",
        "sample_text": "",
    },
    {
        "book_id": "book_2_2",
        "name": "Green Eggs and Ham",
        "level": 2,
        "description": "A funny, repetitive story that builds confidence with familiar words.",
        "author": "Dr. Seuss",
        "pages": 72,
        "genre": "Rhyming Picture Book",
        "published_year": 1960,
        "pdf_url": "",
        "cover_url": "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&h=800&fit=crop",
        "sample_text": (
            "Sam has a surprising meal to share. His friend is not sure about trying it. "
            "Read slowly, notice the rhyming words, and listen for words that repeat."
        ),
    },
    {
        "book_id": "book_2_3",
        "name": "The Very Hungry Caterpillar",
        "level": 2,
        "description": "A colorful counting story with days, foods, and a growing caterpillar.",
        "author": "Eric Carle",
        "pages": 26,
        "genre": "Picture Book",
        "published_year": 1969,
        "pdf_url": "",
        "cover_url": "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=600&h=800&fit=crop",
        "sample_text": (
            "A tiny caterpillar wakes up feeling hungry. Each day, it searches for something "
            "new to eat. Soon it will make a cozy home and begin a wonderful change."
        ),
    },
    {
        "book_id": "book_2_4",
        "name": "Frog and Toad Are Friends",
        "level": 2,
        "description": "Gentle stories about friendship, patience, and helping one another.",
        "author": "Arnold Lobel",
        "pages": 64,
        "genre": "Early Reader",
        "published_year": 1970,
        "pdf_url": "",
        "cover_url": "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=600&h=800&fit=crop",
        "sample_text": (
            "Frog visits Toad on a bright morning. They make a plan for the day and help each "
            "other when the plan changes. Good friends can solve problems together."
        ),
    },
    {
        "book_id": "book_2_5",
        "name": "Corduroy",
        "level": 2,
        "description": "A warm story about a toy bear who hopes to find a home and a friend.",
        "author": "Don Freeman",
        "pages": 32,
        "genre": "Picture Book",
        "published_year": 1968,
        "pdf_url": "",
        "cover_url": "https://images.unsplash.com/photo-1559454403-b8fb88521f11?w=600&h=800&fit=crop",
        "sample_text": (
            "A small bear waits on a shelf and dreams of having a home. One night, he explores "
            "the quiet store. In the morning, a kind child returns to see him."
        ),
    },
    {
        "book_id": "book_3_1",
        "name": "Charlotte's Web",
        "level": 3,
        "description": "A thoughtful story about friendship, loyalty, and life on a farm.",
        "author": "E. B. White",
        "pages": 192,
        "genre": "Classic Children's Fiction",
        "published_year": 1952,
        "pdf_url": "",
        "cover_url": "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600&h=800&fit=crop",
        "sample_text": (
            "Wilbur is a young pig who worries about being alone. In the barn, he meets Charlotte, "
            "a clever spider who listens carefully. Their friendship changes the whole farm."
        ),
    },
    {
        "book_id": "book_3_2",
        "name": "The Wonderful Wizard of Oz",
        "level": 3,
        "description": "Dorothy follows a strange road and meets friends searching for courage and wisdom.",
        "author": "L. Frank Baum",
        "pages": 154,
        "genre": "Classic Fantasy",
        "published_year": 1900,
        "pdf_url": "",
        "cover_url": "https://images.unsplash.com/photo-1516979187457-637abb4f9353?w=600&h=800&fit=crop",
        "sample_text": (
            "Dorothy opens the door and sees a bright, unfamiliar land. To find her way home, "
            "she must follow a golden road. Along the way, she meets travelers with wishes of their own."
        ),
    },
    {
        "book_id": "book_3_3",
        "name": "Alice's Adventures in Wonderland",
        "level": 3,
        "description": "A curious girl enters a surprising world filled with puzzles and unusual characters.",
        "author": "Lewis Carroll",
        "pages": 200,
        "genre": "Classic Fantasy",
        "published_year": 1865,
        "pdf_url": "",
        "cover_url": "https://images.unsplash.com/photo-1511108690759-009324a90311?w=600&h=800&fit=crop",
        "sample_text": (
            "Alice notices a hurried white rabbit and follows it toward a deep hole. The world "
            "below is full of odd doors, riddles, and creatures who never behave as expected."
        ),
    },
    {
        "book_id": "book_3_4",
        "name": "The Wind in the Willows",
        "level": 3,
        "description": "Animal friends share adventures beside a river and learn to value home.",
        "author": "Kenneth Grahame",
        "pages": 256,
        "genre": "Classic Adventure",
        "published_year": 1908,
        "pdf_url": "",
        "cover_url": "https://images.unsplash.com/photo-1526243741027-444d633d7365?w=600&h=800&fit=crop",
        "sample_text": (
            "Mole leaves his spring cleaning and discovers the river for the first time. Rat "
            "welcomes him into a little boat. A peaceful afternoon begins a much larger adventure."
        ),
    },
    {
        "book_id": "book_3_5",
        "name": "Peter Pan",
        "level": 3,
        "description": "A magical adventure about imagination, bravery, and the meaning of growing up.",
        "author": "J. M. Barrie",
        "pages": 224,
        "genre": "Classic Fantasy",
        "published_year": 1911,
        "pdf_url": "",
        "cover_url": "https://images.unsplash.com/photo-1519682337058-a94d519337bc?w=600&h=800&fit=crop",
        "sample_text": (
            "Peter arrives at the nursery with stories of a faraway island. Wendy and her brothers "
            "must decide whether to follow him into the night sky and begin an unforgettable journey."
        ),
    },
]


def books_for_level(level: int) -> list[dict[str, Any]]:
    """Return independent dictionaries so handlers cannot mutate the seed data."""

    return [dict(book) for book in SAMPLE_BOOKS if book["level"] == level]