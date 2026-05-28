import { useEffect, useState } from "react";
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
import { Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { gafcoreAuthJsonFetch } from "@/lib/gafcore-client-auth-fetch";
import { GAFCORE_DEFAULT_TEMPLATE_SLUG } from "@/lib/gafcore-templates.shared";
import {
  clearPendingMarketplaceTemplate,
  readPendingMarketplaceTemplate,
  suggestProjectNameFromTemplate,
} from "@/lib/gafcore-marketplace-template-pending.shared";
import type { FileItem } from "@/components/ide/CodeEditor";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: { id: string; name: string; created_at: string }, files: FileItem[]) => void;
};

export function NewProjectDialog({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState("Mi proyecto");
  const [slug, setSlug] = useState(GAFCORE_DEFAULT_TEMPLATE_SLUG);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const pending = readPendingMarketplaceTemplate();
    if (pending) {
      setSlug(pending.slug);
      setName(suggestProjectNameFromTemplate(pending.name));
      clearPendingMarketplaceTemplate();
    }
  }, [open]);

  const submit = async () => {
    const trimmedName = name.trim();
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
      onCreated(result.project, (result.files ?? []) as FileItem[]);
      onOpenChange(false);
      setName("Mi proyecto");
      setSlug(GAFCORE_DEFAULT_TEMPLATE_SLUG);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error de red o sesión";
      toast.error("No se pudo crear el proyecto", { description: msg });
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
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              ¿Quieres empezar con una plantilla del Marketplace?{" "}
              <Link
                to="/gafcore/marketplace"
                className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => onOpenChange(false)}
              >
                <Package className="h-3 w-3" />
                Ir al Marketplace
              </Link>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="np-name">Nombre del proyecto</Label>
            <Input
              id="np-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && !loading) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Mi tienda"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Después, en el chat del editor, pídele al cerebro de GafCore lo que quieras
              construir.
            </p>
          </div>

          <div className="border-t border-border/60 pt-3">
            <Link
              to="/gafcore/marketplace"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/15"
              onClick={() => onOpenChange(false)}
            >
              <Package className="h-4 w-4" />
              Usa nuestras plantillas
            </Link>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Elige una plantilla en Marketplace, pon nombre y ábrela en el editor de GafCore.
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
