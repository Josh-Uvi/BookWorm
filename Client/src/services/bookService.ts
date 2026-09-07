import { Book } from "@/types";
import { sampleBooks } from "@/data/sampleBooks";

/**
 * Books are served by the platform-agnostic media server (`/media`
 * prefix — see Server/media_server.py, vite.config.ts and nginx.conf).
 * If it is unreachable we gracefully fall back to the bundled samples.
 */
const MEDIA_URL = (import.meta.env.VITE_MEDIA_URL || "/media").replace(/\/+$/, "");

function resolveMediaUrl(relativePath: string): string {
  return `${MEDIA_URL}/${relativePath.replace(/^\/+/, "")}`;
}

interface RawBook extends Omit<Book, "pdfUrl"> {
  pdfUrl?: string;
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

export const fetchBooks = async (): Promise<Book[]> => {
  try {
    const books = await fetchMediaBooks();
    return books.length > 0 ? books : sampleBooks;
  } catch {
    return sampleBooks; // media server offline — use the bundled samples
  }
};

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

