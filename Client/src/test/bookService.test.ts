import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBook, fetchBooks } from "@/services/bookService";
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
