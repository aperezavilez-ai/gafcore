import type { ProjectDeployStatus } from "@/lib/gafcore-deploy.shared";
import { isGafcoreDefaultTemplateApp } from "@/lib/gafcore-project-stale.shared";

export type GafcoreJourneyPhaseId =
  | "idea"
  | "building"
  | "validating"
  | "ready"
  | "published"
  | "issue";

export const GAFCORE_JOURNEY_STEPS = [
  { id: "idea" as const, label: "Idea" },
  { id: "building" as const, label: "Construir" },
  { id: "validating" as const, label: "Validar" },
  { id: "ready" as const, label: "Listo" },
  { id: "published" as const, label: "Publicado" },
] as const;

export type DeriveGafcoreJourneyPhaseInput = {
  files: Array<{ name: string; content: string }>;
  loading: boolean;
  autoFixActive: boolean;
  pipelineStatus: string | null;
  validationLabel: string | null;
  lastError: string | null;
  workflowActive: boolean;
  deployStatus: ProjectDeployStatus;
  deploySiteHost: string | null;
};

export function projectHasRealWorkspace(
  files: Array<{ name: string; content: string }>,
): boolean {
  if (!files.length) return false;
  const app = files.find((f) => /^app\.(jsx|tsx?)$/i.test(f.name));
  if (!app) {
    const chars = files.reduce((n, f) => n + (f.content?.length ?? 0), 0);
    return chars > 400;
  }
  if (!isGafcoreDefaultTemplateApp(app.content)) return true;
  const blob = files.map((f) => f.content).join("\n");
  return blob.length > 4500 && !/Bienvenidos a GafCore/i.test(blob);
}

export function deriveGafcoreJourneyPhase(
  input: DeriveGafcoreJourneyPhaseInput,
): GafcoreJourneyPhaseId {
  const hasWorkspace = projectHasRealWorkspace(input.files);

  if (input.deployStatus === "ready" && input.deploySiteHost) {
    return "published";
  }
  if (
    input.deployStatus === "building" ||
    input.loading ||
    input.workflowActive ||
    (input.pipelineStatus && /generat|construy|pipeline|fábrica|factory|retrying/i.test(input.pipelineStatus))
  ) {
    return "building";
  }
  if (
    input.autoFixActive ||
    (input.pipelineStatus && /validaci|validat|audit|corrigi/i.test(input.pipelineStatus))
  ) {
    return "validating";
  }
  if (input.deployStatus === "error") {
    return "issue";
  }
  if (input.lastError && hasWorkspace) {
    return "issue";
  }
  if (hasWorkspace) {
    if (input.validationLabel && /validaci/i.test(input.validationLabel)) {
      return "validating";
    }
    return "ready";
  }
  return "idea";
}

export function journeyPhaseStepIndex(phase: GafcoreJourneyPhaseId): number {
  switch (phase) {
    case "idea":
      return 0;
    case "building":
      return 1;
    case "validating":
      return 2;
    case "ready":
    case "issue":
      return 3;
    case "published":
      return 4;
    default:
      return 0;
  }
}

export function journeyPhaseHint(
  phase: GafcoreJourneyPhaseId,
  deploySiteHost: string | null,
): string {
  switch (phase) {
    case "idea":
      return "Describe tu app en el chat y pulsa Construir.";
    case "building":
      return "Generando y aplicando archivos en tu proyecto…";
    case "validating":
      return "Comprobando código y corrigiendo errores frecuentes.";
    case "ready":
      return "Prueba la vista previa y publica cuando esté listo.";
    case "issue":
      return "Hay un error pendiente; el cerebro puede corregirlo o publica tras revisar.";
    case "published":
      return deploySiteHost
        ? `Publicado en ${deploySiteHost}`
        : "Tu sitio está en vivo.";
    default:
      return "";
  }
}
