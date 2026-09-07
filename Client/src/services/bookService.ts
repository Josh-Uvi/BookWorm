import { Book } from "@/types";
import { sampleBooks } from "@/data/sampleBooks";
import { cloudfrontBooks } from "@/config/books";

export const fetchBooks = async (): Promise<Book[]> => {
  const validBooks = cloudfrontBooks.filter(book => book.pdfUrl);
  return validBooks.length > 0 ? validBooks : sampleBooks;
};

export const fetchBook = async (bookId: string): Promise<Book | null> => {
  const book = cloudfrontBooks.find(b => b.id === bookId);
  if (book && book.pdfUrl) return book;
  return sampleBooks.find(b => b.id === bookId) || null;
};
