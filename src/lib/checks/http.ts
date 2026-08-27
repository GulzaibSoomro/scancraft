/**
 * Shared HTTP helpers for check modules.
 * All requests are read-only, timed out, and size-capped.
 */

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 2_000_000; // 2 MB per response

export class FetchError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export async function fetchWithLimits(
  url: string,
  init: RequestInit = {},
  options: { timeoutMs?: number; maxBytes?: number } = {}
): Promise<{
  status: number;
  headers: Headers;
  body: string;
  finalUrl: string;
}> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_BODY_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      redirect: init.redirect ?? "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "ScanCraftBot/0.1 (+https://scancraft.app; security-preview)",
        Accept: "*/*",
        ...(init.headers ?? {}),
      },
    });

    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
    const body = new TextDecoder("utf-8", { fatal: false }).decode(slice);

    return {
      status: res.status,
      headers: res.headers,
      body,
      finalUrl: res.url,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new FetchError(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeTargetUrl(raw: string): URL {
  const trimmed = raw.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }
  return url;
}

/** Block obvious SSRF targets (localhost, private, link-local, cloud metadata). */
export function assertPublicHttpUrl(url: URL): void {
  const host = url.hostname.toLowerCase();

  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    throw new Error("That URL points at a private or local address — we can’t scan those.");
  }

  // IPv4 literal checks
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((n) => n > 255)) {
      throw new Error("Invalid IP address.");
    }
    const [a, b] = parts;
    const privateRange =
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127); // CGNAT
    if (privateRange) {
      throw new Error("That URL points at a private address — we can’t scan those.");
    }
  }
}

export function absoluteUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}
