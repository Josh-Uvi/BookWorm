import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBook, fetchBooks, fetchReadableBook } from "@/services/bookService";
import { sampleBooks } from "@/data/sampleBooks";

describe("bookService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to sample books when the media server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    expect(await fetchBooks()).toEqual(sampleBooks);
    expect(await fetchBook("1")).toEqual(sampleBooks[0]);
  });

  it("resolves media book pdfUrl against the media root", async () => {
    const mediaBooks = [
      {
        id: "10",
        title: "Media Book",
        author: "Author",
        coverUrl: "https://example.com/cover.jpg",
        description: "desc",
        genre: "Children's Fiction",
        pdfUrl: "books/media-book.pdf",
        chapters: [],
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => mediaBooks })
    );

    const books = await fetchBooks();
    expect(books).toHaveLength(1);
    expect(books[0].pdfUrl).toBe("/media/books/media-book.pdf");
  });

  it("falls back when the media catalogue is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    expect(await fetchBooks()).toEqual(sampleBooks);
  });

  it("returns null for unknown book ids", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    expect(await fetchBook("does-not-exist")).toBeNull();
  });
});

describe("fetchReadableBook", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mediaBook = {
    id: "10",
    title: "Media Book",
    author: "Author",
    coverUrl: "https://example.com/cover.jpg",
    description: "desc",
    genre: "Children's Fiction",
    pdfUrl: "books/media-book.pdf",
    chapters: [],
  };

  it("returns the media book when its PDF is available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === "HEAD"
          ? { ok: true, status: 200 }
          : { ok: true, status: 200, json: async () => [mediaBook] }
      )
    );

    const { book, fellBack } = await fetchReadableBook("10");
    expect(fellBack).toBe(false);
    expect(book.title).toBe("Media Book");
  });

  it("falls back to a sample book when the PDF is missing (404)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === "HEAD"
          ? { ok: false, status: 404 }
          : { ok: true, status: 200, json: async () => [mediaBook] }
      )
    );

    const { book, fellBack } = await fetchReadableBook("10");
    expect(fellBack).toBe(true);
    expect(book).toEqual(sampleBooks[0]); // no sample with id "10" → first sample
  });

  it("falls back to the same-id sample book when the id is not in the catalogue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => [mediaBook] }))
    );

    const { book, fellBack } = await fetchReadableBook("2");
    expect(fellBack).toBe(true);
    expect(book).toEqual(sampleBooks.find((sample) => sample.id === "2"));
  });

  it("falls back when the media server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const { book, fellBack } = await fetchReadableBook("1");
    expect(fellBack).toBe(true);
    expect(book).toEqual(sampleBooks[0]);
  });
});
