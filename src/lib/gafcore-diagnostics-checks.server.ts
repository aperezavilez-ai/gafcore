import type { DiagnosticSeverity, DiagnosticSource } from "@/lib/gafcore-diagnostics.shared";

export type DiagnosticFinding = {
  module: string;
  title: string;
  description: string;
  possible_root_cause?: string;
  impact?: string;
  severity: DiagnosticSeverity;
  source: DiagnosticSource;
  raw_payload?: Record<string, unknown>;
};

function hasEnv(key: string): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}

function aiConfigured(): boolean {
  if (hasEnv("MEAI_API_KEY") || hasEnv("GAFCORE_MEAI_API_KEY")) return true;
  if (hasEnv("GPTPRO4ALL_API_KEY")) return true;
  if (hasEnv("GPTPRO4ALL_BASE_URL") && hasEnv("AI_API_KEY")) return true;
  if (hasEnv("AI_CHAT_COMPLETIONS_URL") && hasEnv("AI_API_KEY")) return true;
  if (hasEnv("OPENROUTER_API_KEY")) return true;
  if (hasEnv("GEMINI_API_KEY") || hasEnv("GOOGLE_AI_API_KEY") || hasEnv("GOOGLE_API_KEY")) return true;
  return false;
}

/** Mismas comprobaciones que `npm run gafcore:doctor` (sin volcar secretos). */
export function runEnvDoctorChecks(): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];

  const add = (f: DiagnosticFinding) => findings.push(f);

  if (!hasEnv("VITE_SUPABASE_URL")) {
    add({
      module: "env",
      title: "Falta VITE_SUPABASE_URL",
      description: "El cliente no puede conectar con Supabase.",
      possible_root_cause: "Variable no definida en Vercel o .env.local",
      impact: "Login y datos de usuario no funcionan en el navegador",
      severity: "critical",
      source: "doctor",
    });
  }

  if (!hasEnv("VITE_SUPABASE_PUBLISHABLE_KEY")) {
    add({
      module: "env",
      title: "Falta VITE_SUPABASE_PUBLISHABLE_KEY",
      description: "Clave pública de Supabase ausente en el build.",
      severity: "critical",
      source: "doctor",
    });
  }

  if (!hasEnv("SUPABASE_URL")) {
    add({
      module: "env",
      title: "Falta SUPABASE_URL en servidor",
      description: "SSR y API no pueden usar Supabase admin/auth.",
      possible_root_cause: "Solo está VITE_SUPABASE_URL; el servidor necesita SUPABASE_URL",
      severity: "critical",
      source: "doctor",
    });
  }

  if (!hasEnv("SUPABASE_SERVICE_ROLE_KEY")) {
    add({
      module: "env",
      title: "Falta SUPABASE_SERVICE_ROLE_KEY",
      description: "Webhooks, checkout-confirm y operaciones admin fallan.",
      severity: "critical",
      source: "doctor",
    });
  }

  if (!hasEnv("SUPABASE_PUBLISHABLE_KEY")) {
    add({
      module: "env",
      title: "Falta SUPABASE_PUBLISHABLE_KEY",
      description: "Rutas API con Bearer (chat, checkout) no validan sesión.",
      severity: "high",
      source: "doctor",
    });
  }

  if (!aiConfigured()) {
    add({
      module: "integration",
      title: "IA no configurada",
      description:
        "Falta MEAI_API_KEY, GPTPRO4ALL_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY/GOOGLE_AI_API_KEY o AI_CHAT_COMPLETIONS_URL+AI_API_KEY hacia un host permitido.",
      impact: "Chat del IDE y generación no disponibles",
      severity: "high",
      source: "doctor",
    });
  }

  const pk = process.env.VITE_PAYMENTS_CLIENT_TOKEN?.trim() ?? "";
  if (pk.startsWith("pk_test_") && !hasEnv("STRIPE_SANDBOX_API_KEY")) {
    add({
      module: "integration",
      title: "Stripe test: falta STRIPE_SANDBOX_API_KEY",
      description: "Cliente en pk_test_ pero servidor sin sk_test_.",
      severity: "high",
      source: "doctor",
    });
  }
  if (pk.startsWith("pk_test_") && !hasEnv("PAYMENTS_SANDBOX_WEBHOOK_SECRET")) {
    add({
      module: "integration",
      title: "Stripe test: falta webhook secret",
      description: "Los webhooks de sandbox no verificarán firma.",
      severity: "medium",
      source: "doctor",
    });
  }
  if (pk.startsWith("pk_live_") && !hasEnv("STRIPE_LIVE_API_KEY")) {
    add({
      module: "integration",
      title: "Stripe live: falta STRIPE_LIVE_API_KEY",
      description: "Cliente en pk_live_ pero servidor sin sk_live_.",
      severity: "critical",
      source: "doctor",
    });
  }

  return findings;
}

export async function runHealthChecks(origin?: string): Promise<DiagnosticFinding[]> {
  const findings: DiagnosticFinding[] = [];
  const base = origin?.replace(/\/$/, "") ?? process.env.VITE_PUBLIC_SITE_URL?.trim();

  if (!base) {
    findings.push({
      module: "deploy",
      title: "Sin URL pública para health check",
      description: "Define VITE_PUBLIC_SITE_URL o pasa origin al escanear.",
      severity: "low",
      source: "health_cron",
    });
    return findings;
  }

  const endpoints = [
    { path: "/api/v1/health", module: "api" as const },
  ];

  for (const { path, module } of endpoints) {
    try {
      const res = await fetch(`${base}${path}`, { method: "GET" });
      if (!res.ok) {
        findings.push({
          module,
          title: `Health check falló: ${path}`,
          description: `HTTP ${res.status} desde ${base}`,
          severity: res.status >= 500 ? "high" : "medium",
          source: "health_cron",
          raw_payload: { status: res.status, url: `${base}${path}` },
        });
      }
    } catch (e) {
      findings.push({
        module,
        title: `Health check inalcanzable: ${path}`,
        description: e instanceof Error ? e.message : String(e),
        severity: "high",
        source: "health_cron",
        raw_payload: { url: `${base}${path}` },
      });
    }
  }

  return findings;
}

export async function runFullDiagnosticScan(origin?: string): Promise<DiagnosticFinding[]> {
  const env = runEnvDoctorChecks();
  const health = await runHealthChecks(origin);
  return [...env, ...health];
}
