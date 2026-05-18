import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { appendDiagnosticAudit } from "@/lib/gafcore-diagnostics-audit.server";
import { DIAGNOSTIC_SEVERITIES } from "@/lib/gafcore-diagnostics.shared";

const IngestSchema = z.object({
  module: z.string().min(1).max(128),
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(8000),
  severity: z.enum(DIAGNOSTIC_SEVERITIES),
  source: z.string().min(1).max(64).optional(),
  possible_root_cause: z.string().max(4000).optional(),
  impact: z.string().max(2000).optional(),
  raw_payload: z.record(z.unknown()).optional(),
  environment: z.string().max(32).optional(),
});

/**
 * POST /api/gafcore/admin/diagnostics-ingest
 * Fase C: ingesta de eventos (Sentry/cron/manual) — solo admin Bearer.
 */
export const Route = createFileRoute("/api/gafcore/admin/diagnostics-ingest")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        const admin = await isGafcoreAdminUser(userId);
        if (!admin) {
          return json({ error: "forbidden" }, 403);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        const parsed = IngestSchema.safeParse(body);
        if (!parsed.success) {
          return json({ error: "invalid_body", issues: parsed.error.issues }, 400);
        }

        const { data, error } = await supabaseAdmin
          .from("diagnostic_reports")
          .insert({
            module: parsed.data.module,
            title: parsed.data.title,
            description: parsed.data.description,
            possible_root_cause: parsed.data.possible_root_cause ?? null,
            impact: parsed.data.impact ?? null,
            severity: parsed.data.severity,
            status: "pending_analysis",
            source: parsed.data.source ?? "ingest",
            raw_payload: parsed.data.raw_payload ?? {},
            environment: parsed.data.environment ?? "production",
          })
          .select("id")
          .single();

        if (error || !data) {
          return json({ error: error?.message ?? "insert_failed" }, 502);
        }

        await appendDiagnosticAudit({
          reportId: data.id,
          actorId: userId,
          eventType: "ingested",
          message: `Evento ingestado: ${parsed.data.title}`,
          metadata: { source: parsed.data.source ?? "ingest" },
        });

        return json({ id: data.id }, 201);
      },
    },
  },
});

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
