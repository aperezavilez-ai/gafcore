import { useRef, useState, type ChangeEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderOpen, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { gafcoreAuthJsonFetch } from "@/lib/gafcore-client-auth-fetch";
import { fileItemsFromBrowserFileList, suggestNameFromPaths } from "@/lib/gafcore-import-files";
import type { FileItem } from "@/components/ide/CodeEditor";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (project: { id: string; name: string; created_at: string }, files: FileItem[]) => void;
};

export function ImportProjectDialog({ open, onOpenChange, onImported }: Props) {
  const [name, setName] = useState("Mi proyecto importado");
  const [pendingFiles, setPendingFiles] = useState<FileItem[] | null>(null);
  const [reading, setReading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPendingFiles(null);
    setName("Mi proyecto importado");
    setReading(false);
    setSubmitting(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const absorbFileList = async (list: FileList | null) => {
    if (!list?.length) return;
    setReading(true);
    try {
      const items = await fileItemsFromBrowserFileList(list);
      if (!items.length) {
        toast.error(
          "No se encontraron archivos de código. Prueba otra carpeta o archivos .ts, .tsx, .html, .css, etc.",
        );
        return;
      }
      setPendingFiles(items);
      const suggested = suggestNameFromPaths(items.map((f) => f.name));
      if (suggested) setName(suggested);
      toast.success(`${items.length} archivo(s) listos para importar`);
    } catch (e) {
      console.error(e);
      toast.error("Error al leer los archivos");
    } finally {
      setReading(false);
    }
  };

  const onFolderChange = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    e.target.value = "";
    void absorbFileList(list);
  };

  const onFilesChange = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    e.target.value = "";
    void absorbFileList(list);
  };

  const pickFolder = () => {
    window.setTimeout(() => folderRef.current?.click(), 50);
  };

  const pickFiles = () => {
    window.setTimeout(() => filesRef.current?.click(), 50);
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!pendingFiles?.length) {
      toast.error("Elige una carpeta o archivos antes de importar");
      return;
    }
    setSubmitting(true);
    try {
      const result = await gafcoreAuthJsonFetch<{
        ok: boolean;
        project?: { id: string; name: string; created_at: string };
        files?: FileItem[];
        error?: string;
      }>("/api/gafcore/projects-create", {
        name: trimmed,
        files: pendingFiles.map((f) => ({
          name: f.name,
          language: f.language,
          content: f.content,
        })),
      });
      if (!result.ok || !result.project) {
        toast.error(result.error ?? "No se pudo importar el proyecto");
        return;
      }
      onImported(result.project, (result.files ?? pendingFiles) as FileItem[]);
      handleOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al importar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md border-border bg-background text-foreground">
        <DialogHeader>
          <DialogTitle>Importar proyecto</DialogTitle>
          <DialogDescription>
            Elige una carpeta o archivos de código, pon nombre al proyecto e importa. Se omiten
            node_modules, dist y binarios.
          </DialogDescription>
        </DialogHeader>
        <input
          ref={folderRef}
          type="file"
          className="hidden"
          multiple
          {...({ webkitdirectory: "" } as Record<string, string>)}
          onChange={onFolderChange}
        />
        <input ref={filesRef} type="file" className="hidden" multiple onChange={onFilesChange} />
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="import-name">Nombre del proyecto</Label>
            <Input
              id="import-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mi app"
              disabled={submitting}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="flex-1 gap-2"
              onClick={pickFolder}
              disabled={reading || submitting}
            >
              {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
              Elegir carpeta
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 gap-2"
              onClick={pickFiles}
              disabled={reading || submitting}
            >
              {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Elegir archivos
            </Button>
          </div>
          {pendingFiles ? (
            <p className="text-sm text-muted-foreground">
              {pendingFiles.length} archivo(s) listos. Pulsa Importar para crear el proyecto.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no has seleccionado archivos.</p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || reading || !name.trim() || !pendingFiles?.length}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
