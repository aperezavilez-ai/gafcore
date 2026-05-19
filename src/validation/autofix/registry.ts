import { repairCommonJsxSyntaxErrors } from "@/lib/gafcore-media.shared";
import type { ValidationFileInput } from "@/validation/types";

export type AutofixResult = {
  files: ValidationFileInput[];
  applied: string[];
};

/** Correcciones deterministas (0 créditos IA). */
export function applyDeterministicAutofix(files: ValidationFileInput[]): AutofixResult {
  const applied: string[] = [];
  const out = files.map((f) => {
    let content = f.content;
    let name = f.name;

    if (/\.(tsx|jsx)$/i.test(name)) {
      const repaired = repairCommonJsxSyntaxErrors(content);
      if (repaired !== content) {
        content = repaired;
        applied.push(`jsx-repair:${name}`);
      }
    }

    if (name === "package.json" || name.endsWith("/package.json")) {
      const next = tryFixPackageJson(content, files);
      if (next && next !== content) {
        content = next;
        applied.push("package-json-deps");
      }
    }

    if (/^app\.(tsx|jsx)$/i.test(name.replace(/^.*\//, ""))) {
      if (!/export\s+default/.test(content) && /function\s+App|const\s+App\s*=/.test(content)) {
        if (!content.trimEnd().endsWith("export default App;")) {
          content = `${content.trimEnd()}\n\nexport default App;\n`;
          applied.push(`export-default:${name}`);
        }
      }
    }

    return { ...f, name, content };
  });

  return { files: out, applied };
}

function tryFixPackageJson(pkgContent: string, allFiles: ValidationFileInput[]): string | null {
  const usesReact = allFiles.some((f) => /\.(tsx|jsx)$/i.test(f.name));
  if (!usesReact) return null;
  try {
    const j = JSON.parse(pkgContent) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...(j.dependencies ?? {}) };
    let changed = false;
    if (!deps.react) {
      deps.react = "^19.0.0";
      changed = true;
    }
    if (!deps["react-dom"]) {
      deps["react-dom"] = "^19.0.0";
      changed = true;
    }
    if (!changed) return null;
    return JSON.stringify({ ...j, dependencies: deps }, null, 2);
  } catch {
    return null;
  }
}
