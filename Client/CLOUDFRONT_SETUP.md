# CloudFront Book Data Structure

## Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update `VITE_CLOUDFRONT_URL` with your CloudFront distribution URL

## Expected Data Structure

### Books List Endpoint
**URL:** `https://your-cloudfront-domain.cloudfront.net/books.json`

**Format:**
```json
[
  {
    "id": "1",
    "title": "Book Title",
    "author": "Author Name",
    "coverUrl": "https://example.com/cover.jpg",
    "description": "Book description",
    "genre": "Genre",
    "chapters": [
      {
        "id": "1-1",
        "title": "Chapter 1",
        "content": "Chapter content..."
      }
    ]
  }
]
```

### Individual Book Endpoint
**URL:** `https://your-cloudfront-domain.cloudfront.net/books/{bookId}.json`

**Format:** Same as single book object above

## Fallback Behavior

If CloudFront is unavailable or returns an error, the app will:
- Show "Loading books..." while fetching
- Display "No books available" if fetch fails
- Show "Book not found" for individual book errors
