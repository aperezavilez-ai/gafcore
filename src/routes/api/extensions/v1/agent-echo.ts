import { createFileRoute } from "@tanstack/react-router";
import { extensionsEnabled } from "@/extensions/extension-host.server";

/** Webhook de prueba para agentes del marketplace (eco JSON). */
export const Route = createFileRoute("/api/extensions/v1/agent-echo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!extensionsEnabled()) {
          return Response.json({ ok: false, error: "extensions_disabled" }, { status: 503 });
        }
        const secret = process.env.GAFCORE_AGENT_WEBHOOK_SECRET?.trim();
        if (secret) {
          const got = request.headers.get("x-gafcore-agent-secret");
          if (got !== secret) {
            return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
          }
        }
        let body: unknown = null;
        try {
          body = await request.json();
        } catch {
          body = null;
        }
        return Response.json({
          ok: true,
          echo: true,
          received: body,
          at: new Date().toISOString(),
        });
      },
    },
  },
});
