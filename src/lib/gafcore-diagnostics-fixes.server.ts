import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runFullDiagnosticScan } from "@/lib/gafcore-diagnostics-checks.server";
import { applyGafcorePlanSubscription } from "@/lib/stripe-subscription-sync.server";
import { createStripeClient, type StripeEnv } from "@/lib/stripe.server";
import type { FixType } from "@/lib/gafcore-diagnostics.shared";
import { appendDiagnosticAudit } from "@/lib/gafcore-diagnostics-audit.server";

export type FixExecutionInput = {
  userId?: string;
  stripeSubscriptionId?: string;
  environment?: StripeEnv;
  origin?: string;
};

export async function executeApprovedFix(args: {
  reportId: string;
  fixType: FixType;
  actorId: string;
  input?: FixExecutionInput;
}): Promise<Record<string, unknown>> {
  const { reportId, fixType, actorId, input } = args;

  await appendDiagnosticAudit({
    reportId,
    actorId,
    eventType: "execution_started",
    message: `Inicio fix: ${fixType}`,
    metadata: { fix_type: fixType },
  });

  try {
    switch (fixType) {
      case "run_doctor": {
        const findings = await runFullDiagnosticScan(input?.origin);
        return {
          ok: true,
          findings_count: findings.length,
          findings: findings.map((f) => ({ title: f.title, severity: f.severity })),
        };
      }
      case "health_check_all": {
        const findings = await runFullDiagnosticScan(input?.origin);
        return { ok: true, findings_count: findings.length, findings };
      }
      case "sync_stripe_subscription": {
        const uid = input?.userId;
        const subId = input?.stripeSubscriptionId;
        const env = input?.environment ?? "sandbox";
        if (!uid || !subId) {
          throw new Error("sync_stripe_subscription requiere userId y stripeSubscriptionId en el input");
        }
        const stripe = createStripeClient(env);
        const sub = await stripe.subscriptions.retrieve(subId);
        const item = sub.items.data[0];
        const priceId =
          item?.price?.lookup_key ??
          item?.price?.metadata?.gafcore_price_id ??
          item?.price?.id;
        if (!priceId) throw new Error("No se pudo resolver price_id de la suscripción");
        await applyGafcorePlanSubscription({
          userId: uid,
          priceId,
          stripeSubscriptionId: sub.id,
          stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
          status: sub.status,
          environment: env,
          currentPeriodStart: item?.current_period_start
            ? new Date(item.current_period_start * 1000).toISOString()
            : null,
          currentPeriodEnd: item?.current_period_end
            ? new Date(item.current_period_end * 1000).toISOString()
            : null,
          cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        });
        return { ok: true, user_id: uid, price_id: priceId, subscription_status: sub.status };
      }
      case "replay_webhook_guidance": {
        return {
          ok: true,
          manual_steps: [
            "Stripe Dashboard (test) → Developers → Webhooks → tu endpoint",
            "URL: https://gafcore.com/api/public/payments/webhook?env=sandbox",
            "Reenviar checkout.session.completed o customer.subscription.created",
            "Verificar PAYMENTS_SANDBOX_WEBHOOK_SECRET en Vercel",
          ],
        };
      }
      default:
        throw new Error(`Fix no implementado: ${fixType}`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await appendDiagnosticAudit({
      reportId,
      actorId,
      eventType: "execution_failed",
      message,
      metadata: { fix_type: fixType },
    });
    throw e;
  }
}

/** Marca ejecución en sandbox (preview): validación ligera antes de prod. */
export async function validateFixInSandbox(
  reportId: string,
  executionResult: Record<string, unknown>,
): Promise<{ sandbox_ok: boolean; notes: string }> {
  const ok = executionResult.ok === true;
  await appendDiagnosticAudit({
    reportId,
    eventType: "sandbox_validation",
    message: ok ? "Validación sandbox OK" : "Validación sandbox con advertencias",
    metadata: { execution_result: executionResult },
  });
  return {
    sandbox_ok: ok,
    notes: ok
      ? "Resultado coherente; revisar manualmente antes de producción."
      : "Revisar execution_result y logs en Vercel.",
  };
}

export async function recordProductionApply(reportId: string, actorId: string) {
  await appendDiagnosticAudit({
    reportId,
    actorId,
    eventType: "production_applied",
    message: "Admin confirmó aplicación en producción (trazabilidad)",
  });
}
