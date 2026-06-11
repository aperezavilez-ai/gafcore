import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { hydrateAuthFromStorage, initAuthOnce } from "@/hooks/useAuth";
import { saveGafcoreProjectFiles } from "@/lib/gafcore-projects.functions";
import {
  projectSaveErrorMessage,
  type ProjectSaveResult,
  type SaveProjectFilesInput,
} from "@/lib/projects/project-save.shared";

export function useSaveProjectFiles() {
  const saveFn = useServerFn(saveGafcoreProjectFiles);
  const [loading, setLoading] = useState(false);

  const saveProjectFiles = useCallback(
    async (input: SaveProjectFilesInput): Promise<ProjectSaveResult> => {
      setLoading(true);
      try {
        await initAuthOnce();
        try {
          await hydrateAuthFromStorage(3_000);
        } catch {
          /* ignore */
        }
        return await saveFn({ data: input });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Error de red o sesión";
        return {
          ok: false,
          code: "UNKNOWN",
          error: message,
          requestId: "client",
          retryable: true,
        };
      } finally {
        setLoading(false);
      }
    },
    [saveFn],
  );

  return { saveProjectFiles, loading, projectSaveErrorMessage };
}
