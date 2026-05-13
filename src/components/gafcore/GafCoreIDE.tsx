import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { GafCoreAuthDialog } from "@/components/ide/GafCoreAuthDialog";
import { toast } from "sonner";
import { loadProjectFiles, saveProjectFiles, getUserSupabase, listProjects, createProject, renameProject, getCurrentProjectId, setCurrentProjectId, listSecrets, type ProjectRow } from "@/lib/userSupabase";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Toaster } from "@/components/ui/sonner";
import {
  Loader2,
  Settings as SettingsIcon,
  LogOut,
  Share2,
  Code2,
  Eye,
  ChevronDown,
  X,
  History,
  Cloud,
  BarChart3,
  Shield,
  MoreHorizontal,
  Globe,
  Home,
  Plug,
  KeyRound,
  Users,
  Pencil,
  Folder,
  Info,
  Palette,
  HelpCircle,
  Gift,
  ExternalLink,
  Check,
  Plus,
  FolderOpen,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/ide/ChatPanel";
import { CodeEditor, initialFiles, type FileItem } from "@/components/ide/CodeEditor";
import { LivePreview } from "@/components/ide/LivePreview";
import { SettingsDialog } from "@/components/ide/SettingsDialog";
import { HistoryDialog } from "@/components/ide/HistoryDialog";
import { SecretsDialog } from "@/components/ide/SecretsDialog";
import { ConnectorsDialog } from "@/components/ide/ConnectorsDialog";
import { GafCoreAnalyticsDialog } from "@/components/ide/GafCoreAnalyticsDialog";
import { FileSidebar } from "@/components/ide/FileSidebar";
import { getIdeConfig } from "@/lib/ideConfig";
import { deployToGithub } from "@/lib/githubDeploy";
import { PublishDialog } from "@/components/ide/PublishDialog";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { useSubscription } from "@/hooks/useSubscription";
import { getUserStats } from "@/lib/admin-users.functions";

type View = "preview" | "code";

export function GafCoreIDE() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { balance, monthlyAllowance, loading: creditsLoading, isUnlimitedDaily } = useCredits(user?.id);
  const { isAdmin, planDisplayLabel, subscription, subActive } = useSubscription(user?.id);

  const isFairUseCreadorPlan =
    !isAdmin &&
    subActive &&
    (subscription?.price_id === "plan_creador_monthly" ||
      String(subscription?.plan_tier ?? "").toLowerCase() === "creador");
  const [files, setFiles] = useState<FileItem[]>(initialFiles);
  const [activeIndex, setActiveIndex] = useState(0);
  const [openTabs, setOpenTabs] = useState<string[]>([initialFiles[0].name]);
  const [loaded, setLoaded] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [view, setView] = useState<View>("preview");
  const [previewKey, setPreviewKey] = useState(0);
  const [projectName, setProjectName] = useState("GafCore");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [currentProjectId, setCurrentProjectIdState] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [userStats, setUserStats] = useState<{ registered: number; paid: number; active: number } | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [projectFolder, setProjectFolder] = useState<string>(() => {
    if (typeof window === "undefined") return "src";
    return localStorage.getItem("gafcore_project_folder") ?? "src";
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleProjects = projects.filter((project, index, all) => {
    const name = (project.name ?? "").trim().toLowerCase();
    return all.findIndex((p) => (p.name ?? "").trim().toLowerCase() === name) === index;
  });
  const creditsLabel = isAdmin
    ? "Ilimitados ∞"
    : isFairUseCreadorPlan || isUnlimitedDaily
      ? "Ilimitado (fair use)"
    : creditsLoading
      ? "Cargando…"
      : monthlyAllowance > 0
        ? `${balance.toLocaleString()} de ${monthlyAllowance.toLocaleString()}`
        : `${balance.toLocaleString()} créditos`;
  const creditsPercent =
    isAdmin || isFairUseCreadorPlan || isUnlimitedDaily || monthlyAllowance <= 0
      ? 100
      : Math.max(0, Math.min(100, (balance / monthlyAllowance) * 100));

  /** Texto corto junto al historial: plan ya va aparte; esto son solo créditos. */
  const toolbarCreditsLine = isAdmin
    ? "∞"
    : creditsLoading
      ? "…"
      : isFairUseCreadorPlan || isUnlimitedDaily
        ? "Ilimitado"
        : monthlyAllowance > 0
          ? `${balance.toLocaleString()}/${monthlyAllowance.toLocaleString()}`
          : `${balance.toLocaleString()} créd.`;

  const refreshProjects = async () => {
    const list = await listProjects();
    setProjects(list);
    const cur = getCurrentProjectId();
    setCurrentProjectIdState(cur);
    const found = list.find((p) => p.id === cur);
    if (found) setProjectName(found.name);
  };

  const switchProject = async (id: string, name: string) => {
    setCurrentProjectId(id);
    setCurrentProjectIdState(id);
    setProjectName(name);
    const remote = await loadProjectFiles();
    if (remote && remote.length > 0) {
      setFiles(remote);
      setOpenTabs([remote[0].name]);
      setActiveIndex(0);
      setPreviewKey((k) => k + 1);
      toast.success(`Cambiado a "${name}"`);
    } else {
      setFiles(initialFiles);
      setOpenTabs([initialFiles[0].name]);
      setActiveIndex(0);
      setPreviewKey((k) => k + 1);
      toast.success(`Abierto "${name}" (vacío)`);
    }
  };

  const newProject = async () => {
    const name = window.prompt("Nombre del nuevo proyecto", "Nuevo proyecto");
    if (!name) return;
    const created = await createProject(name);
    if (!created) {
      toast.error("No se pudo crear");
      return;
    }
    await refreshProjects();
    await switchProject(created.id, created.name);
  };

  const renameCurrent = async () => {
    const cur = getCurrentProjectId();
    if (!cur) {
      toast.error("Sin proyecto activo");
      return;
    }
    const n = window.prompt("Nuevo nombre del proyecto", projectName);
    if (!n) return;
    const ok = await renameProject(cur, n);
    if (ok) {
      setProjectName(n);
      await refreshProjects();
      toast.success(`Renombrado a "${n}"`);
    } else {
      toast.error("No se pudo renombrar");
    }
  };

  const openExternal = (url: string) => window.open(url, "_blank", "noopener,noreferrer");
  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.toggle("dark");
    toast.success(root.classList.contains("dark") ? "Modo oscuro" : "Modo claro");
  };
  const refreshPreview = () => {
    setPreviewKey((k) => k + 1);
    toast.success("Preview recargado");
  };

  useEffect(() => {
    if (!isAdmin && secretsOpen) setSecretsOpen(false);
  }, [isAdmin, secretsOpen]);

  useEffect(() => {
    (async () => {
      if (!getUserSupabase()) {
        setLoaded(true);
        return;
      }
      const remote = await loadProjectFiles();
      const appFile = remote?.find((f) => /^app\.(jsx?|tsx?)$/i.test(f.name));
      const isStale =
        !remote ||
        remote.length === 0 ||
        !appFile ||
        !/export\s+default/.test(appFile.content) ||
        /Hello\s*\(/.test(appFile.content) ||
        /GafCore listo|Pídele algo a GafCore|Editor · App\.tsx|const \[code, setCode\]/.test(appFile.content);
      if (!isStale) {
        setFiles(remote!);
        setOpenTabs([remote![0].name]);
        toast.success(`Cargados ${remote!.length} archivos`);
      } else {
        const ok = await saveProjectFiles(initialFiles);
        setFiles(initialFiles);
        setOpenTabs([initialFiles[0].name]);
        if (ok) toast.success(`Plantilla GafCore restaurada (${initialFiles.length} archivos)`);
      }
      setLoaded(true);
      refreshProjects();
    })();
  }, []);

  useEffect(() => {
    if (!loaded || !getUserSupabase()) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const ok = await saveProjectFiles(files);
      if (!ok) toast.error("No se pudo guardar");
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [files, loaded]);

  const openFile = (i: number) => {
    setActiveIndex(i);
    const name = files[i]?.name;
    if (name && !openTabs.includes(name)) setOpenTabs([...openTabs, name]);
  };

  const closeTab = (name: string) => {
    const next = openTabs.filter((t) => t !== name);
    setOpenTabs(next.length ? next : ([files[0]?.name].filter(Boolean) as string[]));
  };

  const onDeploy = async () => {
    const cfg = getIdeConfig();
    if (!cfg.githubToken || !cfg.githubRepo) {
      toast.error("Configura tu GitHub Token y repo para publicar", {
        action: { label: "Abrir Configuración", onClick: () => setSettingsOpen(true) },
      });
      return;
    }
    const branch = cfg.githubBranch ?? "main";
    setDeploying(true);
    try {
      // Pre-flight: verify repo + branch exist with the given token
      const check = await fetch(
        `https://api.github.com/repos/${cfg.githubRepo}/branches/${encodeURIComponent(branch)}`,
        { headers: { Authorization: `Bearer ${cfg.githubToken}`, Accept: "application/vnd.github+json" } },
      );
      if (!check.ok) {
        if (check.status === 401 || check.status === 403) {
          toast.error("Token de GitHub inválido o sin permisos (necesita scope `repo`)", {
            action: { label: "Configuración", onClick: () => setSettingsOpen(true) },
          });
        } else if (check.status === 404) {
          toast.error(`No se encontró ${cfg.githubRepo}@${branch}. Verifica el repo y la rama.`, {
            action: { label: "Configuración", onClick: () => setSettingsOpen(true) },
          });
        } else {
          toast.error(`GitHub respondió ${check.status} al verificar el repo.`);
        }
        return;
      }

      // Inject .env from project secrets (if any), unless excluded
      const secrets = await listSecrets();
      const filesToDeploy = [...files];
      const excludeEnv = cfg.githubExcludeEnv !== false;
      let envIncluded = 0;
      if (secrets.length > 0 && !excludeEnv) {
        const envContent =
          "# Generado por GafCore — secretos del proyecto\n" +
          secrets
            .map((s) => `${s.name}=${JSON.stringify(s.value)}`)
            .join("\n") + "\n";
        filesToDeploy.push({ name: ".env", language: "plaintext", content: envContent });
        envIncluded = secrets.length;
      }

      // Si excluimos .env, asegurarnos de que .gitignore del proyecto lo contenga
      if (excludeEnv) {
        const giIdx = filesToDeploy.findIndex((f) => f.name === ".gitignore");
        if (giIdx >= 0) {
          const cur = filesToDeploy[giIdx].content;
          if (!/^\.env\s*$/m.test(cur)) {
            filesToDeploy[giIdx] = {
              ...filesToDeploy[giIdx],
              content: cur.replace(/\s*$/, "") + "\n.env\n",
            };
          }
        } else {
          filesToDeploy.push({
            name: ".gitignore",
            language: "plaintext",
            content: "node_modules\ndist\n.env\n.DS_Store\n",
          });
        }
      }

      const envNote = envIncluded
        ? ` (incluye .env con ${envIncluded} secretos)`
        : excludeEnv && secrets.length
          ? ` (.env omitido — ${secrets.length} secretos no se subirán)`
          : "";
      toast.message(
        `Subiendo ${filesToDeploy.length} archivos a ${cfg.githubRepo}${envNote}…`,
      );
      const r = await deployToGithub(filesToDeploy, {
        token: cfg.githubToken,
        repo: cfg.githubRepo,
        branch,
      });
      const repoUrl = `https://github.com/${cfg.githubRepo}/tree/${branch}`;
      if (r.ok) {
        toast.success(r.message, {
          action: { label: "Ver en GitHub", onClick: () => window.open(repoUrl, "_blank") },
        });
      } else {
        toast.error(r.message);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error al hacer deploy");
    } finally {
      setDeploying(false);
    }
  };

  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <div
      className="gafcore-light flex h-screen flex-col overflow-hidden"
      style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#ffffff", color: "#0f172a" }}
    >
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-3" style={{ background: "#ffffff", borderColor: "#e5e7eb" }}>
        {/* Left: logo + project */}
        <div className="flex min-w-0 items-center gap-1">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white"
            style={{
              background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #38bdf8 100%)",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontWeight: 700,
              fontSize: "14px",
              letterSpacing: "-0.02em",
              boxShadow: "0 1px 2px rgba(37,99,235,0.35)",
            }}
            aria-label="GafCore"
          >
            G
          </div>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium hover:bg-muted">
                <span className="truncate max-w-[180px]">{projectName}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64" onCloseAutoFocus={(e) => e.preventDefault()}>
              <DropdownMenuItem onClick={() => navigate({ to: "/gafcore" })}>
                <Home className="mr-2 h-4 w-4" />
                Ir a inicio
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center justify-between text-[12px] font-normal">
                <span className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-[10px] font-bold">G</span>
                  GafCore · {isAdmin ? "Administrador" : "Usuario"}
                </span>
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary max-w-[120px] truncate">
                  {isAdmin ? "ADMIN" : planDisplayLabel}
                </span>
              </DropdownMenuLabel>
              <div className="px-2 py-1.5">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-muted-foreground">Créditos GafCore</span>
                  <span className="text-foreground">{creditsLabel}</span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-foreground" style={{ width: `${creditsPercent}%` }} />
                </div>
              </div>
              <DropdownMenuItem className="text-primary" onClick={() => navigate({ to: "/credits" })}>
                <Gift className="mr-2 h-4 w-4" />
                Obtén créditos
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
                <span className="flex items-center gap-1.5"><FolderOpen className="h-3.5 w-3.5" /> Mis proyectos</span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); newProject(); }}
                  className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10.5px] font-medium text-primary hover:bg-primary/10"
                  title="Nuevo proyecto"
                >
                  <Plus className="h-3 w-3" /> Nuevo
                </button>
              </DropdownMenuLabel>
              <div className="max-h-48 overflow-y-auto">
                {visibleProjects.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => switchProject(p.id, p.name)}
                  >
                    <FolderOpen className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.id === currentProjectId && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
                {visibleProjects.length === 0 && (
                  <div className="px-2 py-3 text-center">
                    <p className="mb-2 text-[11px] text-muted-foreground">Aún no tienes proyectos</p>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); newProject(); }}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90"
                    >
                      <Plus className="h-3 w-3" /> Crear proyecto
                    </button>
                  </div>
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: "/gafcore/settings/project" })}>
                <SettingsIcon className="mr-2 h-4 w-4" />
                <span className="flex-1">Ajustes</span>
                <span className="text-[11px] text-muted-foreground">Ctrl ,</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setConnectorsOpen(true)}>
                <Plug className="mr-2 h-4 w-4" />
                <span className="flex-1">Conectores</span>
                <span className="text-[11px] text-muted-foreground">Catálogo</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={renameCurrent}>
                <Pencil className="mr-2 h-4 w-4" />
                Cambiar el nombre del proyecto
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const folder = window.prompt("Nombre de la carpeta destino", projectFolder);
                  if (folder && folder.trim()) {
                    const clean = folder.trim();
                    setProjectFolder(clean);
                    localStorage.setItem("gafcore_project_folder", clean);
                    toast.success(`Proyecto movido a "${clean}"`);
                  }
                }}
              >
                <Folder className="mr-2 h-4 w-4" />
                <span className="flex-1">Mover a carpeta</span>
                <span className="max-w-[80px] truncate text-[11px] text-muted-foreground">{projectFolder}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDetailsOpen(true)}>
                <Info className="mr-2 h-4 w-4" />
                Detalles
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Palette className="mr-2 h-4 w-4" />
                  <span className="flex-1">Apariencia</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={() => {
                      document.documentElement.classList.remove("dark");
                      localStorage.setItem("gafcore_theme", "light");
                      toast.success("Modo claro");
                    }}
                  >
                    Claro
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      document.documentElement.classList.add("dark");
                      localStorage.setItem("gafcore_theme", "dark");
                      toast.success("Modo oscuro");
                    }}
                  >
                    Oscuro
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                      document.documentElement.classList.toggle("dark", dark);
                      localStorage.setItem("gafcore_theme", "system");
                      toast.success(`Sistema (${dark ? "oscuro" : "claro"})`);
                    }}
                  >
                    Sistema
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <HelpCircle className="mr-2 h-4 w-4" />
                  <span className="flex-1">Ayuda</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => openExternal("https://tanstack.com/start/latest")}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Documentación
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setHelpOpen(true)}>
                    <Info className="mr-2 h-4 w-4" />
                    Atajos de teclado
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openExternal("mailto:soporte@gafcore.com")}>
                    <HelpCircle className="mr-2 h-4 w-4" />
                    Contactar soporte
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openExternal("https://gafcore.com")}>
                    <History className="mr-2 h-4 w-4" />
                    Novedades
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-1 flex min-w-0 max-w-[min(320px,calc(100vw-420px))] items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Historial de versiones"
            >
              <History className="h-4 w-4" />
            </button>
            <div
              className="min-w-0 leading-tight"
              title={`${planDisplayLabel} — ${creditsLabel}`}
            >
              <div className="truncate text-[11px] font-semibold text-foreground">{planDisplayLabel}</div>
              <div className="truncate text-[10px] font-medium tabular-nums text-muted-foreground">
                {isAdmin ? "Créditos: ilimitados" : `Créditos: ${toolbarCreditsLine}`}
              </div>
            </div>
          </div>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setSecretsOpen(true)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Secretos del proyecto (solo administración)"
            >
              <KeyRound className="h-4 w-4" />
            </button>
          ) : null}
          {isAdmin && (
            <button
              onClick={async () => {
                setUsersOpen(true);
                setUsersLoading(true);
                try {
                  const stats = await getUserStats();
                  setUserStats(stats);
                } catch (err) {
                  toast.error("No se pudieron cargar las estadísticas");
                  console.error(err);
                } finally {
                  setUsersLoading(false);
                }
              }}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Estadísticas de usuarios"
            >
              <Users className="h-4 w-4" />
              <span>Usuarios</span>
            </button>
          )}
        </div>

        {/* Center: workspace tools */}
        <div className="hidden items-center gap-0.5 md:flex">
          <button
            onClick={() => { setView("preview"); refreshPreview(); }}
            className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium ${
              view === "preview" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="Preview · ver y recargar"
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
          <button
            onClick={() => setView("code")}
            className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium ${
              view === "code" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="Código"
          >
            <Code2 className="h-3.5 w-3.5" /> Código
          </button>
          <button
            onClick={() => setConnectorsOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Cloud · backend e integraciones"
          >
            <Cloud className="h-4 w-4" />
          </button>
          <button
            onClick={() => setAnalyticsOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Analytics · GafCore"
          >
            <BarChart3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Seguridad · ajustes"
          >
            <Shield className="h-4 w-4" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Más">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setAnalyticsOpen(true)}>
                <BarChart3 className="mr-2 h-4 w-4" />
                <span className="flex-1">Analítica GafCore</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openExternal("https://supabase.com/dashboard/project/hbfbqqwetaynblmkezeu")}>
                <Cloud className="mr-2 h-4 w-4" />
                <span className="flex-1">Nube</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setView("code")}>
                <Code2 className="mr-2 h-4 w-4" />
                <span className="flex-1">Código</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/credits" })}>
                <Gift className="mr-2 h-4 w-4" />
                <span className="flex-1">Créditos y pagos</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                <Shield className="mr-2 h-4 w-4" />
                <span className="flex-1">Seguridad</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const { supabase } = await import("@/integrations/supabase/client");
              await supabase.auth.signOut();
              toast.success("Sesión cerrada");
              navigate({
                to: "/gafcore/login",
                search: { redirect: "/gafcore/app", signedOut: true },
              });
            }}
            className="h-8 gap-1.5 px-2.5 text-[13px] text-foreground hover:bg-muted"
            title="Cerrar sesión"
          >
            <LogOut className="h-3.5 w-3.5" />
            Cerrar sesión
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onShare}
            className="h-8 gap-1.5 px-2.5 text-[13px] text-foreground hover:bg-muted"
          >
            <Share2 className="h-3.5 w-3.5" />
            Compartir
          </Button>
          <PublishDialog
            customDomain="gafcore.com"
            isUpdating={deploying}
            onUpdate={onDeploy}
            onOpenSettings={() => setSettingsOpen(true)}
          >
            <Button
              size="sm"
              disabled={deploying}
              className="h-8 gap-1.5 rounded-md bg-foreground px-3 text-[13px] font-medium text-background hover:bg-foreground/90"
            >
              {deploying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Globe className="h-3.5 w-3.5" />
              )}
              Publicar
            </Button>
          </PublishDialog>
          <Button
            size="icon"
            variant="ghost"
            title="Configuración del proyecto"
            aria-label="Configuración del proyecto"
            onClick={() => navigate({ to: "/gafcore/settings/project" })}
            className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal">
          {/* Left: Chat (fixed open) */}
          <ResizablePanel id="chat" defaultSize="34%" minSize="28%" maxSize="55%">
            <ChatPanel
              files={files}
              setFiles={setFiles}
              projectId={currentProjectId}
              onCodeGenerated={() => {
                setView("preview");
                setPreviewKey((k) => k + 1);
              }}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenHistory={() => setHistoryOpen(true)}
              onOpenConnectors={() => setConnectorsOpen(true)}
            />
          </ResizablePanel>
          <ResizableHandle withHandle className="w-1.5 bg-border hover:bg-primary/40 transition-colors" />

          {/* Right: Preview / Code workspace */}
          <ResizablePanel id="workspace" minSize="45%">
            <div className="flex h-full flex-col bg-muted/30">
              {view === "preview" ? (
                <div className="h-full p-3">
                  <div className="h-full overflow-hidden rounded-lg border border-border bg-background shadow-sm">
                    <LivePreview key={previewKey} files={files} />
                  </div>
                </div>
              ) : (
                <ResizablePanelGroup orientation="horizontal">
                  <ResizablePanel defaultSize={18} minSize={12} maxSize={30}>
                    <FileSidebar
                      files={files}
                      activeIndex={activeIndex}
                      onSelect={openFile}
                      setFiles={setFiles}
                      setActiveIndex={setActiveIndex}
                    />
                  </ResizablePanel>
                  <ResizableHandle className="bg-border w-px" />
                  <ResizablePanel minSize={30}>
                    <div className="flex h-full flex-col bg-background">
                      <div className="flex h-9 items-center overflow-x-auto border-b border-border">
                        {openTabs.map((name) => {
                          const isActive = files[activeIndex]?.name === name;
                          return (
                            <div
                              key={name}
                              onClick={() => {
                                const i = files.findIndex((f) => f.name === name);
                                if (i >= 0) setActiveIndex(i);
                              }}
                              className={`group flex h-full cursor-pointer items-center gap-2 border-r border-border px-3 text-[12px] ${
                                isActive
                                  ? "bg-background text-foreground border-b-2 border-b-primary"
                                  : "bg-muted/40 text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <span>{name}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  closeTab(name);
                                }}
                                className="opacity-0 group-hover:opacity-100 hover:text-foreground"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex-1">
                        <CodeEditor files={files} setFiles={setFiles} activeIndex={activeIndex} />
                      </div>
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        files={files}
        onRestore={(restored) => {
          setFiles(restored);
          setOpenTabs([restored[0]?.name].filter(Boolean) as string[]);
          setActiveIndex(0);
          setPreviewKey((k) => k + 1);
        }}
      />
      {isAdmin ? <SecretsDialog open={secretsOpen} onOpenChange={setSecretsOpen} /> : null}
      <ConnectorsDialog open={connectorsOpen} onOpenChange={setConnectorsOpen} />
      <GafCoreAnalyticsDialog open={analyticsOpen} onOpenChange={setAnalyticsOpen} userId={user?.id} />
      <GafCoreAuthDialog open={authOpen} onOpenChange={setAuthOpen} initialMode={authMode} />

      <Dialog open={usersOpen} onOpenChange={setUsersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Estadísticas de usuarios</DialogTitle>
            <DialogDescription>Resumen de la actividad en la plataforma.</DialogDescription>
          </DialogHeader>
          {usersLoading || !userStats ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 py-2">
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold">{userStats.registered.toLocaleString()}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">Registrados</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold">{userStats.paid.toLocaleString()}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">Pagaron</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold">{userStats.active.toLocaleString()}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">Activos (24h)</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUsersOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalles del proyecto</DialogTitle>
            <DialogDescription>Información del proyecto activo en GafCore.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">Nombre</span><span className="font-medium">{projectName}</span></div>
            <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">ID</span><span className="font-mono text-[11px]">{currentProjectId ?? "—"}</span></div>
            <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">Archivos</span><span>{files.length}</span></div>
            <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">Carpeta</span><span>{projectFolder}</span></div>
            <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">Usuario</span><span className="truncate max-w-[60%]">{user?.email ?? "Invitado"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span>{isAdmin ? "Administrador" : "Estándar"}</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Atajos de teclado</DialogTitle>
            <DialogDescription>Acelera tu trabajo en GafCore.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 text-sm">
            {[
              ["Ctrl + ,", "Abrir Ajustes"],
              ["Ctrl + S", "Guardar archivos"],
              ["Ctrl + B", "Mostrar/ocultar archivos"],
              ["Ctrl + K", "Buscar"],
              ["Ctrl + Enter", "Enviar mensaje al chat"],
              ["Esc", "Cerrar diálogo"],
            ].map(([k, d]) => (
              <div key={k} className="flex items-center justify-between border-b py-1.5">
                <span className="text-muted-foreground">{d}</span>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{k}</kbd>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHelpOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster theme="light" />
    </div>
  );
}
