import { Book } from "@/types";
import { sampleBooks } from "@/data/sampleBooks";
import { getReadingLevelBooks, readingLevelBooks } from "@/data/readingBooks";

/**
 * Books are served by the platform-agnostic media server (`/media`
 * prefix — see Server/media_server.py, vite.config.ts and nginx.conf).
 * If it is unreachable we gracefully fall back to the bundled samples.
 */
const MEDIA_URL = (import.meta.env.VITE_MEDIA_URL || "/media").replace(/\/+$/, "");
const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");

function resolveMediaUrl(relativePath: string): string {
  return `${MEDIA_URL}/${relativePath.replace(/^\/+/, "")}`;
}

interface RawBook extends Omit<Book, "pdfUrl"> {
  pdfUrl?: string;
}

interface ApiBook {
  book_id: string;
  name: string;
  level: 2 | 3;
  description: string;
  author: string;
  pages: number;
  genre: string;
  published_year: number;
  pdf_url?: string;
  cover_url?: string;
  sample_text?: string;
}

interface BooksApiResponse {
  books: ApiBook[];
  level: 2 | 3;
  count: number;
  source?: "postgres" | "media" | "mock";
}

export interface LevelBooksResult {
  books: Book[];
  fellBack: boolean;
  source: "postgres" | "media" | "mock" | "bundled";
}

function normalizeFallbackBook(book: Book): Book {
  return {
    ...book,
    // The API and media server share a backend; if the API is unreachable,
    // prefer the bundled practice passage over an iframe that cannot load.
    pdfUrl: undefined,
  };
}

function normalizeApiBook(book: ApiBook): Book {
  const fallback = readingLevelBooks.find((candidate) => candidate.id === book.book_id);
  const sampleText = book.sample_text?.trim();
  return {
    id: book.book_id,
    title: book.name,
    author: book.author,
    coverUrl: book.cover_url || fallback?.coverUrl || "",
    description: book.description,
    genre: book.genre,
    level: book.level,
    pages: book.pages,
    publishedYear: book.published_year,
    pdfUrl: book.pdf_url ? resolveMediaUrl(book.pdf_url) : undefined,
    chapters: sampleText
      ? [{ id: `${book.book_id}-sample`, title: "Reading Practice", content: sampleText }]
      : (fallback?.chapters ?? []),
  };
}

async function fetchMediaBooks(): Promise<Book[]> {
  const response = await fetch(resolveMediaUrl("books.json"));
  if (!response.ok) {
    throw new Error(`books.json request failed (${response.status})`);
  }
  const books: RawBook[] = await response.json();
  return books.map((book) => ({
    ...book,
    pdfUrl: book.pdfUrl ? resolveMediaUrl(book.pdfUrl) : undefined,
  }));
}

async function fetchMediaBooksByLevel(level: 2 | 3): Promise<Book[]> {
  const books = (await fetchMediaBooks()).filter((book) => book.level === level);
  const availableBooks = await Promise.all(
    books.map(async (book) => {
      if (book.pdfUrl && !(await isPdfAvailable(book.pdfUrl))) return null;
      return book;
    })
  );
  return availableBooks.filter((book): book is Book => book !== null);
}

export const fetchBooks = async (): Promise<Book[]> => {
  try {
    const books = await fetchMediaBooks();
    return books.length > 0 ? books : sampleBooks;
  } catch {
    return sampleBooks; // media server offline — use the bundled samples
  }
};

export async function fetchBooksByLevel(level: 2 | 3): Promise<LevelBooksResult> {
  let apiMockBooks: Book[] = [];
  try {
    const response = await fetch(`${API_URL}/books?level=${level}`);
    if (!response.ok) {
      throw new Error(`books API request failed (${response.status})`);
    }
    const payload = (await response.json()) as BooksApiResponse;
    if (!Array.isArray(payload.books) || payload.level !== level || payload.books.length === 0) {
      throw new Error("books API returned an invalid or empty catalogue");
    }
    const books = await Promise.all(
      payload.books.map(async (rawBook) => {
        const book = normalizeApiBook(rawBook);
        if (book.pdfUrl && !(await isPdfAvailable(book.pdfUrl))) {
          return { ...book, pdfUrl: undefined };
        }
        return book;
      })
    );
    if (payload.source !== "mock") {
      return {
        books,
        fellBack: false,
        source: payload.source ?? "postgres",
      };
    }
    apiMockBooks = books;
  } catch {
    // The level API may be offline while the media catalogue is still
    // available, especially during native development. Try it next.
  }

  try {
    const mediaBooks = await fetchMediaBooksByLevel(level);
    if (mediaBooks.length > 0) {
      return { books: mediaBooks, fellBack: false, source: "media" };
    }
  } catch {
    // Both server-backed sources are unavailable; use development data below.
  }

  return {
    books: apiMockBooks.length > 0
      ? apiMockBooks
      : getReadingLevelBooks(level).map(normalizeFallbackBook),
    fellBack: apiMockBooks.length === 0,
    source: apiMockBooks.length > 0 ? "mock" : "bundled",
  };
}

export const fetchBook = async (bookId: string): Promise<Book | null> => {
  const books = await fetchBooks();
  return books.find((book) => book.id === bookId) || null;
};

// ── Reading-page resolution (with graceful fallback) ───────────────────

export interface ResolvedBook {
  book: Book;
  fellBack: boolean;
}

/** Probe whether a media file actually exists. The catalogue can list books
 * whose PDFs are missing — rendering such a URL in the reader's iframe shows
 * the raw 404 body ("Not found: …"), so we check before rendering. */
async function isPdfAvailable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

function pickSampleBook(bookId: string): Book {
  return sampleBooks.find((book) => book.id === bookId) ?? sampleBooks[0];
}

/**
 * Resolve the book the Reading page should show. If the requested book is
 * missing from the catalogue, its PDF cannot be fetched, or the media server
 * is offline, a bundled sample book is returned instead (same id when
 * possible) so the child always has something to read. `fellBack` tells the
 * caller to notify the user.
 */
export async function fetchReadableBook(bookId: string): Promise<ResolvedBook> {
  try {
    const books = await fetchMediaBooks();
    const book = books.find((candidate) => candidate.id === bookId);
    if (!book) {
      return { book: pickSampleBook(bookId), fellBack: true };
    }
    if (book.pdfUrl && !(await isPdfAvailable(book.pdfUrl))) {
      return { book: pickSampleBook(bookId), fellBack: true };
    }
    return { book, fellBack: false };
  } catch {
    // Media server unreachable or empty catalogue — bundled samples.
    return { book: pickSampleBook(bookId), fellBack: true };
  }
}

