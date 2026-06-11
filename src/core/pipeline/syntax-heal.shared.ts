import { auditJsxTagBalance } from "@/lib/gafcore-incremental-edit.shared";
import {
  auditSyntaxClosure,
  autoFixSyntaxClosure,
} from "@/lib/gafcore-integrity-shield.shared";

export type SyntaxHealableFile = { name: string; content: string; language?: string };

export type WorkspaceSyntaxHealResult<T extends SyntaxHealableFile> = {
  files: T[];
  healed: boolean;
  notes: string[];
};

function fileNeedsSyntaxHeal(content: string): boolean {
  const closure = auditSyntaxClosure(content);
  if (!closure.ok) return true;
  return auditJsxTagBalance(content) !== 0;
}

/** Autocorrige llaves/JSX en archivos fuente antes de validar o mostrar preview. */
export function healWorkspaceSyntax<T extends SyntaxHealableFile>(
  files: T[],
): WorkspaceSyntaxHealResult<T> {
  const notes: string[] = [];
  let healed = false;

  const out = files.map((f) => {
    if (!/\.(tsx|jsx|ts)$/i.test(f.name)) return f;
    if (!fileNeedsSyntaxHeal(f.content)) return f;

    const fixed = autoFixSyntaxClosure(f.content);
    if (fixed.fixes.length === 0) return f;

    const after = auditSyntaxClosure(fixed.content);
    const tagOk = auditJsxTagBalance(fixed.content) === 0;
    if (!after.ok && !tagOk) return f;

    healed = true;
    notes.push(`${f.name}: ${fixed.fixes.join("; ")}`);
    return { ...f, content: fixed.content };
  });

  return { files: out, healed, notes };
}
