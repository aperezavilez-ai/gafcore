import { createFileRoute } from "@tanstack/react-router";
import { handleGafcoreChatStreamPost } from "@/lib/gafcore-chat-api.server";

/**
 * POST /api/gafcore/chat/stream
 * En producción el handler real está en `server.ts` → gafcore-chat-api.server (evita SSR 500).
 */
export const Route = createFileRoute("/api/gafcore/chat/stream")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => handleGafcoreChatStreamPost(request),
    },
  },
});
