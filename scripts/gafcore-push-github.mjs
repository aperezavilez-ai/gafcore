#!/usr/bin/env node
/**
 * Sube los cambios de esta carpeta (Cursor) a GitHub para que Vercel construya de nuevo.
 * Uso: npm run gafcore:push -- "mensaje del commit"
 *      bun run gafcore:push -- "mensaje del commit"
 *
 * No sube .env (está en .gitignore). Requiere git configurado y push permitido a origin.
 */
import { execSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shell = process.platform === "win32";

function sh(cmd) {
  execSync(cmd, { cwd: root, stdio: "inherit", shell });
}

try {
  execSync("git rev-parse --is-inside-work-tree", { cwd: root, stdio: "pipe", shell });
} catch {
  console.error("Esta carpeta no es un repositorio git.");
  process.exit(1);
}

const msg = process.argv.slice(2).join(" ").trim() || "chore: sync desde Cursor";

sh("git add -A");

let hasStaged = false;
try {
  execSync("git diff --cached --quiet", { cwd: root, stdio: "ignore", shell });
} catch {
  hasStaged = true;
}

if (hasStaged) {
  execFileSync("git", ["commit", "-m", msg], { cwd: root, stdio: "inherit" });
} else {
  console.log("(Sin cambios nuevos para commitear; intentando push por si quedaban commits locales)");
}

try {
  sh("git push origin HEAD");
} catch {
  console.error("\nEl push falló. Revisa: inicio de sesión en GitHub, rama protegida, o red.");
  process.exit(1);
}

console.log(
  "\nHecho. Si Vercel está enlazado a este repo, debería aparecer un deploy nuevo en ~1–3 min.",
);
