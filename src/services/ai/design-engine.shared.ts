/**
 * Motor de Diseño — detección de tarea e inyección de prompts (cliente/servidor).
 */
import { MODERN_SAAS_BLUEPRINT_PROMPT_HINT } from "@/services/ai/blueprints/modernSaaS";
import { FULL_DESIGN_MOTOR_PROMPT } from "@/services/ai/systemPrompts";
import type { AiBrainTaskKind } from "@/services/ai/types.shared";

const DESIGN_MOTOR_TASKS: ReadonlySet<AiBrainTaskKind> = new Set(["design", "frontend"]);

export function isDesignMotorTask(task: AiBrainTaskKind): boolean {
  return DESIGN_MOTOR_TASKS.has(task);
}

const DESIGN_KEYWORDS =
  /dise[ñn]o|dise[ñn]a|ui\/ux|\bux\b|landing|hero|maqueta|wireframe|glassmorphism|\bglass\b|estética|estetica|alta\s*fidelidad|pixel\s*perfect|mockup|figma|bento|galer[ií]a|premium|branding|navbar|footer|tipograf|jerarqu[ií]a visual/i;

const FRONTEND_KEYWORDS =
  /\bfrontend\b|interfaz de usuario|interfaz web|componente react|componentes react|tailwind|shadcn|ui kit|p[aá]gina web|dashboard ui|panel de control/i;

const VISUAL_BUILD_KEYWORDS =
  /p[aá]gina|landing|componente|layout|secci[oó]n|tailwind|responsive|cta\b|collage|portfolio|showcase/i;

/**
 * Infiere tarea del cerebro a partir de la instrucción del usuario (chat IDE).
 */
export function inferAiBrainTaskFromInstruction(instruction: string): AiBrainTaskKind | null {
  const t = instruction.trim();
  if (!t) return null;
  if (DESIGN_KEYWORDS.test(t)) return "design";
  if (FRONTEND_KEYWORDS.test(t)) return "frontend";
  if (VISUAL_BUILD_KEYWORDS.test(t) && !/refactor|bug|error|typescript|eslint|migraci/i.test(t)) {
    return "design";
  }
  return null;
}

/**
 * Texto a anexar al system prompt cuando la tarea es design o frontend.
 */
export function buildDesignMotorPromptAppend(
  task: AiBrainTaskKind | null,
  instruction?: string,
): string {
  const resolved = task ?? (instruction ? inferAiBrainTaskFromInstruction(instruction) : null);
  if (!resolved || !isDesignMotorTask(resolved)) return "";
  return `${FULL_DESIGN_MOTOR_PROMPT}\n${MODERN_SAAS_BLUEPRINT_PROMPT_HINT}\n`;
}
