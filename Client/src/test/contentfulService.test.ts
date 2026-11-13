import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearContentfulCache,
  contentfulConfig,
  fetchContentfulBooks,
  fetchContentfulBooksByLevel,
  isContentfulConfigured,
  normalizeContentfulEntry,
} from "@/services/contentfulService";

const ASSET_BASE = "https://images.ctfassets.net/space123/asset/";

function asset(url: string) {
  return { fields: { title: "asset", file: { url } } };
}

const fullEntry = {
  sys: { id: "entry-1" },
  fields: {
    bookId: "book_2_1",
    title: "The Cat in the Hat",
    author: "Dr. Seuss",
    description: "A playful rhyming story.",
    genre: "Picture Book",
    level: 2,
    pages: 62,
    publishedYear: 1957,
    sampleText: "A tall cat arrives on a rainy day.",
    pdf: asset(`${ASSET_BASE}cat-in-the-hat.pdf`),
    cover: asset("http://images.ctfassets.net/space123/asset/cover.png"),
    interests: ["rhymes", 7],
  },
};

describe("contentfulService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    clearContentfulCache();
  });

  it("is inert without a space id and token", () => {
    expect(contentfulConfig()).toBeNull();
    expect(isContentfulConfigured()).toBe(false);
  });

  it("reads configuration from the environment with sane defaults", () => {
    vi.stubEnv("VITE_CONTENTFUL_SPACE_ID", "space123");
    vi.stubEnv("VITE_CONTENTFUL_ACCESS_TOKEN", "delivery-token");

    expect(isContentfulConfigured()).toBe(true);
    expect(contentfulConfig()).toEqual({
      spaceId: "space123",
      accessToken: "delivery-token",
      environment: "master",
      contentType: "book",
      host: "cdn.contentful.com",
    });
  });

  describe("normalizeContentfulEntry", () => {
    it("maps a full entry to the Book shape", () => {
      expect(normalizeContentfulEntry(fullEntry)).toEqual({
        id: "book_2_1",
        title: "The Cat in the Hat",
        author: "Dr. Seuss",
        coverUrl: "http://images.ctfassets.net/space123/asset/cover.png",
        description: "A playful rhyming story.",
        genre: "Picture Book",
        level: 2,
        pages: 62,
        publishedYear: 1957,
        pdfUrl: `${ASSET_BASE}cat-in-the-hat.pdf`,
        interests: ["rhymes"],
        chapters: [
          {
            id: "book_2_1-sample",
            title: "Reading Practice",
            content: "A tall cat arrives on a rainy day.",
          },
        ],
      });
    });

    it("defaults the id, genre and chapters, and rejects unknown levels", () => {
      const book = normalizeContentfulEntry({
        sys: { id: "entry-2" },
        fields: { title: "T", author: "A", level: 9 },
      });

      expect(book).toMatchObject({
        id: "entry-2",
        genre: "Children's Fiction",
        chapters: [],
        pdfUrl: undefined,
        coverUrl: "",
        level: undefined,
      });
    });

    it("rejects entries without a title or author", () => {
      expect(normalizeContentfulEntry({ sys: { id: "x" }, fields: { title: "T" } })).toBeNull();
      expect(normalizeContentfulEntry({ sys: { id: "x" }, fields: {} })).toBeNull();
      expect(normalizeContentfulEntry({})).toBeNull();
    });
  });

  describe("fetchContentfulBooks", () => {
    beforeEach(() => {
      vi.stubEnv("VITE_CONTENTFUL_SPACE_ID", "space123");
      vi.stubEnv("VITE_CONTENTFUL_ACCESS_TOKEN", "delivery-token");
    });

    it("queries the delivery API once, normalizes, and caches", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [fullEntry, { sys: { id: "bad" }, fields: {} }] }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const books = await fetchContentfulBooks();
      const levelBooks = await fetchContentfulBooksByLevel(2);

      expect(books).toHaveLength(1);
      expect(levelBooks.map((book) => book.id)).toEqual(["book_2_1"]);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
      expect(url).toContain("/spaces/space123/environments/master/entries?");
      expect(url).toContain("content_type=book");
      expect(init.headers.Authorization).toBe("Bearer delivery-token");
    });

    it("filters out books from other reading levels", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [fullEntry] }) })
      );

      expect(await fetchContentfulBooksByLevel(3)).toEqual([]);
    });

    it("surfaces failures and retries on the next call", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [fullEntry] }) });
      vi.stubGlobal("fetch", fetchMock);

      await expect(fetchContentfulBooks()).rejects.toThrow("401");
      expect(await fetchContentfulBooks()).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("rejects when Contentful is not configured", async () => {
      vi.unstubAllEnvs();

      await expect(fetchContentfulBooks()).rejects.toThrow(/not configured/);
    });
  });
});
