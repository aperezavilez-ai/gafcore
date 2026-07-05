import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { requireUser } from "./elevenlabs/-_auth";
import { GAFCORE_ASSISTANT_SYSTEM_PROMPT } from "@/lib/gafcore-assistant-prompt.shared";
import { parseUpstreamFailure } from "@/lib/gafcore-ai-gateway.server";
import { streamClaudeChat } from "@/services/claudeService";

type Mode = "fast" | "reasoning" | "pro";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = await requireUser(request);
        if (auth instanceof Response) return auth;

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

        const conversation = messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));

        const upstream = await streamClaudeChat(conversation, {
          systemPrompt: GAFCORE_ASSISTANT_SYSTEM_PROMPT,
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
