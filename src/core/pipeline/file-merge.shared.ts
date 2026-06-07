/** Fusión incremental de archivos generados sobre el workspace (Fase 6). */
export type PipelineFile = {
  name: string;
  language?: string;
  content: string;
};

export function mergeGeneratedIntoWorkspace(
  currentFiles: PipelineFile[],
  generatedFiles: PipelineFile[],
): PipelineFile[] {
  const byName = new Map(currentFiles.map((file) => [file.name, file]));
  for (const file of generatedFiles) {
    byName.set(file.name, {
      name: file.name,
      language: file.language ?? byName.get(file.name)?.language ?? "typescript",
      content: file.content,
    });
  }
  return Array.from(byName.values());
}
