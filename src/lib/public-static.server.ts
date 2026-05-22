import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GAFCORE_APPLE_TOUCH_ICON_PATH,
  GAFCORE_FAVICON_PATH,
} from "./site-icons.shared";

const PATH_TO_FILE: Record<string, string> = {
  [GAFCORE_FAVICON_PATH]: "favicon.png",
  [GAFCORE_APPLE_TOUCH_ICON_PATH]: "apple-touch-icon.png",
  "/og-image.png": "og-image.png",
  "/favicon.ico": "favicon.png",
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
    const bytes = readFileSync(path);
    cache.set(filename, bytes);
    return bytes;
  }
  return null;
}

/** Sirve favicon/og-image cuando Vercel no expone /public en CDN. */
export function servePublicStatic(pathname: string): Response | null {
  const filename = PATH_TO_FILE[pathname];
  if (!filename) return null;

  const bytes = readBundledPublic(filename);
  if (!bytes) return null;

  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
    },
  });
}
