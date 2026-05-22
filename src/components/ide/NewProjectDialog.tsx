import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
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
import { Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import {
  createProjectFromTemplate,
  listGafcoreProjectTemplates,
} from "@/lib/gafcore-templates.functions";
import { GAFCORE_DEFAULT_TEMPLATE_SLUG } from "@/lib/gafcore-templates.shared";
import type { FileItem } from "@/components/ide/CodeEditor";

type TemplateRow = { slug: string; name: string; description: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: { id: string; name: string; created_at: string }, files: FileItem[]) => void;
};

export function NewProjectDialog({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState("Mi proyecto");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [slug, setSlug] = useState(GAFCORE_DEFAULT_TEMPLATE_SLUG);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);

  const callList = useServerFn(listGafcoreProjectTemplates);
  const callCreate = useServerFn(createProjectFromTemplate);

  useEffect(() => {
    if (!open) return;
    setLoadingList(true);
    void callList()
      .then((r) => {
        const list = r?.templates ?? [];
        setTemplates(list);
        if (list.length > 0) setSlug(list[0].slug);
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
  }, [open, callList]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const result = await callCreate({
        data: { name: trimmed, templateSlug: slug },
      });
      if (!result?.ok || !result.project) {
        toast.error(result?.message ?? "No se pudo crear el proyecto");
        return;
      }
      onCreated(result.project, (result.files ?? []) as FileItem[]);
      onOpenChange(false);
      setName("Mi proyecto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Plantilla</Label>
            {loadingList ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando plantillas…
              </p>
            ) : (
              <ul className="max-h-48 space-y-2 overflow-y-auto">
                {templates.map((t) => (
                  <li key={t.slug}>
                    <button
                      type="button"
                      onClick={() => setSlug(t.slug)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        slug === t.slug
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <span className="font-medium text-foreground">{t.name}</span>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={loading || !name.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
