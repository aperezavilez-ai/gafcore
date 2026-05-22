import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GAFCORE_APPLE_TOUCH_ICON_PATH,
  GAFCORE_FAVICON_PATH,
  GAFCORE_FAVICON_PNG_BASE64,
  GAFCORE_FAVICON_SVG_PATH,
} from "./site-icons.shared";

const FAVICON_PNG_BYTES = Uint8Array.from(
  Buffer.from(GAFCORE_FAVICON_PNG_BASE64, "base64"),
);

const FAVICON_SVG_BYTES = new TextEncoder().encode(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="gc" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#22d3ee"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#gc)"/><text x="16" y="22" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="18" font-weight="700">G</text></svg>`,
);

const PATH_TO_FILE: Record<string, string> = {
  "/favicon.svg": "favicon.svg",
  [GAFCORE_FAVICON_PATH]: "favicon.png",
  "/favicon-32.png": "favicon-32.png",
  [GAFCORE_APPLE_TOUCH_ICON_PATH]: "apple-touch-icon.png",
  "/og-image.png": "og-image.png",
  "/favicon.ico": "favicon.png",
};

const MIME_BY_FILE: Record<string, string> = {
  "favicon.svg": "image/svg+xml",
  "favicon.ico": "image/png",
  "favicon.png": "image/png",
  "favicon-32.png": "image/png",
  "apple-touch-icon.png": "image/png",
  "og-image.png": "image/png",
};

const cache = new Map<string, Uint8Array>();

function readBundledPublic(filename: string): Uint8Array | null {
  const cached = cache.get(filename);
  if (cached) return cached;

  const base = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(base, filename),
    join(base, "..", filename),
    join(base, "../../", filename),
    join(base, "../../../", filename),
    join(process.cwd(), "public", filename),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const bytes = new Uint8Array(readFileSync(path));
    cache.set(filename, bytes);
    return bytes;
  }
  return null;
}

function embeddedBytes(pathname: string): Uint8Array | null {
  if (pathname === "/favicon.ico" || pathname === GAFCORE_FAVICON_PATH || pathname === "/favicon-32.png") {
    return FAVICON_PNG_BYTES;
  }
  if (pathname === GAFCORE_FAVICON_SVG_PATH) return FAVICON_SVG_BYTES;
  return null;
}

/** Normaliza /favicon.png?v=2 → /favicon.png */
function normalizePublicPath(pathname: string): string {
  const q = pathname.indexOf("?");
  return q === -1 ? pathname : pathname.slice(0, q);
}

/** Sirve favicon/og-image (bytes embebidos primero; archivos en disco como respaldo). */
export function servePublicStatic(pathname: string): Response | null {
  const path = normalizePublicPath(pathname);
  const embedded = embeddedBytes(path);
  if (embedded) {
    const mime =
      pathname === GAFCORE_FAVICON_SVG_PATH ? "image/svg+xml" : "image/png";
    return new Response(embedded, {
      status: 200,
      headers: {
        "content-type": mime,
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }

  const filename = PATH_TO_FILE[path];
  if (!filename) return null;

  const bytes = readBundledPublic(filename);
  if (!bytes) return null;

  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": MIME_BY_FILE[filename] ?? "application/octet-stream",
      "cache-control": "public, max-age=86400",
    },
  });
}
