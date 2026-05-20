import { useEffect, useState } from "react";
import { BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { recordProjectDecision } from "@/lib/gafcore-memory.functions";

type FixConventionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null | undefined;
  initialBody: string;
  onSaved?: () => void;
};

function titleFromBody(body: string): string {
  const line =
    body
      .split("\n")
      .find((l) => l.trim())
      ?.trim() ?? body.trim();
  return line.length > 72 ? `${line.slice(0, 69)}…` : line || "Convención";
}

export function FixConventionDialog({
  open,
  onOpenChange,
  projectId,
  initialBody,
  onSaved,
}: FixConventionDialogProps) {
  const callRecord = useServerFn(recordProjectDecision);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBody(initialBody);
    setTitle(titleFromBody(initialBody));
    setTags("chat");
  }, [open, initialBody]);

  const save = async () => {
    if (!projectId) {
      toast.error("Guarda el proyecto en la nube para fijar convenciones");
      return;
    }
    const text = body.trim();
    if (!text) {
      toast.error("Escribe el texto de la convención");
      return;
    }
    setSaving(true);
    try {
      const res = await callRecord({
        data: {
          projectId,
          title: title.trim() || "Convención",
          body: text,
          tags: tags
            .split(/[,;]+/)
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 12),
          source: "chat",
        },
      });
      if (!res.ok) throw new Error(res.error ?? "db_error");
      toast.success("Convención fijada — la IA la tendrá en cuenta");
      onOpenChange(false);
      onSaved?.();
    } catch {
      toast.error("No se pudo guardar. ¿Aplicaste la migración de memoria en Supabase?");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border bg-background text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkPlus className="h-4 w-4 text-primary" />
            Fijar convención
          </DialogTitle>
          <DialogDescription>
            Esta regla se añade a la memoria del proyecto y el asistente la verá antes de editar
            código.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="pin-title">Título</Label>
            <Input
              id="pin-title"
              className="mt-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pin-body">Convención</Label>
            <Textarea
              id="pin-body"
              className="mt-1 min-h-[120px]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pin-tags">Etiquetas (opcional)</Label>
            <Input
              id="pin-tags"
              className="mt-1"
              placeholder="ui, hero"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "Guardando…" : "Guardar convención"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
