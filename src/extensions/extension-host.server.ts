import {
  extensionManifestSchema,
  type ExtensionManifest,
  type TemplateExtensionManifest,
} from "@/extensions/manifests.shared";
import type { GafcoreTemplateFile } from "@/lib/gafcore-templates.shared";
import { validateTemplateFiles } from "@/lib/gafcore-templates.shared";

const ALLOWED_PREFIXES = ["src/", "public/"];
const DENIED_FRAGMENTS = ["..", "\\", "node_modules/", "supabase/migrations/", ".env"];

export function extensionsEnabled(): boolean {
  const raw = process.env.GAFCORE_EXTENSIONS_ENABLED?.trim();
  if (raw === "0" || raw === "false") return false;
  return true;
}

export function getMaxExtensionsPerUser(): number {
  const raw = process.env.GAFCORE_MAX_EXTENSIONS_PER_USER?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 20;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 20;
}

export function parseExtensionManifest(raw: unknown): ExtensionManifest {
  return extensionManifestSchema.parse(raw);
}

export function assertTemplatePathsSafe(files: GafcoreTemplateFile[]): void {
  for (const f of files) {
    const name = f.name.replace(/\\/g, "/").replace(/^\.\//, "");
    if (DENIED_FRAGMENTS.some((d) => name.includes(d))) {
      throw new Error(`path_denied:${name}`);
    }
    if (!ALLOWED_PREFIXES.some((p) => name.startsWith(p))) {
      throw new Error(`path_not_allowed:${name}`);
    }
  }
}

export function templateFilesFromManifest(manifest: TemplateExtensionManifest): GafcoreTemplateFile[] {
  assertTemplatePathsSafe(manifest.files);
  const files = validateTemplateFiles(manifest.files);
  if (manifest.requiredPaths?.length) {
    const names = new Set(files.map((f) => f.name.replace(/\\/g, "/")));
    for (const req of manifest.requiredPaths) {
      if (!names.has(req.replace(/\\/g, "/"))) {
        throw new Error(`contract_missing:${req}`);
      }
    }
  }
  return files;
}
