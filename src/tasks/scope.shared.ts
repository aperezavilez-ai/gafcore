import type { FileScope } from "@/tasks/types";
import type { ProjFile } from "@/lib/gafcore-chat.shared";

function matchGlob(path: string, pattern: string): boolean {
  const p = path.replace(/\\/g, "/");
  if (pattern === "**") return true;
  if (pattern.endsWith("/**")) {
    const base = pattern.slice(0, -3);
    return p === base || p.startsWith(`${base}/`);
  }
  const re = new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*")}$`,
  );
  return re.test(p);
}

export function filterFilesByScope(files: ProjFile[], scope: FileScope): ProjFile[] {
  const deny = scope.deny ?? [];
  const allow = scope.allow ?? [];
  return files.filter((f) => {
    const p = f.name.replace(/\\/g, "/");
    if (deny.some((d) => matchGlob(p, d))) return false;
    if (allow.length === 0) return true;
    return allow.some((a) => matchGlob(p, a));
  });
}
