import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bot, Download, Package, Sparkles, Trash2, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  installGafcoreExtension,
  listGafcoreExtensionsCatalog,
  uninstallGafcoreExtension,
  testGafcoreExtensionAgent,
} from "@/lib/gafcore-extensions.functions";
import type { CatalogListing } from "@/extensions/marketplace.server";

const INSTALL_ERRORS: Record<string, string> = {
  extensions_disabled: "El marketplace no está activado en el servidor.",
  install_limit_reached: "Has alcanzado el límite de extensiones instaladas.",
  listing_not_found: "Esta extensión ya no está disponible.",
  kind_not_supported_yet: "Este tipo de extensión aún no está soportado.",
  agent_webhook_required: "El agente debe definir webhookUrl en el manifest.",
  install_failed: "Error al guardar la instalación.",
};

const UNINSTALL_ERRORS: Record<string, string> = {
  extensions_disabled: "El marketplace no está activado en el servidor.",
  uninstall_failed: "No se pudo quitar la extensión.",
};

const KIND_LABEL: Record<string, string> = {
  template: "Plantilla",
  ai_plugin: "Plugin IA",
  agent: "Agente",
  workflow_pack: "Workflow",
};

type CatalogFilter = "all" | "template" | "ai_plugin" | "agent";

export const Route = createFileRoute("/gafcore_/marketplace")({
  component: MarketplacePage,
  head: () => ({ meta: [{ title: "Marketplace — GafCore" }] }),
});

function MarketplacePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const callList = useServerFn(listGafcoreExtensionsCatalog);
  const callInstall = useServerFn(installGafcoreExtension);
  const callUninstall = useServerFn(uninstallGafcoreExtension);
  const callTestAgent = useServerFn(testGafcoreExtensionAgent);
  const [filter, setFilter] = useState<CatalogFilter>("all");
  const [listings, setListings] = useState<CatalogListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setListings([]);
      setLoadError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await callList({
        data: filter === "all" ? {} : { kind: filter },
      });
      setListings(res.listings ?? []);
    } catch (e) {
      setListings([]);
      setLoadError(e instanceof Error ? e.message : "No se pudo cargar el catálogo");
    } finally {
      setLoading(false);
    }
  }, [callList, filter, user]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [load, authLoading]);

  const onInstall = async (item: CatalogListing) => {
    setBusyId(item.id);
    try {
      const res = await callInstall({ data: { listingId: item.id } });
      if (!res.ok) {
        toast.error("No se pudo instalar", {
          description: INSTALL_ERRORS[res.error] ?? res.error,
        });
        return;
      }
      await load();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("gafcore:extensions-changed"));
      }
      if (item.kind === "ai_plugin") {
        toast.success("Plugin IA activado", {
          description: "Afecta al chat del IDE en tus próximos mensajes.",
        });
        return;
      }
      if (item.kind === "agent") {
        toast.success("Agente instalado", {
          description: "Recibirá eventos al completar o fallar workflows multiagente.",
        });
        return;
      }
      toast.success("Plantilla instalada", {
        description: "Abriendo «Nuevo proyecto» en el IDE para usarla.",
      });
      if (typeof window !== "undefined") {
        sessionStorage.setItem("gafcore_open_new_project", "1");
        window.dispatchEvent(new Event("gafcore:open-new-project"));
      }
      void navigate({ to: "/gafcore/app" });
    } catch {
      toast.error("Error al instalar");
    } finally {
      setBusyId(null);
    }
  };

  const onUninstall = async (id: string) => {
    setBusyId(id);
    try {
      const res = await callUninstall({ data: { listingId: id } });
      if (!res.ok) {
        toast.error("No se pudo quitar", {
          description: UNINSTALL_ERRORS[res.error] ?? res.error,
        });
        return;
      }
      toast.success("Extensión quitada de tu cuenta");
      await load();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("gafcore:extensions-changed"));
      }
    } catch {
      toast.error("Error al quitar la extensión");
    } finally {
      setBusyId(null);
    }
  };

  const onTestAgent = async (listingId: string) => {
    setBusyId(listingId);
    try {
      const res = await callTestAgent({ data: { listingId } });
      if (!res.ok) {
        toast.error("Prueba fallida", { description: res.error });
        return;
      }
      toast.success("Webhook respondió", {
        description: `HTTP ${res.status} — revisa la consola del servidor si usas echo local.`,
      });
      console.info("[agent-test]", res.body);
    } catch {
      toast.error("Error al probar webhook");
    } finally {
      setBusyId(null);
    }
  };

  const filters: { id: CatalogFilter; label: string }[] = [
    { id: "all", label: "Todas" },
    { id: "template", label: "Plantillas" },
    { id: "ai_plugin", label: "Plugins IA" },
    { id: "agent", label: "Agentes" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/gafcore/app">
              <ArrowLeft className="mr-2 h-4 w-4" />
              IDE
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Marketplace GafCore</h1>
            <p className="text-sm text-muted-foreground">
              Plantillas, plugins de chat y agentes webhook para workflows.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex flex-wrap gap-2">
          {filters.map((f) => (
            <Button
              key={f.id}
              type="button"
              size="sm"
              variant={filter === f.id ? "default" : "outline"}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {authLoading ? (
          <p className="text-sm text-muted-foreground">Comprobando sesión…</p>
        ) : !user ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Inicia sesión para ver e instalar extensiones del marketplace.</p>
            <Button asChild>
              <Link to="/gafcore/login" search={{ redirect: "/gafcore/marketplace" }}>
                Entrar
              </Link>
            </Button>
          </div>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Cargando catálogo…</p>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : listings.length === 0 ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>No hay extensiones publicadas en esta categoría.</p>
            <p>
              Si acabas de desplegar: aplica las migraciones en el proyecto Supabase de producción
              (SQL Editor →{" "}
              <code className="text-xs">supabase/migrations/20260531120000_gafcore_extensions.sql</code>{" "}
              y seeds) o ejecuta{" "}
              <code className="text-xs">npm run gafcore:migrate-extensions</code> con el repo enlazado.
            </p>
            <p>
              Comprueba{" "}
              <a href="/api/__extensions-diag" className="text-primary underline" target="_blank" rel="noreferrer">
                /api/__extensions-diag
              </a>{" "}
              (debe mostrar <code className="text-xs">publishedCount</code> &gt; 0).
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {listings.map((item) => (
              <li
                key={item.id}
                className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  {item.kind === "ai_plugin" ? (
                    <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  ) : item.kind === "agent" ? (
                    <Bot className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  ) : (
                    <Package className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium">{item.name}</h2>
                      <Badge variant="outline">{KIND_LABEL[item.kind] ?? item.kind}</Badge>
                      {item.installed ? (
                        <Badge variant="secondary">Activa</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {item.publisherName} · v{item.version}
                    </p>
                  </div>
                </div>
                {item.installed ? (
                  <div className="mt-4 flex flex-col gap-2">
                    {item.kind === "agent" ? (
                      <Button
                        className="w-full"
                        size="sm"
                        variant="secondary"
                        disabled={busyId === item.id}
                        onClick={() => void onTestAgent(item.id)}
                      >
                        <Zap className="mr-2 h-4 w-4" />
                        {busyId === item.id ? "Probando…" : "Probar webhook"}
                      </Button>
                    ) : null}
                    <Button
                      className="w-full"
                      size="sm"
                      variant="outline"
                      disabled={busyId === item.id}
                      onClick={() => void onUninstall(item.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {busyId === item.id ? "Quitando…" : "Quitar de mi cuenta"}
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="mt-4 w-full"
                    size="sm"
                    disabled={busyId === item.id}
                    onClick={() => void onInstall(item)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {busyId === item.id ? "Instalando…" : "Instalar"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
