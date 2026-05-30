import { z } from "zod";

/** Dependencias que no existen en npm (Python, etc.) — no se añaden a package.json. */
const NON_NPM_DEPENDENCIES = new Set([
  "requests",
  "flask",
  "django",
  "numpy",
  "pandas",
  "matplotlib",
  "pillow",
  "beautifulsoup4",
]);

export const structuredActionableFixSchema = z.object({
  moduleToUpdate: z.string().optional(),
  requiredDependency: z.record(z.string(), z.string()).optional(),
  executionEnvironment: z.string().optional(),
  codePatch: z.string().optional(),
  envVars: z.record(z.string(), z.string()).optional(),
});

export type StructuredActionableFix = z.infer<typeof structuredActionableFixSchema>;

export const actionableFixSchema = z
  .union([z.string(), structuredActionableFixSchema, z.null()])
  .nullable();

export type ActionableFix = z.infer<typeof actionableFixSchema>;

export function parseActionableFixLoose(raw: unknown): ActionableFix {
  if (raw == null) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    const parsed = structuredActionableFixSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  }
  return null;
}

/** Convierte diagnóstico loose (p. ej. respuesta Gemini) al contrato normalizado. */
export function normalizeSystemicDiagnosisLoose(raw: unknown): {
  success: boolean;
  errorType: "sistema" | "usuario" | "build_error";
  rootCause: string;
  userFriendlyMessage: string;
  actionableFix: ActionableFix;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.success !== "boolean") return null;
  if (o.errorType !== "sistema" && o.errorType !== "usuario" && o.errorType !== "build_error") {
    return null;
  }
  if (typeof o.rootCause !== "string" || typeof o.userFriendlyMessage !== "string") return null;
  return {
    success: o.success,
    errorType: o.errorType,
    rootCause: o.rootCause,
    userFriendlyMessage: o.userFriendlyMessage,
    actionableFix: parseActionableFixLoose(o.actionableFix),
  };
}

export function hasUsableActionableFix(fix: ActionableFix): boolean {
  if (fix == null) return false;
  if (typeof fix === "string") return fix.trim().length > 8;
  return Boolean(
    fix.codePatch?.trim() ||
      (fix.requiredDependency && Object.keys(fix.requiredDependency).length > 0) ||
      (fix.envVars && Object.keys(fix.envVars).length > 0),
  );
}

/** Texto para el prompt de corrección Safe-Build / chat. */
export function formatActionableFixInstruction(input: {
  rootCause: string;
  userFriendlyMessage: string;
  actionableFix: ActionableFix;
}): string | null {
  const { actionableFix: fix } = input;
  if (!hasUsableActionableFix(fix)) return null;

  if (typeof fix === "string") {
    return fix.trim();
  }

  const lines: string[] = [
    `Causa: ${input.rootCause}`,
    `Mensaje usuario: ${input.userFriendlyMessage}`,
  ];

  if (fix.executionEnvironment) {
    lines.push(`Entorno: ${fix.executionEnvironment}`);
  }
  if (fix.moduleToUpdate) {
    lines.push(`Archivo a actualizar: ${fix.moduleToUpdate}`);
  }

  if (fix.requiredDependency) {
    for (const [name, version] of Object.entries(fix.requiredDependency)) {
      if (NON_NPM_DEPENDENCIES.has(name.toLowerCase())) {
        lines.push(
          `NO añadir "${name}" (librería Python). En proyectos GafCore (React/Vite/Node) usa fetch nativo del navegador o "axios" con import npm; elimina cualquier import de "${name}".`,
        );
      } else {
        lines.push(`Añadir en package.json → dependencies: "${name}": "${version}"`);
      }
    }
  }

  if (fix.envVars && Object.keys(fix.envVars).length > 0) {
    lines.push(`Variables de entorno sugeridas: ${JSON.stringify(fix.envVars)}`);
  }
  if (fix.codePatch?.trim()) {
    lines.push(`Parche de código:\n${fix.codePatch.trim()}`);
  }

  lines.push(
    "Stack GafCore: solo React 19 + Vite + Tailwind en preview; prohibido Python/requires en package.json.",
  );

  return lines.join("\n");
}

function normalizePkgPath(name: string): string {
  return name.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Aplica parche determinista a package.json (solo deps npm válidas).
 * Retorna null si no puede aplicar sin IA (p. ej. solo deps Python).
 */
export function tryApplyStructuredFixToProjectFiles(
  files: Array<{ name: string; content: string; language?: string }>,
  fix: StructuredActionableFix,
): Array<{ name: string; content: string; language?: string }> | null {
  const target = (fix.moduleToUpdate ?? "package.json").toLowerCase();
  if (!target.includes("package.json") || !fix.requiredDependency) return null;

  const npmDeps: Record<string, string> = {};
  for (const [name, version] of Object.entries(fix.requiredDependency)) {
    if (!NON_NPM_DEPENDENCIES.has(name.toLowerCase())) {
      npmDeps[name] = version;
    }
  }

  const idx = files.findIndex((f) => normalizePkgPath(f.name) === "package.json");
  let pkgContent: Record<string, unknown>;
  if (idx >= 0) {
    try {
      pkgContent = JSON.parse(files[idx].content) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (Object.keys(npmDeps).length === 0) {
    return null;
  } else {
    pkgContent = {
      name: "gafcore-app",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
      dependencies: {},
      devDependencies: {},
    };
  }

  const deps = {
    ...((pkgContent.dependencies as Record<string, string>) ?? {}),
    ...npmDeps,
  };
  pkgContent.dependencies = deps;

  const updated = [...files];
  const entry = {
    name: "package.json",
    language: "json",
    content: `${JSON.stringify(pkgContent, null, 2)}\n`,
  };
  if (idx >= 0) updated[idx] = entry;
  else updated.push(entry);

  return updated;
}
