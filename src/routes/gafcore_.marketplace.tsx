import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Download, Package } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  installGafcoreExtension,
  listGafcoreExtensionsCatalog,
} from "@/lib/gafcore-extensions.functions";
import type { CatalogListing } from "@/extensions/marketplace.server";

export const Route = createFileRoute("/gafcore_/marketplace")({
  component: MarketplacePage,
  head: () => ({ meta: [{ title: "Marketplace — GafCore" }] }),
});

function MarketplacePage() {
  const navigate = useNavigate();
  const callList = useServerFn(listGafcoreExtensionsCatalog);
  const callInstall = useServerFn(installGafcoreExtension);
  const [listings, setListings] = useState<CatalogListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [installingId, setInstallingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await callList({ data: { kind: "template" } });
      setListings(res.listings ?? []);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [callList]);

  useEffect(() => {
    void load();
  }, [load]);

  const onInstall = async (id: string) => {
    setInstallingId(id);
    try {
      const res = await callInstall({ data: { listingId: id } });
      if (!res.ok) {
        toast.error("No se pudo instalar", { description: res.error });
        return;
      }
      toast.success("Plantilla instalada", {
        description: "Abriendo «Nuevo proyecto» en el IDE para usarla.",
      });
      await load();
      if (typeof window !== "undefined") {
        sessionStorage.setItem("gafcore_open_new_project", "1");
        window.dispatchEvent(new Event("gafcore:open-new-project"));
      }
      void navigate({ to: "/gafcore/app" });
    } catch {
      toast.error("Error al instalar");
    } finally {
      setInstallingId(null);
    }
  };

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
              Extensiones de plantillas (E1). Plugins IA y agentes — próximamente.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando catálogo…</p>
        ) : listings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay extensiones publicadas. Aplica la migración{" "}
            <code className="text-xs">20260531120000_gafcore_extensions.sql</code> en Supabase.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {listings.map((item) => (
              <li
                key={item.id}
                className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <Package className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium">{item.name}</h2>
                      <Badge variant="outline">{item.kind}</Badge>
                      {item.installed ? (
                        <Badge variant="secondary">Instalada</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {item.publisherName} · v{item.version}
                    </p>
                  </div>
                </div>
                <Button
                  className="mt-4 w-full"
                  size="sm"
                  variant={item.installed ? "outline" : "default"}
                  disabled={item.installed || installingId === item.id}
                  onClick={() => void onInstall(item.id)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {item.installed
                    ? "Instalada"
                    : installingId === item.id
                      ? "Instalando…"
                      : "Instalar"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
