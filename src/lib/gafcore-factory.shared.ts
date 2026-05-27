/**
 * Modo Fábrica GafCore v1 — idea → plan → código → validación → (opcional) mejora de diseño.
 */
export const GAFCORE_FACTORY_CRITIQUE_THRESHOLD = 80;
export const GAFCORE_FACTORY_MAX_WAVES = 12;

export const GAFCORE_FACTORY_PHASES = [
  "planning",
  "generating",
  "validating",
  "design_critique",
  "design_apply",
  "completed",
  "failed",
] as const;

export type GafcoreFactoryPhase = (typeof GAFCORE_FACTORY_PHASES)[number];

export const FACTORY_BUILD_PREFIX =
  "[modo fábrica GafCore] Objetivo: entregar software funcional listo para preview. " +
  "Plan coherente, UI profesional con tokens semánticos, JSX válido (sin objetos como hijos React), iconos lucide reales. ";

export type FactoryFileOut = {
  name: string;
  language?: string;
  content: string;
};

export type FactoryRunResult =
  | {
      ok: true;
      phase: "completed" | "failed";
      pipelineRunId: string | null;
      workflowRunId: string;
      planSummary: string;
      workflowState: string;
      waves: number;
      files: FactoryFileOut[];
      validation: {
        success: boolean;
        overallScore: number;
        status: string;
        issuesCount: number;
      };
      critique?: {
        score: number;
        issuesCount: number;
        followupInstruction?: string;
        skipped?: boolean;
        reason?: string;
      };
      reply: string;
    }
  | {
      ok: false;
      error:
        | "project_not_found"
        | "workflow_limit_reached"
        | "plan_failed"
        | "pipeline_failed"
        | "workflow_empty"
        | "validation_failed";
      active?: number;
      max?: number;
      message?: string;
    };
