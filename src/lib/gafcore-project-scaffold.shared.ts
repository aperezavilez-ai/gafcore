/** Scaffold mínimo para proyectos React del IDE (preview + validación). */

export type ScaffoldFile = { name: string; language?: string; content: string };

function packageNameFromSpecifier(spec: string): string | null {
  if (spec.startsWith(".") || spec.startsWith("/") || /^[a-z]+:/i.test(spec)) return null;
  if (spec === "react-dom/client") return "react-dom";
  if (spec.startsWith("react/")) return "react";
  if (spec.startsWith("@")) return spec.split("/").slice(0, 2).join("/");
  return spec.split("/")[0];
}

function collectDependencies(files: ScaffoldFile[]): Record<string, string> {
  const deps = new Set(["react", "react-dom"]);
  const importRegex =
    /(?:import|export)[\s\S]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g;
  for (const file of files) {
    if (!/\.(tsx?|jsx?|mjs)$/i.test(file.name)) continue;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(file.content))) {
      const dep = packageNameFromSpecifier(match[1] || match[2] || match[3] || "");
      if (dep) deps.add(dep);
    }
  }
  return Object.fromEntries([...deps].sort().map((dep) => [dep, "latest"]));
}

function buildPackageJsonContent(files: ScaffoldFile[]): string {
  return JSON.stringify(
    {
      name: "gafcore-project",
      private: true,
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
      },
      dependencies: collectDependencies(files),
      devDependencies: {
        "@types/react": "^18.3.3",
        "@types/react-dom": "^18.3.0",
        "@vitejs/plugin-react": "^4.3.1",
        typescript: "^5.5.3",
        vite: "^5.4.1",
      },
    },
    null,
    2,
  );
}

/** Añade package.json si el proyecto tiene JSX/TSX y aún no lo tiene. */
export function ensureReactPackageJson<T extends ScaffoldFile>(files: T[]): T[] {
  const hasJsx = files.some((f) => /\.(tsx|jsx)$/i.test(f.name));
  if (!hasJsx) return files;
  if (files.some((f) => f.name.replace(/\\/g, "/") === "package.json")) return files;
  const pkg = {
    name: "package.json",
    language: "json",
    content: buildPackageJsonContent(files),
  } as T;
  return [...files, pkg];
}
