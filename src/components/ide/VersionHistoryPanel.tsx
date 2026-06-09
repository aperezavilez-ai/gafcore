import { useCallback, useEffect, useState } from "react";
import { History, Loader2, RotateCcw, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FileItem } from "@/components/ide/CodeEditor";
import {
  formatVersionTime,
  loadVersions,
  saveManualVersion,
  type GafcoreVersionEntry,
} from "@/lib/gafcore-version-history";
import { cn } from "@/lib/utils";

export function VersionHistoryPanel({
  open,
  onOpenChange,
  projectId,
  files,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  files: FileItem[];
  onRestore: (files: FileItem[]) => void | Promise<void>;
}) {
  const [versions, setVersions] = useState<GafcoreVersionEntry[]>([]);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!projectId) {
      setVersions([]);
      return;
    }
    setVersions(loadVersions(projectId));
  }, [projectId]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleSave = () => {
    if (!projectId) {
      toast.error("No hay proyecto activo");
      return;
    }
    if (files.length === 0) {
      toast.error("No hay archivos para guardar");
      return;
    }
    setSaving(true);
    try {
      const entry = saveManualVersion(projectId, files, label);
      if (!entry) {
        toast.error("No se pudo guardar la versión");
        return;
      }
      setLabel("");
      refresh();
      toast.success("Versión guardada", {
        description: `${entry.fileCount} archivos · ${entry.label}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (version: GafcoreVersionEntry) => {
    if (!version.files?.length) {
      toast.error("Esta versión no tiene archivos");
      return;
    }
    setRestoringId(version.id);
    try {
      await onRestore(version.files);
      toast.success("Versión restaurada", {
        description: `${version.fileCount} archivos · ${version.label}`,
      });
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      toast.error("No se pudo restaurar la versión", { description: msg });
    } finally {
      setRestoringId(null);
    }
  };

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-background/60 backdrop-blur-[1px]"
        aria-label="Cerrar historial de versiones"
        onClick={() => onOpenChange(false)}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-background shadow-xl"
        role="dialog"
        aria-labelledby="version-history-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <History className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <h2 id="version-history-title" className="truncate text-sm font-semibold">
                Historial de versiones
              </h2>
              <p className="text-[11px] text-muted-foreground">Local · hasta 20 por proyecto</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onOpenChange(false)}
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="shrink-0 space-y-2 border-b border-border px-4 py-3">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Etiqueta (opcional)"
            maxLength={200}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
          />
          <Button
            type="button"
            className="w-full"
            onClick={handleSave}
            disabled={saving || !projectId || files.length === 0}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Guardar versión
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {!projectId ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Abre o crea un proyecto para ver versiones.
            </p>
          ) : versions.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Sin versiones guardadas. Se crean automáticamente tras cada build exitoso.
            </p>
          ) : (
            <ul className="divide-y divide-border py-1">
              {versions.map((v) => (
                <li key={v.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{v.label}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatVersionTime(v.timestamp)} · {v.fileCount} archivos
                      </p>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "mt-1.5 text-[10px] font-normal",
                          v.isAuto && "bg-muted text-muted-foreground",
                        )}
                      >
                        {v.isAuto ? "Automática" : "Manual"}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={restoringId === v.id}
                      onClick={() => void handleRestore(v)}
                    >
                      {restoringId === v.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                          Restaurar
                        </>
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </aside>
    </>
  );
}
