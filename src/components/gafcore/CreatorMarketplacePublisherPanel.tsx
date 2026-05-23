import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  fetchMyPublisherListings,
  fetchMyPublisherProfile,
  submitCreatorMarketplaceListing,
} from "@/lib/gafcore-extensions-client";
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
    }
  ],
  "requiredPaths": ["src/App.tsx"]
}`;

const STATE_LABEL: Record<string, string> = {
  draft: "Borrador",
  review: "En revisión",
  published: "Publicado",
  revoked: "Revocado",
};

export function CreatorMarketplacePublisherPanel() {
  const [publisherSlug, setPublisherSlug] = useState<string | null>(null);
  const [listings, setListings] = useState<AdminListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [listingSlug, setListingSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"template" | "ai_plugin" | "agent">("template");
  const [versionLabel, setVersionLabel] = useState("1.0.0");
  const [manifestJson, setManifestJson] = useState(EXAMPLE_TEMPLATE_MANIFEST);
  const [submitForReview, setSubmitForReview] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const pubRes = await fetchMyPublisherProfile();
      if (pubRes.ok && pubRes.publisher) setPublisherSlug(pubRes.publisher.slug);
      const res = await fetchMyPublisherListings();
      setListings(res.listings ?? []);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onSubmit = async () => {
    if (!listingSlug.trim() || !name.trim()) {
      toast.error("Slug y nombre son obligatorios");
      return;
    }
    setBusy(true);
    try {
      const res = await submitCreatorMarketplaceListing({
        listingSlug: listingSlug.trim().toLowerCase(),
        name: name.trim(),
        description: description.trim(),
        kind,
        versionLabel: versionLabel.trim() || "1.0.0",
        manifestJson,
        publish: submitForReview,
      });
      if (!res.ok) {
        toast.error("No se envió", { description: res.error });
        return;
      }
      toast.success(
        res.state === "review"
          ? "Enviado a revisión — un admin lo publicará en el catálogo (revisa /gafcore/admin/marketplace)"
          : "Borrador guardado",
      );
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al enviar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/gafcore/marketplace">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Marketplace
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/gafcore/app">
            <Package className="mr-2 h-4 w-4" />
            IDE
          </Link>
        </Button>
        <Button variant="outline" size="sm" disabled={loading || busy} onClick={() => void reload()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      <h1 className="text-2xl font-semibold text-foreground">Publicar extensión</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Envía plantillas, plugins IA o agentes webhook. Un admin revisará y publicará en el catálogo.
        {publisherSlug ? (
          <>
            {" "}
            Tu publisher: <code className="text-xs">{publisherSlug}</code>
          </>
        ) : null}
      </p>

      <section className="mt-8 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-medium">Tus listings</h2>
        {loading ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando…
          </p>
        ) : listings.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Aún no has creado ningún listing.</p>
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
                <span className="text-xs text-muted-foreground">v{row.versionLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-medium">Nueva extensión</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="list-slug">Slug (único, a-z0-9-)</Label>
            <Input
              id="list-slug"
              value={listingSlug}
              onChange={(e) => setListingSlug(e.target.value)}
              placeholder="mi-extension"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="list-ver">Versión</Label>
            <Input
              id="list-ver"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
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
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="template">Plantilla</option>
              <option value="ai_plugin">Plugin IA</option>
              <option value="agent">Agente</option>
            </select>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Label htmlFor="manifest">Manifest JSON (v1)</Label>
          <Textarea
            id="manifest"
            className="min-h-[200px] font-mono text-xs"
            value={manifestJson}
            onChange={(e) => setManifestJson(e.target.value)}
          />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={submitForReview}
            onChange={(e) => setSubmitForReview(e.target.checked)}
          />
          Enviar a revisión (recomendado)
        </label>
        <Button className="mt-4" disabled={busy} onClick={() => void onSubmit()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Guardar
        </Button>
      </section>
    </div>
  );
}
