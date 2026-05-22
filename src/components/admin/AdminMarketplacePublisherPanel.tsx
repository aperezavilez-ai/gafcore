import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listAdminMarketplaceListingsFn,
  publishAdminMarketplaceListingFn,
  setAdminMarketplaceListingStateFn,
} from "@/lib/gafcore-publisher.functions";
import type { AdminListingRow } from "@/extensions/publisher.server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Package, RefreshCw } from "lucide-react";

const EXAMPLE_TEMPLATE_MANIFEST = `{
  "kind": "template",
  "version": 1,
  "slug": "mi-plantilla",
  "name": "Mi plantilla",
  "description": "Descripción corta.",
  "category": "landing",
  "files": [
    {
      "name": "src/App.tsx",
      "language": "tsx",
      "content": "export default function App() { return <main className=\\"page\\"><h1>Hola</h1></main>; }"
    },
    {
      "name": "src/styles.css",
      "language": "css",
      "content": "body { margin: 0; font-family: system-ui, sans-serif; }"
    },
    {
      "name": "src/main.tsx",
      "language": "tsx",
      "content": "import React from \\"react\\";\\nimport { createRoot } from \\"react-dom/client\\";\\nimport App from \\"./App\\";\\nimport \\"./styles.css\\";\\ncreateRoot(document.getElementById(\\"root\\")!).render(<App />);"
    }
  ],
  "requiredPaths": ["src/App.tsx", "src/styles.css"]
}`;

const STATE_LABEL: Record<string, string> = {
  draft: "Borrador",
  review: "Revisión",
  published: "Publicado",
  revoked: "Revocado",
};

export function AdminMarketplacePublisherPanel() {
  const callList = useServerFn(listAdminMarketplaceListingsFn);
  const callPublish = useServerFn(publishAdminMarketplaceListingFn);
  const callState = useServerFn(setAdminMarketplaceListingStateFn);

  const [listings, setListings] = useState<AdminListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [publisherSlug, setPublisherSlug] = useState("gafcore-labs");
  const [listingSlug, setListingSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"template" | "ai_plugin" | "agent">("template");
  const [versionLabel, setVersionLabel] = useState("1.0.0");
  const [manifestJson, setManifestJson] = useState(EXAMPLE_TEMPLATE_MANIFEST);
  const [publishNow, setPublishNow] = useState(true);
  const [priceCents, setPriceCents] = useState(0);
  const [currency, setCurrency] = useState("eur");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await callList();
      setListings(res.listings ?? []);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [callList]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onPublish = async () => {
    if (!listingSlug.trim() || !name.trim()) {
      toast.error("Slug y nombre son obligatorios");
      return;
    }
    setBusy(true);
    try {
      const res = await callPublish({
        data: {
          publisherSlug: publisherSlug.trim(),
          listingSlug: listingSlug.trim().toLowerCase(),
          name: name.trim(),
          description: description.trim(),
          kind,
          versionLabel: versionLabel.trim() || "1.0.0",
          manifestJson,
          publish: publishNow,
          priceCents: Math.max(0, Math.floor(priceCents)),
          currency: currency.trim().toLowerCase() || "eur",
        },
      });
      if (!res.ok) {
        toast.error("No se publicó", { description: res.error });
        return;
      }
      toast.success(publishNow ? "Listing publicado en el catálogo" : "Borrador guardado");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al publicar");
    } finally {
      setBusy(false);
    }
  };

  const onSetState = async (listingId: string, state: "published" | "revoked" | "draft") => {
    setBusy(true);
    try {
      const res = await callState({ data: { listingId, state } });
      if (!res.ok) {
        toast.error("No se actualizó el estado");
        return;
      }
      toast.success(`Estado → ${STATE_LABEL[state] ?? state}`);
      await reload();
    } catch {
      toast.error("Error de estado");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/gafcore/admin/ops">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Ops
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/gafcore/marketplace">
            <Package className="mr-2 h-4 w-4" />
            Ver catálogo público
          </Link>
        </Button>
        <Button variant="outline" size="sm" disabled={loading || busy} onClick={() => void reload()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      <h1 className="text-2xl font-semibold text-foreground">Publisher — Marketplace</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Solo administradores. Publica extensiones validando el manifest v1 (Zod + paths seguros).
      </p>

      <section className="mt-8 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-medium">Catálogo (todos los estados)</h2>
        {loading ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando…
          </p>
        ) : listings.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Sin listings.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {listings.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <span className="min-w-0 flex-1 font-medium">{row.name}</span>
                <code className="text-xs text-muted-foreground">{row.slug}</code>
                <Badge variant="outline">{row.kind}</Badge>
                <Badge variant={row.state === "published" ? "default" : "secondary"}>
                  {STATE_LABEL[row.state] ?? row.state}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  v{row.versionLabel}
                  {row.priceCents > 0 ? ` · ${(row.priceCents / 100).toFixed(2)} ${currency}` : " · Gratis"}
                </span>
                {row.state !== "published" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void onSetState(row.id, "published")}
                  >
                    Publicar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onSetState(row.id, "revoked")}
                  >
                    Revocar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-medium">Nueva extensión / nueva versión</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pub-slug">Publisher slug</Label>
            <Input
              id="pub-slug"
              value={publisherSlug}
              onChange={(e) => setPublisherSlug(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="list-slug">Listing slug (único)</Label>
            <Input
              id="list-slug"
              value={listingSlug}
              onChange={(e) => setListingSlug(e.target.value)}
              placeholder="mi-extension"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="list-name">Nombre</Label>
            <Input id="list-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="list-desc">Descripción</Label>
            <Input
              id="list-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="list-kind">Tipo</Label>
            <select
              id="list-kind"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={kind}
              onChange={(e) => {
                const k = e.target.value as typeof kind;
                setKind(k);
                if (k === "ai_plugin") {
                  setManifestJson(
                    `{
  "kind": "ai_plugin",
  "version": 1,
  "id": "mi-plugin",
  "name": "Mi plugin IA",
  "description": "Ajusta el tono del chat.",
  "hooks": ["before_chat"],
  "systemPromptAppend": "Responde en español claro y breve."
}`,
                  );
                } else if (k === "agent") {
                  setManifestJson(
                    `{
  "kind": "agent",
  "version": 1,
  "slug": "mi-agente",
  "name": "Mi agente webhook",
  "description": "Notifica a mi URL.",
  "hooks": ["workflow_complete"],
  "runner": "webhook",
  "webhookUrl": "https://ejemplo.com/webhook",
  "canWriteFiles": false
}`,
                  );
                } else {
                  setManifestJson(EXAMPLE_TEMPLATE_MANIFEST);
                }
              }}
            >
              <option value="template">template</option>
              <option value="ai_plugin">ai_plugin</option>
              <option value="agent">agent</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="list-ver">Versión</Label>
            <Input
              id="list-ver"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="list-price">Precio (céntimos, 0 = gratis)</Label>
            <Input
              id="list-price"
              type="number"
              min={0}
              value={priceCents}
              onChange={(e) => setPriceCents(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="list-currency">Moneda</Label>
            <Input
              id="list-currency"
              value={currency}
              maxLength={3}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Label htmlFor="manifest">Manifest JSON (v1)</Label>
          <Textarea
            id="manifest"
            className="min-h-[240px] font-mono text-xs"
            value={manifestJson}
            onChange={(e) => setManifestJson(e.target.value)}
          />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={publishNow}
            onChange={(e) => setPublishNow(e.target.checked)}
          />
          Publicar de inmediato (visible en marketplace)
        </label>
        <Button className="mt-4" disabled={busy} onClick={() => void onPublish()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Guardar listing
        </Button>
      </section>
    </div>
  );
}
