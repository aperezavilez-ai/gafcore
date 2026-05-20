import { useCallback, useEffect, useState } from "react";
import { Brain, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentProjectId } from "@/lib/userSupabase";
import {
  deleteProjectDecision,
  listProjectDecisions,
  recordProjectDecision,
  updateProjectDecision,
} from "@/lib/gafcore-memory.functions";

export type ProjectDecisionItem = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  source: string;
  created_at: string;
};

export function ProjectMemoryConventionsPanel() {
  const callList = useServerFn(listProjectDecisions);
  const callRecord = useServerFn(recordProjectDecision);
  const callUpdate = useServerFn(updateProjectDecision);
  const callDelete = useServerFn(deleteProjectDecision);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [rows, setRows] = useState<ProjectDecisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formTags, setFormTags] = useState("");
  const [showNew, setShowNew] = useState(false);

  const refresh = useCallback(async (pid: string) => {
    setLoading(true);
    try {
      const res = await callList({ data: { projectId: pid } });
      setRows(res.decisions ?? []);
    } catch {
      toast.error("No se pudo cargar la memoria del proyecto");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [callList]);

  useEffect(() => {
    const pid = getCurrentProjectId();
    setProjectId(pid);
    if (pid) void refresh(pid);
    else setLoading(false);
  }, [refresh]);

  const parseTags = (raw: string) =>
    raw
      .split(/[,;]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);

  const resetForm = () => {
    setFormTitle("");
    setFormBody("");
    setFormTags("");
    setEditingId(null);
    setShowNew(false);
  };

  const startEdit = (row: ProjectDecisionItem) => {
    setEditingId(row.id);
    setFormTitle(row.title);
    setFormBody(row.body);
    setFormTags(row.tags.join(", "));
    setShowNew(true);
  };

  const save = async () => {
    if (!projectId) {
      toast.error("Sin proyecto activo");
      return;
    }
    const body = formBody.trim();
    if (!body) {
      toast.error("Escribe la convención o decisión");
      return;
    }
    try {
      if (editingId) {
        const res = await callUpdate({
          data: {
            projectId,
            decisionId: editingId,
            title: formTitle.trim() || "Convención",
            body,
            tags: parseTags(formTags),
          },
        });
        if (!res.ok) throw new Error(res.error);
        toast.success("Convención actualizada");
      } else {
        const res = await callRecord({
          data: {
            projectId,
            title: formTitle.trim() || "Convención",
            body,
            tags: parseTags(formTags),
            source: "user",
          },
        });
        if (!res.ok) throw new Error(res.error);
        toast.success("Convención guardada — la IA la usará en el próximo mensaje");
      }
      resetForm();
      await refresh(projectId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };

  const remove = async (id: string) => {
    if (!projectId) return;
    try {
      const res = await callDelete({ data: { projectId, decisionId: id } });
      if (!res.ok) throw new Error(res.error);
      toast.success("Eliminada");
      if (editingId === id) resetForm();
      await refresh(projectId);
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  if (!projectId) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Abre un proyecto en el IDE para gestionar convenciones de memoria IA.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Brain className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Memoria IA del proyecto</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Convenciones y decisiones que el asistente consulta antes de generar o editar código.
            No es el panel de administrador de la plataforma: es solo para este proyecto.
          </p>
        </div>
      </div>

      <section className="mt-8 rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Convenciones guardadas</h2>
          <Button
            type="button"
            size="sm"
            variant={showNew && !editingId ? "secondary" : "default"}
            onClick={() => {
              if (showNew && !editingId) resetForm();
              else {
                resetForm();
                setShowNew(true);
              }
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Nueva convención
          </Button>
        </div>

        {showNew ? (
          <div className="mb-6 space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <div>
              <Label htmlFor="mem-title">Título corto</Label>
              <Input
                id="mem-title"
                className="mt-1"
                placeholder="Ej. Hero con imagen de ciudad"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mem-body">Texto para la IA</Label>
              <Textarea
                id="mem-body"
                className="mt-1 min-h-[100px]"
                placeholder="Ej. Siempre usar fondo con imagen Picsum en el hero; no fondo sólido azul."
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mem-tags">Etiquetas (opcional, separadas por coma)</Label>
              <Input
                id="mem-tags"
                className="mt-1"
                placeholder="ui, hero, branding"
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => void save()}>
                {editingId ? "Guardar cambios" : "Guardar convención"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={resetForm}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay convenciones. Añade una aquí o usa «Fijar convención» en una respuesta del chat del IDE.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-border bg-background p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{row.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {row.body}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {row.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">
                          {t}
                        </Badge>
                      ))}
                      <span className="text-[10px] text-muted-foreground">
                        {row.source} · {new Date(row.created_at).toLocaleString("es")}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label="Editar"
                      onClick={() => startEdit(row)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      aria-label="Eliminar"
                      onClick={() => void remove(row.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-4 text-xs text-muted-foreground">
        También se guardan automáticamente errores frecuentes de validación. El grafo de imports del
        proyecto se actualiza en cada mensaje al chat.
      </p>
    </div>
  );
}
