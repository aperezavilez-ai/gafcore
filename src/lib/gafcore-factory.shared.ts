/**
 * Modo Fábrica GafCore — idea → plan → código → validación → build smoke → diseño → (opcional) deploy.
 */
export const GAFCORE_FACTORY_CRITIQUE_THRESHOLD = 90;
export const GAFCORE_FACTORY_MAX_WAVES = 12;
/** Por debajo de este % en una fase (mín. 3 muestras) se muestra alerta en admin. */
export const GAFCORE_FACTORY_PHASE_ALERT_THRESHOLD = 70;
export const GAFCORE_FACTORY_GLOBAL_ALERT_THRESHOLD = 55;
export const GAFCORE_FACTORY_ALERT_MIN_SAMPLES = 3;

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
  "[modo fábrica GafCore] Objetivo: entregar software funcional listo para preview y publicación con calidad visual premium. " +
  "Plan coherente, UI profesional con tokens semánticos, JSX válido (sin objetos como hijos React), iconos lucide reales, " +
  "jerarquía tipográfica clara, spacing consistente (8px grid), estados hover/focus, contraste correcto y mobile-first real. " +
  "Evita look genérico tipo placeholder/PowerPoint: NO usar imágenes de stock genéricas por defecto, NO hero vacío, NO bloques planos sin profundidad.";

export type FactoryFileOut = {
  name: string;
  language?: string;
  content: string;
};

/** Respuesta inmediata cuando el run pesado sigue en segundo plano (Vercel). */
export type FactoryRunStarted = {
  ok: true;
  async: true;
  pipelineRunId: string;
  workflowRunId: string;
  planSummary: string;
  templateProfile: {
    id: string;
    label: string;
    slug: string;
  };
  message: string;
};

export type FactoryRunOutcome = FactoryRunResult | FactoryRunStarted;

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
