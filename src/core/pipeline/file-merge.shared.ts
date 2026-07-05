/** Fusión incremental de archivos generados sobre el workspace (Fase 6). */
export type PipelineFile = {
  name: string;
  language?: string;
  content: string;
};

export function normalizeWorkspaceFileName(name: string): string {
  const cleaned = name.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+/g, "/");
  if (cleaned.startsWith("src/")) return cleaned.slice(4);
  return cleaned;
}

export function mergeGeneratedIntoWorkspace(
  currentFiles: PipelineFile[],
  generatedFiles: PipelineFile[],
): PipelineFile[] {
  const byName = new Map(
    currentFiles.map((file) => {
      const name = normalizeWorkspaceFileName(file.name);
      return [name, { ...file, name }];
    }),
  );
  for (const file of generatedFiles) {
    const name = normalizeWorkspaceFileName(file.name);
    byName.set(name, {
      name,
      language: file.language ?? byName.get(name)?.language ?? "typescript",
      content: file.content,
    });
  }
  return Array.from(byName.values());
}
