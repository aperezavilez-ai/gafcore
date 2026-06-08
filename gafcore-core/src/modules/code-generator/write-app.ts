import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GeneratedApp } from "./types";

export async function writeGeneratedApp(
  app: GeneratedApp,
  baseDir: string,
): Promise<string> {
  const root = join(baseDir, app.rootDir);
  for (const file of app.files) {
    const full = join(root, file.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, file.content, "utf8");
  }
  return root;
}
