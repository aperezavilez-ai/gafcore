import type { FileItem } from "@/components/ide/CodeEditor";

const SKIP_DIR_PARTS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".cache",
  "__pycache__",
  ".venv",
  "venv",
  "coverage",
  ".turbo",
  ".output",
]);

const TEXT_EXT = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "css",
  "scss",
  "less",
  "html",
  "htm",
  "md",
  "mdx",
  "txt",
  "sql",
  "yaml",
  "yml",
  "toml",
  "env",
  "svg",
  "xml",
  "astro",
  "vue",
  "svelte",
  "rs",
  "go",
  "py",
  "rb",
  "php",
  "java",
  "kt",
  "swift",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "sh",
  "bat",
  "ps1",
  "dockerfile",
]);

const MAX_FILES = 500;
const MAX_BYTES = 900_000;

export function inferLanguageFromPath(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  const ext = base.includes(".") ? (base.split(".").pop() ?? "").toLowerCase() : "";
  if (base.toLowerCase() === "dockerfile") return "plaintext";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    css: "css",
    scss: "css",
    less: "css",
    html: "html",
    htm: "html",
    md: "markdown",
    mdx: "markdown",
    sql: "sql",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    svg: "xml",
    xml: "xml",
    vue: "vue",
    svelte: "svelte",
    astro: "astro",
    rs: "rust",
    go: "go",
    py: "python",
    rb: "ruby",
    php: "php",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    h: "c",
    cpp: "cpp",
    hpp: "cpp",
    cs: "csharp",
    sh: "shell",
    bat: "bat",
    ps1: "powershell",
  };
  return map[ext] ?? "plaintext";
}

function shouldSkipPath(rel: string): boolean {
  const norm = rel.replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  return parts.some((p) => SKIP_DIR_PARTS.has(p));
}

/**
 * Lee una selección de carpeta (webkitdirectory) o varios archivos (multiple)
 * y devuelve FileItem listos para guardar en project_files.
 */
/** Nombre sugerido a partir de la primera carpeta del path (p. ej. `mi-app/src/App.tsx` → `mi-app`). */
export function suggestNameFromPaths(paths: string[]): string | null {
  for (const p of paths) {
    const norm = p.replace(/\\/g, "/");
    const parts = norm.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const folder = parts[0]!.trim();
      if (folder && !SKIP_DIR_PARTS.has(folder)) return folder;
    }
  }
  return null;
}

export async function fileItemsFromBrowserFileList(fileList: FileList): Promise<FileItem[]> {
  const out: FileItem[] = [];
  const total = fileList.length;
  for (let i = 0; i < total; i++) {
    if (out.length >= MAX_FILES) break;
    if (i > 0 && i % 25 === 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
    const file = fileList[i] as File & { webkitRelativePath?: string };
    const rel = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
    if (shouldSkipPath(rel)) continue;
    const ext = rel.includes(".") ? (rel.split(".").pop() ?? "").toLowerCase() : "";
    if (!TEXT_EXT.has(ext)) continue;
    if (file.size > MAX_BYTES) continue;
    try {
      const content = await file.text();
      out.push({ name: rel, language: inferLanguageFromPath(rel), content });
    } catch {
      /* binario o no legible */
    }
  }
  return out;
}
