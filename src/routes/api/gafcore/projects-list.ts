import { createFileRoute } from "@tanstack/react-router";
import { handleGafcoreProjectsListPost, handleGafcoreProjectsListGet } from "@/lib/gafcore-projects-http.server";

export const Route = createFileRoute("/api/gafcore/projects-list")({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) => handleGafcoreProjectsListPost(request),
      GET: ({ request }: { request: Request }) => handleGafcoreProjectsListGet(request),
    },
  },
});
