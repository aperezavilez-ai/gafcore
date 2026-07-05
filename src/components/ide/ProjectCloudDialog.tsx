import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Cloud, Database, Loader2, Plug, Copy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { getUserSupabase } from "@/lib/userSupabase";
import { getIdeConfig } from "@/lib/ideConfig";
import {
  isViteSupabaseConfigured,
  resolveSupabaseUrlFromViteEnv,
} from "@/lib/gafcore-supabase-env.shared";
import { supabase } from "@/lib/gafcore-supabase-client-proxy";
import { cn } from "@/lib/utils";

const PROJECT_TABLES = [
  { name: "projects", label: "projects" },
  { name: "project_files", label: "project_files" },
  { name: "chat_messages", label: "chat_messages" },
  { name: "project_snapshots", label: "project_snapshots" },
  { name: "project_secrets", label: "project_secrets" },
  { name: "project_publishes", label: "project_publishes" },
  { name: "mcp_connections", label: "mcp_connections" },
] as const;

type TableStat = {
  name: string;
  label: string;
  count: number | null;
};

type CloudStatus = {
  connected: boolean;
  url: string | null;
  projectName: string | null;
  tables: TableStat[];
  reason: string | null;
};

async function countForTable(
  table: (typeof PROJECT_TABLES)[number]["name"],
  projectId: string,
): Promise<number | null> {
  const sb = getUserSupabase();
  if (!sb) return null;
  if (table === "projects") {
    const { count, error } = await sb
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("id", projectId);
    return error ? null : (count ?? 0);
  }
  const { count, error } = await sb
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  return error ? null : (count ?? 0);
}

async function loadCloudStatus(
  projectId: string | null,
  projectName: string | null,
): Promise<CloudStatus> {
  const viteUrl = resolveSupabaseUrlFromViteEnv();
  const customUrl = getIdeConfig().supabaseUrl?.trim();
  const url = viteUrl || customUrl || null;

  if (!isViteSupabaseConfigured() && !customUrl) {
    return {
      connected: false,
      url: null,
      projectName: null,
      tables: [],
      reason: "Supabase no está configurado en este entorno.",
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user) {
    return {
      connected: false,
      url,
      projectName: null,
      tables: [],
      reason: "Inicia sesión para conectar tu proyecto a la nube de GafCore.",
    };
  }

  if (!projectId) {
    return {
      connected: false,
      url,
      projectName: null,
      tables: [],
      reason: "Crea o abre un proyecto para ver sus datos en la nube.",
    };
  }

  const sb = getUserSupabase();
  if (!sb) {
    return {
      connected: false,
      url,
      projectName,
      tables: [],
      reason: "No se pudo inicializar el cliente de Supabase.",
    };
  }

  const { error: probeErr } = await sb.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (probeErr) {
    return {
      connected: false,
      url,
      projectName,
      tables: [],
      reason: "No se pudo acceder al proyecto en Supabase. Revisa tu sesión o la configuración.",
    };
  }

  const tables = await Promise.all(
    PROJECT_TABLES.map(async (t) => ({
      name: t.name,
      label: t.label,
      count: await countForTable(t.name, projectId),
    })),
  );

  return {
    connected: true,
    url,
    projectName,
    tables,
    reason: null,
  };
}

export function ProjectCloudDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  onConnect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  projectName: string | null;
  onConnect: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<CloudStatus | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await loadCloudStatus(projectId, projectName));
    } catch {
      setStatus({
        connected: false,
        url: resolveSupabaseUrlFromViteEnv() || getIdeConfig().supabaseUrl || null,
        projectName,
        tables: [],
        reason: "Error al consultar el estado de la nube.",
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, projectName]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const copyUrl = async () => {
    if (!status?.url) return;
    try {
      await navigator.clipboard.writeText(status.url);
      toast.success("URL copiada");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-primary" />
            Nube · Supabase
          </DialogTitle>
          <DialogDescription>
            Estado de la base de datos del proyecto actual en GafCore.
          </DialogDescription>
        </DialogHeader>

        {loading || !status ? (
          <div className="flex items-center justify-center py-14">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : status.connected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Conectado</p>
                {status.projectName ? (
                  <p className="truncate text-xs text-muted-foreground">Proyecto: {status.projectName}</p>
                ) : null}
              </div>
              <Badge variant="secondary" className="ml-auto shrink-0 text-[10px]">
                Activo
              </Badge>
            </div>

            {status.url ? (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  URL de Supabase
                </p>
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <code className="min-w-0 flex-1 truncate text-xs text-foreground">{status.url}</code>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => void copyUrl()}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tablas del proyecto
              </p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {status.tables.map((t) => (
                  <li key={t.name} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono text-xs text-foreground">{t.label}</span>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-xs tabular-nums",
                        t.count === null ? "text-muted-foreground" : "font-medium text-foreground",
                      )}
                    >
                      {t.count === null ? "—" : t.count.toLocaleString("es")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
              <Cloud className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Sin conexión a la nube</p>
              <p className="mt-1 text-xs text-muted-foreground">{status.reason}</p>
              {status.url ? (
                <p className="mt-3 truncate font-mono text-[11px] text-muted-foreground">{status.url}</p>
              ) : null}
            </div>
            <Button type="button" className="w-full" onClick={onConnect}>
              <Plug className="mr-2 h-4 w-4" />
              Conectar Supabase
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
