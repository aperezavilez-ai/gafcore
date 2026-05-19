import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  completeChatMessage,
  getGafcoreAiGateway,
  resolveGatewayModel,
} from "@/lib/gafcore-ai-gateway.server";
import { verifyTurnstileToken } from "@/lib/turnstile-verify.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const bodySchema = z.object({
  question: z.string().trim().min(4).max(1200),
  turnstileToken: z.string().trim().max(4096).optional(),
});

const SYSTEM = `Eres "Gafia", asistente de **GafCore** (plataforma para crear sitios y apps con IA: chat, preview y editor en /gafcore/app).
Responde en el mismo idioma que la pregunta (por defecto español). Máximo ~12 frases. Markdown ligero.
Temas: planes y créditos, cómo empezar, editor, publicar, cuenta, facturación general.
Si piden borrar cuenta, reembolsos o datos sensibles: indica que escriban a soporte@gafcore.com.
No inventes precios exactos ni fechas: remite a la sección de planes en gafcore.com/gafcore#planes si hace falta.`;

const rateBucket = new Map<string, number[]>();
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 24;

function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim().slice(0, 128);
  return request.headers.get("x-real-ip")?.trim().slice(0, 128) || "unknown";
}

function rateOk(ip: string): boolean {
  const now = Date.now();
  const arr = (rateBucket.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) return false;
  arr.push(now);
  rateBucket.set(ip, arr);
  return true;
}

export const Route = createFileRoute("/api/public/gafcore/support-faq")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }: { request: Request }) => {
        const ip = clientIp(request);
        if (!rateOk(ip)) {
          return new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "invalid_json" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "invalid_body" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim();
        if (turnstileSecret) {
          const tok = parsed.data.turnstileToken?.trim();
          if (!tok) {
            return new Response(JSON.stringify({ error: "turnstile_required" }), {
              status: 400,
              headers: { "Content-Type": "application/json", ...CORS },
            });
          }
          const ok = await verifyTurnstileToken(tok, ip);
          if (!ok) {
            return new Response(JSON.stringify({ error: "turnstile_failed" }), {
              status: 400,
              headers: { "Content-Type": "application/json", ...CORS },
            });
          }
        }

        let gateway: ReturnType<typeof getGafcoreAiGateway>;
        try {
          gateway = getGafcoreAiGateway();
        } catch {
          return new Response(JSON.stringify({ error: "ai_not_configured" }), {
            status: 503,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const model = resolveGatewayModel(gateway, { tier: "support" });

        let reply: string;
        try {
          const completed = await completeChatMessage({
            model,
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: parsed.data.question },
            ],
            temperature: 0.35,
          });
          reply = completed.content.trim() || "…";
        } catch (e: unknown) {
          const err = e as Error & { status?: number };
          return new Response(
            JSON.stringify({ error: "upstream", detail: err.message?.slice(0, 200) }),
            {
              status: err.status && err.status >= 400 && err.status < 600 ? err.status : 502,
              headers: { "Content-Type": "application/json", ...CORS },
            },
          );
        }
        return new Response(JSON.stringify({ reply }), {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
        });
      },
    },
  },
});
