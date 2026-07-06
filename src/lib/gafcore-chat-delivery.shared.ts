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

function fallbackTitle(instruction: string): string {
  if (/barber|barberia|barbería/i.test(instruction)) return "Barberia Premium";
  if (/restaurante|restaurant|comida/i.test(instruction)) return "Restaurante Premium";
  if (/salon|belleza|spa/i.test(instruction)) return "Estudio de Belleza";
  if (/tienda|shop|catalogo|catálogo/i.test(instruction)) return "Tienda Premium";
  return "Landing Premium";
}

function fallbackServices(instruction: string): string[] {
  if (/barber|barberia|barbería/i.test(instruction)) {
    return ["Corte clasico", "Barba premium", "Paquete completo"];
  }
  if (/restaurante|restaurant|comida/i.test(instruction)) {
    return ["Menu de autor", "Reservas privadas", "Catering"];
  }
  if (/salon|belleza|spa/i.test(instruction)) {
    return ["Estilo personal", "Tratamientos", "Agenda express"];
  }
  return ["Diseno profesional", "Conversion clara", "Contacto directo"];
}

export function createDeterministicBuildFallbackFiles(
  instruction: string,
): GafcoreDeliveredFile[] {
  const title = fallbackTitle(instruction);
  const services = fallbackServices(instruction);
  const app = `import React, { useMemo, useState } from "react";

const services = ${JSON.stringify(services)};

export default function App() {
  const [selected, setSelected] = useState(services[0]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);

  const summary = useMemo(() => selected + " reservado para " + (name || "tu cliente"), [selected, name]);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setSent(true);
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <section className="mx-auto grid min-h-screen max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-300">Agenda online</p>
          <h1 className="mt-4 text-5xl font-black leading-tight md:text-7xl">${title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-neutral-300">
            Una experiencia web lista para captar clientes, mostrar servicios y recibir reservas desde el primer dia.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={() => scrollTo("reservar")} className="rounded-full bg-amber-400 px-6 py-3 font-bold text-neutral-950 hover:bg-amber-300">
              Reservar ahora
            </button>
            <button type="button" onClick={() => scrollTo("servicios")} className="rounded-full border border-white/20 px-6 py-3 font-semibold hover:bg-white/10">
              Ver servicios
            </button>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur">
          <img
            src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1200&q=80"
            alt="Servicio premium"
            className="h-80 w-full rounded-[1.5rem] object-cover"
          />
          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <span className="rounded-2xl bg-neutral-950/70 px-3 py-4 text-sm">Citas</span>
            <span className="rounded-2xl bg-neutral-950/70 px-3 py-4 text-sm">Servicios</span>
            <span className="rounded-2xl bg-neutral-950/70 px-3 py-4 text-sm">Contacto</span>
          </div>
        </div>
      </section>

      <section id="servicios" className="border-y border-white/10 bg-neutral-900 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-black">Servicios destacados</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {services.map((service) => (
              <button
                key={service}
                type="button"
                onClick={() => setSelected(service)}
                className={"rounded-3xl border p-6 text-left transition " + (selected === service ? "border-amber-300 bg-amber-300 text-neutral-950" : "border-white/10 bg-white/5 hover:bg-white/10")}
              >
                <span className="text-xl font-bold">{service}</span>
                <p className="mt-3 text-sm opacity-80">Atencion profesional, tiempos claros y seguimiento personalizado.</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="reservar" className="px-6 py-16">
        <form onSubmit={onSubmit} className="mx-auto grid max-w-4xl gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-6 md:grid-cols-2">
          <div className="md:col-span-2">
            <h2 className="text-3xl font-black">Reserva tu cita</h2>
            <p className="mt-2 text-neutral-300">{summary}</p>
          </div>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre" className="rounded-2xl border border-white/10 bg-neutral-950 px-4 py-3" />
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Telefono" className="rounded-2xl border border-white/10 bg-neutral-950 px-4 py-3" />
          <button type="submit" className="rounded-2xl bg-white px-5 py-3 font-bold text-neutral-950 md:col-span-2">
            Confirmar reserva
          </button>
          {sent ? <p className="text-emerald-300 md:col-span-2">Reserva recibida. Te contactaremos para confirmar horario.</p> : null}
        </form>
      </section>
    </main>
  );
}
`;

  return [
    {
      name: "index.html",
      language: "html",
      content: `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>`,
    },
    {
      name: "main.tsx",
      language: "typescript",
      content:
        'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./styles.css";\n\ncreateRoot(document.getElementById("root")!).render(<App />);\n',
    },
    { name: "App.tsx", language: "typescript", content: app },
    {
      name: "styles.css",
      language: "css",
      content:
        ":root { color-scheme: dark; }\nhtml, body, #root { min-height: 100%; margin: 0; }\nbody { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }\n* { box-sizing: border-box; }\n",
    },
  ];
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
  let usedFallback = false;

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
    files = createDeterministicBuildFallbackFiles(instruction);
    source = "template_bootstrap";
    usedFallback = true;
    files = ensureReactPackageJson(files);
    /* Sin plantillas predefinidas — confiar en la respuesta de la IA o reintento del usuario. */
  } else if (files.length > 0) {
    files = ensureReactPackageJson(files);
  }

  const session = prepareIncrementalEditSession(contextFiles, instruction);
  if (!usedFallback && session.active && files.length > 0) {
    const persisted = applyIncrementalEditPersistence(contextFiles, files, session);
    const shield = runIntegrityShield(contextFiles, persisted.files, session.snapshot, {
      deltaPaths: files.map((f) => f.name),
      instruction,
    });
    files = shield.files;
  }

  if (!usedFallback) {
    const syntaxHeal = healWorkspaceSyntax(files);
    if (syntaxHeal.healed) {
      files = syntaxHeal.files;
    }
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
