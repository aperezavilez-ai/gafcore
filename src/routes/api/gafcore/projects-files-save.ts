import { createFileRoute } from "@tanstack/react-router";
import { handleGafcoreProjectsFilesSavePost } from "@/lib/gafcore-projects-http.server";

export const Route = createFileRoute("/api/gafcore/projects-files-save")({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) => handleGafcoreProjectsFilesSavePost(request),
    },
  },
});
