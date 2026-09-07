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

