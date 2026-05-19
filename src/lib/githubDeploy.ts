import type { FileItem } from "@/components/ide/CodeEditor";

const API = "https://api.github.com";

const DEFAULT_DEV_FILES: FileItem[] = [
  {
    name: "vite.config.ts",
    language: "typescript",
    content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
`,
  },
  {
    name: "tsconfig.json",
    language: "json",
    content: `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": false,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  "exclude": ["node_modules", "dist"]
}
`,
  },
  {
    name: ".gitignore",
    language: "plaintext",
    content: `node_modules
dist
.env
.DS_Store
`,
  },
  {
    name: "index.html",
    language: "html",
    content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GafCore Export</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
`,
  },
];

function normalizeName(name: string) {
  return name.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function githubPath(path: string) {
  return normalizeName(path).split("/").map(encodeURIComponent).join("/");
}

function packageNameFromSpecifier(spec: string) {
  if (spec.startsWith(".") || spec.startsWith("/") || /^[a-z]+:/i.test(spec)) return null;
  if (spec === "react-dom/client") return "react-dom";
  if (spec.startsWith("react/")) return "react";
  if (spec.startsWith("@")) return spec.split("/").slice(0, 2).join("/");
  return spec.split("/")[0];
}

function collectDependencies(files: FileItem[]) {
  const deps = new Set(["react", "react-dom"]);
  const importRegex = /(?:import|export)[\s\S]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g;
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

function packageJson(files: FileItem[]) {
  return JSON.stringify(
    {
      name: "gafcore-export",
      private: true,
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: "vite --host 0.0.0.0",
        build: "vite build",
        preview: "vite preview --host 0.0.0.0",
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

function withDeployScaffold(files: FileItem[]) {
  const byName = new Map<string, FileItem>();
  for (const file of files) {
    const name = normalizeName(file.name);
    if (name) byName.set(name, { ...file, name });
  }
  if (!byName.has("package.json")) {
    byName.set("package.json", { name: "package.json", language: "json", content: packageJson(files) });
  }
  for (const file of DEFAULT_DEV_FILES) {
    if (!byName.has(file.name)) byName.set(file.name, file);
  }
  return [...byName.values()];
}

function b64(s: string) {
  // UTF-8 safe base64
  return btoa(unescape(encodeURIComponent(s)));
}

async function gh(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  return res;
}

async function ensureGithubBranch(
  token: string,
  repo: string,
  branch: string,
): Promise<{ ok: boolean; message: string }> {
  const branchRes = await gh(token, `/repos/${repo}/branches/${encodeURIComponent(branch)}`);
  if (branchRes.ok) return { ok: true, message: "ok" };

  const repoRes = await gh(token, `/repos/${repo}`);
  if (!repoRes.ok) {
    return {
      ok: false,
      message: `No se encontró el repositorio ${repo}. Conecta GitHub y vuelve a publicar.`,
    };
  }

  const readmePath = githubPath("README.md");
  const initRes = await gh(token, `/repos/${repo}/contents/${readmePath}`, {
    method: "PUT",
    body: JSON.stringify({
      message: "chore: inicializar rama desde GafCore",
      content: b64("# Sitio publicado con GafCore\n"),
      branch,
    }),
  });
  if (!initRes.ok) {
    const t = await initRes.text();
    return {
      ok: false,
      message: `No se encontró \`${repo}@${branch}\`. Verifica el repo y la rama. ${t.slice(0, 100)}`,
    };
  }
  return { ok: true, message: "rama creada" };
}

export async function deployToGithub(
  files: FileItem[],
  opts: { token: string; repo: string; branch: string },
): Promise<{ ok: boolean; message: string }> {
  const { token, repo, branch } = opts;
  if (!token || !repo) return { ok: false, message: "Falta token o repo (owner/repo)" };

  const branchReady = await ensureGithubBranch(token, repo, branch);
  if (!branchReady.ok) return { ok: false, message: branchReady.message };

  const deployFiles = withDeployScaffold(files);

  // For each file: get current sha (if any), then PUT contents
  let updated = 0;
  const errors: string[] = [];
  for (const f of deployFiles) {
    const path = githubPath(f.name);
    let sha: string | undefined;
    const getRes = await gh(token, `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
    if (getRes.ok) {
      const j = await getRes.json();
      sha = j.sha;
    } else if (getRes.status !== 404) {
      const t = await getRes.text();
      errors.push(`GET ${f.name}: ${getRes.status} ${t}`);
      continue;
    }
    const putRes = await gh(token, `/repos/${repo}/contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `chore: update ${f.name} via GafCore`,
        content: b64(f.content),
        branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!putRes.ok) {
      const t = await putRes.text();
      errors.push(`PUT ${f.name}: ${putRes.status} ${t}`);
    } else {
      updated++;
    }
  }
  if (errors.length) {
    return { ok: updated > 0, message: `${updated} subidos, ${errors.length} errores. ${errors[0]}` };
  }
  return { ok: true, message: `${updated} archivos del proyecto subidos a ${repo}@${branch}` };
}
