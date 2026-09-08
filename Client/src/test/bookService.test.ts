import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBook, fetchBooks, fetchBooksByLevel, fetchReadableBook } from "@/services/bookService";
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

describe("fetchBooksByLevel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes the PostgreSQL API response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        level: 2,
        count: 1,
        source: "postgres",
        books: [{
          book_id: "book_2_1",
          name: "The Cat in the Hat",
          level: 2,
          description: "A fun story",
          author: "Dr. Seuss",
          pages: 62,
          genre: "Picture Book",
          published_year: 1957,
          pdf_url: "books/Cat-in-the-Hat.pdf",
          cover_url: "https://example.com/cat.jpg",
          sample_text: "",
        }],
      }),
    }));

    const result = await fetchBooksByLevel(2);
    expect(result.fellBack).toBe(false);
    expect(result.source).toBe("postgres");
    expect(result.books[0]).toMatchObject({
      id: "book_2_1",
      title: "The Cat in the Hat",
      level: 2,
      pages: 62,
      pdfUrl: "/media/books/Cat-in-the-Hat.pdf",
    });
  });

  it("uses the server media catalogue when the books API is unavailable", async () => {
    const mediaBook = {
      id: "media-level-2",
      title: "Real Media Book",
      author: "Media Author",
      coverUrl: "https://example.com/media.jpg",
      description: "A book stored in media/books.",
      genre: "Children's Fiction",
      level: 2,
      pages: 20,
      pdfUrl: "books/real-media-book.pdf",
      chapters: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/books?level=2") {
          throw new Error("API offline");
        }
        if (url === "/media/books.json") {
          return { ok: true, status: 200, json: async () => [mediaBook] };
        }
        if (url === "/media/books/real-media-book.pdf" && init?.method === "HEAD") {
          return { ok: true, status: 200 };
        }
        throw new Error(`Unexpected request: ${url}`);
      })
    );

    const result = await fetchBooksByLevel(2);
    expect(result).toMatchObject({ fellBack: false, source: "media" });
    expect(result.books).toEqual([
      expect.objectContaining({
        id: "media-level-2",
        title: "Real Media Book",
        pdfUrl: "/media/books/real-media-book.pdf",
      }),
    ]);
  });

  it("prefers real media books over API mock books", async () => {
    const mockApiBook = {
      book_id: "mock-book",
      name: "Mock Book",
      level: 2,
      description: "mock",
      author: "Mock Author",
      pages: 10,
      genre: "Mock",
      published_year: 2020,
      pdf_url: "",
      cover_url: "",
      sample_text: "Mock text",
    };
    const mediaBook = {
      id: "real-book",
      title: "Real Media Book",
      author: "Media Author",
      coverUrl: "https://example.com/media.jpg",
      description: "real",
      genre: "Children's Fiction",
      level: 2,
      pages: 24,
      pdfUrl: "books/real.pdf",
      chapters: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/books?level=2") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              level: 2,
              count: 1,
              source: "mock",
              books: [mockApiBook],
            }),
          };
        }
        if (url === "/media/books.json") {
          return { ok: true, status: 200, json: async () => [mediaBook] };
        }
        if (url === "/media/books/real.pdf" && init?.method === "HEAD") {
          return { ok: true, status: 200 };
        }
        throw new Error(`Unexpected request: ${url}`);
      })
    );

    const result = await fetchBooksByLevel(2);
    expect(result.source).toBe("media");
    expect(result.fellBack).toBe(false);
    expect(result.books.map((book) => book.id)).toEqual(["real-book"]);
  });

  it("does not report the server as unavailable when its mock catalogue responds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/books?level=3") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              level: 3,
              count: 1,
              source: "mock",
              books: [{
                book_id: "mock-level-3",
                name: "Server Development Book",
                level: 3,
                description: "Served by the backend.",
                author: "Development Author",
                pages: 40,
                genre: "Children's Fiction",
                published_year: 2020,
                pdf_url: "",
                cover_url: "",
                sample_text: "A server-provided practice passage.",
              }],
            }),
          };
        }
        if (url === "/media/books.json") {
          return { ok: true, status: 200, json: async () => [] };
        }
        throw new Error(`Unexpected request: ${url}`);
      })
    );

    const result = await fetchBooksByLevel(3);
    expect(result.source).toBe("mock");
    expect(result.fellBack).toBe(false);
    expect(result.books[0].title).toBe("Server Development Book");
  });

  it("returns only matching built-in books when the API is offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const result = await fetchBooksByLevel(3);
    expect(result.fellBack).toBe(true);
    expect(result.source).toBe("bundled");
    expect(result.books).toHaveLength(5);
    expect(result.books.every((book) => book.level === 3)).toBe(true);
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
