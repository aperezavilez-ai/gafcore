import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronRight, Loader2, Package, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { gafcoreAuthJsonFetch } from "@/lib/gafcore-client-auth-fetch";
import { GAFCORE_DEFAULT_TEMPLATE_SLUG } from "@/lib/gafcore-templates.shared";
import type { FileItem } from "@/components/ide/CodeEditor";

type TemplateRow = {
  slug: string;
  name: string;
  description: string;
  category?: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  starter: "Web",
  landing: "Landing",
  ecommerce: "Tienda",
  mobile: "Móvil",
  dashboard: "Panel",
  blog: "Blog",
  portfolio: "Portfolio",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: { id: string; name: string; created_at: string }, files: FileItem[]) => void;
};

const SUGGESTIONS = [
  "Una landing para mi startup SaaS con hero, features, pricing y testimonios.",
  "Una tienda online de ropa con catálogo, carrito y checkout.",
  "Un portafolio personal con sección de proyectos y blog.",
  "Una app PWA tipo lista de tareas con persistencia local.",
];

export function NewProjectDialog({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState("Mi proyecto");
  const [description, setDescription] = useState("");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [slug, setSlug] = useState(GAFCORE_DEFAULT_TEMPLATE_SLUG);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const refreshTemplates = useCallback(() => {
    setLoadingList(true);
    void gafcoreAuthJsonFetch<{ ok: boolean; templates?: TemplateRow[] }>(
      "/api/gafcore/project-templates",
      {},
    )
      .then((r) => {
        const list = r.templates ?? [];
        setTemplates(list);
        if (list.length > 0 && !list.some((t) => t.slug === slug)) setSlug(list[0].slug);
      })
      .catch(() => {
        setTemplates([
          {
            slug: GAFCORE_DEFAULT_TEMPLATE_SLUG,
            name: "Vite + React (blank)",
            description: "Base functional-first",
          },
        ]);
      })
      .finally(() => setLoadingList(false));
  }, [slug]);

  useEffect(() => {
    if (!open) return;
    if (showTemplates) refreshTemplates();
  }, [open, showTemplates, refreshTemplates]);

  useEffect(() => {
    const onExt = () => {
      if (open && showTemplates) refreshTemplates();
    };
    window.addEventListener("gafcore:extensions-changed", onExt);
    return () => window.removeEventListener("gafcore:extensions-changed", onExt);
  }, [open, showTemplates, refreshTemplates]);

  const submit = async () => {
    const trimmedName = name.trim();
    const trimmedDesc = description.trim();
    if (!trimmedName) return;
    setLoading(true);
    try {
      const result = await gafcoreAuthJsonFetch<{
        ok: boolean;
        project?: { id: string; name: string; created_at: string };
        files?: FileItem[];
        error?: string;
      }>("/api/gafcore/projects-create", { name: trimmedName, templateSlug: slug });

      if (!result.ok || !result.project) {
        toast.error(result.error ?? "No se pudo crear el proyecto");
        return;
      }

      // Si el usuario describió lo que quiere, lo guardamos para que el ChatPanel del
      // editor lo autoenvíe al cerebro en cuanto se monte.
      if (trimmedDesc.length >= 3) {
        try {
          sessionStorage.setItem(
            `gafcore:initial-instruction:${result.project.id}`,
            trimmedDesc,
          );
        } catch {
          /* storage lleno o denegado: no bloquear creación */
        }
      }

      onCreated(result.project, (result.files ?? []) as FileItem[]);
      onOpenChange(false);
      setName("Mi proyecto");
      setDescription("");
      setShowTemplates(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error de red o sesión";
      toast.error("No se pudo crear el proyecto", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo proyecto</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="np-name">Nombre</Label>
            <Input
              id="np-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mi tienda"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="np-desc" className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              ¿Qué quieres construir?
            </Label>
            <Textarea
              id="np-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej.: Una landing premium en violeta para una app de notas con IA — hero, 3 features, pricing con 3 planes, testimonios y FAQ. Mobile-first."
              rows={5}
              autoFocus
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              El cerebro de GafCore generará todo desde tu descripción. Cuanto más concreto seas
              (público, secciones, estilo), mejor el resultado.
            </p>
            {description.trim().length === 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setDescription(s)}
                    className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                  >
                    {s.length > 50 ? s.slice(0, 47) + "…" : s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="border-t border-border/60 pt-3">
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {showTemplates ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              Opciones avanzadas: empezar desde plantilla
            </button>

            {showTemplates ? (
              <div className="mt-3 space-y-2">
                {loadingList ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando plantillas…
                  </p>
                ) : templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay plantillas en el catálogo. Se usará la plantilla base.
                  </p>
                ) : (
                  <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
                    {templates.map((t) => (
                      <li key={t.slug}>
                        <button
                          type="button"
                          onClick={() => setSlug(t.slug)}
                          className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                            slug === t.slug
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/50"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{t.name}</span>
                            {t.category ? (
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                {CATEGORY_LABEL[t.category] ?? t.category}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {t.description}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  ¿Más plantillas?{" "}
                  <Link
                    to="/gafcore/marketplace"
                    className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => onOpenChange(false)}
                  >
                    <Package className="h-3 w-3" />
                    Abrir Marketplace
                  </Link>
                </p>
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={loading || !name.trim()}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : description.trim().length >= 3 ? (
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Crear y construir
              </span>
            ) : (
              "Crear"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
