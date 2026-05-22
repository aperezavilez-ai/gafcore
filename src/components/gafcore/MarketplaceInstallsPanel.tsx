import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Package, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  listGafcoreUserInstalls,
  uninstallGafcoreExtension,
} from "@/lib/gafcore-extensions.functions";
import type { UserExtensionInstall } from "@/extensions/marketplace.server";

const KIND_LABEL: Record<string, string> = {
  template: "Plantilla",
  ai_plugin: "Plugin IA",
  agent: "Agente",
  workflow_pack: "Workflow",
};

export function MarketplaceInstallsPanel() {
  const callList = useServerFn(listGafcoreUserInstalls);
  const callUninstall = useServerFn(uninstallGafcoreExtension);
  const [installs, setInstalls] = useState<UserExtensionInstall[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await callList();
      setInstalls(res.installs ?? []);
    } catch {
      setInstalls([]);
    } finally {
      setLoading(false);
    }
  }, [callList]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onChange = () => void load();
    window.addEventListener("gafcore:extensions-changed", onChange);
    return () => window.removeEventListener("gafcore:extensions-changed", onChange);
  }, [load]);

  const onUninstall = async (listingId: string) => {
    setBusyId(listingId);
    try {
      const res = await callUninstall({ data: { listingId } });
      if (!res.ok) {
        toast.error("No se pudo quitar la extensión");
        return;
      }
      toast.success("Extensión quitada");
      await load();
      window.dispatchEvent(new Event("gafcore:extensions-changed"));
    } catch {
      toast.error("Error al quitar");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando extensiones…
      </p>
    );
  }

  if (installs.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          No tienes extensiones instaladas. Explora plantillas y plugins IA en el marketplace.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/gafcore/marketplace">Abrir marketplace</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/gafcore/publisher">Publicar extensión</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/gafcore/marketplace">Explorar más</Link>
        </Button>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {installs.map((item) => (
          <li key={item.listingId} className="flex items-start gap-3 px-4 py-3">
            {item.kind === "ai_plugin" ? (
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            ) : item.kind === "agent" ? (
              <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            ) : (
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{item.name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {KIND_LABEL[item.kind] ?? item.kind}
                </Badge>
              </div>
              {item.description ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
              ) : null}
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">{item.installSlug}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              disabled={busyId === item.listingId}
              onClick={() => void onUninstall(item.listingId)}
            >
              {busyId === item.listingId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
