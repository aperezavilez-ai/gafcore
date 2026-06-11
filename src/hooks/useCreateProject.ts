import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { hydrateAuthFromStorage, initAuthOnce } from "@/hooks/useAuth";
import { createGafcoreProject } from "@/lib/gafcore-projects.functions";
import {
  projectCreateErrorMessage,
  type CreateProjectInput,
  type ProjectCreateResult,
} from "@/lib/projects/project-create.shared";

export function useCreateProject() {
  const createFn = useServerFn(createGafcoreProject);
  const [loading, setLoading] = useState(false);

  const createProject = useCallback(
    async (input: CreateProjectInput): Promise<ProjectCreateResult> => {
      setLoading(true);
      try {
        await initAuthOnce();
        try {
          await hydrateAuthFromStorage(4_000);
        } catch {
          /* ignore */
        }
        return await createFn({ data: input });
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
    [createFn],
  );

  return { createProject, loading, projectCreateErrorMessage };
}
