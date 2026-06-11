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
import { useCreateProject } from "@/hooks/useCreateProject";
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
  const [templateSlug, setTemplateSlug] = useState<string | undefined>();
  const { createProject, loading, projectCreateErrorMessage } = useCreateProject();

  useEffect(() => {
    if (!open) return;
    const pending = readPendingMarketplaceTemplate();
    if (pending) {
      setName(suggestProjectNameFromTemplate(pending.name));
      setTemplateSlug(pending.slug);
    } else {
      setTemplateSlug(undefined);
    }
  }, [open]);

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const result = await createProject({
      name: trimmedName,
      templateSlug,
      source: templateSlug ? "marketplace" : "dialog",
    });

    if (!result.ok) {
      toast.error("No se pudo crear el proyecto", {
        description: projectCreateErrorMessage(result),
      });
      return;
    }

    clearPendingMarketplaceTemplate();
    onCreated(result.project, (result.files ?? []) as FileItem[]);
    onOpenChange(false);
    setName("Mi proyecto");
    setTemplateSlug(undefined);
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
              autoComplete="off"
              disabled={loading}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!name.trim() || loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
