import { useEffect, useState } from "react";
import {
  Archive,
  BarChart3,
  ChevronDown,
  Cloud,
  Code2,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  FileCode2,
  FolderGit2,
  Gift,
  History,
  KeyRound,
  LayoutGrid,
  Loader2,
  LogOut,
  MoreHorizontal,
  Package,
  Pencil,
  Plug,
  Plus,
  Rocket,
  RotateCcw,
  Settings,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ViewMode = "preview" | "code";

type BuilderProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  projectName: string;
  userEmail: string | null;
  html: string | null;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onSignOut?: () => void;
  projects: BuilderProjectSummary[];
  currentProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onNewProject: () => void;
  onOpenProjectsList: () => void;
  onDeleteProject: (projectId: string) => Promise<boolean>;
  saveStatus: SaveStatus;
  getAuthHeader: () => Promise<string>;
  onRestoreHtml: (html: string) => void;
};

/**
 * Barra superior del Builder V2, inspirada en la barra del IDE legado
 * (GafCoreIDE.tsx) pero reconstruida desde cero para el motor simple.
 *
 * Paleta clara (blanco). Tres menus desplegables completos (usuario,
 * selector de proyecto, "..."), todos en fondo blanco, igual que el
 * original. El unico acento oscuro es el boton "Publicar".
 *
 * Estado de cada item: la mayoria son placeholder "proximamente" -- cada
 * uno abre un dialogo explicando que llega en una fase futura. Funcional
 * ya: Preview/Codigo (toggle real), cerrar sesion.
 */
export function GafCoreBuilderTopBar({
  projectName,
  userEmail,
  html,
  viewMode,
  onViewModeChange,
  onSignOut,
  projects,
  currentProjectId,
  onSelectProject,
  onNewProject,
  onOpenProjectsList,
  onDeleteProject,
  saveStatus,
  getAuthHeader,
  onRestoreHtml,
}: Props) {
  const [comingSoonLabel, setComingSoonLabel] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BuilderProjectSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [secretsOpen, setSecretsOpen] = useState(false);

  function openComingSoon(label: string) {
    setComingSoonLabel(label);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    const ok = await onDeleteProject(deleteTarget.id);
    setDeleteBusy(false);
    if (ok) {
      setDeleteTarget(null);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1 border-b border-neutral-200 bg-white px-3 py-2">
        {/* Menu de usuario */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">
                {userEmail ? userEmail[0]?.toUpperCase() : "?"}
              </span>
              <span className="hidden max-w-[140px] truncate sm:inline">
                {userEmail ?? "Invitado"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 bg-white text-neutral-900">
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium text-neutral-900">
                {userEmail ?? "Invitado"}
              </p>
              {userEmail && (
                <p className="truncate text-xs text-neutral-400">{userEmail}</p>
              )}
              <p className="text-xs text-neutral-400">Administrador</p>
            </div>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>Creditos GafCore</span>
                <span className="font-medium text-neutral-700">Ilimitados</span>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => openComingSoon("Comprar creditos (paquetes)")}
              className="text-blue-600 focus:text-blue-600"
            >
              <Gift className="mr-2 h-4 w-4 text-blue-500" />
              Comprar creditos (paquetes)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Pagos")}>
              <CreditCard className="mr-2 h-4 w-4 text-neutral-400" />
              Pagos
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Apariencia")}>
              Apariencia
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Ayuda")}>Ayuda</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onSignOut?.()}
              className="text-red-500 focus:text-red-500"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ToolbarIconButton
          icon={History}
          title="Historial de versiones"
          onClick={() => setHistoryOpen(true)}
          disabled={!currentProjectId}
        />
        <ToolbarIconButton
          icon={KeyRound}
          title="Secretos del proyecto"
          onClick={() => setSecretsOpen(true)}
          disabled={!currentProjectId}
        />
        <ToolbarIconButton
          icon={Users}
          title="Usuarios"
          onClick={() => openComingSoon("Usuarios")}
        />

        {/* Selector de proyecto */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1 flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100">
              <FolderGit2 className="h-3.5 w-3.5 text-neutral-400" />
              {projectName}
              <ChevronDown className="h-3 w-3 text-neutral-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 bg-white text-neutral-900">
            <DropdownMenuLabel className="flex items-center justify-between text-xs text-neutral-400">
              MIS PROYECTOS
              <button
                onClick={onNewProject}
                className="flex items-center gap-1 text-violet-600"
              >
                <Plus className="h-3 w-3" />
                Nuevo
              </button>
            </DropdownMenuLabel>
            {projects.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-neutral-400">
                Aún no tienes proyectos guardados.
              </div>
            ) : (
              projects.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onSelect={() => onSelectProject(p.id)}
                  className={cn(p.id === currentProjectId && "font-semibold text-violet-700")}
                >
                  {p.name}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuItem onSelect={onNewProject}>
              <Plus className="mr-2 h-4 w-4 text-neutral-400" />
              Nuevo proyecto...
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Importar proyecto")}>
              <Upload className="mr-2 h-4 w-4 text-neutral-400" />
              Importar proyecto...
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onOpenProjectsList}>
              <LayoutGrid className="mr-2 h-4 w-4 text-neutral-400" />
              Todos los proyectos
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Marketplace")}>
              <Package className="mr-2 h-4 w-4 text-neutral-400" />
              Marketplace
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => openComingSoon("Ajustes del proyecto")}>
              <Settings className="mr-2 h-4 w-4 text-neutral-400" />
              Ajustes del proyecto
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Conectores")}>
              <Plug className="mr-2 h-4 w-4 text-neutral-400" />
              Conectores
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Cambiar el nombre del proyecto")}>
              <Pencil className="mr-2 h-4 w-4 text-neutral-400" />
              Cambiar el nombre del proyecto
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                if (!currentProjectId) return;
                const current = projects.find((p) => p.id === currentProjectId);
                if (current) setDeleteTarget(current);
              }}
              disabled={!currentProjectId}
              className="text-red-500 focus:text-red-500"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar proyecto
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {saveStatus !== "idle" && (
          <span
            className={cn(
              "ml-1 text-[11px]",
              saveStatus === "saving" && "text-neutral-400",
              saveStatus === "saved" && "text-emerald-600",
              saveStatus === "error" && "text-red-500",
            )}
          >
            {saveStatus === "saving" && "Guardando..."}
            {saveStatus === "saved" && "Guardado"}
            {saveStatus === "error" && "Error al guardar"}
          </span>
        )}

        {/* Toggle Preview / Codigo (funcional) */}
        <div className="ml-2 flex items-center rounded-full border border-neutral-200 bg-neutral-50 p-0.5 text-xs">
          <button
            onClick={() => onViewModeChange("preview")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors",
              viewMode === "preview"
                ? "bg-violet-500 text-white"
                : "text-neutral-500 hover:text-neutral-800",
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </button>
          <button
            onClick={() => onViewModeChange("code")}
            disabled={!html}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-100",
              viewMode === "code"
                ? "bg-violet-500 text-white"
                : "text-neutral-600 hover:text-neutral-900 disabled:text-neutral-500 disabled:hover:text-neutral-500",
            )}
          >
            <Code2 className="h-3.5 w-3.5" />
            Codigo
          </button>
        </div>

        <div className="flex-1" />

        <ToolbarIconButton icon={Cloud} title="Nube" onClick={() => openComingSoon("Nube")} />
        <ToolbarIconButton
          icon={BarChart3}
          title="Analitica de GafCore"
          onClick={() => openComingSoon("Analitica de GafCore")}
        />
        <ToolbarIconButton
          icon={Settings}
          title="Configuracion del IDE"
          onClick={() => openComingSoon("Configuracion del IDE")}
        />

        {/* Menu de tres puntos */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title="Mas opciones"
              className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-white text-neutral-900">
            <DropdownMenuItem onSelect={() => setSecretsOpen(true)} disabled={!currentProjectId}>
              <KeyRound className="mr-2 h-4 w-4 text-neutral-400" />
              Secretos del proyecto
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Analitica GafCore")}>
              <Sparkles className="mr-2 h-4 w-4 text-neutral-400" />
              Analitica GafCore
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Nube")}>
              <Cloud className="mr-2 h-4 w-4 text-neutral-400" />
              Nube
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onViewModeChange("code")}>
              <FileCode2 className="mr-2 h-4 w-4 text-neutral-400" />
              Codigo
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Archivos")}>
              <Archive className="mr-2 h-4 w-4 text-neutral-400" />
              Archivos
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Pagos")}>
              <CreditCard className="mr-2 h-4 w-4 text-neutral-400" />
              Pagos
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => openComingSoon("Comprar creditos (paquetes)")}
              className="text-blue-600 focus:text-blue-600"
            >
              <Gift className="mr-2 h-4 w-4 text-blue-500" />
              Comprar creditos (paquetes)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Configuracion")}>
              <Settings className="mr-2 h-4 w-4 text-neutral-400" />
              Configuracion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          className="ml-1 border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100"
          onClick={() => openComingSoon("Compartir")}
        >
          <Share2 className="h-3.5 w-3.5" />
          Compartir
        </Button>

        <Button
          size="sm"
          className="bg-neutral-900 text-white hover:bg-neutral-800"
          onClick={() => openComingSoon("Publicar")}
        >
          <Rocket className="h-3.5 w-3.5" />
          Publicar
        </Button>
      </div>

      <Dialog open={comingSoonLabel !== null} onOpenChange={() => setComingSoonLabel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{comingSoonLabel}</DialogTitle>
            <DialogDescription>
              Esta funcion llega en una proxima fase del Builder V2. Por ahora puedes
              generar tu sitio, editarlo por chat y descargar el HTML.
            </DialogDescription>
          </DialogHeader>
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

      <BuilderHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        projectId={currentProjectId}
        currentHtml={html}
        getAuthHeader={getAuthHeader}
        onRestoreHtml={(restoredHtml) => {
          onRestoreHtml(restoredHtml);
          setHistoryOpen(false);
        }}
      />

      <BuilderSecretsDialog
        open={secretsOpen}
        onOpenChange={setSecretsOpen}
        projectId={currentProjectId}
        getAuthHeader={getAuthHeader}
      />
    </>
  );
}

function ToolbarIconButton({
  icon: Icon,
  title,
  onClick,
  disabled,
}: {
  icon: typeof History;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

type BuilderVersionSummary = {
  id: string;
  label: string;
  isAuto: boolean;
  createdAt: string;
};

function formatVersionDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/**
 * Historial de versiones del proyecto activo. Reutiliza la tabla
 * `gafcore_project_versions` (la misma del IDE legado) vía las rutas
 * /api/gafcore/builder-v2/versions y /version/:id.
 */
function BuilderHistoryDialog({
  open,
  onOpenChange,
  projectId,
  currentHtml,
  getAuthHeader,
  onRestoreHtml,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  currentHtml: string | null;
  getAuthHeader: () => Promise<string>;
  onRestoreHtml: (html: string) => void;
}) {
  const [versions, setVersions] = useState<BuilderVersionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function refresh() {
    if (!projectId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch(
        `/api/gafcore/builder-v2/versions?projectId=${projectId}`,
        { headers: { Authorization: authHeader } },
      );
      if (!res.ok) throw new Error("list_failed");
      const data = (await res.json()) as { versions: BuilderVersionSummary[] };
      setVersions(data.versions);
    } catch {
      setErrorMsg("No se pudo cargar el historial.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  async function saveSnapshot() {
    if (!projectId || !currentHtml) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch("/api/gafcore/builder-v2/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ projectId, html: currentHtml, label: "Versión manual" }),
      });
      if (!res.ok) throw new Error("save_failed");
      await refresh();
    } catch {
      setErrorMsg("No se pudo guardar esta versión.");
    } finally {
      setSaving(false);
    }
  }

  async function restoreVersion(versionId: string) {
    if (!projectId) return;
    setRestoringId(versionId);
    setErrorMsg(null);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch(
        `/api/gafcore/builder-v2/version/${versionId}?projectId=${projectId}`,
        { headers: { Authorization: authHeader } },
      );
      if (!res.ok) throw new Error("restore_failed");
      const data = (await res.json()) as { html: string };
      onRestoreHtml(data.html);
    } catch {
      setErrorMsg("No se pudo restaurar esa versión.");
    } finally {
      setRestoringId(null);
    }
  }

  async function deleteVersion(versionId: string) {
    setDeletingId(versionId);
    setErrorMsg(null);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch(`/api/gafcore/builder-v2/version/${versionId}`, {
        method: "DELETE",
        headers: { Authorization: authHeader },
      });
      if (!res.ok) throw new Error("delete_failed");
      setVersions((prev) => prev.filter((v) => v.id !== versionId));
    } catch {
      setErrorMsg("No se pudo eliminar esa versión.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-white text-neutral-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Historial de versiones
          </DialogTitle>
          <DialogDescription>
            Guarda puntos de control de tu sitio y restaura cualquiera cuando lo
            necesites. Se conservan las últimas 30 versiones.
          </DialogDescription>
        </DialogHeader>

        <Button
          type="button"
          size="sm"
          onClick={() => void saveSnapshot()}
          disabled={saving || !currentHtml}
          className="w-full bg-violet-600 text-white hover:bg-violet-500"
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Guardar versión actual
        </Button>

        {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}

        <div className="max-h-72 overflow-y-auto rounded-md border border-neutral-200">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-neutral-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cargando...
            </div>
          ) : versions.length === 0 ? (
            <div className="py-8 text-center text-sm text-neutral-400">
              Aún no hay versiones guardadas de este proyecto.
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {versions.map((v) => (
                <div key={v.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-neutral-800">
                      {v.label || (v.isAuto ? "Build automático" : "Versión manual")}
                    </p>
                    <p className="text-[11px] text-neutral-400">
                      {formatVersionDate(v.createdAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Restaurar esta versión"
                    onClick={() => void restoreVersion(v.id)}
                    disabled={restoringId === v.id}
                  >
                    {restoringId === v.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Eliminar esta versión"
                    onClick={() => void deleteVersion(v.id)}
                    disabled={deletingId === v.id}
                  >
                    {deletingId === v.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type BuilderSecretSummary = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
};

/**
 * Secretos del proyecto activo. Reutiliza la tabla `project_secrets` (la
 * misma del IDE legado) vía /api/gafcore/builder-v2/secrets y /secret/:id.
 */
function BuilderSecretsDialog({
  open,
  onOpenChange,
  projectId,
  getAuthHeader,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  getAuthHeader: () => Promise<string>;
}) {
  const [secrets, setSecrets] = useState<BuilderSecretSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function refresh() {
    if (!projectId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch(
        `/api/gafcore/builder-v2/secrets?projectId=${projectId}`,
        { headers: { Authorization: authHeader } },
      );
      if (!res.ok) throw new Error("list_failed");
      const data = (await res.json()) as { secrets: BuilderSecretSummary[] };
      setSecrets(data.secrets);
    } catch {
      setErrorMsg("No se pudieron cargar los secretos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      void refresh();
      setRevealed({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  async function handleAdd() {
    if (!projectId || !name.trim() || !value.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch("/api/gafcore/builder-v2/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({
          projectId,
          name,
          value,
          description: description.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("save_failed");
      setName("");
      setValue("");
      setDescription("");
      await refresh();
    } catch {
      setErrorMsg("No se pudo guardar el secreto.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleReveal(secretId: string) {
    if (revealed[secretId] !== undefined) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[secretId];
        return next;
      });
      return;
    }
    setRevealingId(secretId);
    setErrorMsg(null);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch(`/api/gafcore/builder-v2/secret/${secretId}`, {
        headers: { Authorization: authHeader },
      });
      if (!res.ok) throw new Error("reveal_failed");
      const data = (await res.json()) as { value: string | null };
      setRevealed((prev) => ({ ...prev, [secretId]: data.value ?? "" }));
    } catch {
      setErrorMsg("No se pudo descifrar ese secreto.");
    } finally {
      setRevealingId(null);
    }
  }

  async function copyRevealed(secretValue: string) {
    try {
      await navigator.clipboard.writeText(secretValue);
    } catch {
      // Silencioso: copiar al portapapeles es una mejora, no crítico.
    }
  }

  async function handleDelete(secretId: string) {
    setDeletingId(secretId);
    setErrorMsg(null);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch(`/api/gafcore/builder-v2/secret/${secretId}`, {
        method: "DELETE",
        headers: { Authorization: authHeader },
      });
      if (!res.ok) throw new Error("delete_failed");
      setSecrets((prev) => prev.filter((s) => s.id !== secretId));
    } catch {
      setErrorMsg("No se pudo eliminar el secreto.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-white text-neutral-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Secretos del proyecto
          </DialogTitle>
          <DialogDescription>
            Guarda API keys y tokens de este proyecto. Los nombres se normalizan a
            MAYÚSCULAS y los valores se guardan cifrados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-md border border-neutral-200 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="NOMBRE_DEL_SECRETO"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="font-mono text-xs"
            />
            <Input
              type="password"
              placeholder="Valor"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <Input
            placeholder="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            className="w-full bg-violet-600 text-white hover:bg-violet-500"
            onClick={() => void handleAdd()}
            disabled={saving || !name.trim() || !value.trim()}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Agregar / actualizar secreto
          </Button>
        </div>

        {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}

        <div className="max-h-64 overflow-y-auto rounded-md border border-neutral-200">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-neutral-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cargando...
            </div>
          ) : secrets.length === 0 ? (
            <div className="py-8 text-center text-sm text-neutral-400">
              No hay secretos en este proyecto.
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {secrets.map((s) => (
                <div key={s.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-xs font-semibold text-neutral-800">
                        {s.name}
                      </span>
                      {s.description && (
                        <span className="truncate text-[10px] text-neutral-400">
                          · {s.description}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-neutral-400">
                      {revealed[s.id] !== undefined ? revealed[s.id] : "•".repeat(24)}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => void toggleReveal(s.id)}
                    disabled={revealingId === s.id}
                  >
                    {revealingId === s.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : revealed[s.id] !== undefined ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => revealed[s.id] !== undefined && void copyRevealed(revealed[s.id])}
                    disabled={revealed[s.id] === undefined}
                    title={revealed[s.id] === undefined ? "Revela primero" : "Copiar"}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => void handleDelete(s.id)}
                    disabled={deletingId === s.id}
                  >
                    {deletingId === s.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
