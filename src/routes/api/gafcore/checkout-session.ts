import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { createEmbeddedCheckoutClientSecret } from "@/lib/stripe-checkout.server";
import type { StripeEnv } from "@/lib/stripe.server";

const BodySchema = z.object({
  priceId: z.string().min(1).max(128),
  customerEmail: z.string().email().optional(),
  returnUrl: z.string().min(8).max(2048),
  environment: z.enum(["sandbox", "live"]),
});

/**
 * POST /api/gafcore/checkout-session
 * JSON plano (sin server-fn) para que client_secret no sea redactado en tránsito.
 */
export const Route = createFileRoute("/api/gafcore/checkout-session")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return json({ error: "invalid_body" }, 400);
        }

        try {
          const client_secret = await createEmbeddedCheckoutClientSecret({
            priceId: parsed.data.priceId,
            customerEmail: parsed.data.customerEmail,
            returnUrl: parsed.data.returnUrl,
            environment: parsed.data.environment as StripeEnv,
            userId,
          });
          return json({ client_secret }, 200);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("[checkout-session]", message);
          return json({ error: message }, 502);
        }
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
