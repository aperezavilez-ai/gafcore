import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { validateGafcoreProjectCore } from "@/lib/gafcore-validate.server";
import type { ProjFile } from "@/lib/gafcore-chat.shared";
import { AGENT_REGISTRY } from "@/agents/registry.shared";
import type { AgentTaskRow } from "@/tasks/types";
import type { FilePatch } from "@/tasks/artifacts.shared";
import { filterFilesByScope } from "@/tasks/scope.shared";
import { runGafcoreChatForUser } from "@/tasks/chat-executor.server";
import { appendTaskLog } from "@/tasks/scheduler.server";

export type TaskExecutionResult = {
  reply: string;
  patches: FilePatch[];
  artifactId?: string;
};

export async function executeAgentTask(opts: {
  task: AgentTaskRow;
  files: ProjFile[];
  workflowInstruction: string;
}): Promise<TaskExecutionResult> {
  const { task, files, workflowInstruction } = opts;
  const scope = (task.file_scope ?? {}) as { allow?: string[]; deny?: string[] };
  const scopedFiles = filterFilesByScope(files, scope);
  const cap = AGENT_REGISTRY[task.agent_type];

  if (task.agent_type === "validation") {
    const merged = scopedFiles.length > 0 ? scopedFiles : files;
    const { ok, issues } = validateGafcoreProjectCore(merged);
    const errors = issues.filter((i) => i.severity === "error");
    const reply = ok
      ? "Validación OK: sin errores bloqueantes."
      : `Validación: ${errors.length} error(es), ${issues.length} aviso(s).`;
    await appendTaskLog(task.id, "validated", reply, ok ? "info" : "warn", {
      issueCount: issues.length,
    });
    return { reply, patches: [] };
  }

  if (task.agent_type === "deployment") {
    const reply =
      "Despliegue: usa el botón **Publicar** en la barra del IDE (GitHub + Vercel). Esta tarea no publica automáticamente en v1.";
    await appendTaskLog(task.id, "deploy_hint", reply);
    return { reply, patches: [] };
  }

  if (task.agent_type === "database") {
    const reply =
      "Migraciones SQL: revisa en Supabase antes de aplicar. No se escriben migraciones automáticamente en v1.";
    await appendTaskLog(task.id, "db_gate", reply, "warn");
    return { reply, patches: [] };
  }

  if (!cap.canWriteFiles && task.agent_type !== "planner") {
    const { reply } = await runGafcoreChatForUser({
      userId: task.user_id,
      projectId: task.project_id,
      instruction: task.instruction,
      files: scopedFiles,
      agentType: task.agent_type,
      workflowGoal: workflowInstruction,
    });
    return { reply, patches: [] };
  }

  const { reply, files: outFiles } = await runGafcoreChatForUser({
    userId: task.user_id,
    projectId: task.project_id,
    instruction: task.instruction,
    files: scopedFiles.length > 0 ? scopedFiles : files,
    agentType: task.agent_type,
    workflowGoal: workflowInstruction,
  });

  const patches: FilePatch[] = outFiles.map((f) => ({
    name: f.name,
    content: f.content,
    language: f.language,
  }));

  return { reply, patches };
}

export async function persistTaskArtifact(
  workflowRunId: string,
  taskId: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<string | undefined> {
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
  const { data, error } = await supabaseAdmin
    .from("gafcore_workflow_artifacts")
    .insert({
      workflow_run_id: workflowRunId,
      task_id: taskId,
      kind,
      content_hash: hash,
      payload_json: payload,
    })
    .select("id")
    .single();
  if (error) {
    console.warn("[executor] artifact:", error.message);
    return undefined;
  }
  return data?.id;
}
