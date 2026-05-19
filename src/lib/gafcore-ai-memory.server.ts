import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  formatMemoryHintsForPrompt,
  type ProjectMemoryRow,
} from "@/lib/gafcore-ai-memory.shared";

/** Carga memoria IA del proyecto para inyectar en el prompt (solo usuario dueño). */
export async function loadProjectMemoryHintsForUser(
  projectId: string,
  userId: string,
): Promise<string> {
  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project?.id) return "";

  const { data: rows, error } = await supabaseAdmin
    .from("project_ai_memory")
    .select("kind, fingerprint, message, solution_hint, hit_count")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("hit_count", { ascending: false })
    .limit(8);

  if (error || !rows?.length) return "";

  const mapped: ProjectMemoryRow[] = rows.map((r) => ({
    kind: r.kind as "error" | "solution",
    fingerprint: r.fingerprint,
    message: r.message,
    solution_hint: r.solution_hint,
    hit_count: r.hit_count ?? 1,
  }));
  return formatMemoryHintsForPrompt(mapped);
}
