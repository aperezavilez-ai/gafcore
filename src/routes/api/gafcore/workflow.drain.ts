import { createFileRoute } from "@tanstack/react-router";
import { drainWorkflowQueue } from "@/tasks/workflow-drain.server";

/** POST /api/gafcore/workflow/drain — worker/cron (header x-cron-secret). */
const drainHandler = async ({ request }: { request: Request }) => {
  const result = await drainWorkflowQueue(request);
  const status = result.ok ? 200 : 401;
  return new Response(JSON.stringify(result), {
    status,
    headers: { "content-type": "application/json" },
  });
};

/** GET (Vercel Cron) + POST — worker en background. */
export const Route = createFileRoute("/api/gafcore/workflow/drain")({
  server: {
    handlers: {
      GET: drainHandler,
      POST: drainHandler,
    },
  },
});
