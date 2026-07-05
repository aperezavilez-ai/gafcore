import { getGafcoreAiGateway, resolveGatewayModel } from "@/lib/gafcore-ai-gateway.server";
import { completeChatMessageViaWorkflowQueue } from "@/tasks/workflow-ai-queue.server";
import { taskPlanSchema, type TaskPlan } from "@/tasks/artifacts.shared";
import type { ProjFile } from "@/lib/gafcore-chat.shared";
import {
  buildPlannerAgentCatalogPrompt,
  selectProfessionalSkills,
} from "@/agents/registry.shared";

const PLANNER_SYSTEM = `Eres el planificador de GafCore. Divide el trabajo en un DAG pequeño (3-8 tareas) según el pedido del usuario.
Responde SOLO JSON válido con esta forma exacta:
{
  "version": 1,
  "summary": "resumen breve en español",
  "tasks": [
    {
      "id": "t1",
      "agentType": "frontend|backend|validation|documentation|refactor|debug|deployment",
      "title": "título corto",
      "instruction": "qué debe hacer este agente",
      "dependsOn": [],
      "priority": "normal"
    }
  ]
}
Reglas:
- Genera tareas DINÁMICAS según tipo de proyecto (landing, tienda, SaaS, app, etc.).
- Máximo 5 tareas por plan (prioriza lo esencial: UI, lógica, validación, deploy si aplica).
- Incluye etapas de preview/UI primero; validation al final del código.
- Si el usuario menciona publicar, deploy, dominio, GitHub o Vercel, añade tarea "deployment" al final.
- NO incluyas agentType "planner". "database" solo si pide migraciones/Supabase explícito.
- ids únicos (t1, t2, …), sin ciclos en dependsOn.
- Instrucciones concretas por tarea, no copiar el mensaje del usuario entero en cada una.
- Usa el catalogo profesional de agentes y skills cuando el pedido tenga UI, negocio, datos o deploy.`;

function defaultPlan(instruction: string): TaskPlan {
  return {
    version: 1,
    summary: "Plan por defecto: UI y validación",
    tasks: [
      {
        id: "t1",
        agentType: "frontend",
        title: "Implementar cambios",
        instruction,
        dependsOn: [],
        priority: "normal",
      },
      {
        id: "t2",
        agentType: "validation",
        title: "Validar proyecto",
        instruction: "Revisa sintaxis y coherencia del proyecto tras los cambios.",
        dependsOn: ["t1"],
        priority: "high",
      },
    ],
  };
}

export async function generateTaskPlan(
  instruction: string,
  files: ProjFile[],
): Promise<TaskPlan> {
  const names = files.slice(0, 40).map((f) => f.name.replace(/\\/g, "/"));
  const skills = selectProfessionalSkills(instruction);
  const userPrompt = [
    `Pedido del usuario:\n${instruction.slice(0, 4000)}`,
    `\n${buildPlannerAgentCatalogPrompt()}`,
    skills.length > 0
      ? `\nSkills detectadas:\n${skills.map((skill) => `- ${skill.id}: ${skill.label}`).join("\n")}`
      : "",
    names.length > 0 ? `\nArchivos del proyecto (${files.length} total):\n${names.join("\n")}` : "",
  ].join("");

  try {
    const gateway = getGafcoreAiGateway();
    const model = resolveGatewayModel(gateway, { tier: "deep" });
    const { content } = await completeChatMessageViaWorkflowQueue({
      model,
      messages: [
        { role: "system", content: PLANNER_SYSTEM },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      json: true,
    });
    const raw = JSON.parse(content || "{}");
    const parsed = taskPlanSchema.safeParse(raw);
    if (parsed.success) {
      const tasks = parsed.data.tasks.filter((t) => t.agentType !== "planner").slice(0, 5);
      if (tasks.length > 0) {
        return { ...parsed.data, tasks };
      }
    }
  } catch (e) {
    console.warn("[planner] generate failed:", e);
  }
  return defaultPlan(instruction);
}
