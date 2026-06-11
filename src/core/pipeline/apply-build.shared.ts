/**
 * Pipeline único: servidor entrega deltas curados → cliente solo fusiona, heal y audita.
 * Evita triple shield/finalize que restauraba snapshots y rompía el preview.
 */
import { mergeGeneratedIntoWorkspace, type PipelineFile } from "@/core/pipeline/file-merge.shared";
import { healUntilStable } from "@/core/pipeline/syntax-heal.shared";
import { buildWorkspaceFromGeneration } from "@/core/pipeline/workspace-heal.shared";
import {
  auditProjectLocally,
  hasBlockingValidationIssues,
  type ProjectValidationIssue,
} from "@/lib/gafcore-ai-validation.shared";
import { ensureReactPackageJson } from "@/lib/gafcore-project-scaffold.shared";

export type ApplyBuildMode = "server_delivered" | "local_full";

export type WorkspacePrepareResult = {
  merged: PipelineFile[];
  issues: ProjectValidationIssue[];
  healNotes: string[];
  /** Bloquea setFiles en preview (solo errores syntax/import/build). */
  blocking: boolean;
};

function mapHealedFiles(files: Array<{ name: string; content: string; language?: string }>): PipelineFile[] {
  return files.map((f) => ({
    name: f.name,
    content: f.content,
    language: f.language ?? "typescript",
  }));
}

/**
 * Prepara workspace para preview.
 * - server_delivered: el agente HTTP ya hizo finalize + gate (NO volver a ejecutar shield).
 * - local_full: factory/offline — reparación completa local.
 */
export function prepareWorkspaceForPreview(input: {
  baseFiles: PipelineFile[];
  deliveredFiles: PipelineFile[];
  userInstruction: string;
  mode: ApplyBuildMode;
}): WorkspacePrepareResult {
  if (input.deliveredFiles.length === 0) {
    return {
      merged: input.baseFiles,
      issues: [],
      healNotes: [],
      blocking: false,
    };
  }

  let merged: PipelineFile[];
  if (input.mode === "server_delivered") {
    merged = ensureReactPackageJson(
      mergeGeneratedIntoWorkspace(input.baseFiles, input.deliveredFiles),
    );
  } else {
    const built = buildWorkspaceFromGeneration({
      baseFiles: input.baseFiles,
      generated: input.deliveredFiles,
      userInstruction: input.userInstruction,
    });
    merged = built.merged;
  }

  const healed = healUntilStable(
    merged.map((f) => ({ name: f.name, content: f.content, language: f.language })),
  );
  merged = mapHealedFiles(healed.files);

  const audit = auditProjectLocally(merged);
  const blockingIssues = audit.issues.filter(
    (i) =>
      i.severity === "error" &&
      (i.category === "syntax" || i.category === "import" || i.category === "build"),
  );

  return {
    merged,
    issues: audit.issues,
    healNotes: healed.notes,
    blocking: hasBlockingValidationIssues(blockingIssues),
  };
}
