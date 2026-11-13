import { Book } from "@/types";

/**
 * Optional Contentful-backed book catalogue.
 *
 * Used by the fully-free demo deployment (Netlify SPA + Render WebSocket
 * server + Contentful CMS — see docs/deployment-render.md). The CMS produces
 * the same `Book` shape as the platform media server, so the rest of the app
 * is unaware of which source won.
 *
 * Contentful is only consulted when `VITE_CONTENTFUL_SPACE_ID` and
 * `VITE_CONTENTFUL_ACCESS_TOKEN` are present at build time. Without them every
 * function here is a no-op and the existing media/API/bundled chain runs
 * unchanged.
 *
 * Expected content type (default id: `book`):
 *   title         Symbol  (required)
 *   author        Symbol  (required)
 *   description   Text
 *   genre         Symbol
 *   level         Integer (2 or 3)
 *   pages         Integer
 *   publishedYear Integer
 *   sampleText    Text    (practice passage for the reader)
 *   pdf           Asset   (the book PDF shown in the iframe)
 *   cover         Asset
 *   interests     Symbol list
 *   bookId        Symbol  (defaults to the entry id)
 *
 * NOTE: the delivery token ships in the SPA bundle. Use a read-only Content
 * Delivery API token (never a management/preview token) — see the deployment
 * guide's security section.
 */

function resolveAssetUrl(asset: unknown): string | undefined {
  if (!asset || typeof asset !== "object") return undefined;
  const file = (asset as { fields?: { file?: { url?: unknown } } }).fields?.file;
  const url = file?.url;
  if (typeof url !== "string" || url.length === 0) return undefined;
  // Contentful returns protocol-relative URLs ("//images.ctfassets.net/...").
  return url.startsWith("//") ? `https:${url}` : url;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asLevel(value: unknown): 2 | 3 | undefined {
  return value === 2 || value === 3 ? value : undefined;
}

export interface ContentfulConfig {
  spaceId: string;
  accessToken: string;
  environment: string;
  contentType: string;
  host: string;
}

/**
 * Read the Contentful configuration from the build-time environment.
 * Resolved per call (not at module scope) so tests can stub `import.meta.env`.
 */
export function contentfulConfig(): ContentfulConfig | null {
  const env = import.meta.env;
  const spaceId = env.VITE_CONTENTFUL_SPACE_ID?.trim();
  const accessToken = env.VITE_CONTENTFUL_ACCESS_TOKEN?.trim();
  if (!spaceId || !accessToken) return null;
  return {
    spaceId,
    accessToken,
    environment: env.VITE_CONTENTFUL_ENVIRONMENT?.trim() || "master",
    contentType: env.VITE_CONTENTFUL_CONTENT_TYPE?.trim() || "book",
    host: env.VITE_CONTENTFUL_HOST?.trim() || "cdn.contentful.com",
  };
}

export function isContentfulConfigured(): boolean {
  return contentfulConfig() !== null;
}

interface ContentfulEntry {
  sys?: { id?: unknown };
  fields?: Record<string, unknown>;
}

/** Map one Contentful entry to a `Book`; `null` when required fields are missing. */
export function normalizeContentfulEntry(entry: ContentfulEntry): Book | null {
  const fields = entry.fields;
  const id = asString(entry.sys?.id);
  if (!fields) return null;

  const title = asString(fields.title).trim();
  const author = asString(fields.author).trim();
  if (!title || !author) return null;

  const bookId = asString(fields.bookId).trim() || id;
  if (!bookId) return null;

  const sampleText = asString(fields.sampleText).trim();
  const interests = Array.isArray(fields.interests)
    ? fields.interests.filter((interest): interest is string => typeof interest === "string")
    : undefined;

  return {
    id: bookId,
    title,
    author,
    coverUrl: resolveAssetUrl(fields.cover) ?? "",
    description: asString(fields.description),
    genre: asString(fields.genre) || "Children's Fiction",
    level: asLevel(fields.level),
    pages: asNumber(fields.pages),
    publishedYear: asNumber(fields.publishedYear),
    // CMS assets are absolute, trusted URLs — they are served straight to the
    // iframe/img, never re-based against VITE_MEDIA_URL (see bookService).
    pdfUrl: resolveAssetUrl(fields.pdf),
    interests,
    chapters: sampleText
      ? [{ id: `${bookId}-sample`, title: "Reading Practice", content: sampleText }]
      : [],
  };
}

let cachedBooks: Promise<Book[]> | null = null;

/** Drop the in-memory catalogue cache (one CDA call per page load). */
export function clearContentfulCache(): void {
  cachedBooks = null;
}

function buildEntriesUrl(config: ContentfulConfig): string {
  const query = new URLSearchParams({
    content_type: config.contentType,
    limit: "100",
    include: "2",
  });
  return (
    `https://${config.host}/spaces/${config.spaceId}/environments/${config.environment}` +
    `/entries?${query.toString()}`
  );
}

/**
 * Fetch and normalize the whole catalogue (cached for the page's lifetime).
 * Rejects when Contentful is unreachable or not configured — callers fall back
 * to the next source.
 */
export function fetchContentfulBooks(): Promise<Book[]> {
  const config = contentfulConfig();
  if (!config) return Promise.reject(new Error("Contentful is not configured"));
  if (!cachedBooks) {
    cachedBooks = (async () => {
      const response = await fetch(buildEntriesUrl(config), {
        headers: { Authorization: `Bearer ${config.accessToken}` },
      });
      if (!response.ok) {
        throw new Error(`Contentful request failed (${response.status})`);
      }
      const payload = (await response.json()) as { items?: ContentfulEntry[] };
      return (payload.items ?? [])
        .map(normalizeContentfulEntry)
        .filter((book): book is Book => book !== null);
    })().catch((error) => {
      cachedBooks = null; // allow a later retry instead of caching the failure
      throw error;
    });
  }
  return cachedBooks;
}

export async function fetchContentfulBooksByLevel(level: 2 | 3): Promise<Book[]> {
  const books = await fetchContentfulBooks();
  return books.filter((book) => book.level === level);
}
