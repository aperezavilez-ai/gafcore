/** Punto de entrada Vite/React (main.tsx) — no aplicar heal JSX agresivo. */
export function isJsxBootstrapEntry(filename: string): boolean {
  const base = filename.replace(/^.*[/\\]/, "");
  return /^(main|index)\.(tsx|jsx|ts|js)$/i.test(base);
}

/** Quita cierres JSX huérfanos al final de main.tsx (artefacto de auto-heal). */
export function cleanJsxBootstrapEntryContent(content: string): string {
  let out = content.replace(/\r\n/g, "\n");
  for (let i = 0; i < 4; i++) {
    const next = out.replace(/\n[ \t]*<\/([A-Za-z][\w.-]*)>[ \t]*(?=\n|$)/g, "\n");
    if (next === out) break;
    out = next;
  }
  return out.endsWith("\n") ? out : `${out}\n`;
}

export function cleanJsxBootstrapEntryFile<T extends { name: string; content: string }>(
  file: T,
): T {
  if (!isJsxBootstrapEntry(file.name)) return file;
  const content = cleanJsxBootstrapEntryContent(file.content);
  return content === file.content ? file : { ...file, content };
}
