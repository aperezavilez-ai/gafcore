import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { createExtensionCheckoutSession } from "@/extensions/marketplace-payments.server";
import type { StripeEnv } from "@/lib/stripe.server";

const BodySchema = z.object({
  listingId: z.string().uuid(),
  returnUrl: z.string().min(8).max(2048),
  environment: z.enum(["sandbox", "live"]),
  customerEmail: z.string().email().optional(),
});

export const Route = createFileRoute("/api/extensions/v1/checkout-session")({
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
        if (!parsed.success) return json({ error: "invalid_body" }, 400);

        const result = await createExtensionCheckoutSession({
          userId,
          listingId: parsed.data.listingId,
          returnUrl: parsed.data.returnUrl,
          environment: parsed.data.environment as StripeEnv,
          customerEmail: parsed.data.customerEmail,
        });

        if (!result.ok) return json({ error: result.error }, 400);

        return json(
          {
            client_secret: result.checkout.clientSecret,
            session_id: result.checkout.sessionId,
            amount_cents: result.checkout.amountCents,
            currency: result.checkout.currency,
          },
          200,
        );
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
