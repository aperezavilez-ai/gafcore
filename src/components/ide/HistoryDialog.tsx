import { useCallback, useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { History, Plus, RotateCcw, Trash2, Loader2, GitCompare } from "lucide-react";
import { toast } from "sonner";
import {
  listSnapshots,
  createSnapshot,
  loadSnapshotFiles,
  deleteSnapshot,
  type SnapshotRow,
} from "@/lib/userSupabase";
import type { FileItem } from "@/components/ide/CodeEditor";
import { SnapshotDiffDialog } from "@/components/ide/SnapshotDiffDialog";
import { isRiskySnapshotLabel } from "@/lib/gafcore-snapshot-restore.shared";
import { cn } from "@/lib/utils";

export function HistoryDialog({
  open,
  onOpenChange,
  files,
  projectId,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  files: FileItem[];
  projectId: string | null;
  onRestore: (files: FileItem[]) => void | Promise<void>;
}) {
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [riskyConfirmOpen, setRiskyConfirmOpen] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<SnapshotRow | null>(null);
  const [diffSnap, setDiffSnap] = useState<{ files: FileItem[]; label: string | null } | null>(null);

  const selected = snapshots.find((s) => s.id === selectedId) ?? null;

  const refresh = useCallback(async () => {
    if (!projectId) {
      setSnapshots([]);
      return;
    }
    setLoading(true);
    try {
      const list = await listSnapshots(projectId);
      setSnapshots(list);
      if (selectedId && !list.some((s) => s.id === selectedId)) {
        setSelectedId(null);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) {
      void refresh();
      setRiskyConfirmOpen(false);
      setPendingRestore(null);
    }
  }, [open, refresh]);

  const selectSnapshot = (s: SnapshotRow) => {
    setSelectedId(s.id);
    setLabel(s.label?.slice(0, 80) ?? "");
    toast.message("Versión seleccionada", {
      description: "Pulsa «Restaurar selección» abajo para aplicarla al proyecto.",
      duration: 4000,
    });
  };

  const runRestore = async (s: SnapshotRow) => {
    if (!projectId) {
      toast.error("No hay proyecto activo");
      return;
    }
    setBusyId(s.id);
    try {
      const restored = await loadSnapshotFiles(s.id, projectId);
      if (!restored?.length) {
        toast.error("No se pudo cargar esa versión", {
          description: "Comprueba la sesión y que el proyecto sea el mismo.",
        });
        return;
      }

      const backupOk = await createSnapshot(
        files,
        `respaldo · antes de restaurar (${new Date().toLocaleTimeString()})`,
        projectId,
      );
      if (!backupOk) {
        toast.message("Restaurando sin respaldo previo (no se pudo guardar copia).", {
          duration: 6000,
        });
      }

      await onRestore(restored);
      toast.success(`Versión restaurada (${restored.length} archivos)`, {
        description: "Auto-fix pausado. El preview se actualiza en unos segundos.",
      });
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      toast.error("No se pudo aplicar la versión", { description: msg });
    } finally {
      setBusyId(null);
      setRiskyConfirmOpen(false);
      setPendingRestore(null);
    }
  };

  const requestRestore = (s: SnapshotRow) => {
    if (!projectId) {
      toast.error("Inicia sesión y abre un proyecto");
      return;
    }
    if (busyId) return;

    if (isRiskySnapshotLabel(s.label)) {
      setPendingRestore(s);
      setRiskyConfirmOpen(true);
      return;
    }
    void runRestore(s);
  };

  const handleCreate = async () => {
    if (!projectId) {
      toast.error("Abre o crea un proyecto antes de guardar");
      return;
    }
    setBusyId("__new");
    const ok = await createSnapshot(files, label.trim() || undefined, projectId);
    setBusyId(null);
    if (ok) {
      toast.success("Versión guardada");
      setLabel("");
      void refresh();
    } else {
      toast.error("No se pudo guardar (¿sesión iniciada?)");
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar esta versión?")) return;
    setBusyId(id);
    const ok = await deleteSnapshot(id);
    setBusyId(null);
    if (ok) {
      if (selectedId === id) setSelectedId(null);
      toast.success("Versión eliminada");
      void refresh();
    } else {
      toast.error("No se pudo eliminar");
    }
  };

  const handleDiff = async (s: SnapshotRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!projectId) return;
    setBusyId(s.id);
    const snapFiles = await loadSnapshotFiles(s.id, projectId);
    setBusyId(null);
    if (snapFiles) setDiffSnap({ files: snapFiles, label: s.label });
    else toast.error("No se pudo cargar el diff");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="z-[200] max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Historial de versiones
            </DialogTitle>
            <DialogDescription>
              <strong className="text-foreground">Clic en una fila</strong> para seleccionarla. Luego
              pulsa <strong className="text-foreground">Restaurar selección</strong>. Guarda una versión
              buena con el botón azul cuando el preview funcione.
            </DialogDescription>
          </DialogHeader>

          {!projectId ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Inicia sesión y abre un proyecto. Sin eso el historial no puede cargar ni restaurar.
            </p>
          ) : null}

          <div className="flex gap-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Etiqueta nueva: bueno — antes de login"
              disabled={!projectId}
            />
            <Button onClick={() => void handleCreate()} disabled={!!busyId || !projectId} size="sm">
              {busyId === "__new" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Guardar
            </Button>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-md border overscroll-contain">
            <div className="divide-y">
              {loading && (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
                </div>
              )}
              {!loading && snapshots.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {projectId
                    ? "Sin versiones. Guarda una cuando el preview esté bien."
                    : "Sin proyecto activo."}
                </div>
              )}
              {snapshots.map((s) => {
                const isSelected = selectedId === s.id;
                const risky = isRiskySnapshotLabel(s.label);
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectSnapshot(s)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectSnapshot(s);
                      }
                    }}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 transition-colors hover:bg-muted/60",
                      isSelected && "bg-primary/10 ring-1 ring-inset ring-primary/40",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{s.label ?? "Sin etiqueta"}</span>
                        {risky ? (
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            auto / posible error
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(s.created_at).toLocaleString()} · {s.file_count} archivos
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={(e) => void handleDiff(s, e)}
                        disabled={!!busyId}
                        title="Ver cambios"
                      >
                        <GitCompare className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => requestRestore(s)}
                        disabled={!!busyId || !projectId}
                        title="Restaurar ya"
                      >
                        {busyId === s.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={(e) => void handleDelete(s.id, e)}
                        disabled={!!busyId}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            {selected ? (
              <p className="w-full truncate text-left text-xs text-muted-foreground">
                Seleccionada: <span className="text-foreground">{selected.label ?? selected.id}</span>
              </p>
            ) : (
              <p className="w-full text-left text-xs text-muted-foreground">
                Ninguna versión seleccionada — haz clic en una fila de la lista.
              </p>
            )}
            <Button
              type="button"
              className="w-full"
              size="lg"
              disabled={!selected || !!busyId || !projectId}
              onClick={() => selected && requestRestore(selected)}
            >
              {busyId && selected && busyId === selected.id ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Restaurando…
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restaurar selección
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={riskyConfirmOpen} onOpenChange={setRiskyConfirmOpen}>
        <DialogContent className="z-[250] max-w-md">
          <DialogHeader>
            <DialogTitle>¿Restaurar esta captura?</DialogTitle>
            <DialogDescription>
              «{pendingRestore?.label ?? "Sin etiqueta"}» se guardó en automático y puede seguir con
              errores de sintaxis. Si tienes una versión que guardaste tú como «bueno», úsala antes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setRiskyConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => pendingRestore && void runRestore(pendingRestore)}
              disabled={!!busyId}
            >
              Restaurar de todos modos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {diffSnap && (
        <SnapshotDiffDialog
          open={!!diffSnap}
          onOpenChange={(v) => !v && setDiffSnap(null)}
          current={files}
          snapshot={diffSnap.files}
          snapshotLabel={diffSnap.label}
        />
      )}
    </>
  );
}
