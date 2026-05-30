import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { requireUser } from "./elevenlabs/-_auth";
import {
  getGafcoreAiGateway,
  parseUpstreamFailure,
  resolveGatewayModel,
  streamChatCompletions,
} from "@/lib/gafcore-ai-gateway.server";
import { sanitizeUserFacingAiText } from "@/lib/gafcore-user-facing-errors";

const SYSTEM_PROMPT = `Eres GafCore AI, asistente de la plataforma de creación con IA. Responde en español de forma clara, breve y útil. Usa markdown cuando ayude.`;

type Mode = "fast" | "reasoning" | "pro";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = await requireUser(request);
        if (auth instanceof Response) return auth;

        let gateway: ReturnType<typeof getGafcoreAiGateway>;
        try {
          gateway = getGafcoreAiGateway();
        } catch {
          return new Response(
            JSON.stringify({
              error: "ai_not_configured",
              detail: sanitizeUserFacingAiText("ai_not_configured"),
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        let body: { messages?: Array<{ role: string; content: string }>; mode?: Mode };
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (messages.length === 0) {
          return new Response(JSON.stringify({ error: "messages required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const mode: Mode = body.mode && ["fast", "reasoning", "pro"].includes(body.mode) ? body.mode : "fast";
        const model = resolveGatewayModel(gateway, {
          tier: mode === "fast" ? "fast" : "deep",
        });

        const upstream = await streamChatCompletions({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        });

        if (!upstream.ok) {
          const fail = await parseUpstreamFailure(upstream);
          return new Response(JSON.stringify({ error: fail.message, detail: fail.detail }), {
            status: fail.status,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
