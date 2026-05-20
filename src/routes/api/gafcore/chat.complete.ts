import { createFileRoute } from "@tanstack/react-router";
import { handleGafcoreChatCompletePost } from "@/lib/gafcore-chat-api.server";

/** POST /api/gafcore/chat/complete — JSON (fallback del IDE). */
export const Route = createFileRoute("/api/gafcore/chat/complete")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => handleGafcoreChatCompletePost(request),
    },
  },
});
