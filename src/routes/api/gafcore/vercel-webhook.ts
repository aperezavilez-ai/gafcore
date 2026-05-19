import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  extractGafcoreProjectIdFromVercelMeta,
  setProjectDeployStatus,
} from "@/lib/gafcore-deploy-status.server";
import { mapVercelReadyState } from "@/lib/vercel-deploy.server";

/**
 * POST /api/gafcore/vercel-webhook
 * Eventos de deployment Vercel → actualiza deploy_status del proyecto.
 * Configura en Vercel: Webhooks → Deployment + secret = VERCEL_WEBHOOK_SECRET
 */
export const Route = createFileRoute("/api/gafcore/vercel-webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const rawBody = await request.text();
        const secret = process.env.VERCEL_WEBHOOK_SECRET?.trim();

        if (secret) {
          const sig = request.headers.get("x-vercel-signature");
          if (!sig || !verifyVercelSignature(rawBody, sig, secret)) {
            return json({ error: "invalid_signature" }, 401);
          }
        }

        let body: unknown;
        try {
          body = JSON.parse(rawBody);
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        const deployment = extractDeployment(body);
        if (!deployment) {
          return json({ ok: true, skipped: true });
        }

        const projectId = extractGafcoreProjectIdFromVercelMeta(deployment.meta);

        if (!projectId) {
          return json({ ok: true, skipped: true, reason: "no_project_meta" });
        }

        const status = mapVercelReadyState(deployment.readyState ?? deployment.state);
        await setProjectDeployStatus(projectId, {
          status,
          deploymentId: deployment.id ?? null,
          error: status === "error" ? "Deploy fallido (webhook Vercel)" : null,
        });

        return json({ ok: true, projectId, status });
      },
    },
  },
});

function verifyVercelSignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha1", secret).update(body).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return signature === expected;
  }
}

function extractDeployment(body: unknown): {
  id?: string;
  meta?: unknown;
  readyState?: string;
  state?: string;
} | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const payload = b.payload as Record<string, unknown> | undefined;
  const dep = (payload?.deployment ?? b.deployment) as Record<string, unknown> | undefined;
  if (!dep || typeof dep !== "object") return null;
  return {
    id: typeof dep.id === "string" ? dep.id : undefined,
    meta: dep.meta,
    readyState: typeof dep.readyState === "string" ? dep.readyState : undefined,
    state: typeof dep.state === "string" ? dep.state : undefined,
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
