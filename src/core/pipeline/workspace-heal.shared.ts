import {
  repairGeneratedSourceFiles,
  repairGafcoreProjectMedia,
  sanitizeProjectJsxFiles,
} from "@/lib/gafcore-media.shared";
import { ensureReactPackageJson } from "@/lib/gafcore-project-scaffold.shared";
import {
  cleanJsxBootstrapEntryFile,
  isJsxBootstrapEntry,
} from "@/lib/gafcore-jsx-bootstrap.shared";
import {
  createCodeSnapshot,
  validateAndHealBeforePreview,
} from "@/lib/gafcore-incremental-edit.shared";
import { runIntegrityShield } from "@/lib/gafcore-integrity-shield.shared";
import { mergeGeneratedIntoWorkspace, type PipelineFile } from "@/core/pipeline/file-merge.shared";
import { healUntilStable, healWorkspaceSyntax } from "@/core/pipeline/syntax-heal.shared";

export type WorkspaceBuildResult = {
  merged: PipelineFile[];
  deltaFiles: PipelineFile[];
};

/** Sanea + autocorrige JSX al cargar proyecto desde Supabase (refresh del IDE). */
export function prepareLoadedProjectFiles<T extends { name: string; content: string; language?: string }>(
  files: T[],
): T[] {
  const sanitized = sanitizeProjectJsxFiles(files).map((file) => {
    if (!/\.(tsx|jsx)$/i.test(file.name)) return file;
    return { ...file, content: repairPersistedRootCloserArtifact(file.content) };
  });
  const healed = healUntilStable(sanitized);
  return ensureReactPackageJson(healed.files);
}

function repairPersistedRootCloserArtifact(source: string): string {
  const root = source.match(/return\s*\(\s*<([A-Za-z][\w.-]*)\b/);
  const rootTag = root?.[1];
  if (!rootTag) return source;
  const closeRootThenExtraDiv = new RegExp(`</${rootTag}>\\s*</div>(\\s*\\);)`, "m");
  return source.replace(closeRootThenExtraDiv, `</${rootTag}>$1`);
}

/** Plantilla nueva o recién creada: sin heal agresivo (evita romper welcome con Tailwind `/`). */
export function prepareFreshProjectFiles<T extends { name: string; content: string; language?: string }>(
  files: T[],
): T[] {
  const cleaned = files.map((f) => cleanJsxBootstrapEntryFile(f));
  return ensureReactPackageJson(
    cleaned.map((f) => ({ ...f, content: f.content })),
  );
}

/** Repara el delta IA (media + sintaxis) sin fusionar aún. */
export function repairGenerationDelta(
  baseFiles: PipelineFile[],
  generated: PipelineFile[],
  userInstruction: string,
): PipelineFile[] {
  return repairGafcoreProjectMedia(
    repairGeneratedSourceFiles(generated),
    baseFiles.map((f) => ({ name: f.name, content: f.content, language: f.language })),
    userInstruction,
  );
}

/** Fusiona delta reparado, sanea JSX y aplica heal + integrity shield. */
export function finalizeWorkspaceFromDelta(
  baseFiles: PipelineFile[],
  deltaFiles: PipelineFile[],
  userInstruction: string,
): PipelineFile[] {
  let merged = ensureReactPackageJson(
    sanitizeProjectJsxFiles(mergeGeneratedIntoWorkspace(baseFiles, deltaFiles)),
  );
  const snapshot = createCodeSnapshot(
    baseFiles.map((f) => ({
      name: f.name,
      content: f.content,
      language: f.language,
    })),
  );
  const baselineProj = baseFiles.map((f) => ({
    name: f.name,
    content: f.content,
    language: f.language,
  }));
  const mergedProj = merged.map((f) => ({
    name: f.name,
    content: f.content,
    language: f.language,
  }));
  const heal = validateAndHealBeforePreview(baselineProj, mergedProj, snapshot);
  const shield = runIntegrityShield(baselineProj, heal.files, snapshot, {
    deltaPaths: deltaFiles.map((f) => f.name),
    instruction: userInstruction,
  });
  const syntaxHeal = healWorkspaceSyntax(
    shield.files.map((f) => ({
      name: f.name,
      content: f.content,
      language: f.language,
    })),
  );
  return syntaxHeal.files.map((f) => ({
    name: f.name,
    content: f.content,
    language: f.language ?? "typescript",
  }));
}

export function buildWorkspaceFromGeneration(params: {
  baseFiles: PipelineFile[];
  generated: PipelineFile[];
  userInstruction: string;
}): WorkspaceBuildResult {
  const deltaFiles = repairGenerationDelta(
    params.baseFiles,
    params.generated,
    params.userInstruction,
  );
  const merged = finalizeWorkspaceFromDelta(
    params.baseFiles,
    deltaFiles,
    params.userInstruction,
  );
  return { merged, deltaFiles };
}
