import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  FolderOpen,
  Globe,
  LayoutGrid,
  Loader2,
  Lock,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getGafcoreSupabaseBrowser } from "@/lib/gafcore-supabase-browser";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  clearCurrentProjectId,
  getCurrentProjectId,
  listProjects,
  renameProject,
  setCurrentProjectId,
  type ProjectRow,
} from "@/lib/userSupabase";
import { gafcoreAuthJsonFetch } from "@/lib/gafcore-client-auth-fetch";
import { NewProjectDialog } from "@/components/ide/NewProjectDialog";
import { CriticalActionConfirmDialog } from "@/components/ide/CriticalActionConfirmDialog";
import { activateProjectRow } from "@/core/project";
import type { FileItem } from "@/components/ide/CodeEditor";
import { requestGafcoreCriticalApproval } from "@/lib/gafcore-governance.functions";
import type { GafcoreRiskAssessment } from "@/lib/gafcore-governance.shared";

export const Route = createFileRoute("/gafcore_/projects")({
  component: GafcoreProjectsPage,
  head: () => ({
    meta: [
      { title: "Proyectos — GafCore" },
      {
        name: "description",
        content: "Gestiona tus proyectos GafCore: abre la tarjeta en el editor o usa el menú ⋮.",
      },
    ],
  }),
});

function GafcoreProjectsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [graceChecking, setGraceChecking] = useState(true);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectRow | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmBusy, setDeleteConfirmBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [deletePendingApproval, setDeletePendingApproval] = useState<{
    approvalId: string;
    summary: string;
    risk: GafcoreRiskAssessment;
  } | null>(null);

  const requestCriticalApproval = useServerFn(requestGafcoreCriticalApproval);

  // Hidratar sesión al cargar la página
  useEffect(() => {
    void (async () => {
      const sb = await getGafcoreSupabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (!data.session) {
        void sb.auth.refreshSession();
      }
    })();
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      setHasSession(true);
      setGraceChecking(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const sb = await getGafcoreSupabaseBrowser();
      for (let i = 0; i < 50; i++) {
        if (cancelled) return;
        const { data } = await sb.auth.getSession();
        if (data.session?.user) {
          if (!cancelled) {
            setHasSession(true);
            setGraceChecking(false);
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      if (!cancelled) setGraceChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      let list = await listProjects();
      // Si devuelve vacío pero hay sesión, reintentar una vez después de 2s
      // (el proyecto recién creado puede tardar en propagarse con RLS)
      if (list.length === 0 && (user?.id || hasSession)) {
        await new Promise((r) => setTimeout(r, 2000));
        list = await listProjects();
      }
      console.log("[projects] listProjects result:", list.length, list);
      setProjects(list);
    } catch (e) {
      console.error(e);
      toast.error("No se pudieron cargar los proyectos.");
    } finally {
      setLoading(false);
    }
  }, [user?.id, hasSession]);

  useEffect(() => {
    if (authLoading || graceChecking) return;
    if (!user?.id && !hasSession) return;
    void refresh();
  }, [authLoading, graceChecking, user?.id, hasSession, refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("newProject") !== "1") return;
    setNewProjectOpen(true);
    url.searchParams.delete("newProject");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, []);

  const openNewProjectDialog = () => setNewProjectOpen(true);

  const onProjectCreated = async (
    project: { id: string; name: string; created_at: string },
    _files: FileItem[],
  ) => {
    activateProjectRow({
      id: project.id,
      name: project.name,
      created_at: project.created_at,
    });
    setNewProjectOpen(false);
    // Esperar que la lista se actualice ANTES de navegar al editor,
    // así el proyecto ya existe en /projects cuando el usuario regrese.
    await refresh();
    void navigate({ to: "/gafcore/app" });
    toast.success(`Proyecto «${project.name}» listo en el editor`);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => (p.name ?? "").toLowerCase().includes(q));
  }, [projects, query]);

  const openInEditor = (p: ProjectRow) => {
    setCurrentProjectId(p.id);
    void navigate({ to: "/gafcore/app" });
    toast.success(`Proyecto «${p.name}» seleccionado`);
  };

  const openRenameDialog = (p: ProjectRow) => {
    setRenameTarget(p);
    setRenameDraft(p.name);
    setRenameOpen(true);
  };

  const commitRename = async () => {
    if (!renameTarget) return;
    const next = renameDraft.trim();
    if (!next) {
      toast.error("El nombre no puede estar vacío");
      return;
    }
    if (next === renameTarget.name) {
      setRenameOpen(false);
      setRenameTarget(null);
      return;
    }
    const ok = await renameProject(renameTarget.id, next);
    if (ok) {
      toast.success("Proyecto renombrado");
      setRenameOpen(false);
      setRenameTarget(null);
      await refresh();
    } else {
      toast.error("No se pudo renombrar");
    }
  };

  const beginDelete = async (p: ProjectRow) => {
    try {
      const approval = await requestCriticalApproval({
        data: {
          action: "project.delete",
          projectId: p.id,
          projectName: p.name,
        },
      });
      setDeleteTarget(p);
      setDeletePendingApproval({
        approvalId: approval.approvalId,
        summary: approval.summary,
        risk: approval.risk,
      });
      setDeleteConfirmOpen(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "No se pudo preparar la eliminación");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !deletePendingApproval) return;
    setDeleteConfirmBusy(true);
    try {
      const res = await gafcoreAuthJsonFetch<{ ok: boolean; error?: string }>(
        "/api/gafcore/projects-delete",
        {
          projectId: deleteTarget.id,
          approvalId: deletePendingApproval.approvalId,
        },
      );
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo eliminar");
        return;
      }
      if (getCurrentProjectId() === deleteTarget.id) {
        clearCurrentProjectId();
      }
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      setDeletePendingApproval(null);
      toast.success(`Proyecto «${deleteTarget.name}» eliminado`);
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "No se pudo eliminar";
      toast.error(msg === "invalid_body" ? "Error al confirmar eliminación. Recarga e inténtalo de nuevo." : msg);
    } finally {
      setDeleteConfirmBusy(false);
    }
  };

  if (authLoading || graceChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user && !hasSession) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-foreground">
        <Lock className="h-10 w-10 text-muted-foreground" />
        <p className="text-center text-sm text-muted-foreground">
          Inicia sesión para ver tus proyectos.
        </p>
        <Button asChild>
          <Link to="/gafcore/login" search={{ redirect: "/gafcore/projects" }}>
            Entrar
          </Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/gafcore">Volver al inicio</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/40 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="shrink-0"
              aria-label="Volver al editor"
            >
              <Link to="/gafcore/app">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight">Proyectos</h1>
              <p className="text-xs text-muted-foreground">
                Pulsa la tarjeta para abrir en el editor; ⋮ para renombrar o eliminar.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={openNewProjectDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Crear en el editor
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar proyectos…"
              className="pl-9"
              aria-label="Buscar proyectos"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Actualizar"}
          </Button>
        </div>

        {loading && projects.length === 0 ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center">
            <LayoutGrid className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {projects.length === 0 ? "Aún no tienes proyectos" : "Ningún proyecto coincide"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {projects.length === 0
                ? "Pulsa el botón de arriba para nombrar tu proyecto y abrir el editor."
                : "Prueba otra búsqueda."}
            </p>
            {projects.length === 0 ? (
              <Button type="button" className="mt-4" onClick={openNewProjectDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Crear proyecto
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <article
                key={p.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:border-primary/30 hover:shadow-md"
              >
                <div className="relative h-36 w-full bg-gradient-to-br from-primary/10 via-muted/40 to-background">
                  <button
                    type="button"
                    onClick={() => openInEditor(p)}
                    className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-2 p-4 text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Abrir ${p.name} en el editor`}
                  >
                    <FolderOpen className="h-9 w-9 text-primary/70 transition-transform group-hover:scale-110 group-hover:text-primary" />
                    <span className="line-clamp-2 px-2 text-center text-sm font-semibold text-foreground">
                      {p.name}
                    </span>
                  </button>
                  {/* Capa sólo para ⋮: evita que el botón a pantalla completa robe clics al menú (p. ej. «Nuevo Proyecto»). */}
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-end p-2">
                    <div className="pointer-events-auto">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className="h-9 w-9 rounded-full border border-border bg-background/95 shadow-sm backdrop-blur-sm"
                            aria-label={`Más opciones: ${p.name}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem
                            onSelect={() => {
                              window.setTimeout(() => openRenameDialog(p), 0);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Renombrar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => {
                              window.setTimeout(() => void beginDelete(p), 0);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
                <div className="border-t border-border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                      {p.name}
                    </p>
                    {p.id === getCurrentProjectId() ? (
                      <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Activo
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {p.updated_at
                        ? new Date(p.updated_at).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })
                        : p.created_at
                        ? new Date(p.created_at).toLocaleDateString("es", { day: "2-digit", month: "short" })
                        : "—"}
                    </span>
                    {p.deploy_site_url ? (
                      <a
                        href={`https://${p.deploy_site_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
                      >
                        <Globe className="h-2.5 w-2.5" />
                        En vivo
                      </a>
                    ) : p.github_repo ? (
                      <span className="text-[10px] text-muted-foreground">
                        {p.github_repo.split("/")[1] ?? p.github_repo}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {p.created_at
                      ? `Creado ${new Date(p.created_at).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}`
                      : "Proyecto GafCore"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        onCreated={onProjectCreated}
      />

      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          setRenameOpen(open);
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renombrar proyecto</DialogTitle>
            <DialogDescription>
              El nombre se muestra en tarjetas y menús. La tarjeta del proyecto sigue abriendo el editor al pulsarla.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="gafcore-rename-project">Nombre</Label>
            <Input
              id="gafcore-rename-project"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitRename();
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void commitRename()}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CriticalActionConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) {
            setDeleteTarget(null);
            setDeletePendingApproval(null);
          }
        }}
        title="Eliminar proyecto"
        summary={
          deletePendingApproval?.summary ??
          (deleteTarget
            ? `Eliminar definitivamente «${deleteTarget.name}» y todos sus datos.`
            : "Esta acción no se puede deshacer.")
        }
        risk={deletePendingApproval?.risk ?? null}
        confirmLabel="Eliminar definitivamente"
        busy={deleteConfirmBusy}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
