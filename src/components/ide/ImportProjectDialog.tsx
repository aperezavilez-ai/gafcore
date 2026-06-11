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
import { FolderOpen, Github, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useCreateProject } from "@/hooks/useCreateProject";
import {
  fileItemsFromBrowserFileList,
  fileItemsFromDirectoryHandle,
  fileItemsFromGithubRepoUrl,
  suggestNameFromPaths,
} from "@/lib/gafcore-import-files";
import type { FileItem } from "@/components/ide/CodeEditor";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (project: { id: string; name: string; created_at: string }, files: FileItem[]) => void;
};

export function ImportProjectDialog({ open, onOpenChange, onImported }: Props) {
  const { createProject, loading: submitting, projectCreateErrorMessage } = useCreateProject();
  const [name, setName] = useState("Mi proyecto importado");
  const [pendingFiles, setPendingFiles] = useState<FileItem[] | null>(null);
  const [reading, setReading] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPendingFiles(null);
    setName("Mi proyecto importado");
    setReading(false);
    setGithubUrl("");
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
    if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
      void (async () => {
        try {
          setReading(true);
          const handle = await (window as Window & {
            showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
          }).showDirectoryPicker();
          const items = await fileItemsFromDirectoryHandle(handle);
          if (!items.length) {
            toast.error("No se encontraron archivos de código en la carpeta seleccionada");
            return;
          }
          setPendingFiles(items);
          const suggested = suggestNameFromPaths(items.map((f) => f.name));
          if (suggested) setName(suggested);
          toast.success(`${items.length} archivo(s) listos para importar`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (msg && /abort|cancel/i.test(msg)) return;
          folderRef.current?.click();
        } finally {
          setReading(false);
        }
      })();
      return;
    }
    window.setTimeout(() => folderRef.current?.click(), 50);
  };

  const pickFiles = () => {
    window.setTimeout(() => filesRef.current?.click(), 50);
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!pendingFiles?.length) {
      toast.error("Clona un repo de GitHub o elige una carpeta/archivos antes de importar");
      return;
    }
    const result = await createProject({
      name: trimmed,
      files: pendingFiles.map((f) => ({
        name: f.name,
        language: f.language,
        content: f.content,
      })),
      source: "import",
    });
    if (!result.ok) {
      toast.error("No se pudo importar el proyecto", {
        description: projectCreateErrorMessage(result),
      });
      return;
    }
    onImported(result.project, (result.files ?? pendingFiles) as FileItem[]);
    handleOpenChange(false);
  };

  const importFromGithub = async () => {
    const url = githubUrl.trim();
    if (!url) {
      toast.error("Pega la URL de GitHub primero");
      return;
    }
    setReading(true);
    try {
      const items = await fileItemsFromGithubRepoUrl(url);
      setPendingFiles(items);
      const suggested = suggestNameFromPaths(items.map((f) => f.name));
      if (suggested) setName(suggested);
      toast.success(`${items.length} archivo(s) cargados desde GitHub`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo importar desde GitHub");
    } finally {
      setReading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md border-border bg-background text-foreground">
        <DialogHeader>
          <DialogTitle>Importar proyecto</DialogTitle>
          <DialogDescription>
            Clona un repositorio de GitHub o importa una carpeta/archivos locales. Se omiten
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
          <div className="space-y-3 rounded-xl border border-primary/35 bg-primary/5 p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Github className="h-5 w-5" />
              </div>
              <div>
                <Label htmlFor="import-github" className="text-sm font-semibold text-foreground">
                  Clonar desde GitHub
                </Label>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Pega la URL del repo y carga el código al instante
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                id="import-github"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                disabled={reading || submitting}
                className="bg-background"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void importFromGithub();
                }}
              />
              <Button
                type="button"
                onClick={() => void importFromGithub()}
                disabled={reading || submitting || !githubUrl.trim()}
                className="shrink-0"
              >
                {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Clonar"}
              </Button>
            </div>
          </div>

          <div className="relative flex items-center gap-3 py-0.5">
            <div className="h-px flex-1 bg-border" />
            <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              O desde tu equipo
            </span>
            <div className="h-px flex-1 bg-border" />
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
