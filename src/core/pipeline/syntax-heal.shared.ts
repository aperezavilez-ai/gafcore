import { repairCommonJsxSyntaxErrors } from "@/lib/gafcore-media.shared";
import {
  auditSyntaxClosure,
  autoFixSyntaxClosure,
} from "@/lib/gafcore-integrity-shield.shared";
import { isJsxBootstrapEntry } from "@/lib/gafcore-jsx-bootstrap.shared";

export type SyntaxHealableFile = { name: string; content: string; language?: string };

export type WorkspaceSyntaxHealResult<T extends SyntaxHealableFile> = {
  files: T[];
  healed: boolean;
  notes: string[];
};

function fileNeedsSyntaxHeal(content: string): boolean {
  const closure = auditSyntaxClosure(content);
  return closure.braceDelta !== 0 || closure.parenDelta !== 0;
}

function healFileContent(content: string): { content: string; notes: string[] } {
  const notes: string[] = [];
  let out = repairCommonJsxSyntaxErrors(content);
  if (out !== content) notes.push("reparación JSX común");

  if (!fileNeedsSyntaxHeal(out)) {
    return { content: out, notes };
  }

  const fixed = autoFixSyntaxClosure(out);
  if (fixed.fixes.length > 0) {
    out = fixed.content;
    notes.push(...fixed.fixes);
  }

  return { content: out, notes };
}

/** Autocorrige llaves/JSX en archivos fuente antes de validar o mostrar preview. */
export function healWorkspaceSyntax<T extends SyntaxHealableFile>(
  files: T[],
): WorkspaceSyntaxHealResult<T> {
  const notes: string[] = [];
  let healed = false;

  const out = files.map((f) => {
    if (!/\.(tsx|jsx|ts)$/i.test(f.name)) return f;
    if (isJsxBootstrapEntry(f.name)) return f;
    const { content, notes: fileNotes } = healFileContent(f.content);
    if (content === f.content) return f;
    healed = true;
    notes.push(`${f.name}: ${fileNotes.join("; ")}`);
    return { ...f, content };
  });

  return { files: out, healed, notes };
}

/** Repite heal hasta estabilizar o alcanzar maxPasses. */
export function healUntilStable<T extends SyntaxHealableFile>(
  files: T[],
  maxPasses = 8,
): WorkspaceSyntaxHealResult<T> {
  let current = files;
  const notes: string[] = [];
  let healed = false;

  for (let pass = 0; pass < maxPasses; pass++) {
    const round = healWorkspaceSyntax(current);
    if (!round.healed) break;
    healed = true;
    notes.push(...round.notes);
    current = round.files;
  }

  return { files: current, healed, notes };
}
