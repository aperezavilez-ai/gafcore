import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/gafcore/orchestrator/events?runId=<uuid>
 * SSE de hitos del pipeline (polling ligero cada ~1.2s, máx ~2 min).
 */
export const Route = createFileRoute("/api/gafcore/orchestrator/events")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        const url = new URL(request.url);
        const runId = url.searchParams.get("runId");
        if (!runId) {
          return new Response("runId required", { status: 400 });
        }

        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
          return new Response("orchestrator_sse_not_configured", { status: 500 });
        }

        const sb = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false },
        });

        const encoder = new TextEncoder();
        let closed = false;
        let lastEventCount = -1;
        let ticks = 0;
        const maxTicks = 100;

        const stream = new ReadableStream({
          start(controller) {
            const send = (event: string, data: unknown) => {
              if (closed) return;
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            const poll = async () => {
              if (closed || ticks >= maxTicks) {
                send("done", { reason: ticks >= maxTicks ? "timeout" : "closed" });
                controller.close();
                return;
              }
              ticks += 1;

              const { data: row, error } = await sb
                .from("gafcore_pipeline_runs")
                .select("state, current_step, events_json, error_code, updated_at")
                .eq("id", runId)
                .eq("user_id", userId)
                .maybeSingle();

              if (error || !row) {
                send("error", { message: "run_not_found" });
                controller.close();
                return;
              }

              const events = Array.isArray(row.events_json) ? row.events_json : [];
              if (events.length !== lastEventCount) {
                lastEventCount = events.length;
                send("progress", {
                  state: row.state,
                  current_step: row.current_step,
                  events,
                  error_code: row.error_code,
                  updated_at: row.updated_at,
                });
              }

              const terminal = ["completed", "failed", "cancelled"].includes(String(row.state));
              if (terminal) {
                send("done", { state: row.state });
                controller.close();
                return;
              }

              setTimeout(poll, 1200);
            };

            void poll();
          },
          cancel() {
            closed = true;
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
