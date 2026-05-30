/**
 * validarIA() — detector de si el código generado rompe la app.
 * No comprueba OpenAI/Claude; simula una entrega y audita sintaxis.
 */
import { auditProjectLocally } from "@/lib/gafcore-ai-validation.shared";
import {
  deriveVisualStatus,
  type AiMonitorCheck,
  type ValidarIAFullResult,
  type ValidarIAResult,
} from "@/lib/gafcore-ai-monitor.shared";

/** Componente básico como si la IA acabara de generarlo. */
const COMPONENTE_SIMULADO = `export default function App() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Validación IA</h1>
      <p>Componente básico de prueba</p>
    </main>
  );
}
`;

/** Código roto de control: el detector debe marcar error. */
const COMPONENTE_ROTO_CONTROL = `export default function Broken() {
  return (
    <div>
      <p>sin cerrar
    </div>
  );
}
`;

function countSyntaxErrors(files: Array<{ name: string; content: string }>): number {
  return auditProjectLocally(files).issues.filter((i) => i.severity === "error").length;
}

function countWarnings(files: Array<{ name: string; content: string }>): number {
  return auditProjectLocally(files).issues.filter((i) => i.severity === "warn").length;
}

/**
 * Simula crear un componente, evalúa sintaxis y confirma el detector.
 * Retorno simple: { estado, errores, mensaje }.
 */
export async function validarIA(): Promise<ValidarIAFullResult> {
  const checks: AiMonitorCheck[] = [];
  const validatedAt = new Date().toISOString();

  const generatedFiles = [{ name: "App.tsx", content: COMPONENTE_SIMULADO }];
  const syntaxErrors = countSyntaxErrors(generatedFiles);
  const warnings = countWarnings(generatedFiles);

  checks.push({
    id: "crear_componente",
    name: "Crear componente básico",
    ok: true,
    detail: "Tarea simulada: componente React mínimo generado.",
  });

  checks.push({
    id: "sintaxis",
    name: "Sintaxis y código válido",
    ok: syntaxErrors === 0,
    detail:
      syntaxErrors === 0
        ? "Sin errores de sintaxis en el componente simulado."
        : `${syntaxErrors} error(es) de sintaxis en el componente simulado.`,
  });

  const brokenErrors = countSyntaxErrors([
    { name: "Broken.tsx", content: COMPONENTE_ROTO_CONTROL },
  ]);
  const detectorOk = brokenErrors > 0;
  checks.push({
    id: "detector",
    name: "Detector de código roto",
    ok: detectorOk,
    detail: detectorOk
      ? `Detector activo (${brokenErrors} error(es) en muestra inválida).`
      : "El detector no marcó código inválido (revisar validación).",
  });

  let errores = syntaxErrors;
  if (!detectorOk) errores += 1;

  const advertencia = warnings > 0 && errores === 0;
  const estado: ValidarIAResult["estado"] = errores === 0 ? "OK" : "ERROR";

  let mensaje: string;
  if (estado === "OK") {
    mensaje = advertencia
      ? "Código válido con advertencias menores. Revisa antes de publicar."
      : "Código generado válido. Puedes continuar.";
  } else {
    mensaje =
      errores === 1
        ? "1 error en código generado. No publiques."
        : `${errores} errores en código generado. No publiques.`;
  }

  const core: ValidarIAResult = { estado, errores, mensaje };

  return {
    ...core,
    visualStatus: deriveVisualStatus(errores, advertencia),
    advertencia,
    validatedAt,
    checks,
  };
}
