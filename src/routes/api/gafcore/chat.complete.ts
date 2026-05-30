import { createFileRoute } from "@tanstack/react-router";
import { handleGafcoreChatCompletePost } from "@/lib/gafcore-chat-api.server";
import { withGafcoreApiDiagnostics } from "@/services/health/gafcore-api-error-handler.server";

/** POST /api/gafcore/chat/complete — JSON (fallback del IDE). */
export const Route = createFileRoute("/api/gafcore/chat/complete")({
  server: {
    handlers: {
      POST: withGafcoreApiDiagnostics(
        (request) => handleGafcoreChatCompletePost(request),
        { component: "gafcore.chat.complete" },
      ),
    },
  },
});
