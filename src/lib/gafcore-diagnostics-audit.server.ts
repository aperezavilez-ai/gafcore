import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function appendDiagnosticAudit(args: {
  reportId: string;
  actorId?: string | null;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("diagnostic_audit_log").insert({
    report_id: args.reportId,
    actor_id: args.actorId ?? null,
    event_type: args.eventType,
    message: args.message,
    metadata: args.metadata ?? {},
  });
  if (error) console.error("[diagnostic_audit]", error.message);
}
