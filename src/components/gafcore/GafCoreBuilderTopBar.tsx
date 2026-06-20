import { useState } from "react";
import {
  Archive,
  BarChart3,
  ChevronDown,
  Cloud,
  Code2,
  CreditCard,
  Eye,
  FileCode2,
  FolderGit2,
  Gift,
  History,
  Home,
  KeyRound,
  LogOut,
  MoreHorizontal,
  Package,
  Pencil,
  Plug,
  Plus,
  Rocket,
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
}: Props) {
  const [comingSoonLabel, setComingSoonLabel] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BuilderProjectSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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
          onClick={() => openComingSoon("Historial de versiones")}
        />
        <ToolbarIconButton
          icon={KeyRound}
          title="Secretos del proyecto"
          onClick={() => openComingSoon("Secretos del proyecto")}
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
              Todos los proyectos
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Marketplace")}>
              <Package className="mr-2 h-4 w-4 text-neutral-400" />
              Marketplace
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Ir a inicio")}>
              <Home className="mr-2 h-4 w-4 text-neutral-400" />
              Ir a inicio
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Ajustes del proyecto")}>
              <Settings className="mr-2 h-4 w-4 text-neutral-400" />
              Ajustes del proyecto
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Memoria IA del proyecto")}>
              Memoria IA del proyecto
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Conectores")}>
              <Plug className="mr-2 h-4 w-4 text-neutral-400" />
              Conectores
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Cambiar el nombre del proyecto")}>
              <Pencil className="mr-2 h-4 w-4 text-neutral-400" />
              Cambiar el nombre del proyecto
            </DropdownMenuItem>
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
            <DropdownMenuItem onSelect={() => openComingSoon("Mover a carpeta")}>
              Mover a carpeta
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openComingSoon("Detalles")}>
              Detalles
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
            <DropdownMenuItem onSelect={() => openComingSoon("Secretos del proyecto")}>
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
    </>
  );
}

function ToolbarIconButton({
  icon: Icon,
  title,
  onClick,
}: {
  icon: typeof History;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
