import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  solutionHintFromIssues,
  validationFingerprint,
  type ProjectMemoryRow,
} from "@/lib/gafcore-ai-memory.shared";
import type { ProjectValidationIssue } from "@/lib/gafcore-ai-validation.shared";

const issueSchema = z.object({
  severity: z.enum(["error", "warn"]),
  category: z.enum(["syntax", "import", "build", "functional"]),
  file: z.string(),
  message: z.string(),
});

const recordSchema = z.object({
  projectId: z.string().uuid(),
  issues: z.array(issueSchema).max(20),
  resolved: z.boolean().optional(),
});

export const recordProjectAiMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => recordSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId!;
    const sb = context.supabase!;

    const { data: project } = await sb
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project?.id) return { ok: false };

    for (const issue of data.issues) {
      const fp = validationFingerprint(issue as ProjectValidationIssue);
      if (data.resolved) {
        const hint = solutionHintFromIssues([issue as ProjectValidationIssue]);
        await sb.from("project_ai_memory").upsert(
          {
            project_id: data.projectId,
            user_id: userId,
            kind: "solution",
            fingerprint: fp,
            message: issue.message.slice(0, 500),
            solution_hint: hint.slice(0, 800),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id,kind,fingerprint" },
        );
      } else if (issue.severity === "error") {
        const { data: existing } = await sb
          .from("project_ai_memory")
          .select("hit_count")
          .eq("project_id", data.projectId)
          .eq("kind", "error")
          .eq("fingerprint", fp)
          .maybeSingle();
        await sb.from("project_ai_memory").upsert(
          {
            project_id: data.projectId,
            user_id: userId,
            kind: "error",
            fingerprint: fp,
            message: issue.message.slice(0, 500),
            solution_hint: null,
            hit_count: (existing?.hit_count ?? 0) + 1,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id,kind,fingerprint" },
        );
      }
    }
    return { ok: true };
  });

export const getProjectAiMemoryHints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase!;
    const { data: rows, error } = await sb
      .from("project_ai_memory")
      .select("kind, fingerprint, message, solution_hint, hit_count")
      .eq("project_id", data.projectId)
      .order("hit_count", { ascending: false })
      .limit(8);

    if (error) {
      console.error("[memory] load:", error);
      return { rows: [] as ProjectMemoryRow[] };
    }

    return {
      rows: (rows ?? []).map((r) => ({
        kind: r.kind as "error" | "solution",
        fingerprint: r.fingerprint,
        message: r.message,
        solution_hint: r.solution_hint,
        hit_count: r.hit_count ?? 1,
      })),
    };
  });
