/**
 * Entrega fiable de builds del chat (cliente + servidor).
 * Garantiza que un pedido de construcción SIEMPRE produce archivos aplicables al preview.
 */
import { validateOutputFiles, type ProjFile } from "@/lib/gafcore-chat.shared";
import {
  patchProjectFilesVisually,
  repairGafcoreOutputFiles,
} from "@/lib/gafcore-media.shared";
import { ensureReactPackageJson } from "@/lib/gafcore-project-scaffold.shared";
import { isGafcoreDefaultTemplateApp } from "@/lib/gafcore-project-stale.shared";
import {
  aiReplyLooksLikePlanOnly,
  isSubstantiveBuildRequest,
} from "@/lib/gafcore-chat-intent.shared";
import {
  applyIncrementalEditPersistence,
  prepareIncrementalEditSession,
} from "@/lib/gafcore-incremental-edit.shared";
import { runIntegrityShield } from "@/lib/gafcore-integrity-shield.shared";
import { parseJsonLoose } from "@/lib/gafcore-json-loose.shared";
import { healWorkspaceSyntax } from "@/core/pipeline/syntax-heal.shared";

export type GafcoreDeliveredFile = {
  name: string;
  language?: string;
  content: string;
};

export type FinalizeBuildResult = {
  reply: string;
  files: GafcoreDeliveredFile[];
  /** Origen principal de los archivos entregados. */
  source: "ai" | "visual_patch" | "template_bootstrap" | "template_then_ai";
  /** true si la IA devolvió plan/texto sin código útil. */
  planOnly: boolean;
};

/** Plantillas desactivadas: siempre canvas en blanco + IA. */
export function filesFromBuiltinTemplateByInstruction(
  _instruction: string,
): GafcoreDeliveredFile[] {
  return [];
}

function contextStillWelcome(contextFiles: ProjFile[]): boolean {
  const app = contextFiles.find((f) => /^app\.(tsx|jsx)$/i.test(f.name));
  return !app || isGafcoreDefaultTemplateApp(app.content);
}

export function outputReplacesWelcome(
  contextFiles: ProjFile[],
  outputFiles: GafcoreDeliveredFile[],
): boolean {
  if (!contextStillWelcome(contextFiles)) return true;
  const outApp = outputFiles.find((f) => /^app\.(tsx|jsx)$/i.test(f.name));
  if (!outApp?.content?.trim()) return false;
  return !isGafcoreDefaultTemplateApp(outApp.content);
}

export function shouldBootstrapBuildDelivery(
  instruction: string,
  contextFiles: ProjFile[],
  outputFiles: GafcoreDeliveredFile[],
  reply: string,
): boolean {
  if (!isSubstantiveBuildRequest(instruction)) return false;
  if (outputFiles.length === 0) return true;
  if (aiReplyLooksLikePlanOnly(reply)) return true;
  if (contextStillWelcome(contextFiles) && !outputReplacesWelcome(contextFiles, outputFiles)) {
    return true;
  }
  return false;
}

/**
 * Si la IA metió el JSON entero en `reply` o dejó `files` vacío, extrae reply + files.
 */
export function unwrapGafcoreChatPayload(
  reply: string,
  files: unknown,
): { reply: string; files: unknown } {
  let outReply = typeof reply === "string" ? reply : "";
  let outFiles = files;

  const tryExtract = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed.startsWith("{") && !trimmed.includes('"files"')) return false;
    const parsed = parseJsonLoose<{ reply?: string; files?: unknown }>(trimmed);
    if (!parsed) return false;
    let changed = false;
    if (typeof parsed.reply === "string" && parsed.reply.trim()) {
      outReply = parsed.reply;
      changed = true;
    }
    if (Array.isArray(parsed.files) && validateOutputFiles(parsed.files).length > 0) {
      outFiles = parsed.files;
      changed = true;
    }
    return changed;
  };

  if (validateOutputFiles(outFiles).length === 0) {
    tryExtract(outReply);
  }
  if (outReply.trim().startsWith("{") && /"files"\s*:/.test(outReply)) {
    tryExtract(outReply);
  }

  return { reply: outReply, files: outFiles };
}

/** Repara, bootstrap plantilla y asegura package.json cuando hace falta. */
export function finalizeGafcoreBuildDelivery(
  instruction: string,
  contextFiles: ProjFile[],
  reply: string,
  rawFiles: unknown,
): FinalizeBuildResult {
  const unwrapped = unwrapGafcoreChatPayload(reply, rawFiles);
  const planOnly = aiReplyLooksLikePlanOnly(unwrapped.reply);
  let files = repairGafcoreOutputFiles(validateOutputFiles(unwrapped.files));
  let source: FinalizeBuildResult["source"] = "ai";

  if (files.length === 0) {
    const patch = patchProjectFilesVisually(
      contextFiles.map((f) => ({
        name: f.name,
        language: f.language,
        content: f.content,
      })),
      instruction,
    );
    if (patch.length > 0) {
      files = repairGafcoreOutputFiles(patch);
      source = "visual_patch";
    }
  }

  if (shouldBootstrapBuildDelivery(instruction, contextFiles, files, unwrapped.reply)) {
    /* Sin plantillas predefinidas — confiar en la respuesta de la IA o reintento del usuario. */
  } else if (files.length > 0) {
    files = ensureReactPackageJson(files);
  }

  const session = prepareIncrementalEditSession(contextFiles, instruction);
  if (session.active && files.length > 0) {
    const persisted = applyIncrementalEditPersistence(contextFiles, files, session);
    const shield = runIntegrityShield(contextFiles, persisted.files, session.snapshot, {
      deltaPaths: files.map((f) => f.name),
      instruction,
    });
    files = shield.files;
  }

  const syntaxHeal = healWorkspaceSyntax(files);
  if (syntaxHeal.healed) {
    files = syntaxHeal.files;
  }

  return { reply: unwrapped.reply, files, source, planOnly };
}

export const GAFCORE_CUSTOMIZE_AFTER_BOOTSTRAP_PREFIX =
  "[GAFCORE PERSONALIZAR] Ya tienes una base funcional (App.tsx, main.tsx, index.html). " +
  "Reescribe App.tsx y archivos necesarios para cumplir el pedido del usuario. " +
  "PROHIBIDO react-router (usa useState para vistas). " +
  "PROHIBIDO responder solo con plan: devuelve files con código completo. ";

export const GAFCORE_FORCE_FILES_BUILD_PREFIX =
  "[GAFCORE BUILD OBLIGATORIO] El usuario pidió CREAR o CONSTRUIR un proyecto. " +
  "Responde SOLO JSON { reply, files }. files NO puede estar vacío. " +
  "Incluye App.tsx (export default function App), main.tsx e index.html si faltan. " +
  "PROHIBIDO arquitectura en prosa, fases, módulos sin código, o plan sin implementar. " +
  "PROHIBIDO react-router. Iconos lucide: import obligatorio. " +
  "CHECKLIST DE SINTAXIS ANTES DE ENTREGAR: " +
  "(a) Cada { tiene su }, cada ( tiene su ), cada <Tag> tiene </Tag> o />. " +
  "(b) Todos los hooks/componentes usados están importados. " +
  "(c) No hay objetos renderizados directamente en JSX ({obj} → usa {obj.prop}). " +
  "(d) App.tsx tiene exactamente un export default function. ";
