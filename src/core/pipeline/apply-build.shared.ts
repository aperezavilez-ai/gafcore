/**
 * Pipeline único: servidor entrega deltas curados → cliente fusiona, heal y aplica.
 * Nunca bloquea el preview por auditoría heurística de sintaxis (solo transpile real).
 */
import { mergeGeneratedIntoWorkspace, type PipelineFile } from "@/core/pipeline/file-merge.shared";
import { healUntilStable } from "@/core/pipeline/syntax-heal.shared";
import { buildWorkspaceFromGeneration } from "@/core/pipeline/workspace-heal.shared";
import {
  auditProjectLocally,
  type ProjectValidationIssue,
} from "@/lib/gafcore-ai-validation.shared";
import { ensureReactPackageJson } from "@/lib/gafcore-project-scaffold.shared";
import { repairGeneratedSourceFiles } from "@/lib/gafcore-media.shared";

export type ApplyBuildMode = "server_delivered" | "local_full";

export type WorkspacePrepareResult = {
  merged: PipelineFile[];
  issues: ProjectValidationIssue[];
  healNotes: string[];
};

function mapHealedFiles(files: Array<{ name: string; content: string; language?: string }>): PipelineFile[] {
  return files.map((f) => ({
    name: f.name,
    content: f.content,
    language: f.language ?? "typescript",
  }));
}

export function prepareWorkspaceForPreview(input: {
  baseFiles: PipelineFile[];
  deliveredFiles: PipelineFile[];
  userInstruction: string;
  mode: ApplyBuildMode;
}): WorkspacePrepareResult {
  if (input.deliveredFiles.length === 0) {
    return { merged: input.baseFiles, issues: [], healNotes: [] };
  }

  const repaired = repairGeneratedSourceFiles(input.deliveredFiles);

  let merged: PipelineFile[];
  if (input.mode === "server_delivered") {
    merged = ensureReactPackageJson(
      mergeGeneratedIntoWorkspace(input.baseFiles, repaired),
    );
  } else {
    const built = buildWorkspaceFromGeneration({
      baseFiles: input.baseFiles,
      generated: repaired,
      userInstruction: input.userInstruction,
    });
    merged = built.merged;
  }

  const healed = healUntilStable(
    merged.map((f) => ({ name: f.name, content: f.content, language: f.language })),
  );
  merged = mapHealedFiles(healed.files);

  const audit = auditProjectLocally(merged);
  return { merged, issues: audit.issues, healNotes: healed.notes };
}
