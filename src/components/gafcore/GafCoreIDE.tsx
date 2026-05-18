import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { GafCoreAuthDialog } from "@/components/ide/GafCoreAuthDialog";
import { toast } from "sonner";
import {
  loadProjectFiles,
  saveProjectFiles,
  saveProjectFilesDetailed,
  getUserSupabase,
  listProjects,
  type ProjectRow,
  createProject,
  renameProject,
  getCurrentProjectId,
  setCurrentProjectId,
  clearCurrentProjectId,
  listSecrets,
  getProjectDeployMeta,
} from "@/lib/userSupabase";
import {
  deployHostFromGithubRepo,
  normalizeDeployHost,
  type GafcoreDeployResult,
} from "@/lib/gafcore-deploy.shared";
import { fileItemsFromBrowserFileList } from "@/lib/gafcore-import-files";
import { sanitizeProjectJsxFiles } from "@/lib/gafcore-media.shared";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Toaster } from "@/components/ui/sonner";
import {
  LayoutGrid,
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
  ShieldAlert,
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
  Plus,
  FolderOpen,
  Upload,
  CreditCard,
  Check,
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { useSubscription } from "@/hooks/useSubscription";
import { getStripeEnvironment } from "@/lib/stripe";
import { getUserStats } from "@/lib/admin-users.functions";
import { displayMonthlyAllowanceForUi } from "@/lib/gafcore-plan-credits.shared";
import { CreditsOutModal } from "@/components/CreditsOutModal";

type View = "preview" | "code";

/** Nombre de cuenta en menús (el proyecto activo va en la barra principal). */
function ideUserToolbarName(
  user: { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined,
): string {
  if (!user) return "Cuenta";
  const meta = user.user_metadata ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const full = str(meta.full_name);
  if (full) return full;
  const fn = str(meta.first_name);
  const ln = str(meta.last_name);
  const combined = [fn, ln].filter(Boolean).join(" ");
  if (combined) return combined;
  const local = user.email?.split("@")[0]?.trim();
  if (local) return local;
  return "Tu cuenta";
}

export function GafCoreIDE() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    balance,
    monthlyAllowance,
    loading: creditsLoading,
    isUnlimitedDaily,
    refresh: refreshCredits,
  } = useCredits(user?.id);
  const { isAdmin, subscription, subActive } = useSubscription(user?.id);

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
  /** ID del proyecto activo (sincronizado con `setCurrentProjectId` en userSupabase). */
  const [currentProjectId, setCurrentProjectIdState] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<ProjectRow[]>([]);
  const [switchingProject, setSwitchingProject] = useState(false);
  const [deploySiteHost, setDeploySiteHost] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [importProjectDialogOpen, setImportProjectDialogOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [userStats, setUserStats] = useState<{
    registered: number;
    connected: number;
    active24h: number;
  } | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [projectFolder, setProjectFolder] = useState<string>(() => {
    if (typeof window === "undefined") return "src";
    return localStorage.getItem("gafcore_project_folder") ?? "src";
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveErrToastAt = useRef(0);
  const importFolderInputRef = useRef<HTMLInputElement>(null);
  const importFilesInputRef = useRef<HTMLInputElement>(null);
  const [creditsModalOpen, setCreditsModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const checkoutOk = url.searchParams.get("checkout") === "success";
    const creditsOk = url.searchParams.get("credits") === "success";
    if (!checkoutOk && !creditsOk) return;

    const sessionId = url.searchParams.get("session_id");

    void (async () => {
      if (checkoutOk && sessionId) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          if (token) {
            const res = await fetch("/api/gafcore/checkout-confirm", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                session_id: sessionId,
                environment: getStripeEnvironment(),
              }),
            });
            if (!res.ok) {
              const body = (await res.json().catch(() => ({}))) as { error?: string };
              console.warn("[checkout-confirm]", body.error ?? res.status);
            }
          }
        } catch (e) {
          console.warn("[checkout-confirm]", e);
        }
      }

      url.searchParams.delete("checkout");
      url.searchParams.delete("credits");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      void refreshCredits();
      window.dispatchEvent(new Event("gafcore:credits-applied"));
      toast.success(
        checkoutOk ? "Pago confirmado. Tu plan y créditos se están actualizando." : "Pago confirmado. Créditos actualizados.",
      );
    })();
  }, [refreshCredits]);

  const displayMonthly = displayMonthlyAllowanceForUi({ isAdmin, subActive, monthlyAllowance });
  const creditsLabel = isAdmin
    ? "Ilimitados ∞"
    : isFairUseCreadorPlan || isUnlimitedDaily
      ? "Ilimitado (fair use)"
      : creditsLoading
        ? "Cargando…"
        : `${balance.toLocaleString()} de ${displayMonthly.toLocaleString()}`;
  const creditsPercent =
    isAdmin || isFairUseCreadorPlan || isUnlimitedDaily || displayMonthly <= 0
      ? 100
      : Math.max(0, Math.min(100, (balance / displayMonthly) * 100));

  const refreshProjects = async () => {
    const list = await listProjects();
    setRecentProjects(list.slice(0, 8));
    const cur = getCurrentProjectId();
    const nextId = cur && list.some((p) => p.id === cur) ? cur : null;
    if (!nextId) {
      clearCurrentProjectId();
    }
    setCurrentProjectIdState(nextId);
    const found = nextId ? list.find((p) => p.id === nextId) : undefined;
    if (found) setProjectName(found.name);
    else if (list.length === 0) setProjectName("Sin proyecto");
  };

  const hydrateEditorFromRemote = async (remote: FileItem[] | null, projectId: string) => {
    const appFile = remote?.find((f) => /^app\.(jsx?|tsx?)$/i.test(f.name));
    const isStale =
      !remote ||
      remote.length === 0 ||
      !appFile ||
      !/export\s+default/.test(appFile.content) ||
      /Hello\s*\(/.test(appFile.content) ||
      /GafCore listo|Pídele algo a GafCore|Editor · App\.tsx|const \[code, setCode\]/.test(
        appFile.content,
      ) ||
      /Hola desde GafCore/i.test(appFile.content) ||
      (/Proyecto listo/i.test(appFile.content) && !/useState/i.test(appFile.content));

    if (!isStale && remote?.length) {
      const sanitized = sanitizeProjectJsxFiles(remote);
      const jsxFixed = sanitized.some((f, i) => f.content !== remote[i]?.content);
      setFiles(sanitized);
      setOpenTabs([sanitized[0]?.name ?? remote[0].name]);
      setActiveIndex(0);
      if (jsxFixed) void saveProjectFiles(sanitized, projectId);
      return;
    }

    const ok = await saveProjectFiles(initialFiles, projectId);
    setFiles(initialFiles);
    setOpenTabs([initialFiles[0].name]);
    setActiveIndex(0);
    if (!ok) toast.error("No se pudo guardar la plantilla inicial");
  };

  const switchToProject = async (p: ProjectRow) => {
    if (p.id === currentProjectId || switchingProject) return;
    setSwitchingProject(true);
    try {
      if (currentProjectId && loaded) {
        await saveProjectFilesDetailed(files, currentProjectId);
      }
      setCurrentProjectId(p.id);
      setCurrentProjectIdState(p.id);
      setProjectName(p.name);
      const remote = await loadProjectFiles(p.id);
      await hydrateEditorFromRemote(remote, p.id);
      setPreviewKey((k) => k + 1);
      const meta = await getProjectDeployMeta(p.id);
      const cfg = getIdeConfig();
      const host =
        normalizeDeployHost(meta?.deploy_site_url ?? cfg.deploySiteUrl) ??
        (meta?.github_repo || cfg.githubRepo
          ? deployHostFromGithubRepo(meta?.github_repo ?? cfg.githubRepo ?? "")
          : null);
      setDeploySiteHost(host);
      toast.success(`Proyecto «${p.name}»`);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo cambiar de proyecto");
    } finally {
      setSwitchingProject(false);
    }
  };

  const newProject = async () => {
    const name = window.prompt("Nombre del nuevo proyecto", "Mi proyecto");
    if (!name?.trim()) return;
    const created = await createProject(name.trim());
    if (!created) {
      toast.error("No se pudo crear el proyecto");
      return;
    }
    setCurrentProjectId(created.id);
    setCurrentProjectIdState(created.id);
    setProjectName(created.name);
    setFiles(initialFiles);
    setOpenTabs([initialFiles[0].name]);
    setActiveIndex(0);
    setPreviewKey((k) => k + 1);
    const saved = await saveProjectFiles(initialFiles);
    if (!saved) toast.error("Proyecto creado pero no se pudieron guardar los archivos iniciales");
    await refreshProjects();
    toast.success(`Proyecto «${created.name}» creado. Puedes cambiar de proyecto en «Todos los proyectos».`);
  };

  const applyImportedFiles = async (items: FileItem[], suggestedName = "Mi proyecto") => {
    if (!items.length) {
      toast.error("No hay archivos importables.");
      return;
    }
    const name = window.prompt("Nombre del proyecto en GafCore", suggestedName) ?? "";
    if (!name.trim()) {
      toast.message("Importación cancelada.");
      return;
    }
    const created = await createProject(name.trim());
    if (!created) {
      toast.error("No se pudo crear el proyecto");
      return;
    }
    setCurrentProjectId(created.id);
    setCurrentProjectIdState(created.id);
    setProjectName(created.name);
    setFiles(items);
    setOpenTabs([items[0]?.name].filter(Boolean) as string[]);
    setActiveIndex(0);
    setPreviewKey((k) => k + 1);
    const saved = await saveProjectFiles(items);
    if (!saved) toast.error("No se pudieron guardar los archivos importados");
    await refreshProjects();
    toast.success(`Importados ${items.length} archivos en «${created.name}».`);
  };

  const onImportFolderChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    e.target.value = "";
    if (!list?.length) return;
    try {
      const items = await fileItemsFromBrowserFileList(list);
      if (!items.length) {
        toast.error(
          "No se encontraron archivos de texto o código (omitimos node_modules, dist, binarios, etc.). Prueba con la carpeta que contiene tu src.",
        );
        return;
      }
      await applyImportedFiles(items, "Mi proyecto");
    } catch (err) {
      console.error(err);
      toast.error("Error al leer la carpeta.");
    }
  };

  const onImportFilesChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    e.target.value = "";
    if (!list?.length) return;
    try {
      const items = await fileItemsFromBrowserFileList(list);
      if (!items.length) {
        toast.error(
          "No se pudieron importar esos archivos. Usa extensiones de código (.ts, .tsx, .html, .css, etc.).",
        );
        return;
      }
      await applyImportedFiles(items, "Mi proyecto");
    } catch (err) {
      console.error(err);
      toast.error("Error al importar archivos.");
    }
  };

  const renameCurrent = async () => {
    const cur = getCurrentProjectId();
    if (!cur) {
      toast.error("Sin proyecto activo");
      return;
    }
    const n = window.prompt("Nuevo nombre del proyecto", projectName);
    if (n === null) return;
    const trimmed = n.trim();
    if (!trimmed) {
      toast.error("El nombre no puede estar vacío");
      return;
    }
    const ok = await renameProject(cur, trimmed);
    if (ok) {
      setProjectName(trimmed);
      await refreshProjects();
      toast.success(`Renombrado a «${trimmed}»`);
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
    if (!loaded) return;
    setFiles((prev) => {
      const next = sanitizeProjectJsxFiles(prev);
      return next.some((f, i) => f.content !== prev[i]?.content) ? next : prev;
    });
  }, [loaded]);

  useEffect(() => {
    if (!isAdmin && secretsOpen) setSecretsOpen(false);
  }, [isAdmin, secretsOpen]);

  useEffect(() => {
    (async () => {
      if (!getUserSupabase()) {
        setLoaded(true);
        return;
      }
      const list = await listProjects();
      if (list.length === 0) {
        clearCurrentProjectId();
        setCurrentProjectIdState(null);
        setProjectName("Sin proyecto");
        setFiles(initialFiles);
        setOpenTabs([initialFiles[0].name]);
        setLoaded(true);
        return;
      }
      let activeId = getCurrentProjectId();
      if (!activeId || !list.some((p) => p.id === activeId)) {
        activeId = list[0].id;
        setCurrentProjectId(activeId);
      }
      setCurrentProjectIdState(activeId);
      const row = list.find((p) => p.id === activeId);
      if (row) setProjectName(row.name);

      setRecentProjects(list.slice(0, 8));
      const remote = await loadProjectFiles(activeId);
      await hydrateEditorFromRemote(remote, activeId);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded || !getUserSupabase() || !currentProjectId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const result = await saveProjectFilesDetailed(files, currentProjectId);
      if (!result.ok) {
        const now = Date.now();
        if (now - saveErrToastAt.current > 25_000) {
          saveErrToastAt.current = now;
          const description =
            result.reason === "no_project"
              ? "No hay proyecto activo. Usa «+ Nuevo» para crear uno y guardar tus archivos."
              : result.reason === "insert_failed" && result.detail
                ? `Supabase: ${result.detail}`
                : "Revisa la conexión. Si acabas de entrar, espera unos segundos e inténtalo de nuevo.";
          toast.error("No se pudo guardar", { description });
        }
      }
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [files, loaded, currentProjectId]);

  useEffect(() => {
    if (!currentProjectId) {
      setDeploySiteHost(null);
      return;
    }
    void (async () => {
      const meta = await getProjectDeployMeta(currentProjectId);
      const cfg = getIdeConfig();
      const host =
        normalizeDeployHost(meta?.deploy_site_url ?? cfg.deploySiteUrl) ??
        (meta?.github_repo || cfg.githubRepo
          ? deployHostFromGithubRepo(meta?.github_repo ?? cfg.githubRepo ?? "")
          : null);
      setDeploySiteHost(host);
    })();
  }, [currentProjectId, settingsOpen]);

  const openFile = (i: number) => {
    setActiveIndex(i);
    const name = files[i]?.name;
    if (name && !openTabs.includes(name)) setOpenTabs([...openTabs, name]);
  };

  const closeTab = (name: string) => {
    const next = openTabs.filter((t) => t !== name);
    setOpenTabs(next.length ? next : ([files[0]?.name].filter(Boolean) as string[]));
  };

  const onDeploy = async (): Promise<GafcoreDeployResult> => {
    if (!currentProjectId) {
      throw new Error("Crea o selecciona un proyecto antes de publicar (+ Nuevo).");
    }

    const cfg = getIdeConfig();
    const meta = await getProjectDeployMeta(currentProjectId);
    const githubRepo = (meta?.github_repo ?? cfg.githubRepo)?.trim();
    const githubToken = cfg.githubToken?.trim();
    const branch = meta?.github_branch ?? cfg.githubBranch ?? "main";
    const hookUrl = (meta?.vercel_deploy_hook_url ?? cfg.vercelDeployHookUrl)?.trim();

    if (!githubToken || !githubRepo) {
      throw new Error("Configura GitHub Token y repo en Configuración.");
    }

    setDeploying(true);
    try {
      const saved = await saveProjectFilesDetailed(files, currentProjectId);
      if (!saved.ok) {
        throw new Error(
          saved.reason === "no_project"
            ? "No hay proyecto activo."
            : saved.detail
              ? `No se pudo guardar antes de publicar: ${saved.detail}`
              : "No se pudo guardar antes de publicar.",
        );
      }

      const check = await fetch(
        `https://api.github.com/repos/${githubRepo}/branches/${encodeURIComponent(branch)}`,
        {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github+json",
          },
        },
      );
      if (!check.ok) {
        if (check.status === 401 || check.status === 403) {
          throw new Error("Token de GitHub inválido o sin permisos (scope repo).");
        }
        if (check.status === 404) {
          throw new Error(`No se encontró ${githubRepo}@${branch}.`);
        }
        throw new Error(`GitHub respondió ${check.status} al verificar el repo.`);
      }

      const secrets = await listSecrets();
      const filesToDeploy = [...files];
      const excludeEnv = cfg.githubExcludeEnv !== false;
      if (secrets.length > 0 && !excludeEnv) {
        const envContent =
          "# Generado por GafCore — secretos del proyecto\n" +
          secrets.map((s) => `${s.name}=${JSON.stringify(s.value)}`).join("\n") +
          "\n";
        filesToDeploy.push({ name: ".env", language: "plaintext", content: envContent });
      }

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

      toast.message(`Subiendo ${filesToDeploy.length} archivos a ${githubRepo}…`);
      const r = await deployToGithub(filesToDeploy, {
        token: githubToken,
        repo: githubRepo,
        branch,
      });

      if (!r.ok) {
        return { ok: false, message: r.message };
      }

      if (hookUrl) {
        try {
          await fetch(hookUrl, { method: "POST" });
          toast.message("Deploy Hook de Vercel disparado");
        } catch {
          toast.error("Push OK, pero falló el Deploy Hook de Vercel");
        }
      }

      const repoUrl = `https://github.com/${githubRepo}/tree/${branch}`;
      const siteHost =
        normalizeDeployHost(meta?.deploy_site_url ?? cfg.deploySiteUrl) ??
        deployHostFromGithubRepo(githubRepo);

      if (siteHost) setDeploySiteHost(siteHost);

      return {
        ok: true,
        message: r.message,
        repoUrl,
        fileCount: filesToDeploy.length,
        siteHost: siteHost ?? undefined,
      };
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
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        background: "#ffffff",
        color: "#0f172a",
      }}
    >
      <input
        ref={importFolderInputRef}
        type="file"
        className="hidden"
        multiple
        {...({ webkitdirectory: "" } as Record<string, string>)}
        onChange={onImportFolderChange}
      />
      <input
        ref={importFilesInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={onImportFilesChange}
      />
      <Dialog open={importProjectDialogOpen} onOpenChange={setImportProjectDialogOpen}>
        <DialogContent className="max-w-md border-border bg-background text-foreground">
          <DialogHeader>
            <DialogTitle>Importar proyecto</DialogTitle>
            <DialogDescription>
              Elige una carpeta con tu código o varios archivos. Después podrás poner nombre al
              proyecto (puedes ponerle el nombre que quieras) y renombrarlo después.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => {
                setImportProjectDialogOpen(false);
                importFolderInputRef.current?.click();
              }}
            >
              <FolderOpen className="h-4 w-4" />
              Elegir carpeta
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => {
                setImportProjectDialogOpen(false);
                importFilesInputRef.current?.click();
              }}
            >
              <Upload className="h-4 w-4" />
              Elegir archivos
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setImportProjectDialogOpen(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Top bar */}
      <header
        className="flex h-12 shrink-0 items-center justify-between border-b px-3"
        style={{ background: "#ffffff", borderColor: "#e5e7eb" }}
      >
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
          <DropdownMenu
            modal={false}
            onOpenChange={(open) => {
              if (open) void refreshProjects();
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 max-w-[min(100vw-200px,420px)] flex-col items-start gap-0 rounded-md px-2 py-1 text-left hover:bg-muted sm:flex-row sm:items-center sm:gap-1"
                title={
                  currentProjectId
                    ? `Proyecto: ${projectName} · Cuenta: ${ideUserToolbarName(user)}`
                    : "Crea o elige un proyecto"
                }
              >
                <span className="truncate text-[13px] font-semibold text-foreground">
                  {projectName}
                </span>
                <span className="hidden truncate text-[11px] text-muted-foreground sm:inline sm:max-w-[140px]">
                  {ideUserToolbarName(user)}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground sm:ml-0.5" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-64"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <DropdownMenuItem onClick={() => navigate({ to: "/gafcore" })}>
                <Home className="mr-2 h-4 w-4" />
                Ir a inicio
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Proyecto activo
              </DropdownMenuLabel>
              <div className="px-2 pb-1">
                <p className="truncate text-sm font-semibold text-foreground">{projectName}</p>
                {currentProjectId ? (
                  <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                    {currentProjectId.slice(0, 8)}…
                  </p>
                ) : (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Usa «+ Nuevo» para crear uno
                  </p>
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-start gap-2 text-[12px] font-normal">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold">
                  {ideUserToolbarName(user).charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 leading-snug">
                  <span className="block truncate font-medium text-foreground">
                    {ideUserToolbarName(user)}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    {user?.email ?? "Sesión"}
                  </span>
                  {isAdmin ? (
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      Administrador
                    </span>
                  ) : null}
                </span>
              </DropdownMenuLabel>
              <div className="px-2 py-1.5">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-muted-foreground">Créditos GafCore</span>
                  <span className="text-foreground">{creditsLabel}</span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground"
                    style={{ width: `${creditsPercent}%` }}
                  />
                </div>
              </div>
              <DropdownMenuItem className="text-primary" onClick={() => setCreditsModalOpen(true)}>
                <Gift className="mr-2 h-4 w-4" />
                Comprar créditos (paquetes)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  navigate({ to: "/gafcore/settings/project", search: { section: "plans" } })
                }
              >
                <CreditCard className="mr-2 h-4 w-4" />
                <span className="flex-1">Pagos</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5" /> Cambiar proyecto
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    newProject();
                  }}
                  className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10.5px] font-medium text-primary hover:bg-primary/10"
                  title="Crear proyecto nuevo"
                >
                  <Plus className="h-3 w-3" /> Nuevo
                </button>
              </DropdownMenuLabel>
              {recentProjects.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Sin proyectos. Usa «+ Nuevo» para crear uno.
                </div>
              ) : (
                recentProjects.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    disabled={switchingProject}
                    onClick={(e) => {
                      e.preventDefault();
                      void switchToProject(p);
                    }}
                  >
                    {p.id === currentProjectId ? (
                      <Check className="mr-2 h-4 w-4 text-primary" />
                    ) : (
                      <Folder className="mr-2 h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate">{p.name}</span>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuItem onClick={() => void navigate({ to: "/gafcore/projects" })}>
                <LayoutGrid className="mr-2 h-4 w-4" />
                Todos los proyectos
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  setImportProjectDialogOpen(true);
                }}
              >
                <Upload className="mr-2 h-4 w-4" />
                Importar proyecto (carpeta o archivos)
              </DropdownMenuItem>
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
              <DropdownMenuItem
                onSelect={() => {
                  window.setTimeout(() => void renameCurrent(), 0);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Cambiar el nombre del proyecto
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  window.setTimeout(() => {
                    const folder = window.prompt("Nombre de la carpeta destino", projectFolder);
                    if (folder && folder.trim()) {
                      const clean = folder.trim();
                      setProjectFolder(clean);
                      localStorage.setItem("gafcore_project_folder", clean);
                      toast.success(`Proyecto movido a «${clean}»`);
                    }
                  }, 0);
                }}
              >
                <Folder className="mr-2 h-4 w-4" />
                <span className="flex-1">Mover a carpeta</span>
                <span className="max-w-[80px] truncate text-[11px] text-muted-foreground">
                  {projectFolder}
                </span>
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
                  <DropdownMenuItem
                    onClick={() => openExternal("https://tanstack.com/start/latest")}
                  >
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
          <div className="ml-1 flex items-center md:hidden">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Historial de versiones"
            >
              <History className="h-4 w-4" />
            </button>
          </div>
          <div className="ml-1 hidden min-w-0 items-center gap-1.5 md:flex">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Historial de versiones"
            >
              <History className="h-4 w-4" />
            </button>
          </div>
          {isAdmin ? (
            <>
              <Link
                to="/gafcore/admin/ops"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Ops — diagnóstico y aprobación (admin)"
              >
                <ShieldAlert className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => setSecretsOpen(true)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Secretos del proyecto (solo administración)"
              >
                <KeyRound className="h-4 w-4" />
              </button>
            </>
          ) : null}
          {isAdmin && (
            <button
              onClick={async () => {
                setUsersOpen(true);
                setUsersLoading(true);
                setUsersError(null);
                try {
                  const stats = await getUserStats();
                  setUserStats(stats);
                } catch (err) {
                  setUsersError("No se pudieron cargar las estadísticas");
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

        {/* Centro: vista y herramientas (plan y créditos solo en el panel de chat) */}
        <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 px-1 md:flex">
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={() => {
                setView("preview");
                refreshPreview();
              }}
              className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium ${
                view === "preview"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title="Preview · ver y recargar"
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </button>
            <button
              onClick={() => setView("code")}
              className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium ${
                view === "code"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Más"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {isAdmin ? (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        setSecretsOpen(true);
                      }}
                    >
                      <KeyRound className="mr-2 h-4 w-4" />
                      <span className="flex-1">Secretos del proyecto</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                <DropdownMenuItem onClick={() => setAnalyticsOpen(true)}>
                  <BarChart3 className="mr-2 h-4 w-4" />
                  <span className="flex-1">Analítica GafCore</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    openExternal("https://supabase.com/dashboard/project/hbfbqqwetaynblmkezeu")
                  }
                >
                  <Cloud className="mr-2 h-4 w-4" />
                  <span className="flex-1">Nube</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setView("code")}>
                  <Code2 className="mr-2 h-4 w-4" />
                  <span className="flex-1">Código</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setView("code");
                  }}
                  title="Abre la vista Código con el explorador de archivos"
                >
                  <Folder className="mr-2 h-4 w-4" />
                  <span className="flex-1">Archivos</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    navigate({ to: "/gafcore/settings/project", search: { section: "plans" } })
                  }
                  title="Plan actual, créditos y facturación"
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  <span className="flex-1">Pagos</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreditsModalOpen(true)}>
                  <Gift className="mr-2 h-4 w-4" />
                  <span className="flex-1">Comprar créditos (paquetes)</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                  <Shield className="mr-2 h-4 w-4" />
                  <span className="flex-1">Seguridad</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
            siteHost={deploySiteHost}
            projectId={currentProjectId}
            canPublish={Boolean(currentProjectId)}
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

      <div className="relative min-h-0 flex-1">
        <main className="h-full overflow-hidden">
          <ResizablePanelGroup orientation="horizontal" className="h-full">
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
            <ResizableHandle
              withHandle
              className="w-1.5 bg-border hover:bg-primary/40 transition-colors"
            />

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
        {loaded && getUserSupabase() && !currentProjectId ? (
          <div
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 border-t border-border bg-background/95 px-6 text-center backdrop-blur-sm"
            role="status"
            aria-live="polite"
          >
            <p className="max-w-md text-[15px] font-semibold text-foreground">
              Crea tu primer proyecto o importa uno
            </p>
            <p className="max-w-md text-[13px] text-muted-foreground">
              No creamos proyectos automáticamente. Usa «+ Nuevo» o importa una carpeta o archivos
              para empezar.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button type="button" onClick={() => void newProject()}>
                <Plus className="mr-2 h-4 w-4" />
                Crear proyecto
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setImportProjectDialogOpen(true)}
              >
                <Upload className="mr-2 h-4 w-4" />
                Importar proyecto
              </Button>
            </div>
          </div>
        ) : null}
      </div>

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
      <GafCoreAnalyticsDialog
        open={analyticsOpen}
        onOpenChange={setAnalyticsOpen}
        userId={user?.id}
      />
      <GafCoreAuthDialog open={authOpen} onOpenChange={setAuthOpen} initialMode={authMode} />

      <CreditsOutModal
        open={creditsModalOpen}
        onOpenChange={setCreditsModalOpen}
        userId={user?.id}
        userEmail={user?.email ?? undefined}
        reason="buy"
        returnUrl={
          typeof window !== "undefined"
            ? `${window.location.origin}/gafcore/app?credits=success`
            : "/gafcore/app?credits=success"
        }
      />

      <Dialog open={usersOpen} onOpenChange={setUsersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Estadísticas de usuarios</DialogTitle>
            <DialogDescription>Resumen de la actividad en la plataforma.</DialogDescription>
          </DialogHeader>
          {usersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : usersError ? (
            <p className="py-2 text-sm text-muted-foreground">{usersError}</p>
          ) : !userStats ? (
            <p className="py-2 text-sm text-muted-foreground">Aún no hay datos disponibles.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 py-2">
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold">{userStats.registered.toLocaleString()}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">Registrados</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold">{userStats.connected.toLocaleString()}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">Conectados (30 min)</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold">{userStats.active24h.toLocaleString()}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">Activos (24h)</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUsersOpen(false)}>
              Cerrar
            </Button>
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
            <div className="flex justify-between border-b pb-1.5">
              <span className="text-muted-foreground">Nombre</span>
              <span className="font-medium">{projectName}</span>
            </div>
            <div className="flex justify-between border-b pb-1.5">
              <span className="text-muted-foreground">ID</span>
              <span className="font-mono text-[11px]">{currentProjectId ?? "—"}</span>
            </div>
            <div className="flex justify-between border-b pb-1.5">
              <span className="text-muted-foreground">Archivos</span>
              <span>{files.length}</span>
            </div>
            <div className="flex justify-between border-b pb-1.5">
              <span className="text-muted-foreground">Carpeta</span>
              <span>{projectFolder}</span>
            </div>
            <div className="flex justify-between border-b pb-1.5">
              <span className="text-muted-foreground">Usuario</span>
              <span className="truncate max-w-[60%]">{user?.email ?? "Invitado"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plan</span>
              <span>{isAdmin ? "Administrador" : "Estándar"}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Cerrar
            </Button>
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
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                  {k}
                </kbd>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHelpOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster theme="light" />
    </div>
  );
}
