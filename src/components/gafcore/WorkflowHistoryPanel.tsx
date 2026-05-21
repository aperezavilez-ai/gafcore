import { useCallback, useEffect, useState } from "react";
import { GitFork, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { listGafcoreProjectWorkflows } from "@/lib/gafcore-workflow.functions";
import { getCurrentProjectId } from "@/lib/userSupabase";
import { Badge } from "@/components/ui/badge";

type RunRow = {
  id: string;
  state: string;
  instruction: string;
  pipelineRunId: string | null;
  createdAt: string;
  metrics: {
    taskCounts: { total: number; succeeded: number; failed: number };
    durationMs: number | null;
  };
};

export function WorkflowHistoryPanel() {
  const callList = useServerFn(listGafcoreProjectWorkflows);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const pid = await getCurrentProjectId();
    setProjectId(pid);
    if (!pid) {
      setRuns([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await callList({ data: { projectId: pid, limit: 10 } });
      setRuns(res.ok ? (res.runs as RunRow[]) : []);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [callList]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!projectId) {
    return (
      <p className="text-sm text-muted-foreground">
        Abre un proyecto en el IDE para ver workflows multiagente.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Últimos workflows multiagente de este proyecto (plan + tareas en servidor).
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando…
        </div>
      ) : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay workflows. Activa Multiagente en el IDE.</p>
      ) : (
        <ul className="space-y-3">
          {runs.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <GitFork className="h-3.5 w-3.5 text-muted-foreground" />
                <Badge variant="outline">{r.state}</Badge>
                {r.metrics.durationMs != null ? (
                  <span className="text-xs text-muted-foreground">
                    {Math.round(r.metrics.durationMs / 1000)}s
                  </span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {r.metrics.taskCounts.succeeded}/{r.metrics.taskCounts.total} OK
                  {r.metrics.taskCounts.failed > 0
                    ? ` · ${r.metrics.taskCounts.failed} fallo(s)`
                    : ""}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-muted-foreground">{r.instruction}</p>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{r.id}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
