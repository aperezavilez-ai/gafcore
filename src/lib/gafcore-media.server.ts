import type { ProjFile } from "@/lib/gafcore-chat.shared";
import {
  applyPicsumFallbacksInSource,
  buildAssetUrlMap,
  collectHttpImageUrlsFromFiles,
  repairGafcoreProjectMedia,
  repairHtmlMedia,
  themedPicsumUrl,
} from "@/lib/gafcore-media.shared";
import {
  planImage,
  type ImageModel,
  type ImageRequest,
} from "@/lib/gafcore-image-router.shared";

const HEAD_TIMEOUT_MS = 3500;
const MAX_HEAD_CHECKS = 10;
const MAX_REPLICATE_IMAGES = 2;
const REPLICATE_TIMEOUT_S = 90;

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

/** Versión del modelo Replicate (sin pin → usa última versión publicada por el owner). */
function replicateEndpointFor(model: ImageModel): string {
  const map: Record<ImageModel, string> = {
    "flux-1.1-pro-ultra": "https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro-ultra/predictions",
    "flux-schnell": "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
    "recraft-v3": "https://api.replicate.com/v1/models/recraft-ai/recraft-v3/predictions",
    "recraft-v3-svg": "https://api.replicate.com/v1/models/recraft-ai/recraft-v3-svg/predictions",
    "ideogram-v3-turbo": "https://api.replicate.com/v1/models/ideogram-ai/ideogram-v3-turbo/predictions",
  };
  return map[model];
}

function buildReplicateInput(req: ImageRequest): Record<string, unknown> {
  const base = { prompt: req.prompt };
  switch (req.model) {
    case "flux-1.1-pro-ultra":
      return {
        ...base,
        aspect_ratio: req.aspectRatio,
        output_format: "webp",
        safety_tolerance: 2,
        raw: false,
      };
    case "flux-schnell":
      return {
        ...base,
        aspect_ratio: req.aspectRatio,
        output_format: "webp",
        num_outputs: 1,
        go_fast: true,
      };
    case "recraft-v3":
    case "recraft-v3-svg":
      return {
        ...base,
        size: req.aspectRatio === "1:1" ? "1024x1024" : "1820x1024",
        style: req.style ?? "any",
      };
    case "ideogram-v3-turbo":
      return {
        ...base,
        aspect_ratio: req.aspectRatio,
        resolution: "None",
        style_type: req.style ?? "Auto",
      };
    default:
      return base;
  }
}

/** Llama a Replicate y devuelve la URL de la imagen (o null si falla). */
export async function generateImageWithRouter(req: ImageRequest): Promise<string | null> {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) return null;

  const endpoint = replicateEndpointFor(req.model);
  const input = buildReplicateInput(req);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: `wait=${REPLICATE_TIMEOUT_S}`,
      },
      body: JSON.stringify({ input }),
    });

    if (!res.ok) {
      console.warn("[image-router]", req.model, "HTTP", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return null;
    }

    const json = (await res.json()) as {
      output?: string | string[];
      urls?: { get?: string };
      status?: string;
    };
    const out = json.output;
    if (typeof out === "string" && out.startsWith("https://")) return out;
    if (Array.isArray(out) && typeof out[0] === "string" && out[0].startsWith("https://")) return out[0];
    return null;
  } catch (e) {
    console.warn("[image-router]", req.model, "failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Compat: ruta original Flux Schnell para callers existentes. */
export async function generateReplicateImage(prompt: string): Promise<string | null> {
  return generateImageWithRouter({
    intent: "generic",
    model: "flux-schnell",
    aspectRatio: "16:9",
    prompt: prompt.slice(0, 800),
  });
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
    /genera|crea.*imagen|foto|fotograf|hero.*imagen|ilustraci|mockup|banner|visual\s+premium|logo|icono?s?\b|avatar|producto/i.test(
      instruction,
    );

  let slot = 0;
  for (const url of urls) {
    if (await urlReachable(url)) continue;
    let replacement = themedPicsumUrl(url, instruction, slot++, 800, 600);

    if (wantsGen && replicateUsed < MAX_REPLICATE_IMAGES && process.env.REPLICATE_API_TOKEN?.trim()) {
      const plan = planImage({ instruction, brokenUrl: url });
      const generated = await generateImageWithRouter(plan);
      if (generated) {
        replacement = generated;
        replicateUsed += 1;
        console.info("[image-router] used", plan.model, "for intent", plan.intent);
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
  let files = repairGafcoreProjectMedia(generated, projectFiles, instruction);
  const assetMap = buildAssetUrlMap([...projectFiles, ...files]);
  files = files.map((f) => {
    if (!/\.(html|htm|jsx|tsx|js|css)$/i.test(f.name)) return f;
    let content = repairHtmlMedia(f.content, assetMap);
    content = applyPicsumFallbacksInSource(content, instruction);
    return { ...f, content };
  });
  files = await repairBrokenHttpImages(files, instruction);
  return files;
}
