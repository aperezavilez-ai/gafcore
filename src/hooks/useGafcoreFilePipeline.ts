import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { FileItem } from "@/components/ide/CodeEditor";
import {
  finalizeWorkspaceFromDelta,
  repairGenerationDelta,
} from "@/core/pipeline/workspace-heal.shared";
import { mergeGeneratedIntoWorkspace } from "@/core/pipeline/file-merge.shared";
import { enrichGafcoreMedia } from "@/lib/enrich-gafcore-media.functions";
import { validateGafcoreSources } from "@/lib/gafcore-validate.functions";
import { logClientWarn, logPipelineEvent, pipelineTraceMeta } from "@/lib/gafcore-client-logger";
import {
  formatValidationForUser,
  type ProjectValidationIssue,
} from "@/lib/gafcore-ai-validation.shared";
import {
  isPreviewAutofixAiEnabled,
  shouldAttemptAiAutofix,
} from "@/lib/gafcore-chat-autofix.shared";

export type ApplyGenerationOptions = {
  runFunctionalAudit: boolean;
  snapshotLabel?: string;
};

export type ApplyGenerationResult = {
  merged: FileItem[];
  issues: ProjectValidationIssue[];
};

type RunProjectValidation = (
  merged: FileItem[],
  options?: { skipOrchestrator?: boolean },
) => Promise<{
  issues: ProjectValidationIssue[];
  patchedFiles?: Array<{ name: string; content: string; language?: string }>;
}>;

/** Persiste árbol completo del workspace (compartido con rollback del IDE). */
export async function persistProjectWorkspaceFiles(
  mergedFiles: FileItem[],
  projectId: string | null | undefined,
  userId: string | undefined,
): Promise<{ ok: boolean; detail?: string }> {
  if (!projectId || !userId || mergedFiles.length === 0) {
    return { ok: false, detail: "no_project" };
  }
  const { saveProjectFilesDetailed } = await import("@/lib/userSupabase");
  const result = await saveProjectFilesDetailed(
    mergedFiles.map((f) => ({
      name: f.name,
      language: f.language ?? "typescript",
      content: f.content,
    })),
    projectId,
  );
  if (!result.ok) {
    logClientWarn("gafcore-persist-merged", {
      reason: result.reason,
      detail: result.detail,
      fileCount: mergedFiles.length,
    });
    toast.error("No se guardaron los archivos en el proyecto", {
      description:
        result.detail ?? result.reason ?? "Revisa la conexión e inténtalo de nuevo.",
      duration: 8000,
    });
  }
  return { ok: result.ok, detail: result.detail ?? result.reason };
}

type UseGafcoreFilePipelineOptions = {
  projectId: string | null | undefined;
  userId: string | undefined;
  activeProjectIdRef: MutableRefObject<string | null | undefined>;
  filesRef: MutableRefObject<FileItem[]>;
  setFiles: Dispatch<SetStateAction<FileItem[]>>;
  onCodeGenerated?: () => void;
  rollbackBaselineRef: MutableRefObject<FileItem[] | null>;
  pipelineRunIdRef: MutableRefObject<string | null>;
  requestEpochRef: MutableRefObject<number>;
  validationAutoRetryUsedRef: MutableRefObject<boolean>;
  scheduleRuntimeAutofixRef: MutableRefObject<(msg: string) => void>;
  runProjectValidation: RunProjectValidation;
  offerGenerationRollback: (reason: string) => void;
  setLastError: Dispatch<SetStateAction<string | null>>;
  persistValidationMemory: (issues: ProjectValidationIssue[], resolved: boolean) => Promise<void>;
};

export function useGafcoreFilePipeline({
  projectId,
  userId,
  activeProjectIdRef,
  filesRef,
  setFiles,
  onCodeGenerated,
  rollbackBaselineRef,
  pipelineRunIdRef,
  requestEpochRef,
  validationAutoRetryUsedRef,
  scheduleRuntimeAutofixRef,
  runProjectValidation,
  offerGenerationRollback,
  setLastError,
  persistValidationMemory,
}: UseGafcoreFilePipelineOptions) {
  const callEnrichMedia = useServerFn(enrichGafcoreMedia);
  const callValidateSources = useServerFn(validateGafcoreSources);

  const persistMergedToProjectDb = useCallback(
    async (mergedFiles: FileItem[]): Promise<{ ok: boolean; detail?: string }> =>
      persistProjectWorkspaceFiles(
        mergedFiles,
        activeProjectIdRef.current ?? projectId,
        userId,
      ),
    [activeProjectIdRef, projectId, userId],
  );

  const mergeGeneratedFiles = useCallback(
    (
      currentFiles: FileItem[],
      generatedFiles: Array<{ name: string; language?: string; content: string }>,
    ): FileItem[] => mergeGeneratedIntoWorkspace(currentFiles, generatedFiles) as FileItem[],
    [],
  );

  const applyGenerationFiles = useCallback(
    async (
      baseFiles: FileItem[],
      generated: Array<{ name: string; language?: string; content: string }>,
      userInstruction: string,
      _userRaw: string,
      options: ApplyGenerationOptions,
    ): Promise<ApplyGenerationResult> => {
      const genProjectId = activeProjectIdRef.current ?? projectId ?? null;
      const resolveActiveProjectId = () => activeProjectIdRef.current ?? projectId ?? null;
      const isStaleProject = () => genProjectId !== resolveActiveProjectId();
      const staleReturn = (): ApplyGenerationResult => ({
        merged: filesRef.current.length > 0 ? filesRef.current : baseFiles,
        issues: [],
      });

      rollbackBaselineRef.current = baseFiles.map((f) => ({
        name: f.name,
        content: f.content,
        language: f.language ?? "typescript",
      }));

      logPipelineEvent(
        "info",
        "apply.start",
        pipelineTraceMeta(
          {
            traceId: requestEpochRef.current,
            projectId: genProjectId,
            phase: "apply",
            pipelineRunId: pipelineRunIdRef.current,
          },
          { deltaCount: generated.length },
        ),
      );

      const snapLabel = options.snapshotLabel?.trim();
      if (
        snapLabel &&
        !snapLabel.toLowerCase().startsWith("auto-fix:") &&
        !snapLabel.toLowerCase().startsWith("auto:")
      ) {
        try {
          const { createSnapshot } = await import("@/lib/userSupabase");
          void createSnapshot(baseFiles, snapLabel, projectId ?? undefined);
        } catch (err) {
          logClientWarn("gafcore-snapshot-before-apply", err);
        }
      }

      const baseProj = baseFiles.map((f) => ({
        name: f.name,
        content: f.content,
        language: f.language,
      }));

      let outFiles = repairGenerationDelta(baseProj, generated, userInstruction);
      try {
        const enriched = await callEnrichMedia({
          data: {
            files: outFiles,
            projectFiles: baseProj,
            instruction: userInstruction,
          },
        });
        if (enriched?.files?.length) outFiles = enriched.files;
      } catch {
        /* reparación local ya aplicada */
      }

      const merged = finalizeWorkspaceFromDelta(baseProj, outFiles, userInstruction).map((f) => ({
        name: f.name,
        content: f.content,
        language: f.language ?? "typescript",
      }));

      if (isStaleProject()) {
        logClientWarn("gafcore-apply-files-stale-project", {
          expected: genProjectId,
          current: resolveActiveProjectId(),
        });
        return staleReturn();
      }

      setFiles(merged);
      filesRef.current = merged;
      queueMicrotask(() => onCodeGenerated?.());

      const toPersist = outFiles.map((o) => merged.find((m) => m.name === o.name) ?? o);
      const persistResult = await persistMergedToProjectDb(merged);
      if (!persistResult.ok) {
        logPipelineEvent(
          "warn",
          "persist.failed",
          pipelineTraceMeta(
            {
              traceId: requestEpochRef.current,
              projectId: genProjectId,
              phase: "persist",
              pipelineRunId: pipelineRunIdRef.current,
            },
            { reason: persistResult.detail ?? "unknown", fileCount: merged.length },
          ),
        );
        offerGenerationRollback("No se guardó en la nube. Puedes deshacer el último cambio.");
      }

      try {
        const v = await callValidateSources({
          data: toPersist.map((f) => ({ name: f.name, content: f.content })),
        });
        if (!v.ok && Array.isArray(v.errors) && v.errors.length > 0) {
          const jsxErrors = v.errors.filter((e) => /\.(tsx|jsx)$/i.test(e.name));
          const otherErrors = v.errors.filter((e) => !/\.(tsx|jsx)$/i.test(e.name));
          if (jsxErrors.length > 0) {
            const sourceErr = jsxErrors.map((e) => `${e.name}: ${e.message}`).join("\n");
            setLastError(sourceErr);
            if (
              isPreviewAutofixAiEnabled() &&
              shouldAttemptAiAutofix(sourceErr) &&
              !validationAutoRetryUsedRef.current
            ) {
              scheduleRuntimeAutofixRef.current(sourceErr);
            }
          } else if (otherErrors.length > 0) {
            toast.message("Aviso en archivos auxiliares (no bloquea el preview).", {
              description: otherErrors[0].message.slice(0, 120),
              duration: 5000,
            });
          }
        }
      } catch (err) {
        logClientWarn("gafcore-validate-sources", err);
        toast.message("No se pudo verificar el código generado. El preview puede tener errores.", {
          duration: 6000,
        });
      }

      let issues: ProjectValidationIssue[] = [];
      let mergedForReturn = merged;
      if (options.runFunctionalAudit) {
        const validation = await runProjectValidation(merged);
        issues = validation.issues;
        if (validation.patchedFiles?.length) {
          mergedForReturn = mergeGeneratedFiles(merged, validation.patchedFiles);
          if (isStaleProject()) {
            logClientWarn("gafcore-apply-files-stale-project", {
              expected: genProjectId,
              current: resolveActiveProjectId(),
              phase: "validation_patch",
            });
            return staleReturn();
          }
          setFiles(mergedForReturn);
          filesRef.current = mergedForReturn;
          queueMicrotask(() => onCodeGenerated?.());
          await persistMergedToProjectDb(mergedForReturn);
        }
        if (issues.length > 0) {
          const blocking = issues.filter((i) => i.severity === "error");
          const warnings = issues.filter((i) => i.severity !== "error");
          if (blocking.length > 0) {
            const text = formatValidationForUser(blocking);
            setLastError((prev) =>
              prev ? `${prev}\n\n[Validación GafCore]\n${text}` : `[Validación GafCore]\n${text}`,
            );
            if (isPreviewAutofixAiEnabled()) scheduleRuntimeAutofixRef.current(text);
          } else if (warnings.length > 0) {
            toast.message("Listo con avisos menores", {
              description: formatValidationForUser(warnings).slice(0, 240),
              duration: 6000,
            });
          }
          if (!pipelineRunIdRef.current) {
            void persistValidationMemory(blocking, false);
          }
        }
      }

      logPipelineEvent(
        "info",
        "apply.done",
        pipelineTraceMeta(
          {
            traceId: requestEpochRef.current,
            projectId: genProjectId,
            phase: "apply",
            pipelineRunId: pipelineRunIdRef.current,
          },
          {
            fileCount: mergedForReturn.length,
            deltaCount: outFiles.length,
            persistOk: persistResult.ok,
            issueCount: issues.length,
            blockingCount: issues.filter((i) => i.severity === "error").length,
          },
        ),
      );
      return { merged: mergedForReturn, issues };
    },
    [
      activeProjectIdRef,
      projectId,
      filesRef,
      rollbackBaselineRef,
      requestEpochRef,
      pipelineRunIdRef,
      setFiles,
      onCodeGenerated,
      callEnrichMedia,
      callValidateSources,
      persistMergedToProjectDb,
      mergeGeneratedFiles,
      runProjectValidation,
      offerGenerationRollback,
      setLastError,
      validationAutoRetryUsedRef,
      scheduleRuntimeAutofixRef,
      persistValidationMemory,
    ],
  );

  return {
    applyGenerationFiles,
    mergeGeneratedFiles,
    persistMergedToProjectDb,
  };
}
