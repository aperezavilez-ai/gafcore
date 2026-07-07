import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { GafCoreAuthDialog } from "@/components/ide/GafCoreAuthDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import {
  loadProjectFiles,
  saveProjectFiles,
  saveProjectFilesDetailed,
  getUserSupabase,
  listSecrets,
  setProjectSaveSuppressed,
} from "@/lib/userSupabase";
import {
  activateProjectRow,
  bootstrapWorkspace,
  cacheActiveProject,
  listProjects,
  loadDeployHostForProject,
  loadDeploySummaryForProject,
  readCachedProjectName,
  renameProject,
  syncActiveFromList,
  autoPublishProject,
  clearCurrentProjectId,
  getCurrentProjectId,
  invalidateProjectFromClientCaches,
  bumpIdeSessionAndNotify,
  consumePendingProjectFiles,
  clearActiveProjectCache,
  stashPendingProjectFiles,
  type ProjectRow,
} from "@/core/project";
import { gafcoreAuthJsonFetch } from "@/lib/gafcore-client-auth-fetch";
import { logClientError, logClientWarn } from "@/lib/gafcore-client-logger";
import { requestGafcoreCriticalApproval } from "@/lib/gafcore-governance.functions";
import { CriticalActionConfirmDialog } from "@/components/ide/CriticalActionConfirmDialog";
import type { GafcoreRiskAssessment } from "@/lib/gafcore-governance.shared";
import {
  isGithubDeployConfigured,
  type GafcoreDeployResult,
} from "@/lib/gafcore-deploy.shared";
import {
  dispatchVersionRestored,
  prepareFilesForEditorRestore,
} from "@/lib/gafcore-snapshot-restore.shared";
import { sanitizeProjectJsxFiles } from "@/lib/gafcore-media.shared";
import { prepareFreshProjectFiles, prepareLoadedProjectFiles } from "@/core/pipeline/workspace-heal.shared";
import {
  createWelcomeProjectFiles,
  isWelcomeWorkspace,
  resolveWelcomeWorkspaceFiles,
} from "@/lib/gafcore-welcome-preview.shared";
import {
  hasSubstantialRemoteProject,
  isRemoteProjectStale,
} from "@/lib/gafcore-project-stale.shared";
import {
  isTruthyNewProjectSearchParam,
} from "@/lib/gafcore-marketplace-template-pending.shared";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { Toaster } from "@/components/ui/sonner";
import { GafcoreLogo } from "@/components/GafcoreLogo";
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
  ShieldAlert,
  MoreHorizontal,
  Globe,
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
  Search,
  Package,
  Trash2,
  Monitor,
  Smartphone,
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
import { Input } from "@/components/ui/input";
import { ChatPanel, type ChatWorkflowStripPayload } from "@/components/ide/ChatPanel";
import { WorkflowTaskStrip } from "@/components/ide/WorkflowTaskStrip";
import { CodeEditor, type FileItem } from "@/components/ide/CodeEditor";
import { LivePreview, type PreviewDevice } from "@/components/ide/LivePreview";
import { DesignCritiqueDialog } from "@/components/ide/DesignCritiqueDialog";
import { SettingsDialog } from "@/components/ide/SettingsDialog";
import { HistoryDialog } from "@/components/ide/HistoryDialog";
import { VersionHistoryPanel } from "@/components/ide/VersionHistoryPanel";
import { saveProjectVersionFn } from "@/lib/gafcore-version-history.functions";
import { SecretsDialog } from "@/components/ide/SecretsDialog";
import { ConnectorsDialog } from "@/components/ide/ConnectorsDialog";
import { GafCoreAnalyticsDialog } from "@/components/ide/GafCoreAnalyticsDialog";
import { ProjectCloudDialog } from "@/components/ide/ProjectCloudDialog";
import { FileSidebar } from "@/components/ide/FileSidebar";
import { getIdeConfig } from "@/lib/ideConfig";
import { PublishDialog } from "@/components/ide/PublishDialog";
import { NewProjectDialog } from "@/components/ide/NewProjectDialog";
import { ImportProjectDialog } from "@/components/ide/ImportProjectDialog";
import { getProjectDeployStatus } from "@/lib/gafcore-deploy.functions";
import type { ProjectDeployStatus } from "@/lib/gafcore-deploy.shared";
import { supabase } from "@/lib/gafcore-supabase-client-proxy";
import { useAuth, getAuthAccessToken } from "@/hooks/useAuth";
import { useCreateProject } from "@/hooks/useCreateProject";
import {
  clearPendingMarketplaceTemplate,
  readPendingMarketplaceTemplate,
  shouldAutoCreatePendingMarketplaceTemplate,
  suggestProjectNameFromTemplate,
} from "@/lib/gafcore-marketplace-template-pending.shared";
import { useProfile } from "@/hooks/useProfile";
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

/** Etiqueta corta junto al logo G: primer nombre de registro o primer token del nombre. */
function ideUserToolbarShortName(
  user: { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined,
  profile?: { first_name?: string | null } | null,
): string {
  if (!user) return "";
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const firstToken = (s: string) => s.split(/\s+/).filter(Boolean)[0] ?? s;
  const pfn = str(profile?.first_name);
  if (pfn) return firstToken(pfn);
  const meta = user.user_metadata ?? {};
  const fn = str(meta.first_name) || str(meta.given_name);
  if (fn) return firstToken(fn);
  const full = str(meta.full_name);
  if (full) return firstToken(full);
  const local = user.email?.split("@")[0]?.trim();
  if (local) return local;
  return "Cuenta";
}

export function GafCoreIDE() {
  const { user, signOut } = useAuth();
  const { profile } = useProfile(user?.id);
  const navigate = useNavigate();
  const userShortLabel = ideUserToolbarShortName(user, profile);
  const {
    balance,
    monthlyAllowance,
    loading: creditsLoading,
    isUnlimitedDaily,
    refresh: refreshCredits,
  } = useCredits(user?.id);
  const { isAdmin, subscription, subActive } = useSubscription(user?.id, user?.email);

  const isFairUseCreadorPlan =
    !isAdmin &&
    subActive &&
    (subscription?.price_id === "plan_creador_monthly" ||
      String(subscription?.plan_tier ?? "").toLowerCase() === "creador");
  const callDeployStatus = useServerFn(getProjectDeployStatus);
  const requestCriticalApproval = useServerFn(requestGafcoreCriticalApproval);

  const [files, setFiles] = useState<FileItem[]>(() => createWelcomeProjectFiles());
  const [activeIndex, setActiveIndex] = useState(0);
  const [openTabs, setOpenTabs] = useState<string[]>(() => [createWelcomeProjectFiles()[0].name]);
  const [loaded, setLoaded] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmBusy, setDeleteConfirmBusy] = useState(false);
  const [deletePendingApproval, setDeletePendingApproval] = useState<{
    approvalId: string;
    summary: string;
    risk: GafcoreRiskAssessment;
  } | null>(null);
  const [view, setView] = useState<View>("preview");
  const [previewKey, setPreviewKey] = useState(0);
  /** Fuerza remount del chat al resetear workspace (p. ej. tras eliminar proyecto). */
  const [chatPanelKey, setChatPanelKey] = useState(0);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const previewRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [projectName, setProjectName] = useState(readCachedProjectName);
  const [sessionAccessToken, setSessionAccessToken] = useState<string | null>(null);
  const [workflowStrip, setWorkflowStrip] = useState<ChatWorkflowStripPayload | null>(null);
  const isMobile = useIsMobile();
  const [mobilePane, setMobilePane] = useState<"chat" | "workspace">("chat");
  const mobileScrollRef = useRef<HTMLDivElement | null>(null);
  const workspacePanelRef = useRef<ImperativePanelHandle>(null);

  const refreshPreviewNow = useCallback(() => {
    if (previewRefreshTimerRef.current) {
      clearTimeout(previewRefreshTimerRef.current);
      previewRefreshTimerRef.current = null;
    }
    setPreviewKey((k) => k + 1);
  }, []);

  const schedulePreviewRefresh = useCallback(() => {
    if (previewRefreshTimerRef.current) clearTimeout(previewRefreshTimerRef.current);
    previewRefreshTimerRef.current = setTimeout(() => {
      setPreviewKey((k) => k + 1);
      previewRefreshTimerRef.current = null;
    }, 500);
  }, []);

  const handleWorkflowStripChange = useCallback((payload: ChatWorkflowStripPayload) => {
    setWorkflowStrip(payload);
  }, []);

  const openWorkspacePanel = useCallback(() => {
    if (isMobile) {
      setMobilePane("workspace");
      requestAnimationFrame(() => {
        const el = mobileScrollRef.current;
        if (el) el.scrollTo({ left: el.clientWidth, behavior: "smooth" });
      });
      return;
    }
    workspacePanelRef.current?.expand();
  }, [isMobile]);

  const onPreviewCodeGenerated = useCallback(() => {
    setView("preview");
    refreshPreviewNow();
    openWorkspacePanel();
  }, [refreshPreviewNow, openWorkspacePanel]);

  const handleBuildSucceeded = useCallback(
    ({ label }: { label: string }) => {
      const pid = currentProjectIdRef.current ?? getCurrentProjectId();
      if (!pid || !user?.id) return;
      void saveProjectVersionFn({
        data: { projectId: pid, files: filesRef.current, label, isAuto: true },
      }).catch(() => {
        // silencioso: versión auto no es bloqueante
      });
    },
    [user?.id],
  );

  const restoreVersionFiles = useCallback(async (restored: FileItem[]) => {
    dispatchVersionRestored();
    const sanitized = prepareFilesForEditorRestore(restored);
    setFiles(sanitized);
    setOpenTabs([sanitized[0]?.name].filter(Boolean) as string[]);
    setActiveIndex(0);
    setView("preview");
    setPreviewKey((k) => k + 1);
    const pid = currentProjectIdRef.current ?? getCurrentProjectId();
    if (pid) {
      const result = await saveProjectFilesDetailed(sanitized, pid);
      if (!result.ok) {
        toast.warning("Versión restaurada en el editor; no se guardó en la nube", {
          description: String(result.reason ?? "revisa la sesión"),
        });
      }
    }
    queueMicrotask(() => {
      window.dispatchEvent(new CustomEvent("gafcore:repair-project-jsx"));
    });
  }, []);

  const closeWorkspacePanel = useCallback(() => {
    if (isMobile) {
      setMobilePane("chat");
      requestAnimationFrame(() => {
        const el = mobileScrollRef.current;
        if (el) el.scrollTo({ left: 0, behavior: "smooth" });
      });
      return;
    }
    workspacePanelRef.current?.collapse();
  }, [isMobile]);

  // Al activar layout móvil o al cambiar tamaño/orientación, garantiza que el
  // scroll esté alineado al pane actual (evita posiciones intermedias en iOS).
  useEffect(() => {
    if (!isMobile) return;
    const realign = () => {
      const el = mobileScrollRef.current;
      if (!el) return;
      const idx = mobilePane === "workspace" ? 1 : 0;
      el.scrollTo({ left: idx * el.clientWidth, behavior: "auto" });
    };
    // Espera 1 frame a que el flex calcule clientWidth correcto.
    const raf = requestAnimationFrame(realign);
    window.addEventListener("resize", realign);
    window.addEventListener("orientationchange", realign);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", realign);
      window.removeEventListener("orientationchange", realign);
    };
  }, [isMobile, mobilePane]);
  /** ID del proyecto activo (sincronizado con `setCurrentProjectId` en userSupabase). */
  const [currentProjectId, setCurrentProjectIdState] = useState<string | null>(null);
  const [userProjects, setUserProjects] = useState<ProjectRow[]>([]);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [switchingProject, setSwitchingProject] = useState(false);
  const [pendingOnboardingPrompt, setPendingOnboardingPrompt] = useState<string | null>(() => {
    try { return sessionStorage.getItem("gafcore_initial_prompt"); } catch { return null; }
  });
  const projectSearchRef = useRef<HTMLInputElement>(null);
  const [deploySiteHost, setDeploySiteHost] = useState<string | null>(null);
  const [deployGithubRepo, setDeployGithubRepo] = useState<string | null>(null);
  const [deployGithubReady, setDeployGithubReady] = useState(() => isGithubDeployConfigured());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDraft, setFolderDraft] = useState("");
  const [settingsFocusDeploy, setSettingsFocusDeploy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [importProjectDialogOpen, setImportProjectDialogOpen] = useState(false);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [deployLiveStatus, setDeployLiveStatus] = useState<ProjectDeployStatus>("idle");
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
  /** Evita autosave con plantilla welcome antes de cargar archivos remotos. */
  const workspaceHydratedRef = useRef(false);
  const filesRef = useRef(files);
  filesRef.current = files;
  const currentProjectIdRef = useRef(currentProjectId);
  currentProjectIdRef.current = currentProjectId;
  const [creditsModalOpen, setCreditsModalOpen] = useState(false);

  const handleSignOut = useCallback(async () => {
    setProjectSaveSuppressed(true);
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    toast.dismiss();
    await signOut();
    toast.success("Sesión cerrada");
    navigate({
      to: "/gafcore/login",
      search: { redirect: "/gafcore/app", signedOut: true },
    });
  }, [navigate, signOut]);

  useEffect(() => {
    if (user?.id) setProjectSaveSuppressed(false);
  }, [user?.id]);

  const applyProjectWorkspace = useCallback(
    (workspaceFiles: FileItem[], opts?: { fresh?: boolean; resetChat?: boolean; resetPreview?: boolean }) => {
      let input = workspaceFiles;
      if (opts?.fresh || isWelcomeWorkspace(workspaceFiles)) {
        input = resolveWelcomeWorkspaceFiles(
          workspaceFiles.length ? workspaceFiles : createWelcomeProjectFiles(),
        );
      }
      const prepared = opts?.fresh
        ? prepareFreshProjectFiles(input)
        : prepareLoadedProjectFiles(input);
      filesRef.current = prepared;
      setFiles(prepared);
      setOpenTabs([prepared[0]?.name ?? "App.tsx"]);
      setActiveIndex(0);
      if (opts?.resetPreview !== false) setPreviewKey((k) => k + 1);
      if (opts?.resetChat !== false) setChatPanelKey((k) => k + 1);
      workspaceHydratedRef.current = true;
      return prepared;
    },
    [],
  );

  const resetIdeWorkspaceToDefault = useCallback(() => {
    applyProjectWorkspace(createWelcomeProjectFiles(), { fresh: true });
  }, [applyProjectWorkspace]);

  const openNewProjectDialog = useCallback(() => {
    setProjectMenuOpen(false);
    setImportProjectDialogOpen(false);
    if (!currentProjectIdRef.current) {
      resetIdeWorkspaceToDefault();
    }
    window.setTimeout(() => setNewProjectDialogOpen(true), 0);
  }, [resetIdeWorkspaceToDefault]);

  const openImportProjectDialog = useCallback(() => {
    setProjectMenuOpen(false);
    setNewProjectDialogOpen(false);
    window.setTimeout(() => setImportProjectDialogOpen(true), 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getAuthAccessToken().then((token) => {
      if (!cancelled) setSessionAccessToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
              logClientWarn("checkout-confirm", body.error ?? res.status);
            }
          }
        } catch (e) {
          logClientWarn("checkout-confirm", e);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tryOpenNewProject = () => {
      const url = new URL(window.location.href);
      const fromQuery = isTruthyNewProjectSearchParam(url.searchParams.get("newProject"));
      const fromStorage = sessionStorage.getItem("gafcore_open_new_project") === "1";
      if (!fromQuery && !fromStorage) return;
      if (fromQuery) {
        url.searchParams.delete("newProject");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }
      sessionStorage.removeItem("gafcore_open_new_project");
      openNewProjectDialog();
    };
    tryOpenNewProject();
    window.addEventListener("gafcore:open-new-project", tryOpenNewProject);
    return () => window.removeEventListener("gafcore:open-new-project", tryOpenNewProject);
  }, [openNewProjectDialog]);

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

  const filteredUserProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return userProjects;
    return userProjects.filter((p) => p.name.toLowerCase().includes(q));
  }, [userProjects, projectSearch]);

  const showProjectSearch = userProjects.length > 4 || projectSearch.length > 0;

  const refreshProjects = async (preferActiveId?: string | null) => {
    const keepId = preferActiveId ?? getCurrentProjectId();
    const list = await listProjects();

    if (list.length === 0 && keepId) {
      setUserProjects((prev) => {
        if (prev.some((p) => p.id === keepId)) return prev;
        return [{ id: keepId, name: readCachedProjectName() }, ...prev];
      });
      setCurrentProjectIdState(keepId);
      setProjectName(readCachedProjectName());
      return;
    }

    setUserProjects(list);
    const active = await syncActiveFromList(list, keepId);
    setCurrentProjectIdState(active.id);
    setProjectName(active.name);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key !== "p" || !(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setProjectMenuOpen(true);
      void refreshProjects();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!projectMenuOpen || !showProjectSearch) return;
    const t = window.setTimeout(() => projectSearchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [projectMenuOpen, showProjectSearch]);

  const hydrateEditorFromRemote = async (remote: FileItem[] | null, projectId: string) => {
    const pending = consumePendingProjectFiles(projectId);
    if (pending?.length) {
      const prepared = prepareFreshProjectFiles(resolveWelcomeWorkspaceFiles(pending));
      setFiles(prepared);
      setOpenTabs([prepared[0]?.name ?? pending[0].name]);
      setActiveIndex(0);
      void saveProjectFiles(prepared, projectId);
      return;
    }

    if (remote === null) {
      toast.error("No se pudieron cargar los archivos del proyecto", {
        description: "Comprueba la conexión y recarga la página. No se sobrescribió tu código.",
        duration: 12_000,
      });
      return;
    }

    const shouldLoadRemote =
      remote.length > 0 &&
      (hasSubstantialRemoteProject(remote) || !isRemoteProjectStale(remote));

    if (shouldLoadRemote) {
      const normalized = resolveWelcomeWorkspaceFiles(remote);
      const prepared = isWelcomeWorkspace(normalized)
        ? prepareFreshProjectFiles(normalized)
        : prepareLoadedProjectFiles(normalized);
      const jsxFixed =
        prepared.length !== remote.length ||
        prepared.some((f, i) => f.content !== remote[i]?.content);
      setFiles(prepared);
      setOpenTabs([prepared[0]?.name ?? remote[0].name]);
      setActiveIndex(0);
      if (jsxFixed) void saveProjectFiles(prepared, projectId);
      return;
    }

    toast.warning(
      "No había código guardado de tu proyecto (o solo la plantilla vacía). Se cargó la plantilla inicial.",
      {
        description: "Menú Historial → restaura una versión anterior si la tienes.",
        duration: 12_000,
      },
    );
    setFiles(prepareFreshProjectFiles(createWelcomeProjectFiles()));
    setOpenTabs([createWelcomeProjectFiles()[0].name]);
    setActiveIndex(0);
  };

  const switchToProject = async (p: ProjectRow) => {
    if (p.id === currentProjectId || switchingProject) return;
    setSwitchingProject(true);
    try {
      if (currentProjectId && loaded) {
        await saveProjectFilesDetailed(files, currentProjectId);
      }
      const active = activateProjectRow(p);
      setCurrentProjectIdState(active.id);
      setProjectName(active.name);
      const remote = await loadProjectFiles(p.id);
      await hydrateEditorFromRemote(remote, p.id);
      workspaceHydratedRef.current = true;
      setPreviewKey((k) => k + 1);
      const deploy = await loadDeploySummaryForProject(p.id);
      setDeploySiteHost(deploy.siteHost);
      setDeployGithubRepo(deploy.githubRepo);
      toast.success(`Proyecto «${p.name}»`);
    } catch (e) {
      logClientError("GafCoreIDE", e);
      toast.error("No se pudo cambiar de proyecto");
    } finally {
      setSwitchingProject(false);
    }
  };

  const onProjectCreatedFromChat = async (
    created: { id: string; name: string; created_at: string },
    nextFiles: FileItem[],
  ) => {
    const active = activateProjectRow(created);
    setCurrentProjectIdState(active.id);
    setProjectName(active.name);
    setUserProjects((prev) => {
      if (prev.some((p) => p.id === created.id)) return prev;
      return [{ id: created.id, name: created.name, created_at: created.created_at }, ...prev];
    });
    const source = nextFiles.length ? nextFiles : createWelcomeProjectFiles();
    const filesOut = applyProjectWorkspace(source, { fresh: true });
    stashPendingProjectFiles(
      created.id,
      filesOut.map((f) => ({ name: f.name, language: f.language, content: f.content })),
    );
    setLoaded(true);
    void saveProjectFiles(filesOut, created.id);
    void refreshProjects(created.id);
  };

  const onProjectCreatedFromTemplate = async (
    created: { id: string; name: string; created_at: string },
    nextFiles: FileItem[],
  ) => {
    const active = activateProjectRow(created);
    setCurrentProjectIdState(active.id);
    setProjectName(active.name);
    setUserProjects((prev) => {
      if (prev.some((p) => p.id === created.id)) return prev;
      return [{ id: created.id, name: created.name, created_at: created.created_at }, ...prev];
    });
    const source = nextFiles.length ? nextFiles : createWelcomeProjectFiles();
    const filesOut = applyProjectWorkspace(source, { fresh: true });
    stashPendingProjectFiles(
      created.id,
      filesOut.map((f) => ({ name: f.name, language: f.language, content: f.content })),
    );
    setLoaded(true);
    void saveProjectFiles(filesOut, created.id);
    toast.success(`Proyecto «${created.name}» creado.`);
    void refreshProjects(created.id);
    // Si hay prompt del onboarding, aplicarlo al chat
    try {
      const prompt = sessionStorage.getItem("gafcore_initial_prompt");
      if (prompt) {
        setPendingOnboardingPrompt(prompt);
        sessionStorage.removeItem("gafcore_initial_prompt");
      }
    } catch { /* ignore */ }
  };

  const { createProject, projectCreateErrorMessage } = useCreateProject();
  const marketplaceAutoCreateStarted = useRef(false);

  useEffect(() => {
    if (!user?.id || marketplaceAutoCreateStarted.current) return;
    if (!shouldAutoCreatePendingMarketplaceTemplate()) return;
    const pending = readPendingMarketplaceTemplate();
    if (!pending?.slug) return;

    marketplaceAutoCreateStarted.current = true;
    clearPendingMarketplaceTemplate();

    void (async () => {
      const result = await createProject({
        name: suggestProjectNameFromTemplate(pending.name),
        templateSlug: pending.slug,
        source: "marketplace",
      });
      if (!result.ok) {
        marketplaceAutoCreateStarted.current = false;
        toast.error("No se pudo crear el proyecto desde el marketplace", {
          description: projectCreateErrorMessage(result),
        });
        openNewProjectDialog();
        return;
      }
      await onProjectCreatedFromTemplate(result.project, result.files as FileItem[]);
    })();
  }, [user?.id, createProject, projectCreateErrorMessage, openNewProjectDialog]);

  const beginDeleteCurrentProject = async () => {
    const cur = currentProjectId ?? getCurrentProjectId();
    if (!cur) {
      toast.error("No hay proyecto activo para eliminar");
      return;
    }
    try {
      const approval = await requestCriticalApproval({
        data: {
          action: "project.delete",
          projectId: cur,
          projectName,
        },
      });
      setDeletePendingApproval({
        approvalId: approval.approvalId,
        summary: approval.summary,
        risk: approval.risk,
      });
      setDeleteConfirmOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo preparar la eliminación");
    }
  };

  const confirmDeleteCurrentProject = async () => {
    const cur = currentProjectId ?? getCurrentProjectId();
    if (!cur || !deletePendingApproval) return;
    setDeleteConfirmBusy(true);
    try {
      const res = await gafcoreAuthJsonFetch<{ ok: boolean; error?: string }>(
        "/api/gafcore/projects-delete",
        { projectId: cur, approvalId: deletePendingApproval.approvalId },
      );
      if (!res.ok) {
        const alreadyGone =
          res.error === "Proyecto no encontrado." ||
          res.error === "project_not_found";
        if (!alreadyGone) {
          toast.error(res.error ?? "No se pudo eliminar el proyecto");
          return;
        }
      }
      setDeleteConfirmOpen(false);
      invalidateProjectFromClientCaches(cur);
      clearCurrentProjectId();
      clearActiveProjectCache();
      toast.success(`Proyecto «${projectName}» eliminado`);
      const list = await listProjects();
      const remaining = list.filter((p) => p.id !== cur);
      setUserProjects(remaining);
      if (remaining.length === 0) {
        setCurrentProjectIdState(null);
        setProjectName("Sin proyecto");
        resetIdeWorkspaceToDefault();
        setLoaded(true);
        bumpIdeSessionAndNotify();
        return;
      }
      await switchToProject(remaining[0]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    } finally {
      setDeleteConfirmBusy(false);
    }
  };

  const deleteCurrentProject = beginDeleteCurrentProject;

  const renameCurrent = () => {
    const cur = getCurrentProjectId();
    if (!cur) { toast.error("Sin proyecto activo"); return; }
    setRenameDraft(projectName);
    setRenameDialogOpen(true);
  };

  const confirmRename = async () => {
    const cur = getCurrentProjectId();
    if (!cur) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) { toast.error("El nombre no puede estar vacío"); return; }
    const ok = await renameProject(cur, trimmed);
    if (ok) {
      setProjectName(trimmed);
      cacheActiveProject(cur, trimmed);
      await refreshProjects();
      setRenameDialogOpen(false);
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

  const showPreview = () => {
    setView("preview");
    refreshPreview();
    openWorkspacePanel();
  };

  const showCode = () => {
    setView("code");
    openWorkspacePanel();
  };

  useEffect(() => {
    if (!loaded) return;
    if (isWelcomeWorkspace(filesRef.current)) return;
    setFiles((prev) => {
      const next = sanitizeProjectJsxFiles(prev);
      return next.some((f, i) => f.content !== prev[i]?.content) ? next : prev;
    });
  }, [loaded]);

  useEffect(() => {
    const onRepairJsx = () => {
      setFiles((prev) => {
        if (isWelcomeWorkspace(prev)) {
          const next = prepareFreshProjectFiles(resolveWelcomeWorkspaceFiles(prev));
          if (currentProjectId) void saveProjectFiles(next, currentProjectId);
          return next;
        }
        const next = sanitizeProjectJsxFiles(prev);
        const changed = next.some((f, i) => f.content !== prev[i]?.content);
        if (changed && currentProjectId) {
          void saveProjectFiles(next, currentProjectId);
        }
        return changed ? next : prev;
      });
      schedulePreviewRefresh();
    };
    window.addEventListener("gafcore:repair-project-jsx", onRepairJsx);
    return () => window.removeEventListener("gafcore:repair-project-jsx", onRepairJsx);
  }, [currentProjectId, schedulePreviewRefresh]);

  useEffect(() => {
    if (!isAdmin && secretsOpen) setSecretsOpen(false);
  }, [isAdmin, secretsOpen]);

  useEffect(() => {
    let cancelled = false;
    workspaceHydratedRef.current = false;
    void (async () => {
      const ws = await bootstrapWorkspace();
      if (cancelled) return;

      if (!ws.hasSupabase) {
        workspaceHydratedRef.current = true;
        setLoaded(true);
        return;
      }

      const cachedId = getCurrentProjectId();

      const finishProjectHydration = async (activeId: string) => {
        const remote = await loadProjectFiles(activeId);
        if (cancelled) return;
        await hydrateEditorFromRemote(remote, activeId);
        if (cancelled) return;
        workspaceHydratedRef.current = true;
        const deploy = await loadDeploySummaryForProject(activeId);
        if (cancelled) return;
        setDeploySiteHost(deploy.siteHost);
        setDeployGithubRepo(deploy.githubRepo);
      };

      if (ws.projects.length === 0) {
        if (cachedId) {
          setCurrentProjectIdState(cachedId);
          setProjectName(readCachedProjectName());
          setUserProjects((prev) => {
            if (prev.some((p) => p.id === cachedId)) return prev;
            return [{ id: cachedId, name: readCachedProjectName() }, ...prev];
          });
          await finishProjectHydration(cachedId);
          if (cancelled) return;
          setLoaded(true);
          return;
        }
        setCurrentProjectIdState(null);
        setProjectName(ws.active.name);
        toast.message("No hay proyectos en tu cuenta", {
          description: "Menú del logo → «+ Nuevo» para crear uno.",
        });
        const blank = createWelcomeProjectFiles();
        setFiles(blank);
        setOpenTabs([blank[0]?.name ?? "App.tsx"]);
        workspaceHydratedRef.current = true;
        setLoaded(true);
        return;
      }

      setCurrentProjectIdState(ws.active.id);
      setProjectName(ws.active.name);
      setUserProjects(ws.projects);
      const activeId = ws.active.id!;
      await finishProjectHydration(activeId);
      if (cancelled) return;
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    clearPendingMarketplaceTemplate();
  }, [loaded]);

  useEffect(() => {
    if (!loaded || !currentProjectId || !user?.id || !workspaceHydratedRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const pid = currentProjectIdRef.current;
      if (!pid) return;
      const result = await saveProjectFilesDetailed(filesRef.current, pid);
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
  }, [files, loaded, currentProjectId, user?.id]);

  useEffect(() => {
    if (!currentProjectId) {
      setDeploySiteHost(null);
      setDeployGithubRepo(null);
      setDeployLiveStatus("idle");
      return;
    }
    void loadDeploySummaryForProject(currentProjectId).then((d) => {
      setDeploySiteHost(d.siteHost);
      setDeployGithubRepo(d.githubRepo);
    });
  }, [currentProjectId, settingsOpen]);

  useEffect(() => {
    if (!currentProjectId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const row = await callDeployStatus({ data: { projectId: currentProjectId } });
        if (!cancelled) setDeployLiveStatus((row?.status ?? "idle") as ProjectDeployStatus);
      } catch {
        /* columnas/migración */
      }
    };
    void tick();
    const ms = deployLiveStatus === "building" ? 12_000 : 45_000;
    const id = setInterval(() => void tick(), ms);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [currentProjectId, callDeployStatus, deployLiveStatus]);

  useEffect(() => {
    if (!settingsOpen) {
      setDeployGithubReady(isGithubDeployConfigured());
      setSettingsFocusDeploy(false);
    }
  }, [settingsOpen]);

  const openDeploySettings = () => {
    setSettingsFocusDeploy(true);
    setSettingsOpen(true);
  };

  const openFile = (i: number) => {
    setActiveIndex(i);
    const name = files[i]?.name;
    if (name && !openTabs.includes(name)) setOpenTabs([...openTabs, name]);
  };

  const closeTab = (name: string) => {
    const next = openTabs.filter((t) => t !== name);
    setOpenTabs(next.length ? next : ([files[0]?.name].filter(Boolean) as string[]));
  };

  const onDeploy = async (opts?: { approvalId?: string }): Promise<GafcoreDeployResult> => {
    if (!currentProjectId) {
      throw new Error("Crea o selecciona un proyecto antes de publicar (+ Nuevo).");
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

      const secrets = await listSecrets();
      toast.message("Publicando automáticamente en GitHub…");
      const result = await autoPublishProject({
        projectId: currentProjectId,
        projectName,
        files,
        secrets,
        approvalId: opts?.approvalId,
      });

      if (result.ok && result.siteHost) {
        setDeploySiteHost(result.siteHost);
      }
      if (result.ok && result.repoUrl) {
        const m = result.repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
        if (m?.[1]) setDeployGithubRepo(m[1]);
      }
      if (result.deployStatus) {
        setDeployLiveStatus(result.deployStatus);
      }
      if (result.ok) {
        setDeployGithubReady(isGithubDeployConfigured());
      }
      return result;
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
      className="gafcore-light flex h-screen h-[100dvh] max-h-[100dvh] w-full max-w-[100vw] flex-col overflow-hidden overscroll-none"
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        background: "#ffffff",
        color: "#0f172a",
      }}
    >
      {/* Top bar */}
      <header
        className="flex shrink-0 flex-col border-b"
        style={{ background: "#ffffff", borderColor: "#e5e7eb" }}
      >
        <div className="flex h-11 items-center justify-between gap-1 border-b border-border/40 px-2 md:h-12 md:gap-2 md:px-3 md:border-b-0">
        {/* Left: logo + selector de proyecto */}
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden md:gap-1 md:flex-none">
          <GafcoreLogo variant="toolbar" linkTo="/gafcore" className="shrink-0" />
          {userShortLabel ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-1 hidden max-w-[min(32vw,180px)] min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-[13px] font-semibold text-foreground hover:bg-muted sm:flex"
                  title={user?.email ?? ideUserToolbarName(user)}
                  aria-label={`Cuenta: ${ideUserToolbarName(user)}`}
                >
                  <span className="truncate">{userShortLabel}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
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
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => void handleSignOut()}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {userShortLabel ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground hover:bg-muted/80 sm:hidden"
                  title={user?.email ?? ideUserToolbarName(user)}
                  aria-label={`Cuenta: ${ideUserToolbarName(user)}`}
                >
                  {ideUserToolbarName(user).charAt(0).toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
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
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuItem className="text-primary" onClick={() => setCreditsModalOpen(true)}>
                  <Gift className="mr-2 h-4 w-4" />
                  Comprar créditos
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    navigate({ to: "/gafcore/settings/project", search: { section: "plans" } })
                  }
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Pagos
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => void handleSignOut()}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <div className="ml-0.5 hidden min-w-0 items-center gap-1.5 md:flex">
            <button
              type="button"
              onClick={() => setVersionHistoryOpen(true)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Historial de versiones"
            >
              <History className="h-4 w-4" />
            </button>
          </div>
          {isAdmin ? (
            <Link
              to="/gafcore/admin/ops"
              className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:flex"
              title="Ops — diagnóstico y aprobación (admin)"
            >
              <ShieldAlert className="h-4 w-4" />
            </Link>
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
                  logClientError("GafCoreIDE publish", err);
                } finally {
                  setUsersLoading(false);
                }
              }}
              className="hidden h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground lg:flex"
              title="Estadísticas de usuarios"
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Usuarios</span>
            </button>
          )}
          <DropdownMenu
            modal={false}
            open={projectMenuOpen}
            onOpenChange={(open) => {
              setProjectMenuOpen(open);
              if (!open) setProjectSearch("");
              if (open) void refreshProjects();
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-7 min-w-0 max-w-[min(42vw,9.5rem)] items-center gap-1 rounded-md border border-border/80 bg-muted/30 px-1.5 text-left hover:bg-muted md:max-w-[200px] md:px-2"
                title={
                  currentProjectId
                    ? `Proyecto abierto: ${projectName} · Ctrl+Shift+P`
                    : "Crea o elige un proyecto · Ctrl+Shift+P"
                }
                aria-label={`Proyecto: ${projectName}. Abrir lista de proyectos`}
              >
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">
                  {projectName}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-64"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <DropdownMenuLabel className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5" /> Mis proyectos
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openNewProjectDialog();
                  }}
                  className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10.5px] font-medium text-primary hover:bg-primary/10"
                  title="Nuevo proyecto (nombre y plantilla)"
                >
                  <Plus className="h-3 w-3" /> Nuevo
                </button>
              </DropdownMenuLabel>
              {showProjectSearch ? (
                <div
                  className="px-2 pb-1"
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={projectSearchRef}
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      placeholder="Buscar proyecto…"
                      className="h-8 pl-7 text-xs"
                      aria-label="Buscar proyecto"
                    />
                  </div>
                </div>
              ) : null}
              {userProjects.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Sin proyectos. Usa «+ Nuevo» para crear uno.
                </div>
              ) : filteredUserProjects.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Ningún proyecto coincide con «{projectSearch.trim()}».
                </div>
              ) : (
                <div className="max-h-[min(50vh,280px)] overflow-y-auto">
                  {filteredUserProjects.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      disabled={switchingProject}
                      onClick={(e) => {
                        e.preventDefault();
                        setProjectMenuOpen(false);
                        setProjectSearch("");
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
                  ))}
                </div>
              )}
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  openNewProjectDialog();
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nuevo proyecto…
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  openImportProjectDialog();
                }}
              >
                <Upload className="mr-2 h-4 w-4" />
                Importar proyecto…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void navigate({ to: "/gafcore/projects" })}>
                <LayoutGrid className="mr-2 h-4 w-4" />
                Todos los proyectos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void navigate({ to: "/gafcore/marketplace" })}>
                <Package className="mr-2 h-4 w-4" />
                Marketplace
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: "/gafcore/settings/project" })}>
                <SettingsIcon className="mr-2 h-4 w-4" />
                <span className="flex-1">Ajustes del proyecto</span>
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
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={!currentProjectId || switchingProject}
                onSelect={() => {
                  window.setTimeout(() => void deleteCurrentProject(), 0);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar proyecto
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {workflowStrip?.visible ? (
            <div className="ml-1 hidden min-w-0 max-w-[min(36vw,18rem)] flex-1 lg:flex xl:max-w-md">
              <WorkflowTaskStrip
                className="w-full py-1"
                tasks={workflowStrip.tasks}
                planSummary={workflowStrip.planSummary}
                workflowState={workflowStrip.workflowState}
                metrics={workflowStrip.metrics}
                integrationStatus={workflowStrip.integrationStatus}
                onCancel={workflowStrip.onCancel}
                cancelPending={workflowStrip.cancelPending}
              />
            </div>
          ) : null}
        </div>

        {/* Centro: vista y herramientas (plan y créditos solo en el panel de chat) */}
        <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 px-1 md:flex">
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={showPreview}
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
              onClick={showCode}
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
              title="Configuración del IDE"
            >
              <SettingsIcon className="h-4 w-4" />
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
                <DropdownMenuItem onClick={() => setCloudOpen(true)}>
                  <Cloud className="mr-2 h-4 w-4" />
                  <span className="flex-1">Nube</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={showCode}>
                  <Code2 className="mr-2 h-4 w-4" />
                  <span className="flex-1">Código</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={showCode}
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
                  <SettingsIcon className="mr-2 h-4 w-4" />
                  <span className="flex-1">Configuración</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Right: acciones */}
        <div className="flex shrink-0 items-center gap-0.5 md:gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onShare}
            className="hidden h-8 gap-1.5 px-2.5 text-[13px] text-foreground hover:bg-muted lg:inline-flex"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Compartir</span>
          </Button>
          {deployLiveStatus === "building" && (
            <span className="hidden text-xs text-amber-600 sm:inline" title="Deploy en Vercel">
              Compilando…
            </span>
          )}
          {deployLiveStatus === "ready" && deploySiteHost && (
            <span className="hidden text-xs text-primary sm:inline" title="Sitio en vivo">
              En vivo
            </span>
          )}
          <PublishDialog
            siteHost={deploySiteHost}
            githubRepo={deployGithubRepo}
            projectId={currentProjectId}
            projectName={projectName}
            hasProject={Boolean(currentProjectId)}
            githubConfigured={deployGithubReady}
            isUpdating={deploying}
            onUpdate={onDeploy}
            onOpenSettings={openDeploySettings}
            onOpenChange={(v) => {
              if (v) {
                setDeployGithubReady(isGithubDeployConfigured());
                if (currentProjectId) {
                  void callDeployStatus({ data: { projectId: currentProjectId } }).then((r) =>
                    setDeployLiveStatus((r?.status ?? "idle") as ProjectDeployStatus),
                  );
                }
              }
            }}
          >
            <Button
              size="sm"
              disabled={deploying}
              className="h-8 gap-1.5 rounded-md bg-foreground px-3 text-[13px] font-medium text-background hover:bg-foreground/90"
            >
              {deploying || deployLiveStatus === "building" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Globe className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Publicar</span>
            </Button>
          </PublishDialog>
          <Button
            size="icon"
            variant="ghost"
            title="Configuración del proyecto"
            aria-label="Configuración del proyecto"
            onClick={() => navigate({ to: "/gafcore/settings/project" })}
            className="hidden h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground lg:inline-flex"
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            onClick={() => void handleSignOut()}
            className="hidden h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive lg:inline-flex"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        </div>

        {/* Móvil: segunda fila — herramientas visibles (scroll horizontal), no ocultas en menú */}
        <div
          className="flex shrink-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain px-1.5 py-1 md:hidden [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
          aria-label="Herramientas del IDE"
        >
          <button
            type="button"
            onClick={() => setVersionHistoryOpen(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Historial"
            aria-label="Historial"
          >
            <History className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={showPreview}
            className={`flex h-8 shrink-0 items-center justify-center rounded-md px-2.5 text-[12px] font-medium ${
              view === "preview"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="Preview"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={showCode}
            className={`flex h-8 shrink-0 items-center justify-center rounded-md px-2.5 text-[12px] font-medium ${
              view === "code"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="Código"
          >
            <Code2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setConnectorsOpen(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Cloud"
            aria-label="Cloud"
          >
            <Cloud className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setAnalyticsOpen(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Analytics"
            aria-label="Analytics"
          >
            <BarChart3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Configuración"
            aria-label="Configuración"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void onShare()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Compartir"
            aria-label="Compartir"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/gafcore/settings/project" })}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Ajustes del proyecto"
            aria-label="Ajustes"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
          {isAdmin ? (
            <>
              <button
                type="button"
                onClick={() => void navigate({ to: "/gafcore/admin/ops" })}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Ops admin"
                aria-label="Ops admin"
              >
                <ShieldAlert className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setSecretsOpen(true)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Secretos"
                aria-label="Secretos"
              >
                <KeyRound className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={async () => {
                  setUsersOpen(true);
                  setUsersLoading(true);
                  setUsersError(null);
                  try {
                    const stats = await getUserStats();
                    setUserStats(stats);
                  } catch {
                    setUsersError("No se pudieron cargar las estadísticas");
                    toast.error("No se pudieron cargar las estadísticas");
                  } finally {
                    setUsersLoading(false);
                  }
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Usuarios"
                aria-label="Usuarios"
              >
                <Users className="h-4 w-4" />
              </button>
            </>
          ) : null}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Más opciones"
                aria-label="Más opciones"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => setCreditsModalOpen(true)}>
                <Gift className="mr-2 h-4 w-4" />
                Créditos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={showCode}>
                <Folder className="mr-2 h-4 w-4" />
                Archivos
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <main className="h-full overflow-hidden">
          {!isMobile ? (
          <ResizablePanelGroup
            orientation="horizontal"
            className="h-full"
          >
            {/* Left: Chat (fixed open) — solo desktop */}
            <ResizablePanel id="chat" defaultSize="34%" minSize="28%" maxSize="55%" className="min-h-0">
              <div className="h-full min-h-0">
              <ChatPanel
                key={chatPanelKey}
                files={files}
                setFiles={setFiles}
                projectId={currentProjectId}
                projectName={projectName}
                onCodeGenerated={onPreviewCodeGenerated}
                onBuildSucceeded={handleBuildSucceeded}
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenHistory={() => setVersionHistoryOpen(true)}
                onOpenConnectors={() => setConnectorsOpen(true)}
                onProjectCreated={onProjectCreatedFromChat}
                onWorkflowStripChange={handleWorkflowStripChange}
                pendingPrompt={pendingOnboardingPrompt}
              />
              </div>
            </ResizablePanel>
            <ResizableHandle
              withHandle
              className="w-1.5 bg-border hover:bg-primary/40 transition-colors"
            />

            {/* Right: Preview / Code workspace */}
            <ResizablePanel
              id="workspace"
              ref={workspacePanelRef}
              collapsible
              collapsedSize={0}
              minSize={45}
            >
              <div className="flex h-full flex-col bg-muted/30">
                {view === "preview" ? (
                  <div className="flex h-full flex-col gap-2 p-3">
                    <div className="flex shrink-0 items-center justify-between gap-2">
                      {/* Toggle desktop / móvil */}
                      <div className="flex items-center rounded-md border border-border bg-muted/40 p-0.5">
                        <button
                          type="button"
                          aria-label="Vista escritorio"
                          onClick={() => setPreviewDevice("desktop")}
                          className={
                            "flex h-6 w-6 items-center justify-center rounded transition-colors " +
                            (previewDevice === "desktop"
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground")
                          }
                        >
                          <Monitor className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Vista móvil"
                          onClick={() => setPreviewDevice("mobile")}
                          className={
                            "flex h-6 w-6 items-center justify-center rounded transition-colors " +
                            (previewDevice === "mobile"
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground")
                          }
                        >
                          <Smartphone className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <DesignCritiqueDialog
                        files={files}
                        projectId={currentProjectId ?? null}
                      />
                    </div>
                    <div className="flex-1 overflow-hidden rounded-lg border border-border bg-background shadow-sm">
                      <LivePreview key={previewKey} files={files} device={previewDevice} />
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
          ) : (
            /* Mobile layout: 2 paneles full-screen con scroll snap horizontal */
            <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden">
              <div
                ref={mobileScrollRef}
                onScroll={(e) => {
                  const target = e.currentTarget;
                  const idx = Math.round(target.scrollLeft / target.clientWidth);
                  setMobilePane(idx === 0 ? "chat" : "workspace");
                }}
                className="relative flex min-h-0 w-full max-w-full flex-1 touch-pan-x snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth [scrollbar-width:none] [scroll-snap-stop:always] [&::-webkit-scrollbar]:hidden"
              >
                {/* Pane 1: Chat */}
                <div className="relative h-full w-full min-w-0 max-w-full shrink-0 grow-0 basis-full snap-start snap-always overflow-hidden [scroll-snap-stop:always]">
                  <ChatPanel
                    key={chatPanelKey}
                    files={files}
                    setFiles={setFiles}
                    projectId={currentProjectId}
                    projectName={projectName}
                    onCodeGenerated={onPreviewCodeGenerated}
                    onBuildSucceeded={handleBuildSucceeded}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onOpenHistory={() => setVersionHistoryOpen(true)}
                    onOpenConnectors={() => setConnectorsOpen(true)}
                    onProjectCreated={onProjectCreatedFromChat}
                    onWorkflowStripChange={handleWorkflowStripChange}
                  />
                </div>
                {/* Pane 2: Workspace */}
                <div className="relative h-full w-full min-w-0 max-w-full shrink-0 grow-0 basis-full snap-start snap-always overflow-hidden bg-muted/30 [scroll-snap-stop:always]">
                  <div className="flex h-full flex-col">
                    {view === "preview" ? (
                      <div className="flex h-full flex-col gap-2 p-2">
                        <div className="flex shrink-0 items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const el = mobileScrollRef.current;
                              if (el) el.scrollTo({ left: 0, behavior: "smooth" });
                            }}
                            className="rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                          >
                            ← Chat
                          </button>
                          <div className="flex items-center gap-2">
                            {/* Toggle desktop / móvil */}
                            <div className="flex items-center rounded-md border border-border bg-muted/40 p-0.5">
                              <button
                                type="button"
                                aria-label="Vista escritorio"
                                onClick={() => setPreviewDevice("desktop")}
                                className={
                                  "flex h-6 w-6 items-center justify-center rounded transition-colors " +
                                  (previewDevice === "desktop"
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground")
                                }
                              >
                                <Monitor className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label="Vista móvil"
                                onClick={() => setPreviewDevice("mobile")}
                                className={
                                  "flex h-6 w-6 items-center justify-center rounded transition-colors " +
                                  (previewDevice === "mobile"
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground")
                                }
                              >
                                <Smartphone className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <DesignCritiqueDialog
                              files={files}
                              projectId={currentProjectId ?? null}
                            />
                          </div>
                        </div>
                        <div className="flex-1 overflow-hidden rounded-lg border border-border bg-background shadow-sm">
                          <LivePreview key={previewKey} files={files} device={previewDevice} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full flex-col bg-background">
                        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
                          <button
                            type="button"
                            onClick={closeWorkspacePanel}
                            className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                          >
                            ← Chat
                          </button>
                          <div className="flex flex-1 items-center overflow-x-auto">
                            {openTabs.map((name) => {
                              const isActive = files[activeIndex]?.name === name;
                              return (
                                <div
                                  key={name}
                                  onClick={() => {
                                    const i = files.findIndex((f) => f.name === name);
                                    if (i >= 0) setActiveIndex(i);
                                  }}
                                  className={`flex h-8 cursor-pointer items-center gap-2 border-r border-border px-2 text-[11px] ${
                                    isActive
                                      ? "bg-background text-foreground border-b-2 border-b-primary"
                                      : "bg-muted/40 text-muted-foreground"
                                  }`}
                                >
                                  <span>{name}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <CodeEditor files={files} setFiles={setFiles} activeIndex={activeIndex} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* Indicador de pane activo (dots) */}
              <div className="flex shrink-0 items-center justify-center gap-1.5 border-t border-border bg-background py-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const el = mobileScrollRef.current;
                    if (el) el.scrollTo({ left: 0, behavior: "smooth" });
                  }}
                  className={`h-1.5 rounded-full transition-all ${
                    mobilePane === "chat" ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/40"
                  }`}
                  aria-label="Ver chat"
                />
                <button
                  type="button"
                  onClick={() => {
                    const el = mobileScrollRef.current;
                    if (el) el.scrollTo({ left: el.clientWidth, behavior: "smooth" });
                  }}
                  className={`h-1.5 rounded-full transition-all ${
                    mobilePane === "workspace" ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/40"
                  }`}
                  aria-label="Ver área de trabajo"
                />
              </div>
            </div>
          )}
        </main>
        {loaded && user?.id && !currentProjectId && !newProjectDialogOpen ? (
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
              <Button type="button" onClick={openNewProjectDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Crear proyecto
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={openImportProjectDialog}
              >
                <Upload className="mr-2 h-4 w-4" />
                Importar proyecto
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        highlightDeploy={settingsFocusDeploy}
      />
      <VersionHistoryPanel
        open={versionHistoryOpen}
        onOpenChange={setVersionHistoryOpen}
        projectId={currentProjectId}
        files={files}
        onRestore={restoreVersionFiles}
      />
      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        files={files}
        projectId={currentProjectId}
        onRestore={restoreVersionFiles}
      />
      {isAdmin ? <SecretsDialog open={secretsOpen} onOpenChange={setSecretsOpen} /> : null}
      <ConnectorsDialog open={connectorsOpen} onOpenChange={setConnectorsOpen} />

      {/* Renombrar proyecto */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Renombrar proyecto</DialogTitle>
            <DialogDescription>Ingresa el nuevo nombre para este proyecto.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            placeholder="Nombre del proyecto"
            maxLength={80}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") void confirmRename(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => void confirmRename()} disabled={!renameDraft.trim()}>Renombrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mover a carpeta */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mover a carpeta</DialogTitle>
            <DialogDescription>Escribe el nombre de la carpeta donde mover este proyecto.</DialogDescription>
          </DialogHeader>
          <Input
            value={folderDraft}
            onChange={(e) => setFolderDraft(e.target.value)}
            placeholder="Nombre de carpeta"
            maxLength={60}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && folderDraft.trim()) {
                const clean = folderDraft.trim();
                setProjectFolder(clean);
                localStorage.setItem("gafcore_project_folder", clean);
                setFolderDialogOpen(false);
                toast.success(`Proyecto movido a «${clean}»`);
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                const clean = folderDraft.trim();
                if (!clean) return;
                setProjectFolder(clean);
                localStorage.setItem("gafcore_project_folder", clean);
                setFolderDialogOpen(false);
                toast.success(`Proyecto movido a «${clean}»`);
              }}
              disabled={!folderDraft.trim()}
            >
              Mover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <GafCoreAnalyticsDialog
        open={analyticsOpen}
        onOpenChange={setAnalyticsOpen}
        userId={user?.id}
      />
      <ProjectCloudDialog
        open={cloudOpen}
        onOpenChange={setCloudOpen}
        projectId={currentProjectId}
        projectName={projectName}
        onConnect={() => {
          setCloudOpen(false);
          if (!user) {
            setAuthMode("login");
            setAuthOpen(true);
            return;
          }
          setSettingsOpen(true);
        }}
      />
      <NewProjectDialog
        open={newProjectDialogOpen}
        onOpenChange={setNewProjectDialogOpen}
        onCreated={(project, projectFiles) => void onProjectCreatedFromTemplate(project, projectFiles)}
      />
      <ImportProjectDialog
        open={importProjectDialogOpen}
        onOpenChange={setImportProjectDialogOpen}
        onImported={(project, projectFiles) => void onProjectCreatedFromTemplate(project, projectFiles)}
      />

      <GafCoreAuthDialog open={authOpen} onOpenChange={setAuthOpen} initialMode={authMode} />
      <CriticalActionConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Eliminar proyecto"
        summary={deletePendingApproval?.summary ?? "Esta acción no se puede deshacer."}
        risk={deletePendingApproval?.risk ?? null}
        confirmLabel="Eliminar definitivamente"
        busy={deleteConfirmBusy}
        onConfirm={confirmDeleteCurrentProject}
      />

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
              ["Ctrl + Shift + P", "Cambiar de proyecto"],
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
