/**
 * Utilidades de routing IA sin secretos (seguro en shared).
 * Resolución con API keys: gafcore-model-routing.server.ts
 */

export type ResolvedProvider = "anthropic" | "openai" | "openrouter" | "custom";

export type ResolvedRoute = {
  provider: ResolvedProvider;
  url: string;
  apiKey: string;
  extraHeaders: Record<string, string>;
  modelSlug: string;
};

export function normalizeModelSlug(model: string, target: ResolvedProvider): string {
  const m = model.trim();
  if (!m) return m;

  if (target === "anthropic") {
    const stripped = m.replace(/^anthropic\//i, "");
    return stripped.replace(/(\d+)\.(\d+)/g, "$1-$2");
  }

  if (target === "openai") {
    return m.replace(/^openai\//i, "");
  }

  if (target === "openrouter") {
    if (m.includes("/")) return m;
    if (/^claude-/i.test(m)) {
      const restored = m.replace(/(\d+)-(\d+)(?!-)/g, "$1.$2");
      return `anthropic/${restored}`;
    }
    if (/^gpt-|^o\d-/i.test(m)) return `openai/${m}`;
    if (/^gemini/i.test(m)) return `google/${m}`;
    return m;
  }

  return m;
}

export function detectModelFamily(model: string): "claude" | "openai" | "gemini" | "other" {
  const m = model.toLowerCase();
  if (m.includes("claude") || m.startsWith("anthropic/")) return "claude";
  if (m.startsWith("openai/") || /^gpt-|^o\d-/.test(m) || m.includes("/gpt-")) return "openai";
  if (m.includes("gemini") || m.startsWith("google/")) return "gemini";
  return "other";
}
