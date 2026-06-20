import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  FolderOpen,
  Loader2,
  Lock,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { getGafcoreSupabaseBrowser } from "@/lib/gafcore-supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Pantalla "Mis proyectos" del Builder V2 — calcada del diseño del GafCore
 * viejo (gafcore.com/gafcore/projects): tarjetas en cuadrícula, buscador,
 * menú de tres puntos con Renombrar/Eliminar. Reconstruida desde cero para
 * el modelo simple de Builder V2 (un solo HTML por proyecto, sin la capa de
 * governance/approval del IDE legado).
 */
export const Route = createFileRoute("/gafcore_/app-v2/projects")({
  component: BuilderV2ProjectsPage,
  head: () => ({
    meta: [
      { title: "Proyectos — GafCore Builder" },
      {
        name: "description",
        content: "Tus proyectos del Builder V2: abre, renombra o elimina.",
      },
    ],
  }),
});

type BuilderProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
};

type AuthState = "checking" | "authed" | "anon";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function BuilderV2ProjectsPage() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [currentProjectIdHint, setCurrentProjectIdHint] = useState<string | null>(null);
  const [projects, setProjects] = useState<BuilderProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<BuilderProjectSummary | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<BuilderProjectSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setCurrentProjectIdHint(window.localStorage.getItem("gafcore:builder-v2:lastProjectId"));
    } catch {
      // localStorage puede no estar disponible; no es crítico.
    }
  }, []);

  async function getAuthHeader(): Promise<string> {
    const sb = await getGafcoreSupabaseBrowser();
    const { data } = await sb.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) {
      throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    }
    return `Bearer ${accessToken}`;
  }

  useEffect(() => {
    let active = true;
    getGafcoreSupabaseBrowser()
      .then((sb) => sb.auth.getSession())
      .then(({ data }) => {
        if (active) setAuthState(data.session?.user ? "authed" : "anon");
      })
      .catch(() => {
        if (active) setAuthState("anon");
      });
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch("/api/gafcore/builder-v2/projects", {
        headers: { Authorization: authHeader },
      });
      if (!res.ok) {
        setProjects([]);
        return;
      }
      const data = (await res.json()) as { projects: BuilderProjectSummary[] };
      setProjects(data.projects);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authState !== "authed") return;
    void refresh();
  }, [authState, refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  function openInEditor(p: BuilderProjectSummary) {
    try {
      window.localStorage.setItem("gafcore:builder-v2:openProjectId", p.id);
    } catch {
      // No es crítico si falla.
    }
    window.location.href = "/gafcore/app-v2";
  }

  function openRenameDialog(p: BuilderProjectSummary) {
    setRenameTarget(p);
    setRenameDraft(p.name);
    setRenameOpen(true);
  }

  async function commitRename() {
    if (!renameTarget) return;
    const next = renameDraft.trim();
    if (!next) return;
    if (next === renameTarget.name) {
      setRenameOpen(false);
      setRenameTarget(null);
      return;
    }
    setRenameBusy(true);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch("/api/gafcore/builder-v2/project/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ projectId: renameTarget.id, name: next }),
      });
      if (!res.ok) throw new Error("rename_failed");
      setRenameOpen(false);
      setRenameTarget(null);
      await refresh();
    } catch {
      // Se deja el diálogo abierto para reintentar.
    } finally {
      setRenameBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch(`/api/gafcore/builder-v2/project/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: authHeader },
      });
      if (!res.ok) throw new Error("delete_failed");
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      // Se deja el diálogo abierto para reintentar.
    } finally {
      setDeleteBusy(false);
    }
  }

  if (authState === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0518]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    );
  }

  if (authState === "anon") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0b0518] px-4 text-white">
        <Lock className="h-10 w-10 text-neutral-400" />
        <p className="text-center text-sm text-neutral-300">
          Inicia sesión para ver tus proyectos.
        </p>
        <Button asChild className="bg-violet-600 text-white hover:bg-violet-500">
          <Link to="/gafcore/login">Entrar</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0518] text-white">
      <header className="border-b border-white/10 bg-[#0b0518]/95">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="shrink-0 text-neutral-300 hover:bg-white/10 hover:text-white"
              aria-label="Volver al editor"
            >
              <Link to="/gafcore/app-v2">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight">Proyectos</h1>
              <p className="text-xs text-neutral-400">
                Pulsa la tarjeta para abrir en el editor; ⋮ para renombrar o eliminar.
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="bg-violet-600 text-white hover:bg-violet-500"
            onClick={() => { window.location.href = "/gafcore/app-v2"; }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Crear en el editor
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar proyectos..."
              aria-label="Buscar proyectos"
              className="border-white/10 bg-white/5 pl-9 text-white placeholder:text-neutral-500"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
            className="border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Actualizar"}
          </Button>
        </div>

        {loading && projects.length === 0 ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/5 py-16 text-center">
            <FolderOpen className="mx-auto mb-3 h-10 w-10 text-neutral-500" />
            <p className="text-sm font-medium text-white">
              {projects.length === 0 ? "Aún no tienes proyectos" : "Ningún proyecto coincide"}
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              {projects.length === 0
                ? "Describe lo que quieres construir en el editor para crear tu primer proyecto."
                : "Prueba otra búsqueda."}
            </p>
            {projects.length === 0 ? (
              <Button
                type="button"
                className="mt-4 bg-violet-600 text-white hover:bg-violet-500"
                onClick={() => { window.location.href = "/gafcore/app-v2"; }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Ir al editor
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <article
                key={p.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-sm transition hover:border-violet-400/40 hover:bg-white/[0.07]"
              >
                <div className="relative h-36 w-full bg-gradient-to-br from-violet-500/10 via-white/5 to-transparent">
                  <button
                    type="button"
                    onClick={() => openInEditor(p)}
                    className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-2 p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    aria-label={`Abrir ${p.name} en el editor`}
                  >
                    <FolderOpen className="h-9 w-9 text-violet-400/80 transition-transform group-hover:scale-110 group-hover:text-violet-300" />
                    <span className="line-clamp-2 px-2 text-center text-sm font-semibold text-white">
                      {p.name}
                    </span>
                  </button>
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-end p-2">
                    <div className="pointer-events-auto">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className="h-9 w-9 rounded-full border border-white/10 bg-[#0b0518]/90 text-neutral-200 shadow-sm hover:bg-[#0b0518]"
                            aria-label={`Más opciones: ${p.name}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 bg-white text-neutral-900">
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
                            className="text-red-500 focus:text-red-500"
                            onSelect={() => {
                              window.setTimeout(() => setDeleteTarget(p), 0);
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
                <div className="border-t border-white/10 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs font-medium text-white">
                      {p.name}
                    </p>
                    {p.id === currentProjectIdHint ? (
                      <span className="shrink-0 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                        Activo
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-400">
                    Creado {formatDate(p.createdAt)}
                  </p>
                  <p className="text-[11px] text-neutral-500">Proyecto GafCore</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          if (!open && !renameBusy) {
            setRenameOpen(false);
            setRenameTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renombrar proyecto</DialogTitle>
            <DialogDescription>El nombre se muestra en tarjetas y menús.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="builder-v2-rename-project">Nombre</Label>
            <Input
              id="builder-v2-rename-project"
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
            <Button
              type="button"
              variant="outline"
              disabled={renameBusy}
              onClick={() => {
                setRenameOpen(false);
                setRenameTarget(null);
              }}
            >
              Cancelar
            </Button>
            <Button type="button" disabled={renameBusy} onClick={() => void commitRename()}>
              {renameBusy ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar proyecto</DialogTitle>
            <DialogDescription>
              Vas a eliminar definitivamente «{deleteTarget?.name}» y todo su
              contenido. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={deleteBusy}
              onClick={() => setDeleteTarget(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={deleteBusy}
              onClick={() => void confirmDelete()}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleteBusy ? "Eliminando..." : "Eliminar definitivamente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
