import { z } from "zod";
import type { AgentType } from "@/tasks/types";

export const filePatchSchema = z.object({
  name: z.string(),
  content: z.string(),
  language: z.string().optional(),
});

export const taskPlanItemSchema = z.object({
  id: z.string(),
  agentType: z.enum([
    "planner",
    "frontend",
    "backend",
    "database",
    "validation",
    "deployment",
    "documentation",
    "refactor",
    "debug",
  ]),
  title: z.string(),
  instruction: z.string(),
  priority: z.enum(["critical", "high", "normal", "low"]).optional(),
  dependsOn: z.array(z.string()).default([]),
  fileScope: z
    .object({
      allow: z.array(z.string()).optional(),
      deny: z.array(z.string()).optional(),
    })
    .optional(),
});

export const taskPlanSchema = z.object({
  version: z.literal(1),
  summary: z.string(),
  tasks: z.array(taskPlanItemSchema).min(1).max(24),
});

export type TaskPlan = z.infer<typeof taskPlanSchema>;
export type TaskPlanItem = z.infer<typeof taskPlanItemSchema>;
export type FilePatch = z.infer<typeof filePatchSchema>;

export const filePatchSetSchema = z.object({
  version: z.literal(1),
  patches: z.array(filePatchSchema),
  agentType: z.string().optional(),
});

export type FilePatchSet = z.infer<typeof filePatchSetSchema>;

export function agentTypeLabel(t: AgentType): string {
  const map: Record<AgentType, string> = {
    planner: "Planificador",
    frontend: "Frontend",
    backend: "Backend",
    database: "Base de datos",
    validation: "Validación",
    deployment: "Despliegue",
    documentation: "Documentación",
    refactor: "Refactor",
    debug: "Depuración",
  };
  return map[t] ?? t;
}
