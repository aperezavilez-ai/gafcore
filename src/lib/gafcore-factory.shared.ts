/**
 * Modo Fábrica GafCore — idea → plan → código → validación → build smoke → diseño → (opcional) deploy.
 */
export const GAFCORE_FACTORY_CRITIQUE_THRESHOLD = 80;
export const GAFCORE_FACTORY_MAX_WAVES = 12;

export const GAFCORE_FACTORY_PHASES = [
  "planning",
  "generating",
  "validating",
  "build_smoke",
  "design_critique",
  "design_apply",
  "deploy",
  "completed",
  "failed",
] as const;

export type GafcoreFactoryPhase = (typeof GAFCORE_FACTORY_PHASES)[number];

export const FACTORY_BUILD_PREFIX =
  "[modo fábrica GafCore] Objetivo: entregar software funcional listo para preview y publicación. " +
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
      buildSmoke: {
        ok: boolean;
        message: string;
        entryFiles: string[];
      };
      critique?: {
        score: number;
        issuesCount: number;
        followupInstruction?: string;
        skipped?: boolean;
        reason?: string;
      };
      deploy?: {
        attempted: boolean;
        ok: boolean;
        message: string;
        siteHost?: string;
      };
      templateProfile?: {
        id: string;
        label: string;
        slug: string;
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
        | "validation_failed"
        | "build_smoke_failed"
        | "deploy_failed";
      active?: number;
      max?: number;
      message?: string;
    };
