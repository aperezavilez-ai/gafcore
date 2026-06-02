import { useEffect, useState } from "react";
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { gafcoreAuthJsonFetch } from "@/lib/gafcore-client-auth-fetch";
import { clearPendingMarketplaceTemplate } from "@/lib/gafcore-marketplace-template-pending.shared";
import type { FileItem } from "@/components/ide/CodeEditor";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: { id: string; name: string; created_at: string }, files: FileItem[]) => void;
};

export function NewProjectDialog({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState("Mi proyecto");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    clearPendingMarketplaceTemplate();
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
      }>("/api/gafcore/projects-create", { name: trimmedName });

      if (!result.ok || !result.project) {
        toast.error(result.error ?? "No se pudo crear el proyecto");
        return;
      }
      onCreated(result.project, (result.files ?? []) as FileItem[]);
      onOpenChange(false);
      setName("Mi proyecto");
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
