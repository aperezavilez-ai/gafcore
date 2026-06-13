import { auditJsxTagBalance } from "@/lib/gafcore-incremental-edit.shared";
import { auditSyntaxClosure } from "@/lib/gafcore-integrity-shield.shared";
import { isGafcoreDefaultTemplateApp } from "@/lib/gafcore-project-stale.shared";
import { getFreshDefaultProjectFiles } from "@/lib/gafcore-templates.shared";

export type WelcomeFile = { name: string; content: string; language?: string };

/** Proyecto plantilla welcome (incluye welcome corrupto parcial). */
export function isWelcomeWorkspace(
  files: Array<{ name: string; content: string }> | null | undefined,
): boolean {
  if (!files?.length) return false;
  const app = files.find((f) => /^app\.(jsx?|tsx?)$/i.test(f.name));
  if (!app?.content?.trim()) return false;
  if (isGafcoreDefaultTemplateApp(app.content)) return true;
  return (
    /gafcore-logo\.png/i.test(app.content) &&
    /Empieza escribiendo en el chat/i.test(app.content)
  );
}

function welcomeAppIsTranspileSafe(content: string): boolean {
  const closure = auditSyntaxClosure(content);
  return closure.ok && auditJsxTagBalance(content) === 0;
}

/** Devuelve archivos welcome válidos (pristine si el workspace está corrupto). */
export function resolveWelcomeWorkspaceFiles<T extends WelcomeFile>(files: T[]): T[] {
  if (!isWelcomeWorkspace(files)) return files;
  const app = files.find((f) => /^app\.(jsx?|tsx?)$/i.test(f.name));
  if (app && welcomeAppIsTranspileSafe(app.content)) return files;

  const fresh = getFreshDefaultProjectFiles();
  const byName = new Map(files.map((f) => [f.name, f]));
  return fresh.map((f) => {
    const prev = byName.get(f.name);
    return {
      name: f.name,
      content: f.content,
      language: prev?.language ?? f.language ?? "typescript",
    } as T;
  });
}

/** Plantilla welcome lista para editor/preview — sin pasar por auto-heal. */
export function createWelcomeProjectFiles<T extends WelcomeFile>(): T[] {
  return getFreshDefaultProjectFiles().map(
    (f) =>
      ({
        name: f.name,
        content: f.content,
        language: f.language ?? "typescript",
      }) as T,
  );
}
