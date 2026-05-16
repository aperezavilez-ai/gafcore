import type { ProjFile } from "@/lib/gafcore-chat.shared";
import {
  applyPicsumFallbacksInHtml,
  buildAssetUrlMap,
  collectHttpImageUrlsFromFiles,
  picsumFallbackUrl,
  repairGafcoreProjectMedia,
  repairHtmlMedia,
} from "@/lib/gafcore-media.shared";

const HEAD_TIMEOUT_MS = 3500;
const MAX_HEAD_CHECKS = 10;
const MAX_REPLICATE_IMAGES = 2;

async function urlReachable(url: string): Promise<boolean> {
  if (!url.startsWith("https://")) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal, redirect: "follow" });
    clearTimeout(t);
    if (res.ok) return true;
    if (res.status === 405) {
      const g = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
        headers: { Range: "bytes=0-0" },
      });
      return g.ok;
    }
    return false;
  } catch {
    return false;
  }
}

/** Genera imagen vía Replicate Flux Schnell (opcional). */
export async function generateReplicateImage(prompt: string): Promise<string | null> {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) return null;
  const res = await fetch(
    "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait=60",
      },
      body: JSON.stringify({
        input: {
          prompt: prompt.slice(0, 800),
          aspect_ratio: "16:9",
          output_format: "webp",
          num_outputs: 1,
        },
      }),
    },
  );
  if (!res.ok) {
    console.warn("replicate_image_failed", res.status, await res.text().catch(() => ""));
    return null;
  }
  const json = (await res.json()) as { output?: string | string[]; urls?: string[] };
  const out = json.output;
  if (typeof out === "string" && out.startsWith("https://")) return out;
  if (Array.isArray(out) && typeof out[0] === "string") return out[0];
  if (Array.isArray(json.urls) && json.urls[0]) return json.urls[0];
  return null;
}

function replaceBrokenUrlInFiles(files: ProjFile[], broken: string, replacement: string): ProjFile[] {
  if (broken === replacement) return files;
  return files.map((f) => ({
    ...f,
    content: f.content.split(broken).join(replacement),
  }));
}

async function repairBrokenHttpImages(
  files: ProjFile[],
  instruction: string,
): Promise<ProjFile[]> {
  const urls = collectHttpImageUrlsFromFiles(files).slice(0, MAX_HEAD_CHECKS);
  let out = files;
  let replicateUsed = 0;
  const wantsGen =
    /genera|crea.*imagen|foto|fotograf|hero.*imagen|ilustraci|mockup|banner|visual\s+premium/i.test(
      instruction,
    );

  for (const url of urls) {
    if (await urlReachable(url)) continue;
    let replacement = picsumFallbackUrl(url.slice(-40));

    if (wantsGen && replicateUsed < MAX_REPLICATE_IMAGES && process.env.REPLICATE_API_TOKEN?.trim()) {
      const prompt =
        instruction.slice(0, 400) ||
        "Professional high quality photograph for a modern website hero section, commercial lighting";
      const generated = await generateReplicateImage(prompt);
      if (generated) {
        replacement = generated;
        replicateUsed += 1;
      }
    }

    out = replaceBrokenUrlInFiles(out, url, replacement);
  }

  return out;
}

/**
 * Post-procesa salida del modelo: assets locales, picsum, validación HEAD, Replicate opcional.
 */
export async function enrichGafcoreOutputFiles(
  generated: ProjFile[],
  projectFiles: ProjFile[],
  instruction: string,
): Promise<ProjFile[]> {
  let files = repairGafcoreProjectMedia(generated, projectFiles);
  const assetMap = buildAssetUrlMap([...projectFiles, ...files]);
  files = files.map((f) => {
    if (!/\.(html|htm|jsx|tsx|js|css)$/i.test(f.name)) return f;
    let content = repairHtmlMedia(f.content, assetMap);
    if (/\.html?$/i.test(f.name)) content = applyPicsumFallbacksInHtml(content);
    return { ...f, content };
  });
  files = await repairBrokenHttpImages(files, instruction);
  return files;
}
