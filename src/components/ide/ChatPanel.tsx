import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ArrowUp,
  Sparkles,
  Square,
  Plus,
  Pencil,
  Mic,
  X,
  Settings as SettingsIcon,
  History,
  Info,
  GitFork,
  Factory,
  Globe,
  Plug,
  Image as ImageIcon,
  Folder,
  ChevronRight,
  ChevronDown,
  Paperclip,
  Coins,
  Brain,
  BookmarkPlus,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import type { ChatMsg } from "@/lib/openaiChat";
import { gafcoreChat } from "@/lib/gafcore-chat.functions";
import {
  evaluateCoreOrchestrationGate,
  GAFCORE_BUILD_CONFIRMED_PREFIX,
  markBuildConfirmedInstruction,
} from "@/core/behavior/gafcore-core-rules.shared";
import {
  buildLocalProjectAnalysis,
  formatProjectAnalysisForChat,
} from "@/core/behavior/gafcore-project-analysis.shared";
import { ChatNextStepSuggestions } from "@/components/ide/ChatNextStepSuggestions";
import { getGafcoreChatNextSteps } from "@/lib/gafcore-chat-suggestions.shared";
import type { GafcoreChatSuggestionContext } from "@/lib/gafcore-chat-suggestions.shared";
import {
  aiReplyNeedsUserInput,
  allGuideStepsCompleted,
  buildAutopilotInstruction,
  formatGuideAutopilotUserBubble,
  createGuideAutopilotState,
  extractGuidePauseHint,
  GUIDE_AUTOPILOT_DELAY_MS,
  MAX_GUIDE_AUTOPILOT_CHAIN,
  guideAutopilotStatusMessage,
  isBlockingPreviewError,
  pickAutopilotStep,
  shouldEnableGuideAutopilot,
  type GuideAutopilotState,
} from "@/lib/gafcore-guide-autopilot.shared";
import { assignGafcoreAccountType } from "@/lib/gafcore-roles.functions";
import {
  validateGafcoreSources,
  validateGafcoreProject,
} from "@/lib/gafcore-validate.functions";
import { enrichGafcoreMedia } from "@/lib/enrich-gafcore-media.functions";
import {
  patchProjectFilesVisually,
  repairCommonJsxSyntaxErrors,
  repairGeneratedSourceFiles,
  repairGafcoreProjectMedia,
  neutralizeCssImportsInSource,
  sanitizeProjectJsxFiles,
} from "@/lib/gafcore-media.shared";
import type { FileItem } from "@/components/ide/CodeEditor";
import { CreditsOutModal } from "@/components/CreditsOutModal";
import { supabase } from "@/integrations/supabase/client";
import { getAuthAccessToken } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { useSubscription } from "@/hooks/useSubscription";
import { sanitizeUserFacingAiText } from "@/lib/gafcore-user-facing-errors";
import { displayMonthlyAllowanceForUi } from "@/lib/gafcore-plan-credits.shared";
import { COST_PER_REQUEST } from "@/lib/gafcore-chat.shared";
import { logClientError, logClientWarn, logPipelineEvent, pipelineTraceMeta } from "@/lib/gafcore-client-logger";
import {
  createCodeSnapshot,
  validateAndHealBeforePreview,
} from "@/lib/gafcore-incremental-edit.shared";
import { runIntegrityShield } from "@/lib/gafcore-integrity-shield.shared";
import {
  FUNCTIONAL_FIRST_BUILD_PREFIX,
  buildPreserveExistingPrefix,
} from "@/lib/gafcore-functional-first.shared";
import {
  auditProjectLocally,
  buildValidationFixInstruction,
  formatValidationForUser,
  hasBlockingValidationIssues,
  shouldAutoRetryValidation,
  type ProjectValidationIssue,
} from "@/lib/gafcore-ai-validation.shared";
import {
  GAFCORE_AUTOFIX_SESSION_MAX,
  GAFCORE_CANCEL_PREVIEW_AUTOFIX_EVENT,
  GAFCORE_VERSION_RESTORED_EVENT,
  buildRuntimeAutoFixInstruction,
  isPreviewAutofixSuppressed,
  shouldAttemptAiAutofix,
  isPreviewAutofixAiEnabled,
} from "@/lib/gafcore-chat-autofix.shared";
import { ensureReactPackageJson } from "@/lib/gafcore-project-scaffold.shared";
import { GAFCORE_DEFAULT_TEMPLATE_FILES } from "@/lib/gafcore-templates.shared";
import { recordProjectAiMemory } from "@/lib/gafcore-ai-memory.functions";
import { listGafcoreActiveAiPlugins } from "@/lib/gafcore-extensions.functions";
import { fetchUserExtensionInstalls } from "@/lib/gafcore-extensions-client";
import {
  advanceGafcorePipelineStep,
  finalizeGafcorePipelineRun,
  startGafcorePipelineRun,
} from "@/lib/gafcore-orchestrator.functions";
import {
  cancelGafcoreWorkflow,
  getGafcoreWorkflowStatus,
  planAndStartGafcoreWorkflow,
  runGafcoreWorkflowWave,
  syncGafcorePipelineWorkflow,
} from "@/lib/gafcore-workflow.functions";
import { getGafcoreFactoryStatus, runGafcoreFactory } from "@/lib/gafcore-factory.functions";
import { FACTORY_BUILD_PREFIX } from "@/lib/gafcore-factory.shared";
import { HealthStatus } from "@/components/HealthStatus";
import {
  mapSafeBuildToHealthPhase,
  type HealthStatusPhase,
  type SafeBuildMeta,
} from "@/services/ai/safe-build.shared";
import type { FactoryRunResult } from "@/lib/gafcore-factory.shared";
import {
  FACTORY_PROFILE_AUTO_ID,
} from "@/lib/gafcore-factory-templates.shared";
import {
  WorkflowTaskStrip,
  type WorkflowMetricsUi,
  type WorkflowTaskUi,
} from "@/components/ide/WorkflowTaskStrip";
import { agentTypeLabel } from "@/tasks/artifacts.shared";
import { buildLayoutInstructionPrefix } from "@/lib/gafcore-layout-instruction.shared";
import {
  buildConversationalInstructionPrefix,
  buildCreativeBuildPrefix,
  buildHeroBackgroundInstructionPrefix,
  aiReplyLooksLikePlanOnly,
  isConversationalOnly,
  isSubstantiveBuildRequest,
  isVisualOnlyTweak,
  softenRoboticReply,
  userWantsHeroBackgroundChange,
  buildLiteralVisualChangePrefix,
} from "@/lib/gafcore-chat-intent.shared";
import { isGafcoreDefaultTemplateApp } from "@/lib/gafcore-project-stale.shared";
import {
  dispatchVersionRestored,
  prepareFilesForEditorRestore,
} from "@/lib/gafcore-snapshot-restore.shared";
import {
  finalizeGafcoreBuildDelivery,
  GAFCORE_CUSTOMIZE_AFTER_BOOTSTRAP_PREFIX,
  GAFCORE_FORCE_FILES_BUILD_PREFIX,
  outputReplacesWelcome,
  unwrapGafcoreChatPayload,
} from "@/lib/gafcore-chat-delivery.shared";
import { formatValidationScoreShort } from "@/validation/runner";
import { parseJsonLoose } from "@/lib/gafcore-json-loose.shared";
import { gafcoreAuthJsonFetch } from "@/lib/gafcore-client-auth-fetch";
import {
  buildFreshProjectInstructionPrefix,
  suggestProjectNameFromInstruction,
  userWantsFreshProject,
  userWantsInPlaceRebuild,
} from "@/lib/gafcore-chat-project.shared";

type Msg = { role: "user" | "ai"; content: string; ts?: number };

/** Evita chat/preview “trabado” si el stream o la validación no terminan. */
const CHAT_REQUEST_TIMEOUT_MS = 120_000;

type PendingComposerImage = { id: string; previewUrl: string; fileName: string };

type PendingBuildConfirmation = {
  raw: string;
  pendingImages: PendingComposerImage[];
};

async function readSseJsonPayload(
  res: Response,
  signal: AbortSignal | undefined,
  onTextProgress: (charLen: number) => void,
): Promise<string> {
  if (!res.body) throw new Error("Sin cuerpo de respuesta");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          const piece = j?.choices?.[0]?.delta?.content;
          if (typeof piece === "string") {
            full += piece;
            onTextProgress(full.length);
          }
        } catch {
          /* chunk incompleto */
        }
      }
    }
    if (buf.trim()) {
      const t = buf.trim();
      if (t.startsWith("data:")) {
        const payload = t.slice(5).trim();
        if (payload !== "[DONE]") {
          try {
            const j = JSON.parse(payload);
            const piece = j?.choices?.[0]?.delta?.content;
            if (typeof piece === "string") {
              full += piece;
              onTextProgress(full.length);
            }
          } catch {
            /* */
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return full;
}

/**
 * Mensajes claros para códigos devueltos por POST /api/gafcore/chat/stream.
 * IMPORTANTE: nunca nombrar proveedores externos (OpenAI/OpenRouter/Anthropic/Claude/GPT/Gemini).
 * El usuario solo ve "GafCore" / "asistente IA" / "servicio de IA".
 */
function describeGafcoreStreamFailure(message: string): string | null {
  if (message.startsWith("UPSTREAM:")) {
    const st = Number(message.slice("UPSTREAM:".length));
    if (st === 401 || st === 403) {
      return "El servicio de IA de GafCore no pudo autenticarse. Estamos revisándolo, inténtalo de nuevo en unos minutos.";
    }
    if (st === 429) {
      return "GafCore está procesando muchas solicitudes ahora mismo. Espera unos segundos y vuelve a intentarlo.";
    }
    if (st === 402) {
      return "El asistente de IA está en mantenimiento temporal. Vuelve a intentarlo en unos minutos.";
    }
    if (st >= 500) {
      return "El asistente de IA tuvo un error temporal. Inténtalo de nuevo en unos minutos.";
    }
    return "El asistente de IA rechazó la solicitud. Reformula tu petición o inténtalo de nuevo.";
  }
  if (message === "CREDITS_VERIFY_FAILED") {
    return "No pudimos verificar tus créditos. Recarga la página y vuelve a intentar.";
  }
  if (message === "NO_STREAM_BODY") {
    return "El asistente no devolvió contenido. Prueba de nuevo o acorta la petición.";
  }
  if (message === "rate_limited") {
    return "Has enviado muchas solicitudes seguidas. Espera un minuto y vuelve a intentarlo.";
  }
  if (message.startsWith("UPSTREAM_DETAIL:")) {
    return "El asistente de IA tuvo un error temporal. Inténtalo de nuevo en unos minutos.";
  }
  if (message === "upstream") {
    return "El asistente de IA tuvo un error temporal. Inténtalo de nuevo en unos minutos.";
  }
  if (message === "project_not_found") {
    return "No se encontró el proyecto abierto. Recarga la página o elige otro proyecto.";
  }
  if (
    message === "maintenance" ||
    message === "ai_disabled" ||
    message === "chat_disabled" ||
    message === "factory_disabled"
  ) {
    return "GafCore está en mantenimiento o la IA está pausada temporalmente. Inténtalo en unos minutos.";
  }
  if (message === "risk_blocked") {
    return "Tu solicitud fue bloqueada por seguridad. No pidas secretos, borrados masivos ni manipulación de pagos.";
  }
  return null;
}

const CHAT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/** Data URL en `project_files`; debe caber en el presupuesto de contexto del modelo (truncado por archivo ~14k). */
const CHAT_IMAGE_DATA_URL_MAX_CHARS = 11_000;

function isProbablyImageFile(f: File): boolean {
  if (f.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(f.name);
}

/** PNG/WebP/GIF/SVG suelen llevar transparencia — no convertir a JPEG. */
function fileLikelyHasAlpha(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t === "image/png" || t === "image/webp" || t === "image/gif" || t === "image/svg+xml") {
    return true;
  }
  return /\.(png|webp|gif|svg)$/i.test(file.name);
}

function dataUrlFromImageFileViaCanvas(
  file: File,
  maxEdge: number,
  quality: number,
  opts?: { preserveAlpha?: boolean },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        let { width, height } = img;
        const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("no_canvas"));
          return;
        }
        if (!opts?.preserveAlpha) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = opts?.preserveAlpha
          ? canvas.toDataURL("image/png")
          : canvas.toDataURL("image/jpeg", quality);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("load_image"));
    };
    img.src = url;
  });
}

async function compressChatImageFile(
  file: File,
): Promise<{ dataUrl: string; ext: "png" | "jpg" }> {
  const preserveAlpha = fileLikelyHasAlpha(file);
  if (preserveAlpha) {
    let edge = 1280;
    for (let attempt = 0; attempt < 8; attempt++) {
      const dataUrl = await dataUrlFromImageFileViaCanvas(file, edge, 0.82, {
        preserveAlpha: true,
      });
      if (dataUrl.length <= CHAT_IMAGE_DATA_URL_MAX_CHARS) {
        return { dataUrl, ext: "png" };
      }
      edge = Math.round(edge * 0.72);
    }
    const dataUrl = await dataUrlFromImageFileViaCanvas(file, 480, 0.82, {
      preserveAlpha: true,
    });
    return { dataUrl, ext: "png" };
  }

  let q = 0.82;
  let edge = 1280;
  for (let attempt = 0; attempt < 7; attempt++) {
    const dataUrl = await dataUrlFromImageFileViaCanvas(file, edge, q);
    if (dataUrl.length <= CHAT_IMAGE_DATA_URL_MAX_CHARS) return { dataUrl, ext: "jpg" };
    q = Math.max(0.38, q - 0.1);
    edge = Math.round(edge * 0.78);
  }
  const dataUrl = await dataUrlFromImageFileViaCanvas(file, 512, 0.38);
  return { dataUrl, ext: "jpg" };
}

export function ChatPanel({
  files,
  setFiles,
  onCodeGenerated,
  onOpenSettings,
  onOpenHistory,
  onOpenConnectors,
  onProjectCreated,
  projectId,
  projectName,
}: {
  files: FileItem[];
  setFiles: Dispatch<SetStateAction<FileItem[]>>;
  onCodeGenerated?: () => void;
  onOpenSettings?: () => void;
  onOpenHistory?: () => void;
  onOpenConnectors?: () => void;
  /** Tras crear proyecto desde el chat (auto-provisión del cerebro). */
  onProjectCreated?: (
    created: { id: string; name: string; created_at: string },
    nextFiles: FileItem[],
  ) => void | Promise<void>;
  projectId?: string | null;
  projectName?: string | null;
}) {
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pendingComposerImages, setPendingComposerImages] = useState<PendingComposerImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"build" | "chat">("build");
  const [deepModel, setDeepModel] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("gafcore_ide_deep_model") === "1";
    } catch {
      return false;
    }
  });
  const [visualEditOn, setVisualEditOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [creditsOut, setCreditsOut] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const recognitionRef = useRef<any>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const composerSectionRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContentRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [streamChars, setStreamChars] = useState<number | null>(null);
  const [pinConventionOpen, setPinConventionOpen] = useState(false);
  const [pinConventionBody, setPinConventionBody] = useState("");
  /** Invalida respuestas tardías si el usuario envía otra cosa o pulsa detener. */
  const requestEpochRef = useRef(0);
  const sendInFlightRef = useRef(false);
  /** projectId activo durante send (puede crearse mid-flight). */
  const activeProjectIdRef = useRef<string | null | undefined>(projectId);

  useEffect(() => {
    activeProjectIdRef.current = projectId;
  }, [projectId]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pipelineRunIdRef = useRef<string | null>(null);
  /** Evita eco Realtime del mismo mensaje que acabamos de persistir. */
  const localMessageEchoRef = useRef<Set<string>>(new Set());
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);
  const [activeWorkflowRunId, setActiveWorkflowRunId] = useState<string | null>(null);
  const [backgroundWorkflowRunId, setBackgroundWorkflowRunId] = useState<string | null>(null);
  const [workflowTasks, setWorkflowTasks] = useState<WorkflowTaskUi[]>([]);
  const [workflowPlanSummary, setWorkflowPlanSummary] = useState<string | null>(null);
  const [workflowState, setWorkflowState] = useState<string | null>(null);
  const [workflowMetrics, setWorkflowMetrics] = useState<WorkflowMetricsUi | null>(null);
  const [workflowCancelPending, setWorkflowCancelPending] = useState(false);
  const bgWorkflowMetaRef = useRef<{
    instruction: string;
    userLabel: string;
    effectiveBuild: boolean;
    visualEditOn: boolean;
  } | null>(null);
  const bgWorkflowFinishedRef = useRef<Set<string>>(new Set());
  const [multiAgentMode, setMultiAgentMode] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("gafcore_multi_agent") === "1";
    } catch {
      return false;
    }
  });
  const [multiAgentBg, setMultiAgentBg] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("gafcore_multi_agent_bg") === "1";
    } catch {
      return false;
    }
  });
  const [factoryMode, setFactoryMode] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("gafcore_factory_mode") === "1";
    } catch {
      return false;
    }
  });
  const [factoryAutoDeploy, setFactoryAutoDeploy] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("gafcore_factory_auto_deploy") === "1";
    } catch {
      return false;
    }
  });
  const [factoryProfileId] = useState(FACTORY_PROFILE_AUTO_ID);
  const [validationLabel, setValidationLabel] = useState<string | null>(null);
  const [guideAutopilotUi, setGuideAutopilotUi] = useState<GuideAutopilotState>(
    createGuideAutopilotState,
  );
  const guideAutopilotRef = useRef<GuideAutopilotState>(createGuideAutopilotState());
  const [pendingBuildConfirmation, setPendingBuildConfirmation] =
    useState<PendingBuildConfirmation | null>(null);
  const pendingBuildRef = useRef<PendingBuildConfirmation | null>(null);
  const lastErrorRef = useRef<string | null>(null);
  const guideAutopilotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [healthPhase, setHealthPhase] = useState<HealthStatusPhase | null>(null);
  const freeCreditsRescueDone = useRef(false);
  const freeCreditsRescueUserId = useRef<string | null>(null);
  const callAiPlugins = useServerFn(listGafcoreActiveAiPlugins);
  const [aiPluginNames, setAiPluginNames] = useState<string[]>([]);
  const [workflowPacks, setWorkflowPacks] = useState<Array<{ slug: string; name: string }>>([]);
  const [selectedWorkflowPackSlug, setSelectedWorkflowPackSlug] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem("gafcore_workflow_pack") || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("gafcore_ide_deep_model", deepModel ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [deepModel]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ id: data.user.id, email: data.user.email ?? undefined });
    });
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setAiPluginNames([]);
      return;
    }
    const loadPlugins = () => {
      void callAiPlugins()
        .then((r) => setAiPluginNames(r.names ?? []))
        .catch(() => setAiPluginNames([]));
    };
    loadPlugins();
    window.addEventListener("gafcore:extensions-changed", loadPlugins);
    return () => window.removeEventListener("gafcore:extensions-changed", loadPlugins);
  }, [user?.id, callAiPlugins]);

  useEffect(() => {
    if (!user?.id) {
      setWorkflowPacks([]);
      return;
    }
    const loadPacks = () => {
      void fetchUserExtensionInstalls()
        .then((r) => {
          const packs = (r.installs ?? [])
            .filter((i) => i.kind === "workflow_pack")
            .map((i) => ({
              slug: i.installSlug.replace(/^workflow:/, ""),
              name: i.name,
            }));
          setWorkflowPacks(packs);
        })
        .catch(() => setWorkflowPacks([]));
    };
    loadPacks();
    window.addEventListener("gafcore:extensions-changed", loadPacks);
    return () => window.removeEventListener("gafcore:extensions-changed", loadPacks);
  }, [user?.id]);

  useEffect(() => {
    try {
      if (selectedWorkflowPackSlug) {
        window.localStorage.setItem("gafcore_workflow_pack", selectedWorkflowPackSlug);
      } else {
        window.localStorage.removeItem("gafcore_workflow_pack");
      }
    } catch {
      /* ignore */
    }
  }, [selectedWorkflowPackSlug]);

  // Load chat history for current project
  useEffect(() => {
    if (!projectId || !user?.id) return;
    setMessages([]);
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("role, content, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (cancelled || error || !data) return;
      setMessages(
        data.map((r: any) => ({
          role: r.role === "assistant" ? "ai" : "user",
          content: r.content,
          ts: new Date(r.created_at).getTime(),
        })),
      );
      stickToBottomRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, user?.id]);

  useEffect(() => {
    setPendingComposerImages([]);
  }, [projectId]);

  // Realtime: sync new chat messages across tabs/devices for this project
  useEffect(() => {
    if (!projectId || !user?.id) return;
    const channel = supabase
      .channel(`chat_messages:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `project_id=eq.${projectId}`,
        },
        (payload: any) => {
          const r = payload.new;
          if (!r || r.user_id !== user.id) return;
          const dbRole = r.role === "assistant" ? "assistant" : "user";
          const echoKey = messageEchoKey(dbRole, String(r.content ?? ""));
          if (localMessageEchoRef.current.has(echoKey)) return;
          const ts = new Date(r.created_at).getTime();
          const role = r.role === "assistant" ? "ai" : "user";
          const content = String(r.content ?? "");
          appendMessageDeduped(role, content);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, user?.id]);

  const messageEchoKey = (role: "user" | "assistant", content: string) =>
    `${role}:${content.trim()}`;

  const markLocalEcho = (role: "user" | "assistant", content: string) => {
    const key = messageEchoKey(role, content);
    localMessageEchoRef.current.add(key);
    window.setTimeout(() => localMessageEchoRef.current.delete(key), 45_000);
  };

  const appendMessageDeduped = (role: "user" | "ai", content: string) => {
    const trimmed = content.trim();
    setMessages((prev) => {
      const now = Date.now();
      if (
        prev.some(
          (m) =>
            m.role === role &&
            m.content.trim() === trimmed &&
            now - m.ts < 90_000,
        )
      ) {
        return prev;
      }
      return [...prev, { role, content, ts: now }];
    });
  };

  // Persist a message (best-effort)
  const persistMessage = async (role: "user" | "assistant", content: string) => {
    const pid = activeProjectIdRef.current ?? projectId;
    if (!pid || !user?.id) return;
    markLocalEcho(role, content);
    try {
      await supabase.from("chat_messages").insert({
        project_id: pid,
        user_id: user.id,
        role,
        content,
      });
    } catch {
      /* silent */
    }
  };

  // Sync generated files to project_files (best-effort)
  const syncFilesToDb = async (
    generated: Array<{ name: string; language?: string; content: string }>,
  ): Promise<{ ok: boolean; detail?: string }> => {
    const pid = activeProjectIdRef.current ?? projectId;
    if (!pid || !user?.id || generated.length === 0) {
      return { ok: false, detail: "no_project" };
    }
    const { upsertSingleProjectFile } = await import("@/lib/userSupabase");
    for (const f of generated) {
      const r = await upsertSingleProjectFile(pid, {
        name: f.name,
        language: f.language ?? "typescript",
        content: f.content,
      });
      if (!r.ok) return r;
    }
    return { ok: true };
  };

  /** Persiste el árbol completo del workspace (evita reload con DB parcial/desactualizada). */
  const persistMergedToProjectDb = async (
    mergedFiles: FileItem[],
  ): Promise<{ ok: boolean; detail?: string }> => {
    const pid = activeProjectIdRef.current ?? projectId;
    if (!pid || !user?.id || mergedFiles.length === 0) {
      return { ok: false, detail: "no_project" };
    }
    const { saveProjectFilesDetailed } = await import("@/lib/userSupabase");
    const result = await saveProjectFilesDetailed(
      mergedFiles.map((f) => ({
        name: f.name,
        language: f.language ?? "typescript",
        content: f.content,
      })),
      pid,
    );
    if (!result.ok) {
      logClientWarn("gafcore-persist-merged", {
        reason: result.reason,
        detail: result.detail,
        fileCount: mergedFiles.length,
      });
      toast.error("No se guardaron los archivos en el proyecto", {
        description:
          result.detail ??
          result.reason ??
          "Revisa la conexión e inténtalo de nuevo.",
        duration: 8000,
      });
    }
    return { ok: result.ok, detail: result.detail ?? result.reason };
  };

  const {
    balance,
    monthlyAllowance,
    isUnlimitedDaily,
    loading: creditsLoading,
    refresh: refreshCredits,
  } = useCredits(user?.id);
  const {
    isAdmin,
    planDisplayLabel,
    subActive,
    subscription,
    loading: subLoading,
  } = useSubscription(user?.id);
  const displayMonthly = displayMonthlyAllowanceForUi({ isAdmin, subActive, monthlyAllowance });
  const isFairUseCreadorPlan =
    !isAdmin &&
    subActive &&
    (subscription?.price_id === "plan_creador_monthly" ||
      String(subscription?.plan_tier ?? "").toLowerCase() === "creador");

  const filesRef = useRef(files);
  filesRef.current = files;
  /** Baseline in-memory para deshacer la última generación aplicada al preview. */
  const rollbackBaselineRef = useRef<FileItem[] | null>(null);
  const autofixDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoFixToastIdRef = useRef<string | number | null>(null);
  const scheduleRuntimeAutofixRef = useRef<(msg: string) => void>(() => {});
  const runPreviewAutofixRef = useRef<(msg: string) => Promise<void>>(async () => {});

  const assignUserWelcome = useServerFn(assignGafcoreAccountType);

  useEffect(() => {
    if (user?.id !== freeCreditsRescueUserId.current) {
      freeCreditsRescueUserId.current = user?.id ?? null;
      freeCreditsRescueDone.current = false;
    }
  }, [user?.id]);

  /** Si el saldo sigue en 0 (p. ej. sync de bienvenida no corrió al cargar /app), repara al montar el chat. */
  useEffect(() => {
    if (!user?.id || isAdmin || subLoading || creditsLoading) return;
    if (balance > 0) {
      freeCreditsRescueDone.current = true;
      return;
    }
    if (freeCreditsRescueDone.current) return;
    freeCreditsRescueDone.current = true;
    void (async () => {
      try {
        await assignUserWelcome({ data: { accountType: "user" } });
        await refreshCredits();
        window.dispatchEvent(new Event("gafcore:credits-refresh"));
      } catch {
        freeCreditsRescueDone.current = false;
      }
    })();
  }, [user?.id, isAdmin, subLoading, creditsLoading, balance, assignUserWelcome, refreshCredits]);

  useEffect(() => {
    const onCreditsApplied = () => {
      void refreshCredits();
    };
    window.addEventListener("gafcore:credits-applied", onCreditsApplied);
    return () => window.removeEventListener("gafcore:credits-applied", onCreditsApplied);
  }, [refreshCredits]);

  const cancelPreviewAutofixInFlight = useCallback(() => {
    if (autofixDebounceRef.current) clearTimeout(autofixDebounceRef.current);
    autofixDebounceRef.current = null;
    abortControllerRef.current?.abort();
    autoFixInFlightRef.current = false;
    setAutoFixActive(false);
    if (autoFixToastIdRef.current != null) {
      toast.dismiss(autoFixToastIdRef.current);
      autoFixToastIdRef.current = null;
    }
  }, []);

  const rollbackLastGeneration = useCallback(async () => {
    cancelPreviewAutofixInFlight();
    let baseline = rollbackBaselineRef.current;
    const pid = activeProjectIdRef.current ?? projectId;
    if (!baseline?.length && pid) {
      const { findLatestSnapshotByLabelPrefix, loadSnapshotFiles } = await import(
        "@/lib/userSupabase"
      );
      const snap = await findLatestSnapshotByLabelPrefix(pid, "antes:");
      if (snap) {
        const restored = await loadSnapshotFiles(snap.id, pid);
        if (restored?.length) baseline = prepareFilesForEditorRestore(restored);
      }
    }
    if (!baseline?.length) {
      toast.message("No hay versión anterior en memoria. Usa Historial (reloj).", {
        duration: 8000,
      });
      return;
    }
    rollbackBaselineRef.current = null;
    dispatchVersionRestored();
    setFiles(baseline);
    filesRef.current = baseline;
    queueMicrotask(() => onCodeGenerated?.());
    if (pid) await persistMergedToProjectDb(baseline);
    toast.success("Versión anterior restaurada");
  }, [cancelPreviewAutofixInFlight, onCodeGenerated, projectId]);

  const offerGenerationRollback = useCallback(
    (reason: string) => {
      if (!rollbackBaselineRef.current?.length) return;
      logPipelineEvent(
        "warn",
        "rollback.offered",
        pipelineTraceMeta(
          {
            traceId: requestEpochRef.current,
            projectId: activeProjectIdRef.current ?? projectId,
            phase: "rollback",
            pipelineRunId: pipelineRunIdRef.current,
          },
          { reason: reason.slice(0, 160) },
        ),
      );
      toast.error(reason, {
        duration: 14_000,
        action: {
          label: "Deshacer",
          onClick: () => void rollbackLastGeneration(),
        },
      });
    },
    [rollbackLastGeneration],
  );

  const resetAfterVersionRestore = useCallback(() => {
    cancelPreviewAutofixInFlight();
    autoFixAttemptedErrorsRef.current.clear();
    autoFixSessionCountRef.current = 0;
    rollbackBaselineRef.current = null;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    sendInFlightRef.current = false;
    setLoading(false);
    setAutoFixActive(false);
    setLastError(null);
  }, [cancelPreviewAutofixInFlight]);

  const resetProjectToBlank = useCallback(async () => {
    cancelPreviewAutofixInFlight();
    autoFixAttemptedErrorsRef.current.clear();
    autoFixSessionCountRef.current = 0;
    setLastError(null);
    const blank = ensureReactPackageJson(
      sanitizeProjectJsxFiles(
        GAFCORE_DEFAULT_TEMPLATE_FILES.map((f) => ({
          name: f.name,
          language: f.language,
          content: f.content,
        })),
      ),
    ) as FileItem[];
    setFiles(blank);
    filesRef.current = blank;
    if (projectId && user?.id) {
      const saved = await syncFilesToDb(blank);
      if (!saved.ok) {
        toast.message("Canvas reiniciado en el editor", {
          description: "No se pudo guardar en la nube; al reconectar se sincronizará.",
        });
      }
    }
    onCodeGenerated?.();
    toast.success("Canvas en blanco. Describe qué quieres y pulsa Construir.");
  }, [cancelPreviewAutofixInFlight, onCodeGenerated, projectId, user?.id]);

  useEffect(() => {
    const onCancelAutofix = () => cancelPreviewAutofixInFlight();
    const onVersionRestored = () => resetAfterVersionRestore();
    window.addEventListener(GAFCORE_CANCEL_PREVIEW_AUTOFIX_EVENT, onCancelAutofix);
    window.addEventListener(GAFCORE_VERSION_RESTORED_EVENT, onVersionRestored);
    return () => {
      window.removeEventListener(GAFCORE_CANCEL_PREVIEW_AUTOFIX_EVENT, onCancelAutofix);
      window.removeEventListener(GAFCORE_VERSION_RESTORED_EVENT, onVersionRestored);
    };
  }, [cancelPreviewAutofixInFlight, resetAfterVersionRestore]);

  useEffect(() => {
    return () => {
      cancelPreviewAutofixInFlight();
    };
  }, [cancelPreviewAutofixInFlight]);

  useEffect(() => {
    if (user?.id) return;
    if (autofixDebounceRef.current) clearTimeout(autofixDebounceRef.current);
    abortControllerRef.current?.abort();
    autoFixInFlightRef.current = false;
    if (autoFixToastIdRef.current != null) {
      toast.dismiss(autoFixToastIdRef.current);
      autoFixToastIdRef.current = null;
    }
  }, [user?.id]);

  const toggleMic = () => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Tu navegador no soporta dictado por voz. Usa Chrome o Edge.");
      return;
    }
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }
    try {
      const rec = new SR();
      rec.lang = "es-ES";
      rec.continuous = true;
      rec.interimResults = true;
      let baseText = input;
      rec.onstart = () => {
        setRecording(true);
        baseText = input;
        toast.success("Escuchando… habla ahora");
      };
      rec.onresult = (e: any) => {
        let transcript = "";
        for (let i = 0; i < e.results.length; i++) {
          transcript += e.results[i][0].transcript;
        }
        setInput((baseText ? baseText + " " : "") + transcript);
      };
      rec.onerror = (e: any) => {
        if (e.error === "not-allowed") toast.error("Permiso de micrófono denegado");
        else if (e.error === "no-speech") toast.message("No se detectó voz");
        else toast.error(`Error de micrófono: ${e.error}`);
        setRecording(false);
      };
      rec.onend = () => setRecording(false);
      recognitionRef.current = rec;
      rec.start();
    } catch (err: any) {
      toast.error(err?.message || "No se pudo iniciar el micrófono");
      setRecording(false);
    }
  };

  const applyChatImageFromBlob = async (file: File, sourceLabel: string) => {
    if (!isProbablyImageFile(file)) {
      toast.error("El archivo no es una imagen.");
      return;
    }
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      toast.error("La imagen supera 8 MB. Reduce el tamaño o comprímela.");
      return;
    }
    try {
      const { dataUrl, ext } = await compressChatImageFile(file);
      if (dataUrl.length > CHAT_IMAGE_DATA_URL_MAX_CHARS + 500) {
        toast.error(
          "La imagen sigue siendo demasiado grande tras comprimir. Prueba otra más pequeña.",
        );
        return;
      }
      const relName = `assets/gafcore-ref-${Date.now()}.${ext}`;
      const item: FileItem = {
        name: relName,
        language: "plaintext",
        content: dataUrl,
      };
      setFiles((prev) => [...prev.filter((f) => f.name !== relName), item]);
      const thumbId = `thumb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setPendingComposerImages((prev) => [
        ...prev,
        { id: thumbId, previewUrl: dataUrl, fileName: relName },
      ]);
      toast.success(`${sourceLabel}: ${file.name || relName}`);
      if (!projectId || !user?.id) {
        toast.message("Imagen en el editor", {
          description:
            "Cuando el proyecto esté listo en la nube, se guardará con el resto de archivos.",
        });
        return;
      }
      const saved = await syncFilesToDb([item]);
      if (!saved.ok) {
        toast.error("No se pudo guardar la imagen en la nube; sigue en el editor local.", {
          description: saved.detail?.slice(0, 120) ?? "Revisa permisos del proyecto en Supabase.",
        });
      }
    } catch {
      toast.error("No se pudo procesar la imagen.");
    }
  };

  const removePendingComposerImage = (id: string) => {
    setPendingComposerImages((prev) => {
      const row = prev.find((p) => p.id === id);
      const next = prev.filter((p) => p.id !== id);
      if (row) {
        setFiles((prevFiles) => prevFiles.filter((f) => f.name !== row.fileName));
      }
      return next;
    });
  };

  const handleAttachFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isProbablyImageFile(file)) {
      void applyChatImageFromBlob(file, "Imagen adjunta");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "");
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "txt";
      const lang =
        ext === "tsx" || ext === "ts"
          ? "typescript"
          : ext === "jsx" || ext === "js"
            ? "javascript"
            : ext === "css"
              ? "css"
              : ext === "html"
                ? "html"
                : ext === "json"
                  ? "json"
                  : ext === "md"
                    ? "markdown"
                    : "plaintext";
      const item: FileItem = { name: file.name, language: lang, content };
      setFiles((prev) => [...prev.filter((f) => f.name !== file.name), item]);
      void (async () => {
        if (!projectId || !user?.id) {
          toast.message(`“${file.name}” en el editor`, {
            description:
              "Cuando el proyecto esté listo en la nube, se guardará con el resto de archivos.",
          });
          return;
        }
        const saved = await syncFilesToDb([item]);
        if (saved.ok) {
          toast.success(`Archivo “${file.name}” añadido y guardado en el proyecto`);
        } else {
          toast.error(
            "No se pudo guardar el archivo en la nube. Sigue en el editor; reintenta o revisa permisos.",
            { description: saved.detail?.slice(0, 120) },
          );
        }
      })();
    };
    reader.onerror = () => toast.error("No se pudo leer el archivo");
    reader.readAsText(file);
    e.target.value = "";
  };

  /** Portapapeles con imagen (archivo, data URL o HTML con img). Devuelve true si consumió el evento. */
  const handleComposerPaste = (ev: ClipboardEvent<HTMLTextAreaElement>) => {
    const dt = ev.clipboardData;
    if (!dt) return false;
    const fileList = dt.files;
    if (fileList?.length) {
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList.item(i);
        if (f && isProbablyImageFile(f)) {
          ev.preventDefault();
          void applyChatImageFromBlob(f, "Imagen pegada");
          return true;
        }
      }
    }
    const items = dt.items;
    if (items?.length) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind !== "file") continue;
        const f = it.getAsFile();
        if (f && isProbablyImageFile(f)) {
          ev.preventDefault();
          void applyChatImageFromBlob(f, "Imagen pegada");
          return true;
        }
        if (it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            ev.preventDefault();
            void applyChatImageFromBlob(
              new File([f], `captura-${Date.now()}.png`, { type: it.type || "image/png" }),
              "Captura pegada",
            );
            return true;
          }
        }
      }
    }
    const plain = dt.getData("text/plain").trim();
    if (plain.startsWith("data:image/")) {
      ev.preventDefault();
      void (async () => {
        try {
          const res = await fetch(plain);
          const blob = await res.blob();
          const ext = blob.type.includes("png")
            ? "png"
            : blob.type.includes("webp")
              ? "webp"
              : "jpg";
          await applyChatImageFromBlob(
            new File([blob], `pegado.${ext}`, { type: blob.type || "image/png" }),
            "Imagen pegada",
          );
        } catch {
          toast.error("No se pudo leer la imagen del portapapeles.");
        }
      })();
      return true;
    }
    const html = dt.getData("text/html");
    if (html?.length) {
      const m = html.match(/\bsrc=["'](data:image\/[^"'>\s]+)/i);
      if (m?.[1]) {
        ev.preventDefault();
        void (async () => {
          try {
            const res = await fetch(m[1]);
            const blob = await res.blob();
            await applyChatImageFromBlob(
              new File([blob], `pegado.${blob.type?.includes("png") ? "png" : "jpg"}`, {
                type: blob.type || "image/png",
              }),
              "Imagen pegada",
            );
          } catch {
            toast.error("No se pudo extraer la imagen pegada.");
          }
        })();
        return true;
      }
    }
    return false;
  };

  const handleAttachImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void applyChatImageFromBlob(file, "Imagen adjunta");
    e.target.value = "";
  };

  const handleScreenshot = async () => {
    try {
      const anyNav = navigator as any;
      if (!anyNav.mediaDevices?.getDisplayMedia) {
        toast.error("Tu navegador no soporta captura de pantalla");
        return;
      }
      const stream: MediaStream = await anyNav.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      // @ts-ignore - ImageCapture es API experimental
      const capture = new (window as any).ImageCapture(track);
      const bitmap = await capture.grabFrame();
      track.stop();
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `gafcore-${Date.now()}.png`;
      a.click();
      toast.success("Captura descargada");
    } catch {
      toast.error("Captura cancelada");
    }
  };

  // autosize textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(Math.max(ta.scrollHeight, 64), 320) + "px";
  }, [input]);

  /** Solo el contenedor del chat — scrollIntoView desplaza paneles padre (ResizablePanel) y falla. */
  const forceScrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const top = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = top;
  }, []);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    if (!stickToBottomRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const top = Math.max(0, el.scrollHeight - el.clientHeight);
    try {
      el.scrollTo({ top, behavior });
    } catch {
      el.scrollTop = top;
    }
  }, []);

  const scrollChatToBottomSoon = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      forceScrollToBottom();
      scrollChatToBottom(behavior);
      requestAnimationFrame(() => scrollChatToBottom(behavior));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollChatToBottom(behavior));
      });
      window.setTimeout(() => scrollChatToBottom(behavior), 50);
      window.setTimeout(() => scrollChatToBottom(behavior), 150);
      window.setTimeout(() => scrollChatToBottom(behavior), 400);
      window.setTimeout(() => forceScrollToBottom(), 600);
    },
    [scrollChatToBottom, forceScrollToBottom],
  );

  useLayoutEffect(() => {
    if (!stickToBottomRef.current) return;
    forceScrollToBottom();
    scrollChatToBottom("auto");
  }, [messages, loading, streamChars, pipelineStatus, forceScrollToBottom, scrollChatToBottom]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const content = messagesContentRef.current;
    if (!container || !content) return;

    const onScroll = () => {
      const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
      stickToBottomRef.current = distance < 120;
    };
    container.addEventListener("scroll", onScroll, { passive: true });

    const ro = new ResizeObserver(() => {
      if (stickToBottomRef.current) forceScrollToBottom();
    });
    ro.observe(content);

    const mo = new MutationObserver(() => {
      if (stickToBottomRef.current) forceScrollToBottom();
    });
    mo.observe(content, { childList: true, subtree: true, characterData: true });

    return () => {
      container.removeEventListener("scroll", onScroll);
      ro.disconnect();
      mo.disconnect();
    };
  }, [scrollChatToBottom, forceScrollToBottom]);

  useEffect(() => {
    if (!loading) return;
    stickToBottomRef.current = true;
    const id = window.setInterval(() => scrollChatToBottom("auto"), 400);
    return () => window.clearInterval(id);
  }, [loading, scrollChatToBottom]);

  // Broadcast visual-edit toggle to all preview iframes
  useEffect(() => {
    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((f) => {
      try {
        f.contentWindow?.postMessage({ type: "ve-toggle", on: visualEditOn }, "*");
      } catch {}
    });
  }, [visualEditOn]);

  // Aplica una instrucción externa (p. ej. del Auditor de Diseño) en el input.
  // Si autoSend === true (modo "Auditar y mejorar"), envía sola la próxima vez que se ejecute send.
  useEffect(() => {
    const onApply = (ev: Event) => {
      const detail = (ev as CustomEvent<{ instruction?: string; autoSend?: boolean }>).detail;
      const instruction = detail?.instruction?.trim();
      if (!instruction) return;
      setInput((v) => (v ? v + "\n\n" : "") + instruction);
      taRef.current?.focus();
      if (detail?.autoSend) {
        toast.success("Aplicando mejoras…");
        // Pequeño delay para que React aplique el setInput y send recoja el valor.
        setTimeout(() => {
          void sendRef.current?.(instruction);
        }, 120);
      } else {
        toast.success("Mejoras añadidas al chat — envíalas con Enter");
      }
    };
    window.addEventListener("gafcore:apply-instruction", onApply as EventListener);
    return () => window.removeEventListener("gafcore:apply-instruction", onApply as EventListener);
  }, []);

  const sendRef = useRef<((text?: string) => Promise<void>) | null>(null);

  // Mantiene sendRef.current apuntando al send más reciente para llamadas externas (auditor).
  useEffect(() => {
    sendRef.current = send;
  });

  // Si el usuario describió el proyecto en NewProjectDialog, lo recogemos del sessionStorage
  // y lo autoenvíamos al cerebro la primera vez que abre el editor del proyecto recién creado.
  // Solo se dispara cuando el proyecto no tiene aún mensajes (proyecto fresco).
  const initialAutoSentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId || loading) return;
    if (initialAutoSentRef.current === projectId) return;
    if (messages.length > 0) {
      initialAutoSentRef.current = projectId;
      return;
    }
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem(`gafcore:initial-instruction:${projectId}`);
    } catch {
      pending = null;
    }
    if (!pending || pending.trim().length < 3) return;
    initialAutoSentRef.current = projectId;
    try {
      sessionStorage.removeItem(`gafcore:initial-instruction:${projectId}`);
    } catch {
      /* noop */
    }
    const t = window.setTimeout(() => {
      void sendRef.current?.(pending!);
    }, 350);
    return () => window.clearTimeout(t);
  }, [projectId, messages.length, loading]);

  // Estado para auto-fix con IA cuando el preview falla por error de runtime.
  // Evita loops: solo bloquea reintentos si el MISMO error ya fue intentado y falló.
  const autoFixInFlightRef = useRef(false);
  const autoFixAttemptedErrorsRef = useRef<Set<string>>(new Set());
  const previewErrorCooldownRef = useRef<{ msg: string; at: number }>({ msg: "", at: 0 });
  const autoFixSessionCountRef = useRef(0);
  const validationAutoRetryUsedRef = useRef(false);
  const [autoFixActive, setAutoFixActive] = useState(false);
  const [composerHighlight, setComposerHighlight] = useState(false);

  // Listen for picks + preview errors
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const data: any = ev.data;
      if (!data) return;
      if (data.type === "ve-pick") {
        const info = data.info || {};
        const ref = `Elemento seleccionado: <${info.tag}> "${info.text || ""}" (${info.selector}). `;
        setInput((v) => (v ? v + " " : "") + ref);
        taRef.current?.focus();
        toast.success(`Seleccionado: ${info.tag}`);
        return;
      }
      if (data.type !== "preview-error") return;

      const msg = String(data.message || "Error desconocido");
      const now = Date.now();
      if (
        msg === previewErrorCooldownRef.current.msg &&
        now - previewErrorCooldownRef.current.at < 5000
      ) {
        return;
      }
      previewErrorCooldownRef.current = { msg, at: now };

      logPipelineEvent(
        "warn",
        "preview.error",
        pipelineTraceMeta(
          {
            traceId: requestEpochRef.current,
            projectId: activeProjectIdRef.current ?? projectId,
            phase: "preview",
            pipelineRunId: pipelineRunIdRef.current,
          },
          { message: msg.slice(0, 200) },
        ),
      );

      const errKey = msg.slice(0, 120);
      const looksLikeJsxGlue =
        /SyntaxError|Unexpected token/i.test(msg) ||
        /"[^"]*"(https?:\/\/)/.test(msg);
      const looksLikeObjectChild =
        /Objects are not valid as a React child/i.test(msg) ||
        /Minified React error #31/i.test(msg) ||
        /error #31/i.test(msg);
      const looksLikeUndefined =
        /ReferenceError:\s*\w+\s+is not defined/i.test(msg) || /\bis not defined\b/i.test(msg);
      const looksLikeReactHooksDup =
        /Cannot read properties of null \(reading 'useRef'\)/i.test(msg) ||
        /reading 'useRef'/i.test(msg);
      const looksLikeCssModule =
        /Failed to resolve module specifier/i.test(msg) && /\.css/i.test(msg);
      const looksLikeJsxShimAssign =
        /Cannot assign to property ['"]jsx['"]/i.test(msg) ||
        /__gafcoreInstallJsxGuard/i.test(msg);

      if (looksLikeJsxShimAssign) {
        setLastError(
          "El preview usa una versión antigua del guard JSX. Recarga con Ctrl+Shift+R; si persiste, espera el deploy en Vercel (último fix del shim React).",
        );
        queueMicrotask(() => onCodeGenerated?.());
        return;
      }

      if (looksLikeCssModule) {
        let repairedCss = false;
        setFiles((current) => {
          const next = sanitizeProjectJsxFiles(
            current.map((f) => {
              if (!/\.(jsx|tsx|js|ts)$/i.test(f.name)) return f;
              const content = neutralizeCssImportsInSource(repairCommonJsxSyntaxErrors(f.content));
              return content !== f.content ? { ...f, content } : f;
            }),
          );
          repairedCss = next.some((f, i) => f.content !== current[i]?.content);
          return repairedCss ? next : current;
        });
        autoFixAttemptedErrorsRef.current.add(errKey);
        setLastError(repairedCss ? null : msg);
        if (repairedCss) {
          queueMicrotask(() => {
            toast.success("Import CSS ajustado para el preview");
            window.dispatchEvent(new CustomEvent("gafcore:repair-project-jsx"));
            onCodeGenerated?.();
          });
        }
        return;
      }

      // 1) Auto-repair LOCAL: sintaxis, React #31, iconos lucide, react-router duplicado.
      if (looksLikeJsxGlue || looksLikeObjectChild || looksLikeUndefined || looksLikeReactHooksDup) {
        let repairedLocally = false;
        setFiles((current) => {
          const next = sanitizeProjectJsxFiles(
            current.map((f) => {
              if (!/\.(jsx|tsx|js|ts)$/i.test(f.name)) return f;
              const content = repairCommonJsxSyntaxErrors(f.content);
              return content !== f.content ? { ...f, content } : f;
            }),
          );
          const changed = next.some((f, i) => f.content !== current[i]?.content);
          if (changed) {
            repairedLocally = true;
            queueMicrotask(() => {
              toast.success(
                looksLikeReactHooksDup
                  ? "Router/React unificado para el preview"
                  : looksLikeUndefined
                    ? "Imports de iconos añadidos automáticamente"
                    : looksLikeObjectChild
                      ? "Código reparado (objeto en JSX → texto seguro)"
                      : "Sintaxis JSX reparada automáticamente",
              );
              setLastError(null);
              onCodeGenerated?.();
              window.dispatchEvent(new CustomEvent("gafcore:repair-project-jsx"));
            });
            return next;
          }
          return current;
        });
        if (repairedLocally) return;
        if (looksLikeObjectChild || looksLikeUndefined || looksLikeReactHooksDup) {
          setLastError(msg);
          if (isPreviewAutofixAiEnabled()) scheduleRuntimeAutofixRef.current(msg);
          return;
        }
        if (looksLikeJsxGlue) {
          setLastError(msg);
          if (isPreviewAutofixAiEnabled()) scheduleRuntimeAutofixRef.current(msg);
          return;
        }
      }

      setLastError(msg);
      if (isPreviewAutofixAiEnabled() && shouldAttemptAiAutofix(msg)) {
        scheduleRuntimeAutofixRef.current(msg);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [projectId, files, onCodeGenerated]);

  const callGafcoreChat = useServerFn(gafcoreChat);
  const callPlanAndStartWorkflow = useServerFn(planAndStartGafcoreWorkflow);
  const callRunWorkflowWave = useServerFn(runGafcoreWorkflowWave);
  const callGetWorkflowStatus = useServerFn(getGafcoreWorkflowStatus);
  const callCancelWorkflow = useServerFn(cancelGafcoreWorkflow);
  const callSyncPipelineWorkflow = useServerFn(syncGafcorePipelineWorkflow);
  const callValidateSources = useServerFn(validateGafcoreSources);
  const callValidateProject = useServerFn(validateGafcoreProject);
  const callRecordMemory = useServerFn(recordProjectAiMemory);
  const callEnrichMedia = useServerFn(enrichGafcoreMedia);
  const callStartPipeline = useServerFn(startGafcorePipelineRun);
  const callAdvancePipeline = useServerFn(advanceGafcorePipelineStep);
  const callFinalizePipeline = useServerFn(finalizeGafcorePipelineRun);
  const callRunFactory = useServerFn(runGafcoreFactory);
  const callGetFactoryStatus = useServerFn(getGafcoreFactoryStatus);

  const usePipelineOrchestrator = Boolean(
    projectId && mode === "build" && !visualEditOn,
  );

  const startPipelineRun = async (instruction: string) => {
    if (!usePipelineOrchestrator || !projectId) return;
    pipelineRunIdRef.current = null;
    setPipelineStatus(null);
    try {
      const res = await callStartPipeline({
        data: {
          projectId,
          instruction,
          mode: "build",
          visualEdit: visualEditOn,
        },
      });
      if (res?.ok && res.runId) {
        pipelineRunIdRef.current = res.runId;
        const last = res.events?.[res.events.length - 1];
        setPipelineStatus(last?.message ?? "Pipeline iniciado");
      }
    } catch {
      pipelineRunIdRef.current = null;
    }
  };

  const advancePipeline = async (
    step: "generate" | "retry" | "validate" | "memory",
    state: "generating" | "retrying" | "validating" | "persisting_memory",
  ) => {
    const runId = pipelineRunIdRef.current;
    if (!runId) return;
    try {
      const res = await callAdvancePipeline({
        data: { runId, step, state },
      });
      if (res?.ok && res.run?.events?.length) {
        const last = res.run.events[res.run.events.length - 1];
        if (last?.message) setPipelineStatus(last.message);
      }
    } catch {
      /* opcional si falta migración */
    }
  };

  const mergeGeneratedFiles = (
    currentFiles: FileItem[],
    generatedFiles: Array<{ name: string; language?: string; content: string }>,
  ): FileItem[] => {
    const byName = new Map(currentFiles.map((file) => [file.name, file]));
    for (const file of generatedFiles) {
      byName.set(file.name, {
        name: file.name,
        language: file.language ?? byName.get(file.name)?.language ?? "typescript",
        content: file.content,
      });
    }
    return Array.from(byName.values());
  };

  const persistValidationMemory = async (
    issues: ProjectValidationIssue[],
    resolved: boolean,
  ) => {
    if (!projectId || issues.length === 0) return;
    try {
      await callRecordMemory({
        data: {
          projectId,
          issues: issues.slice(0, 12),
          resolved,
        },
      });
    } catch {
      /* memoria opcional si falta migración */
    }
  };

  const runProjectValidation = async (
    merged: FileItem[],
    options?: { skipOrchestrator?: boolean },
  ): Promise<{
    issues: ProjectValidationIssue[];
    patchedFiles?: Array<{ name: string; content: string; language?: string }>;
  }> => {
    const validationRace = async () => {
    const payload = merged.map((f) => ({ name: f.name, content: f.content }));
    const runId = pipelineRunIdRef.current;
    if (runId && !options?.skipOrchestrator) {
      try {
        const fin = await callFinalizePipeline({
          data: {
            runId,
            files: payload.slice(0, 40),
          },
        });
        if (fin?.ok) {
          const last = fin.run?.events?.[fin.run.events.length - 1];
          const score = fin.overallScore ?? 0;
          if (fin.validationStatus) {
            setValidationLabel(formatValidationScoreShort(score, fin.validationStatus));
          }
          setPipelineStatus(
            fin.success
              ? `Validación completada · ${score}/100`
              : (last?.message ?? "Validación con avisos"),
          );
          if (fin.run?.state === "completed" || fin.run?.state === "failed") {
            pipelineRunIdRef.current = null;
          }
          if (fin.fixesApplied?.length) {
            toast.message(`Auto-fix: ${fin.fixesApplied.length} corrección(es) aplicada(s)`, {
              duration: 4000,
            });
          }
          return {
            issues: fin.issues ?? [],
            patchedFiles: fin.patchedFiles?.length ? fin.patchedFiles : undefined,
          };
        }
      } catch {
        /* fallback local + server fn */
      }
    }
    const local = auditProjectLocally(payload);
    try {
      const remote = await callValidateProject({ data: payload.slice(0, 40) });
      if (typeof remote.overallScore === "number" && remote.status) {
        setValidationLabel(formatValidationScoreShort(remote.overallScore, remote.status));
      }
      const issues = remote.issues?.length ? remote.issues : local.issues;
      return { issues };
    } catch {
      return { issues: local.issues };
    }
    };

    try {
      return await Promise.race([
        validationRace(),
        new Promise<{
          issues: ProjectValidationIssue[];
          patchedFiles?: Array<{ name: string; content: string; language?: string }>;
        }>((resolve) =>
          window.setTimeout(
            () => resolve({ issues: auditProjectLocally(merged.map((f) => ({ name: f.name, content: f.content }))).issues }),
            45_000,
          ),
        ),
      ]);
    } catch {
      return { issues: auditProjectLocally(merged.map((f) => ({ name: f.name, content: f.content }))).issues };
    }
  };

  const applyGenerationFiles = async (
    baseFiles: FileItem[],
    generated: Array<{ name: string; language?: string; content: string }>,
    userInstruction: string,
    userRaw: string,
    options: { runFunctionalAudit: boolean; snapshotLabel?: string },
  ): Promise<{ merged: FileItem[]; issues: ProjectValidationIssue[] }> => {
    const genProjectId = activeProjectIdRef.current ?? projectId ?? null;
    const resolveActiveProjectId = () => activeProjectIdRef.current ?? projectId ?? null;
    const isStaleProject = () => genProjectId !== resolveActiveProjectId();
    const staleReturn = (): { merged: FileItem[]; issues: ProjectValidationIssue[] } => ({
      merged: filesRef.current.length > 0 ? filesRef.current : baseFiles,
      issues: [],
    });

    rollbackBaselineRef.current = baseFiles.map((f) => ({
      name: f.name,
      content: f.content,
      language: f.language ?? "typescript",
    }));

    logPipelineEvent(
      "info",
      "apply.start",
      pipelineTraceMeta(
        {
          traceId: requestEpochRef.current,
          projectId: genProjectId,
          phase: "apply",
          pipelineRunId: pipelineRunIdRef.current,
        },
        { deltaCount: generated.length },
      ),
    );

    const snapLabel = options.snapshotLabel?.trim();
    if (
      snapLabel &&
      !snapLabel.toLowerCase().startsWith("auto-fix:") &&
      !snapLabel.toLowerCase().startsWith("auto:")
    ) {
      try {
        const { createSnapshot } = await import("@/lib/userSupabase");
        void createSnapshot(baseFiles, snapLabel, projectId ?? undefined);
      } catch (err) {
        logClientWarn("gafcore-snapshot-before-apply", err);
      }
    }
    let outFiles = repairGafcoreProjectMedia(
      repairGeneratedSourceFiles(generated),
      baseFiles.map((f) => ({ name: f.name, content: f.content, language: f.language })),
      userInstruction,
    );
    try {
      const enriched = await callEnrichMedia({
        data: {
          files: outFiles,
          projectFiles: baseFiles.map((f) => ({
            name: f.name,
            content: f.content,
            language: f.language,
          })),
          instruction: userInstruction,
        },
      });
      if (enriched?.files?.length) outFiles = enriched.files;
    } catch {
      /* reparación local ya aplicada */
    }
    let merged = ensureReactPackageJson(
      sanitizeProjectJsxFiles(mergeGeneratedFiles(baseFiles, outFiles)),
    );
    const snapshot = createCodeSnapshot(
      baseFiles.map((f) => ({
        name: f.name,
        content: f.content,
        language: f.language,
      })),
    );
    const baselineProj = baseFiles.map((f) => ({
      name: f.name,
      content: f.content,
      language: f.language,
    }));
    const mergedProj = merged.map((f) => ({
      name: f.name,
      content: f.content,
      language: f.language,
    }));
    const heal = validateAndHealBeforePreview(baselineProj, mergedProj, snapshot);
    const shield = runIntegrityShield(baselineProj, heal.files, snapshot, {
      deltaPaths: outFiles.map((f) => f.name),
      instruction: userInstruction,
    });
    merged = shield.files.map((f) => ({
      name: f.name,
      content: f.content,
      language: f.language ?? "typescript",
    }));
    if (isStaleProject()) {
      logClientWarn("gafcore-apply-files-stale-project", {
        expected: genProjectId,
        current: resolveActiveProjectId(),
      });
      return staleReturn();
    }
    setFiles(merged);
    filesRef.current = merged;
    queueMicrotask(() => onCodeGenerated?.());
    const toPersist = outFiles.map((o) => merged.find((m) => m.name === o.name) ?? o);
    const persistResult = await persistMergedToProjectDb(merged);
    if (!persistResult.ok) {
      logPipelineEvent(
        "warn",
        "persist.failed",
        pipelineTraceMeta(
          {
            traceId: requestEpochRef.current,
            projectId: genProjectId,
            phase: "persist",
            pipelineRunId: pipelineRunIdRef.current,
          },
          { reason: persistResult.detail ?? "unknown", fileCount: merged.length },
        ),
      );
      offerGenerationRollback("No se guardó en la nube. Puedes deshacer el último cambio.");
    }

    try {
      const v = await callValidateSources({
        data: toPersist.map((f) => ({ name: f.name, content: f.content })),
      });
      if (!v.ok && Array.isArray(v.errors) && v.errors.length > 0) {
        const jsxErrors = v.errors.filter((e) => /\.(tsx|jsx)$/i.test(e.name));
        const otherErrors = v.errors.filter((e) => !/\.(tsx|jsx)$/i.test(e.name));
        if (jsxErrors.length > 0) {
          const sourceErr = jsxErrors.map((e) => `${e.name}: ${e.message}`).join("\n");
          setLastError(sourceErr);
          if (
            isPreviewAutofixAiEnabled() &&
            shouldAttemptAiAutofix(sourceErr) &&
            !validationAutoRetryUsedRef.current
          ) {
            scheduleRuntimeAutofixRef.current(sourceErr);
          }
        } else if (otherErrors.length > 0) {
          toast.message("Aviso en archivos auxiliares (no bloquea el preview).", {
            description: otherErrors[0].message.slice(0, 120),
            duration: 5000,
          });
        }
      }
    } catch (err) {
      logClientWarn("gafcore-validate-sources", err);
      toast.message("No se pudo verificar el código generado. El preview puede tener errores.", {
        duration: 6000,
      });
    }

    let issues: ProjectValidationIssue[] = [];
    let mergedForReturn = merged;
    if (options.runFunctionalAudit) {
      const validation = await runProjectValidation(merged);
      issues = validation.issues;
      if (validation.patchedFiles?.length) {
        mergedForReturn = mergeGeneratedFiles(merged, validation.patchedFiles);
        if (isStaleProject()) {
          logClientWarn("gafcore-apply-files-stale-project", {
            expected: genProjectId,
            current: resolveActiveProjectId(),
            phase: "validation_patch",
          });
          return staleReturn();
        }
        setFiles(mergedForReturn);
        filesRef.current = mergedForReturn;
        queueMicrotask(() => onCodeGenerated?.());
        await persistMergedToProjectDb(mergedForReturn);
      }
      if (issues.length > 0) {
        const blocking = issues.filter((i) => i.severity === "error");
        const warnings = issues.filter((i) => i.severity !== "error");
        if (blocking.length > 0) {
          const text = formatValidationForUser(blocking);
          setLastError((prev) =>
            prev ? `${prev}\n\n[Validación GafCore]\n${text}` : `[Validación GafCore]\n${text}`,
          );
          if (isPreviewAutofixAiEnabled()) scheduleRuntimeAutofixRef.current(text);
        } else if (warnings.length > 0) {
          toast.message("Listo con avisos menores", {
            description: formatValidationForUser(warnings).slice(0, 240),
            duration: 6000,
          });
        }
        if (!pipelineRunIdRef.current) {
          void persistValidationMemory(blocking, false);
        }
      }
    }
    logPipelineEvent(
      "info",
      "apply.done",
      pipelineTraceMeta(
        {
          traceId: requestEpochRef.current,
          projectId: genProjectId,
          phase: "apply",
          pipelineRunId: pipelineRunIdRef.current,
        },
        {
          fileCount: mergedForReturn.length,
          deltaCount: outFiles.length,
          persistOk: persistResult.ok,
          issueCount: issues.length,
          blockingCount: issues.filter((i) => i.severity === "error").length,
        },
      ),
    );
    return { merged: mergedForReturn, issues };
  };

  const workflowStorageKey = projectId ? `gafcore_workflow_${projectId}` : null;

  const syncWorkflowToPipeline = useCallback(
    async (workflowRunId: string, workflowState: string, planSummary: string) => {
      const pipelineRunId = pipelineRunIdRef.current;
      if (!pipelineRunId) return;
      try {
        await callSyncPipelineWorkflow({
          data: { pipelineRunId, workflowRunId, workflowState, planSummary },
        });
      } catch {
        /* pipeline opcional */
      }
    },
    [callSyncPipelineWorkflow],
  );

  const clearBackgroundWorkflow = useCallback(
    (workflowRunId: string) => {
      setBackgroundWorkflowRunId((cur) => (cur === workflowRunId ? null : cur));
      if (workflowStorageKey) {
        try {
          if (localStorage.getItem(workflowStorageKey) === workflowRunId) {
            localStorage.removeItem(workflowStorageKey);
          }
        } catch {
          /* */
        }
      }
      bgWorkflowMetaRef.current = null;
    },
    [workflowStorageKey],
  );

  const handleCancelWorkflow = useCallback(async () => {
    const runId = backgroundWorkflowRunId ?? activeWorkflowRunId;
    if (!runId) return;
    setWorkflowCancelPending(true);
    requestEpochRef.current += 1;
    try {
      const res = await callCancelWorkflow({ data: { workflowRunId: runId } });
      if (!res.ok) {
        toast.error("No se pudo cancelar el workflow");
        return;
      }
      bgWorkflowFinishedRef.current.add(runId);
      clearBackgroundWorkflow(runId);
      setActiveWorkflowRunId(null);
      setWorkflowState("cancelled");
      setPipelineStatus(null);
      toast.message("Workflow multiagente cancelado");
      const snap = await callGetWorkflowStatus({ data: { workflowRunId: runId } });
      if (snap.ok) setWorkflowTasks(snap.tasks as WorkflowTaskUi[]);
    } catch (e) {
      logClientError("workflow cancel", e);
      toast.error("Error al cancelar");
    } finally {
      setWorkflowCancelPending(false);
    }
  }, [
    activeWorkflowRunId,
    backgroundWorkflowRunId,
    callCancelWorkflow,
    callGetWorkflowStatus,
    clearBackgroundWorkflow,
  ]);

  const finishBackgroundWorkflow = useCallback(
    async (
      workflowRunId: string,
      snap: Awaited<ReturnType<typeof callGetWorkflowStatus>>,
    ) => {
      if (!snap.ok) {
        clearBackgroundWorkflow(workflowRunId);
        return;
      }
      const meta = bgWorkflowMetaRef.current;
      const wfState = snap.run.state;
      const mergedPatches =
        snap.filesSnapshot?.length > 0
          ? snap.filesSnapshot.map((f) => ({
              name: f.name,
              language: f.language,
              content: f.content,
            }))
          : [];

      const lines: string[] = [];
      for (const t of snap.tasks) {
        const label = agentTypeLabel(t.agent_type as Parameters<typeof agentTypeLabel>[0]);
        const status =
          t.state === "succeeded" ? "✓" : t.state === "failed" ? `❌ ${t.error_message ?? "error"}` : "…";
        lines.push(`- **${label}** · ${t.title} ${status}`);
      }
      const reply =
        lines.length > 0
          ? `Workflow en segundo plano **${wfState}**.\n\n${lines.join("\n")}`
          : `Workflow en segundo plano **${wfState}**.`;

      appendMessageDeduped("ai", reply);
      scrollChatToBottomSoon("auto");

      if (mergedPatches.length > 0) {
        const instruction =
          meta?.instruction ??
          (typeof snap.run.instruction === "string" ? snap.run.instruction : "workflow");
        const userLabel = meta?.userLabel ?? "workflow";
        const runAudit = meta ? meta.effectiveBuild && !meta.visualEditOn : false;
        await applyGenerationFiles(files, mergedPatches, instruction, userLabel, {
          runFunctionalAudit: runAudit,
          snapshotLabel: meta
            ? `multiagent-bg: ${meta.userLabel.slice(0, 40)}`
            : "multiagent-bg: resume",
        });
      }

      if (wfState === "completed") {
        toast.success("Multiagente terminado", {
          description: snap.planSummary?.slice(0, 120) ?? "Cambios aplicados al proyecto.",
        });
        setPipelineStatus("Multiagente: listo");
      } else if (wfState === "failed") {
        toast.error("Multiagente falló", {
          description: "Revisa las tareas en el panel del chat.",
        });
        setPipelineStatus("Multiagente: falló");
      } else {
        setPipelineStatus(null);
      }

      setWorkflowState(wfState);
      await syncWorkflowToPipeline(workflowRunId, wfState, snap.planSummary ?? "");
      clearBackgroundWorkflow(workflowRunId);
    },
    [applyGenerationFiles, clearBackgroundWorkflow, files, syncWorkflowToPipeline],
  );

  useEffect(() => {
    if (!projectId || !multiAgentBg || !workflowStorageKey) return;
    try {
      const stored = localStorage.getItem(workflowStorageKey);
      if (stored && !backgroundWorkflowRunId) {
        setBackgroundWorkflowRunId(stored);
        setPipelineStatus("Multiagente (2º plano): reanudando…");
      }
    } catch {
      /* */
    }
  }, [projectId, multiAgentBg, workflowStorageKey, backgroundWorkflowRunId]);

  useEffect(() => {
    const runId = backgroundWorkflowRunId;
    if (!runId || !projectId || !multiAgentBg) return;

    let cancelled = false;
    let inFlight = false;

    const tick = async () => {
      if (cancelled || inFlight || bgWorkflowFinishedRef.current.has(runId)) return;
      inFlight = true;
      try {
        const snap = await callGetWorkflowStatus({ data: { workflowRunId: runId } });
        if (!snap.ok || cancelled) return;

        setWorkflowTasks(snap.tasks as WorkflowTaskUi[]);
        setWorkflowState(snap.run.state);
        if (snap.planSummary) setWorkflowPlanSummary(snap.planSummary);
        if (snap.metrics) setWorkflowMetrics(snap.metrics);

        const terminal =
          snap.run.state === "completed" ||
          snap.run.state === "failed" ||
          snap.run.state === "cancelled";

        if (terminal) {
          if (!bgWorkflowFinishedRef.current.has(runId)) {
            bgWorkflowFinishedRef.current.add(runId);
            if (snap.run.state === "cancelled") {
              setWorkflowState("cancelled");
              setPipelineStatus(null);
              clearBackgroundWorkflow(runId);
            } else {
              await finishBackgroundWorkflow(runId, snap);
            }
          }
          return;
        }

        setPipelineStatus(`Multiagente (2º plano): ${snap.run.state}…`);
        await callRunWorkflowWave({
          data: { workflowRunId: runId, projectId, files: [] },
        });
      } catch (e) {
        logClientError("workflow-bg poll", e);
      } finally {
        inFlight = false;
      }
    };

    const intervalId = window.setInterval(() => void tick(), 2800);
    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    backgroundWorkflowRunId,
    projectId,
    multiAgentBg,
    callGetWorkflowStatus,
    callRunWorkflowWave,
    finishBackgroundWorkflow,
    clearBackgroundWorkflow,
  ]);

  const fetchGafcoreChatComplete = async (
    tok: string,
    history: ChatMsg[],
    instruction: string,
    contextFiles: FileItem[],
    ac: AbortSignal,
    userTextForTone: string,
  ): Promise<{
    reply: string;
    files: Array<{ name: string; language?: string; content: string }>;
    safeBuild?: SafeBuildMeta;
    validationBlocked?: boolean;
  }> => {
    const res = await fetch("/api/gafcore/chat/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${tok}`,
      },
      body: JSON.stringify({
        history,
        instruction,
        files: contextFiles,
        deepMode: deepModel,
        ...(activeProjectIdRef.current ? { projectId: activeProjectIdRef.current } : {}),
      }),
      signal: ac.signal,
    });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok || ct.includes("text/html")) {
      let errCode = `HTTP ${res.status}`;
      try {
        if (!ct.includes("text/html")) {
          const ej = (await res.json()) as { error?: string; detail?: string };
          if (ej?.error === "insufficient_credits") errCode = "INSUFFICIENT_CREDITS";
          else if (ej?.error === "ai_not_configured") errCode = "AI_NO_CONFIGURADA";
          else if (ej?.error === "rate_limited") errCode = "rate_limited";
          else if (ej?.error === "project_not_found") errCode = "project_not_found";
          else if (ej?.error === "upstream" && typeof ej.detail === "string" && ej.detail.trim()) {
            errCode = `UPSTREAM_DETAIL:${ej.detail.trim().slice(0, 200)}`;
          } else if (res.status === 429) errCode = "rate_limited";
          else if (typeof ej?.error === "string") errCode = ej.error;
          else if (res.status >= 500) errCode = `UPSTREAM:${res.status}`;
        } else {
          errCode = "HTML_RESPONSE";
        }
      } catch {
        /* */
      }
      throw new Error(errCode);
    }
    const j = (await res.json()) as {
      reply?: string;
      files?: Array<{ name: string; language?: string; content: string }>;
      safeBuild?: SafeBuildMeta;
      validationBlocked?: boolean;
    };
    if (j.safeBuild?.phase) {
      setHealthPhase(mapSafeBuildToHealthPhase(j.safeBuild.phase));
    }
    return {
      reply: softenRoboticReply(userTextForTone, typeof j.reply === "string" ? j.reply : "Listo."),
      files: Array.isArray(j.files) ? j.files : [],
      safeBuild: j.safeBuild,
      validationBlocked: j.validationBlocked === true,
    };
  };

  const requestGafcoreGeneration = async (
    tok: string,
    history: ChatMsg[],
    instruction: string,
    contextFiles: FileItem[],
    ac: AbortSignal,
    myEpoch: number,
    userTextForTone: string,
    _options?: { preferReliableJson?: boolean },
  ): Promise<{
    reply: string;
    files: Array<{ name: string; language?: string; content: string }>;
    safeBuild?: SafeBuildMeta;
    validationBlocked?: boolean;
  }> => {
    /** Cerebro: siempre /complete (agente 3 intentos + Safe-Build). El stream no reintenta y dejaba el preview vacío. */
    return fetchGafcoreChatComplete(
      tok,
      history,
      instruction,
      contextFiles,
      ac,
      userTextForTone,
    );
  };

  const runPreviewAutofixWithAi = useCallback(
    async (errorMessage: string) => {
      const msg = errorMessage.trim();
      if (!isPreviewAutofixAiEnabled()) return;
      if (isPreviewAutofixSuppressed()) return;
      if (!shouldAttemptAiAutofix(msg)) return;
      if (!projectId || filesRef.current.length === 0) return;
      if (autoFixInFlightRef.current) return;
      if (autoFixSessionCountRef.current >= GAFCORE_AUTOFIX_SESSION_MAX) return;

      const errKey = msg.slice(0, 120);
      const fileSig = filesRef.current.map((f) => `${f.name}:${f.content.length}`).join("|");
      const attemptKey = `${errKey}::${fileSig}`;
      if (autoFixAttemptedErrorsRef.current.has(attemptKey)) return;

      const canSpendCredit =
        isAdmin ||
        isUnlimitedDaily ||
        isFairUseCreadorPlan ||
        balance >= COST_PER_REQUEST;
      if (!canSpendCredit) {
        setCreditsOut(true);
        return;
      }

      if (sendInFlightRef.current) {
        await new Promise((r) => setTimeout(r, 700));
        if (sendInFlightRef.current) return;
      }

      autoFixAttemptedErrorsRef.current.add(attemptKey);
      autoFixSessionCountRef.current += 1;
      autoFixInFlightRef.current = true;
      setAutoFixActive(true);

      const toastId = toast.loading("Corrigiendo error del preview con IA…", { duration: 90_000 });
      autoFixToastIdRef.current = toastId;
      const fixInstruction = buildRuntimeAutoFixInstruction(msg);

      try {
        const tok = await getAuthAccessToken();
        if (!tok) {
          autoFixAttemptedErrorsRef.current.delete(attemptKey);
          toast.dismiss(toastId);
          autoFixToastIdRef.current = null;
          return;
        }

        const result = await fetchGafcoreChatComplete(
          tok,
          [],
          fixInstruction,
          filesRef.current,
          new AbortController() as unknown as AbortSignal,
          fixInstruction,
        );

        if (!Array.isArray(result.files) || result.files.length === 0) {
          autoFixAttemptedErrorsRef.current.delete(attemptKey);
          toast.dismiss(toastId);
          offerGenerationRollback(
            "No se pudo auto-corregir. Puedes deshacer el último cambio o usar Historial (reloj).",
          );
          return;
        }

        const applied = await applyGenerationFiles(
          filesRef.current,
          repairGeneratedSourceFiles(result.files),
          fixInstruction,
          fixInstruction,
          { runFunctionalAudit: true },
        );
        filesRef.current = applied.merged;

        if (hasBlockingValidationIssues(applied.issues)) {
          const blockText = formatValidationForUser(
            applied.issues.filter((i) => i.severity === "error"),
          );
          setLastError(blockText);
          toast.dismiss(toastId);
          offerGenerationRollback(
            "Auto-corrección detenida. Puedes deshacer el último cambio o restaurar desde Historial (reloj).",
          );
          return;
        }

        autoFixAttemptedErrorsRef.current.delete(attemptKey);
        toast.dismiss(toastId);
        toast.success("Error del preview corregido automáticamente", { duration: 5000 });
        setLastError(applied.issues.length > 0 ? formatValidationForUser(applied.issues) : null);
        queueMicrotask(() => {
          window.dispatchEvent(new CustomEvent("gafcore:repair-project-jsx"));
          onCodeGenerated?.();
        });
      } catch (e) {
        logClientWarn("gafcore-autofix-preview", e);
        autoFixAttemptedErrorsRef.current.delete(attemptKey);
        toast.dismiss(toastId);
        const errMsg = String((e as Error)?.message || "");
        if (errMsg.includes("INSUFFICIENT_CREDITS")) setCreditsOut(true);
      } finally {
        autoFixInFlightRef.current = false;
        setAutoFixActive(false);
        if (autoFixToastIdRef.current === toastId) {
          autoFixToastIdRef.current = null;
        }
      }
    },
    [
      applyGenerationFiles,
      balance,
      isAdmin,
      isFairUseCreadorPlan,
      isUnlimitedDaily,
      onCodeGenerated,
      offerGenerationRollback,
      projectId,
    ],
  );

  runPreviewAutofixRef.current = runPreviewAutofixWithAi;

  const scheduleRuntimeAutofix = useCallback((msg: string) => {
    if (isPreviewAutofixSuppressed()) return;
    if (!shouldAttemptAiAutofix(msg)) return;
    if (autofixDebounceRef.current) clearTimeout(autofixDebounceRef.current);
    const delay = sendInFlightRef.current ? 900 : 400;
    autofixDebounceRef.current = setTimeout(() => {
      autofixDebounceRef.current = null;
      void runPreviewAutofixRef.current(msg);
    }, delay);
  }, []);

  scheduleRuntimeAutofixRef.current = scheduleRuntimeAutofix;

  const pollFactoryUntilComplete = async (
    pipelineRunId: string,
    workflowRunId: string,
    myEpoch: number,
  ): Promise<Extract<FactoryRunResult, { ok: true }>> => {
    const maxAttempts = 150;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (myEpoch !== requestEpochRef.current) {
        throw new Error("CANCELLED");
      }
      await new Promise((r) => setTimeout(r, 2500));
      const st = await callGetFactoryStatus({
        data: { pipelineRunId, workflowRunId },
      });
      if (!st.ok) continue;
      if (st.pipeline?.current_step) {
        setPipelineStatus(`Fábrica: ${st.pipeline.current_step}…`);
      }
      if (st.workflow?.run.state) {
        setWorkflowState(st.workflow.run.state);
        if (st.workflow.planSummary) setWorkflowPlanSummary(st.workflow.planSummary);
        if (st.workflow.tasks?.length) {
          setWorkflowTasks(st.workflow.tasks as WorkflowTaskUi[]);
        }
      }
      const pending = st.pipeline?.factoryAsyncPending;
      const asyncResult = st.pipeline?.factoryResult;
      if (asyncResult) {
        if (!asyncResult.ok) {
          const msg =
            asyncResult.message ??
            (asyncResult.error === "build_smoke_failed"
              ? "Build smoke falló."
              : asyncResult.error === "deploy_failed"
                ? "Deploy fallido."
                : "La fábrica no pudo completar el build.");
          toast.error(msg, { duration: 9000 });
          throw new Error(asyncResult.error ?? "FACTORY_FAILED");
        }
        return asyncResult;
      }
      if (st.pipeline && pending === false) break;
    }
    toast.error("La fábrica tardó demasiado. Revisa el proyecto en unos minutos.", {
      duration: 10000,
    });
    throw new Error("FACTORY_TIMEOUT");
  };

  const runFactoryBuild = async (
    instruction: string,
    myEpoch: number,
    userLabel: string,
    effectiveBuild: boolean,
    visualEditOn: boolean,
  ): Promise<{ reply: string; files: Array<{ name: string; language?: string; content: string }> }> => {
    if (!projectId) throw new Error("project_required");

    const factoryInstruction = instruction.includes("[modo fábrica")
      ? instruction
      : `${FACTORY_BUILD_PREFIX}${instruction}`;

    setPipelineStatus("Fábrica: planificando y generando…");
    setActiveWorkflowRunId(null);
    setWorkflowTasks([]);
    setWorkflowPlanSummary(null);
    setWorkflowState("executing");
    setWorkflowMetrics(null);

    if (usePipelineOrchestrator) {
      await startPipelineRun(factoryInstruction);
    }

    let factoryRes = await callRunFactory({
      data: {
        projectId,
        instruction: factoryInstruction,
        files: files.map((f) => ({
          name: f.name,
          language: f.language,
          content: f.content,
        })),
        runDesignCritique: true,
        autoDeploy: factoryAutoDeploy,
        asyncRun: import.meta.env.PROD,
        ...(factoryProfileId !== FACTORY_PROFILE_AUTO_ID
          ? { factoryProfileId }
          : {}),
        ...(projectName ? { projectName } : {}),
      },
    });

    if (factoryRes.ok && "async" in factoryRes && factoryRes.async) {
      pipelineRunIdRef.current = factoryRes.pipelineRunId;
      setActiveWorkflowRunId(factoryRes.workflowRunId);
      setWorkflowPlanSummary(factoryRes.planSummary);
      toast.message(factoryRes.message, { duration: 6000 });
      factoryRes = await pollFactoryUntilComplete(
        factoryRes.pipelineRunId,
        factoryRes.workflowRunId,
        myEpoch,
      );
    }

    if (!factoryRes.ok) {
      if (factoryRes.error === "workflow_limit_reached") {
        toast.error(
          `Límite de workflows activos (${factoryRes.active ?? 0}/${factoryRes.max ?? 2})`,
          { duration: 8000 },
        );
        throw new Error("WORKFLOW_LIMIT_REACHED");
      }
      const msg =
        factoryRes.message ??
        (factoryRes.error === "plan_failed"
          ? "No se pudo planificar el proyecto."
          : factoryRes.error === "build_smoke_failed"
            ? "Build smoke falló: revisa App.tsx y errores de sintaxis."
            : factoryRes.error === "deploy_failed"
              ? "Deploy bloqueado o fallido."
              : "La fábrica no pudo completar el build.");
      toast.error(msg, { duration: 9000 });
      throw new Error(factoryRes.error ?? "FACTORY_FAILED");
    }

    if (myEpoch !== requestEpochRef.current) {
      return { reply: "Cancelado.", files: [] };
    }

    if (factoryRes.pipelineRunId) {
      pipelineRunIdRef.current = factoryRes.pipelineRunId;
    }

    setWorkflowPlanSummary(factoryRes.planSummary);
    setWorkflowState(factoryRes.workflowState);
    const deployNote = factoryRes.deploy?.ok
      ? " · publicado"
      : factoryRes.deploy?.attempted
        ? " · deploy pendiente"
        : "";
    setPipelineStatus(
      factoryRes.phase === "completed"
        ? `Fábrica: listo · ${factoryRes.validation.overallScore}/100 · ${factoryRes.buildSmoke.message}${deployNote}`
        : `Fábrica: ${factoryRes.workflowState}`,
    );
    if (factoryRes.deploy?.ok && factoryRes.deploy.siteHost) {
      toast.success(`Sitio publicado: ${factoryRes.deploy.siteHost}`, { duration: 8000 });
    }

    appendMessageDeduped("ai", factoryRes.reply);
    scrollChatToBottomSoon("auto");

    if (factoryRes.pipelineRunId) {
      await syncWorkflowToPipeline(
        factoryRes.workflowRunId,
        factoryRes.workflowState,
        factoryRes.planSummary,
      );
    }

    let patchFiles = repairGeneratedSourceFiles(
      factoryRes.files.map((p) => ({
        name: p.name,
        language: p.language,
        content: p.content,
      })),
    );

    if (patchFiles.length > 0 && effectiveBuild) {
      const { merged } = await applyGenerationFiles(files, patchFiles, instruction, userLabel, {
        runFunctionalAudit: effectiveBuild && !visualEditOn,
        snapshotLabel: `fábrica: ${userLabel.slice(0, 40)}`,
      });
      setFiles(merged);
      onCodeGenerated?.();
      patchFiles = merged.map((f) => ({
        name: f.name,
        language: f.language,
        content: f.content,
      }));
    }

    const followup = factoryRes.critique?.followupInstruction?.trim();
    if (
      followup &&
      effectiveBuild &&
      !visualEditOn &&
      myEpoch === requestEpochRef.current &&
      factoryRes.validation.success
    ) {
      setPipelineStatus("Fábrica: mejorando diseño…");
      appendMessageDeduped(
        "ai",
        `**Fábrica · diseño:** puntuación ${factoryRes.critique?.score ?? "—"}/100. Aplicando mejoras automáticas…`,
      );
      const tok = await getAuthAccessToken();
      if (tok) {
        const designResult = await requestGafcoreGeneration(
          tok,
          [{ role: "user", content: instruction }, { role: "assistant", content: factoryRes.reply }],
          followup,
          patchFiles.length ? patchFiles : files,
          undefined,
          myEpoch,
          userLabel,
        );
        if (myEpoch === requestEpochRef.current && designResult.files?.length) {
          const { merged } = await applyGenerationFiles(
            patchFiles.length ? mergeGeneratedFiles(files, patchFiles) : files,
            designResult.files,
            followup,
            userLabel,
            { runFunctionalAudit: true, snapshotLabel: "fábrica: diseño" },
          );
          setFiles(merged);
          onCodeGenerated?.();
          appendMessageDeduped(
            "ai",
            sanitizeUserFacingAiText(designResult.reply || "Mejoras de diseño aplicadas."),
          );
          patchFiles = merged.map((f) => ({
            name: f.name,
            language: f.language,
            content: f.content,
          }));
        }
      }
      setPipelineStatus("Fábrica: completado");
    }

    pipelineRunIdRef.current = null;

    return {
      reply: factoryRes.reply,
      files: patchFiles,
    };
  };

  const runMultiAgentWorkflow = async (
    instruction: string,
    myEpoch: number,
    userLabel: string,
    effectiveBuild: boolean,
    visualEditOn: boolean,
  ): Promise<{ reply: string; files: Array<{ name: string; language?: string; content: string }> }> => {
    if (!projectId) throw new Error("project_required");
    const workflowInstruction = selectedWorkflowPackSlug
      ? `@workflow:${selectedWorkflowPackSlug} ${instruction}`.trim()
      : instruction;
    const ctxFiles = files.map((f) => ({
      name: f.name,
      language: f.language,
      content: f.content,
    }));

    setPipelineStatus("Multiagente: planificando…");
    setActiveWorkflowRunId(null);
    setWorkflowTasks([]);
    setWorkflowPlanSummary(null);
    setWorkflowState(null);
    setWorkflowMetrics(null);

    if (usePipelineOrchestrator) {
      await startPipelineRun(instruction);
    }

    const started = await callPlanAndStartWorkflow({
      data: {
        projectId,
        instruction: workflowInstruction,
        files: ctxFiles,
        ...(pipelineRunIdRef.current ? { pipelineRunId: pipelineRunIdRef.current } : {}),
      },
    });
    if (!started.ok) {
      if (started.error === "workflow_limit_reached") {
        const active = "active" in started ? started.active : 0;
        const max = "max" in started ? started.max : 2;
        toast.error(`Límite de workflows activos (${active}/${max})`, {
          description: "Espera a que termine uno o desactiva multiagente en segundo plano.",
          duration: 8000,
        });
        throw new Error("WORKFLOW_LIMIT_REACHED");
      }
      throw new Error(started.error === "plan_failed" ? "PLAN_FAILED" : "WORKFLOW_START_FAILED");
    }
    if (myEpoch !== requestEpochRef.current) {
      return { reply: "Cancelado.", files: [] };
    }

    if (multiAgentBg) {
      if (workflowStorageKey) {
        try {
          localStorage.setItem(workflowStorageKey, started.workflowRunId);
        } catch {
          /* */
        }
      }
      bgWorkflowMetaRef.current = { instruction, userLabel, effectiveBuild, visualEditOn };
      setBackgroundWorkflowRunId(started.workflowRunId);
      setWorkflowPlanSummary(started.planSummary);
      setWorkflowState("executing");
      setPipelineStatus("Multiagente (2º plano): plan listo, ejecutando…");
      appendMessageDeduped(
        "ai",
        `**Plan multiagente (segundo plano):** ${started.planSummary}\n\nPuedes seguir usando el chat; te avisamos al terminar.`,
      );
      scrollChatToBottomSoon("auto");
      return {
        reply: `Workflow en segundo plano iniciado.\n\n**Plan:** ${started.planSummary}`,
        files: [],
      };
    }

    setActiveWorkflowRunId(started.workflowRunId);
    setWorkflowPlanSummary(started.planSummary);
    setPipelineStatus(`Plan: ${started.planSummary}`);
    appendMessageDeduped(
      "ai",
      `**Plan multiagente:** ${started.planSummary}\n\nEjecutando tareas…`,
    );
    scrollChatToBottomSoon("auto");

    const refreshStatus = async () => {
      const snap = await callGetWorkflowStatus({
        data: { workflowRunId: started.workflowRunId },
      });
      if (!snap.ok) return;
      setWorkflowTasks(snap.tasks as WorkflowTaskUi[]);
      setWorkflowState(snap.run.state);
      if (snap.planSummary) setWorkflowPlanSummary(snap.planSummary);
      if (snap.metrics) setWorkflowMetrics(snap.metrics);
    };

    await refreshStatus();

    const allSteps: Awaited<ReturnType<typeof callRunWorkflowWave>>["steps"] = [];
    let waves = 0;
    let done = false;
    const maxWaves = 12;

    while (!done && waves < maxWaves && myEpoch === requestEpochRef.current) {
      setPipelineStatus(`Multiagente: ola ${waves + 1}…`);
      const wave = await callRunWorkflowWave({
        data: {
          workflowRunId: started.workflowRunId,
          projectId,
          files: [],
        },
      });
      waves += 1;
      allSteps.push(...wave.steps);
      done = wave.done;
      setWorkflowState(wave.workflowState);
      await refreshStatus();
      if (wave.claimed === 0) break;
    }

    if (myEpoch !== requestEpochRef.current) {
      setActiveWorkflowRunId(null);
      return { reply: "Cancelado.", files: [] };
    }

    const finalSnap = await callGetWorkflowStatus({
      data: { workflowRunId: started.workflowRunId },
    });
    const mergedPatches =
      finalSnap.ok && finalSnap.filesSnapshot?.length
        ? finalSnap.filesSnapshot.map((f) => ({
            name: f.name,
            language: f.language,
            content: f.content,
          }))
        : [];

    const lines: string[] = [];
    for (const step of allSteps) {
      if (!step.task) continue;
      const label = agentTypeLabel(step.task.agent_type);
      const status = step.error ? `❌ ${step.error}` : "✓";
      lines.push(`- **${label}** · ${step.task.title} ${status}`);
      if (step.reply && !step.error) {
        lines.push(`  ${step.reply.slice(0, 180)}${step.reply.length > 180 ? "…" : ""}`);
      }
    }

    const wfState = finalSnap.ok ? finalSnap.run.state : "unknown";
    const waveNote = waves > 0 ? ` (${waves} ola(s) paralelas)` : "";
    const reply =
      lines.length > 0
        ? `Workflow **${wfState}**${waveNote}.\n\n${lines.join("\n")}`
        : `Workflow **${wfState}**${waveNote} completado.`;

    setPipelineStatus(
      wfState === "completed" ? "Multiagente: listo" : `Multiagente: ${wfState}`,
    );
    setActiveWorkflowRunId(null);
    await syncWorkflowToPipeline(started.workflowRunId, wfState, started.planSummary);

    if (mergedPatches.length > 0 && effectiveBuild) {
      const patchFiles = mergedPatches.map((p) => ({
        name: p.name,
        language: p.language,
        content: p.content,
      }));
      const { merged } = await applyGenerationFiles(files, patchFiles, instruction, userLabel, {
        runFunctionalAudit: effectiveBuild && !visualEditOn,
        snapshotLabel: `multiagent: ${userLabel.slice(0, 40)}`,
      });
      setFiles(merged);
      onCodeGenerated?.();
    }

    return {
      reply,
      files: mergedPatches,
    };
  };

  useEffect(() => {
    lastErrorRef.current = lastError;
  }, [lastError]);

  useEffect(() => {
    guideAutopilotRef.current = guideAutopilotUi;
  }, [guideAutopilotUi]);

  const buildGuideSuggestionContext = useCallback((): GafcoreChatSuggestionContext => {
    return {
      messages,
      files: files.map((f) => ({ name: f.name, content: f.content })),
      mode,
      factoryMode,
      visualEditOn,
      multiAgentMode,
      factoryAutoDeploy,
      lastError: lastErrorRef.current,
      pipelineStatus,
      validationLabel,
    };
  }, [
    messages,
    files,
    mode,
    factoryMode,
    visualEditOn,
    multiAgentMode,
    factoryAutoDeploy,
    pipelineStatus,
    validationLabel,
  ]);

  const tryAdvanceGuideAutopilot = useCallback(async () => {
    if (loading || sendInFlightRef.current || factoryMode || visualEditOn || mode !== "build") {
      return;
    }
    const ga = guideAutopilotRef.current;
    if (ga.paused) return;

    if (ga.autoStepsRun >= MAX_GUIDE_AUTOPILOT_CHAIN) {
      const paused = {
        active: true,
        paused: true,
        pauseReason: `Límite de ${MAX_GUIDE_AUTOPILOT_CHAIN} pasos automáticos. Pulsa Construir para continuar la guía.`,
        lastStepId: ga.lastStepId,
        autoStepsRun: ga.autoStepsRun,
      };
      guideAutopilotRef.current = paused;
      setGuideAutopilotUi(paused);
      return;
    }

    const ctx = buildGuideSuggestionContext();

    if (!ga.active) {
      if (!shouldEnableGuideAutopilot(ctx)) return;
      const started = { active: true, paused: false, pauseReason: null, lastStepId: null, autoStepsRun: 0 };
      guideAutopilotRef.current = started;
      setGuideAutopilotUi(started);
    }

    if (allGuideStepsCompleted(ctx)) {
      const done = createGuideAutopilotState();
      guideAutopilotRef.current = done;
      setGuideAutopilotUi(done);
      toast.success("Guía del proyecto completada. Revisa el preview y publica cuando quieras.", {
        duration: 8000,
      });
      return;
    }

    const err = lastErrorRef.current;
    if (isBlockingPreviewError(err)) {
      const paused = {
        ...guideAutopilotRef.current,
        active: true,
        paused: true,
        pauseReason:
          "Hay un error en el preview. Corrige manualmente, usa Deshacer o restaura una versión antes de continuar la guía.",
      };
      guideAutopilotRef.current = paused;
      setGuideAutopilotUi(paused);
      return;
    }

    const step = pickAutopilotStep(ctx, ga.lastStepId);
    if (!step || step.id === "guide-1") return;

    const nextGa = {
      ...guideAutopilotRef.current,
      lastStepId: step.id,
      autoStepsRun: guideAutopilotRef.current.autoStepsRun + 1,
    };
    guideAutopilotRef.current = nextGa;
    setGuideAutopilotUi(nextGa);
    toast.message(`Guía automática: ${step.label}`, { duration: 5000 });
    await sendRef.current?.(buildAutopilotInstruction(step));
  }, [
    loading,
    factoryMode,
    visualEditOn,
    mode,
    buildGuideSuggestionContext,
  ]);

  const scheduleGuideAutopilotAdvance = useCallback(() => {
    const gate = evaluateCoreOrchestrationGate({
      instruction: "",
      rawUserText: "",
      mode,
      factoryMode,
      multiAgentMode,
      visualEditOn,
      buildConfirmed: true,
      blockingError: lastErrorRef.current,
      validationBlocked: false,
    });
    if (gate.blockAutonomousAdvance) return;
    if (guideAutopilotTimerRef.current) clearTimeout(guideAutopilotTimerRef.current);
    guideAutopilotTimerRef.current = setTimeout(() => {
      guideAutopilotTimerRef.current = null;
      void tryAdvanceGuideAutopilot();
    }, GUIDE_AUTOPILOT_DELAY_MS);
  }, [tryAdvanceGuideAutopilot, mode, factoryMode, multiAgentMode, visualEditOn]);

  const cancelPendingBuildConfirmation = useCallback(() => {
    pendingBuildRef.current = null;
    setPendingBuildConfirmation(null);
    toast.message("Plan cancelado. Puedes ajustar tu pedido y volver a enviar.");
  }, []);

  const confirmPendingBuildConfirmation = useCallback(() => {
    const pending = pendingBuildRef.current;
    if (!pending) return;
    pendingBuildRef.current = null;
    setPendingBuildConfirmation(null);
    setPendingComposerImages(pending.pendingImages);
    void sendRef.current?.(markBuildConfirmedInstruction(pending.raw), { confirmed: true });
  }, []);

  const send = async (text?: string, options?: { confirmed?: boolean }) => {
    const raw = (text ?? input).trim();
    const pendingSnapshot = [...pendingComposerImages];
    const refNames = pendingSnapshot.map((p) => p.fileName).join(", ");
    const pendingRef =
      pendingSnapshot.length > 0
        ? `\n[REFERENCIA VISUAL OBLIGATORIA] Imagen(es) en el proyecto: ${refNames}. ` +
          `Usa esa imagen como fondo del hero (background-image: url(...) o <img> a pantalla completa con object-cover). ` +
          `En JSX/HTML usa src="${pendingSnapshot[0]?.fileName ?? "assets/ref.jpg"}" — el preview la resuelve. ` +
          `Prohibido dejar solo fondo negro o sólido si el usuario pidió imagen de fondo.\n`
        : "";
    const coreText =
      raw ||
      (pendingSnapshot.length > 0
        ? "Usa la imagen de referencia adjunta en los archivos del proyecto."
        : "");
    if (!coreText && pendingSnapshot.length === 0) return;
    if (raw && guideAutopilotRef.current.paused) {
      const resumed = { ...guideAutopilotRef.current, paused: false, pauseReason: null };
      guideAutopilotRef.current = resumed;
      setGuideAutopilotUi(resumed);
    }
    /** Bloquear si no alcanza 1 crédito: el denominador de la UI puede ser 10 aunque `balance` sea 0 (plan gratis), y antes no se bloqueaba y el error del proveedor parecía “fallo de conexión”. */
    const noQuota =
      !isAdmin &&
      !isUnlimitedDaily &&
      !isFairUseCreadorPlan &&
      !creditsLoading &&
      !!user?.id &&
      balance < COST_PER_REQUEST;
    if (noQuota) {
      toast.error("No tienes créditos de IA. Recarga o elige un plan.", { duration: 6000 });
      setCreditsOut(true);
      return;
    }
    const conversational = isConversationalOnly(raw) && pendingSnapshot.length === 0;
    const effectiveBuild = mode === "build" && !conversational;
    let scheduleGuideAfterBuild = false;

    const buildConfirmed =
      options?.confirmed === true || raw.startsWith(GAFCORE_BUILD_CONFIRMED_PREFIX.trim());
    const userFacingRaw =
      buildConfirmed && raw.startsWith(GAFCORE_BUILD_CONFIRMED_PREFIX.trim())
        ? raw.slice(GAFCORE_BUILD_CONFIRMED_PREFIX.length).trim()
        : raw;

    if (pendingBuildRef.current && !buildConfirmed) {
      const attempt = (userFacingRaw || coreText).trim();
      if (/^(s[ií]|ok|vale|adelante|comenzar|empieza|confirmo|yes|go)\b/i.test(attempt)) {
        const p = pendingBuildRef.current;
        pendingBuildRef.current = null;
        setPendingBuildConfirmation(null);
        setPendingComposerImages(p.pendingImages);
        return send(markBuildConfirmedInstruction(p.raw), { confirmed: true });
      }
      toast.message("Tienes un plan pendiente. Pulsa «Comenzar construcción» o escribe «sí, adelante».", {
        duration: 6000,
      });
      return;
    }

    if (effectiveBuild && !buildConfirmed && !factoryMode && !multiAgentMode && !visualEditOn) {
      const orchestrationGate = evaluateCoreOrchestrationGate({
        instruction: coreText,
        rawUserText: userFacingRaw || coreText,
        mode,
        factoryMode,
        multiAgentMode,
        visualEditOn,
        buildConfirmed,
        blockingError: lastErrorRef.current,
        validationBlocked: false,
      });
      if (orchestrationGate.requiresBuildConfirmation) {
        const analysis = buildLocalProjectAnalysis(userFacingRaw || coreText, files.length);
        const analysisText = formatProjectAnalysisForChat(analysis);
        const payload: PendingBuildConfirmation = {
          raw: userFacingRaw || coreText,
          pendingImages: pendingSnapshot,
        };
        pendingBuildRef.current = payload;
        setPendingBuildConfirmation(payload);
        const userBubble = [userFacingRaw, pendingSnapshot.length > 0 ? `📎 ${pendingSnapshot.length} imagen` : ""]
          .filter(Boolean)
          .join("\n");
        appendMessageDeduped("user", userBubble || "Pedido de proyecto");
        appendMessageDeduped("ai", analysisText);
        scrollChatToBottomSoon("auto");
        void persistMessage("user", userBubble || "Pedido de proyecto");
        void persistMessage("ai", analysisText);
        setInput("");
        setPendingComposerImages([]);
        return;
      }
    }

    let buildContextFiles = files;
    let isFreshProject = false;

    if (effectiveBuild && user?.id) {
      const needsFirstProject = !projectId;
      const wantsFresh = Boolean(projectId && userWantsFreshProject(raw, files));
      if (needsFirstProject || wantsFresh) {
        if (wantsFresh && projectId) {
          try {
            const { saveProjectFilesDetailed } = await import("@/lib/userSupabase");
            await saveProjectFilesDetailed(files, projectId);
          } catch {
            /* best-effort */
          }
        }
        const name = suggestProjectNameFromInstruction(raw);
        try {
          const created = await gafcoreAuthJsonFetch<{
            ok: boolean;
            project?: { id: string; name: string; created_at: string };
            files?: FileItem[];
            error?: string;
          }>("/api/gafcore/projects-create", { name });
          if (!created.ok || !created.project) {
            toast.error("No se pudo crear el proyecto", {
              description: created.error ?? "Reintenta con «+ Nuevo».",
              duration: 10_000,
            });
            return;
          }
          isFreshProject = true;
          activeProjectIdRef.current = created.project.id;
          buildContextFiles = (created.files?.length ? created.files : files) as FileItem[];
          setFiles(buildContextFiles);
          filesRef.current = buildContextFiles;
          setMessages([]);
          await onProjectCreated?.(created.project, buildContextFiles);
          toast.success(`Proyecto «${created.project.name}» listo — construyendo…`, {
            duration: 6000,
          });
        } catch (e) {
          toast.error("Error al crear proyecto", {
            description: e instanceof Error ? e.message : "Error de red",
          });
          return;
        }
      } else if (userWantsInPlaceRebuild(raw)) {
        /* Reconstrucción in-place: la IA sustituye archivos; sin plantillas predefinidas. */
      }
    }

    if (effectiveBuild && !activeProjectIdRef.current && !projectId) {
      toast.error("No hay proyecto activo. Escribe tu idea y lo creamos automáticamente.", {
        duration: 8000,
      });
      return;
    }

    const functionalPrefix =
      effectiveBuild && !visualEditOn ? FUNCTIONAL_FIRST_BUILD_PREFIX : "";
    const welcomeApp = buildContextFiles.find((f) => /^app\.(tsx|jsx)$/i.test(f.name));
    const stillOnWelcome = Boolean(
      welcomeApp?.content && isGafcoreDefaultTemplateApp(welcomeApp.content),
    );
    const preservePrefix =
      effectiveBuild && !visualEditOn && !isFreshProject && !stillOnWelcome
        ? buildPreserveExistingPrefix(buildContextFiles.length)
        : "";
    const freshProjectPrefix = isFreshProject ? buildFreshProjectInstructionPrefix() : "";
    const conversationalPrefix = conversational ? buildConversationalInstructionPrefix(raw) : "";
    const creativePrefix =
      effectiveBuild && !visualEditOn ? buildCreativeBuildPrefix(raw) : "";
    const deepPrefix =
      (deepModel && effectiveBuild) || (effectiveBuild && isSubstantiveBuildRequest(raw))
        ? "[modo profundo] Prioriza análisis cuidadoso, UI cuidada y código robusto; la salida sigue siendo solo el JSON del contrato. "
        : "";
    const chatPrefix =
      mode === "chat" || conversational
        ? "[Modo chat] Responde sin generar código a menos que se solicite explícitamente. "
        : "";
    const visualPrefix = visualEditOn
      ? "[Edición visual] Enfócate solo en cambios de UI/estilos sin tocar lógica. "
      : "";
    const visionBoost =
      pendingSnapshot.length > 0
        ? "[modo profundo] Hay imagen de referencia pegada; analízala y aplícala al diseño. "
        : "";
    const layoutPrefix = buildLayoutInstructionPrefix(raw);
    const heroBgPrefix = buildHeroBackgroundInstructionPrefix(raw);
    const literalVisualPrefix = buildLiteralVisualChangePrefix(raw);
    const forceBuildPrefix =
      effectiveBuild && isSubstantiveBuildRequest(coreText) ? GAFCORE_FORCE_FILES_BUILD_PREFIX : "";
    const instruction =
      freshProjectPrefix +
      conversationalPrefix +
      forceBuildPrefix +
      creativePrefix +
      functionalPrefix +
      preservePrefix +
      heroBgPrefix +
      literalVisualPrefix +
      layoutPrefix +
      visionBoost +
      deepPrefix +
      chatPrefix +
      visualPrefix +
      coreText +
      pendingRef;
    if (!instruction.trim() || loading || sendInFlightRef.current) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (
      lastUser &&
      lastUser.content.trim() === (raw || coreText).trim() &&
      Date.now() - lastUser.ts < 8_000
    ) {
      toast.message("Mensaje ya enviado; espera la respuesta del asistente.", { duration: 4_000 });
      return;
    }
    sendInFlightRef.current = true;
    setLoading(true);
    if (effectiveBuild) {
      setHealthPhase(
        deepModel || isSubstantiveBuildRequest(raw) ? "optimizing_design" : "designing",
      );
    } else {
      setHealthPhase(null);
    }
    const myEpoch = ++requestEpochRef.current;
    logPipelineEvent(
      "info",
      "chat.request",
      pipelineTraceMeta(
        {
          traceId: myEpoch,
          projectId: activeProjectIdRef.current ?? projectId,
          phase: "chat",
          pipelineRunId: pipelineRunIdRef.current,
        },
        { build: effectiveBuild, instructionLen: raw.length },
      ),
    );
    validationAutoRetryUsedRef.current = false;
    setInput("");
    setPendingComposerImages([]);
    const userDisplay = [raw, pendingSnapshot.length > 0 ? `📎 ${pendingSnapshot.length} imagen` : ""]
      .filter(Boolean)
      .join("\n");
    const guideBubble = formatGuideAutopilotUserBubble(coreText);
    const userBubble =
      guideBubble ?? (userDisplay || "📎 Imagen de referencia");
    stickToBottomRef.current = true;
    appendMessageDeduped("user", userBubble);
    stickToBottomRef.current = true;
    forceScrollToBottom();
    scrollChatToBottomSoon("auto");
    void persistMessage("user", userBubble);
    if (effectiveBuild && (activeProjectIdRef.current ?? projectId)) void startPipelineRun(instruction);
    if (effectiveBuild && buildContextFiles.length > 0) {
      try {
        const { createSnapshot } = await import("@/lib/userSupabase");
        await createSnapshot(
          buildContextFiles,
          `antes: ${(raw || "build").slice(0, 48)}`,
          projectId ?? undefined,
        );
      } catch (err) {
        logClientWarn("gafcore-snapshot-before-build", err);
      }
    }
    setStreamChars(null);
    const ac = new AbortController();
    abortControllerRef.current = ac;
    const chatTimeoutId = window.setTimeout(() => {
      if (!sendInFlightRef.current) return;
      ac.abort();
      toast.error("La solicitud tardó demasiado (2 min). Pulsa el cuadrado para detener o envía de nuevo.", {
        duration: 8000,
      });
    }, CHAT_REQUEST_TIMEOUT_MS);
    try {
      const history: ChatMsg[] = isFreshProject
        ? [{ role: "user", content: conversational ? userBubble : instruction }]
        : [
            ...messages
              .slice(-5)
              .map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.content })),
            { role: "user", content: conversational ? userBubble : instruction },
          ];

      const tok = await getAuthAccessToken();
      if (!tok) {
        toast.error("Inicia sesión para usar el asistente.");
        throw new Error("no_session");
      }

      /** Si el usuario envió otra petición, no descartar en silencio una respuesta ya lista. */
      const staleDrop = (partialReply?: string) => {
        if (myEpoch === requestEpochRef.current) return false;
        const t = partialReply?.trim();
        if (t) {
          appendMessageDeduped("ai", sanitizeUserFacingAiText(t));
          scrollChatToBottomSoon("auto");
        }
        return true;
      };

      let result: {
        reply: string;
        files: Array<{ name: string; language?: string; content: string }>;
        safeBuild?: SafeBuildMeta;
        validationBlocked?: boolean;
      };

      if (effectiveBuild && factoryMode && (activeProjectIdRef.current ?? projectId)) {
        result = await runFactoryBuild(
          instruction,
          myEpoch,
          raw,
          effectiveBuild,
          visualEditOn,
        );
      } else if (effectiveBuild && multiAgentMode && (activeProjectIdRef.current ?? projectId)) {
        result = await runMultiAgentWorkflow(
          instruction,
          myEpoch,
          raw,
          effectiveBuild,
          visualEditOn,
        );
      } else {
        await advancePipeline("generate", "generating");
        result = await requestGafcoreGeneration(
          tok,
          history,
          instruction,
          buildContextFiles,
          ac.signal,
          myEpoch,
          raw,
          { preferReliableJson: isSubstantiveBuildRequest(raw || coreText) },
        );
      }

      logPipelineEvent(
        "info",
        "chat.response",
        pipelineTraceMeta(
          {
            traceId: myEpoch,
            projectId: activeProjectIdRef.current ?? projectId,
            phase: "chat",
            pipelineRunId: pipelineRunIdRef.current,
          },
          {
            filesOut: result.files?.length ?? 0,
            validationBlocked: result.validationBlocked === true,
            safeBuildPhase: result.safeBuild?.phase ?? null,
          },
        ),
      );

      const unwrappedChat = unwrapGafcoreChatPayload(result.reply ?? "", result.files ?? []);
      result = {
        ...result,
        reply: unwrappedChat.reply,
        files: Array.isArray(unwrappedChat.files)
          ? (unwrappedChat.files as Array<{ name: string; language?: string; content: string }>)
          : result.files,
      };

      if (
        staleDrop(
          sanitizeUserFacingAiText(softenRoboticReply(raw, result.reply || "Listo.")),
        )
      ) {
        return;
      }

      let replyText = sanitizeUserFacingAiText(
        softenRoboticReply(raw, result.reply || "Listo."),
      );
      // Mostrar respuesta en cuanto la IA responde (no esperar personalización/reintentos).
      appendMessageDeduped("ai", replyText);
      scrollChatToBottomSoon("auto");
      setLoading(false);
      setStreamChars(null);

      if (effectiveBuild) {
        const sbPhase = result.safeBuild?.phase;
        setHealthPhase(
          sbPhase ? mapSafeBuildToHealthPhase(sbPhase) : "validating",
        );
      }

      const contextForDelivery = buildContextFiles.map((f) => ({
        name: f.name,
        language: f.language,
        content: f.content,
      }));

      let filesToApply: Array<{ name: string; language?: string; content: string }> = [];
      let generationValidationBlocked = result.validationBlocked === true;

      if (effectiveBuild) {
        let delivery = finalizeGafcoreBuildDelivery(
          raw || coreText,
          contextForDelivery,
          result.reply || "",
          result.files ?? [],
        );
        filesToApply = delivery.files;

        const needsCustomize = filesToApply.length > 0 && delivery.planOnly;

        if (
          filesToApply.length > 0 &&
          !needsCustomize &&
          !outputReplacesWelcome(contextForDelivery, filesToApply)
        ) {
          toast.message("Proyecto generado. Revisa la vista previa.", { duration: 6000 });
        }

        if (needsCustomize && myEpoch === requestEpochRef.current) {
          setLoading(true);
          toast.message("Personalizando proyecto con IA…", { duration: 8000 });
          const customizeInstruction = GAFCORE_CUSTOMIZE_AFTER_BOOTSTRAP_PREFIX + (raw || coreText);
          const customizeHistory: ChatMsg[] = [
            ...history,
            { role: "assistant", content: replyText },
            { role: "user", content: customizeInstruction },
          ];
          const customized = await requestGafcoreGeneration(
            tok,
            customizeHistory,
            customizeInstruction,
            buildContextFiles as FileItem[],
            ac.signal,
            myEpoch,
            raw || coreText,
            { preferReliableJson: true },
          );
          if (staleDrop(replyText)) return;
          generationValidationBlocked = customized.validationBlocked === true;
          delivery = finalizeGafcoreBuildDelivery(
            raw || coreText,
            filesToApply,
            customized.reply || "",
            customized.files ?? [],
          );
          filesToApply = delivery.files;
          replyText = sanitizeUserFacingAiText(
            softenRoboticReply(raw, customized.reply || `${replyText}\n\nProyecto personalizado.`),
          );
        } else if (filesToApply.length === 0) {
          setLoading(true);
          setHealthPhase("optimizing_design");
          const strictInstruction =
            FUNCTIONAL_FIRST_BUILD_PREFIX +
            GAFCORE_FORCE_FILES_BUILD_PREFIX +
            (raw || coreText);
          const strictRetry = await requestGafcoreGeneration(
            tok,
            [
              ...history,
              { role: "assistant", content: replyText },
              { role: "user", content: strictInstruction },
            ],
            strictInstruction,
            buildContextFiles,
            ac.signal,
            myEpoch,
            raw || coreText,
            { preferReliableJson: true },
          );
          if (staleDrop(replyText)) return;
          generationValidationBlocked = strictRetry.validationBlocked === true;
          delivery = finalizeGafcoreBuildDelivery(
            raw || coreText,
            contextForDelivery,
            strictRetry.reply || "",
            strictRetry.files ?? [],
          );
          filesToApply = delivery.files;
          replyText = sanitizeUserFacingAiText(
            softenRoboticReply(
              raw,
              strictRetry.reply || `${replyText}\n\nProyecto generado tras reintento.`,
            ),
          );
        }

        if (filesToApply.length === 0) {
          if (generationValidationBlocked) {
            toast.error(
              "La validación bloqueó los archivos generados (errores de sintaxis o estructura). Pide una versión más simple o revisa el mensaje de la IA.",
              { duration: 12_000 },
            );
          } else {
            toast.error(
              "No pude generar archivos. Prueba: «Crea landing de [tu negocio] con hero y formulario».",
              { duration: 12_000 },
            );
          }
        }
      } else if (Array.isArray(result.files) && result.files.length > 0) {
        filesToApply = result.files;
      }

      if (replyText.trim()) {
        appendMessageDeduped("ai", replyText);
        forceScrollToBottom();
        scrollChatToBottomSoon("auto");
        void persistMessage("assistant", replyText);
      }

      if (filesToApply.length > 0 && effectiveBuild) {
        const runFunctional = effectiveBuild && !visualEditOn;
        let { merged, issues } = await applyGenerationFiles(
          buildContextFiles,
          filesToApply,
          instruction,
          raw,
          {
            runFunctionalAudit: runFunctional,
            snapshotLabel: `auto: ${raw.slice(0, 60)}`,
          },
        );

        const appAfterBuild = merged.find((f) => /^app\.(tsx|jsx)$/i.test(f.name));
        const stillWelcomeTemplate =
          !!appAfterBuild &&
          isGafcoreDefaultTemplateApp(appAfterBuild.content) &&
          isSubstantiveBuildRequest(raw);
        if (stillWelcomeTemplate) {
          if (isPreviewAutofixAiEnabled()) {
            toast.message("Reemplazando pantalla de bienvenida por tu proyecto…", { duration: 8000 });
            scheduleRuntimeAutofixRef.current(
              `App.tsx sigue mostrando «Bienvenidos a GafCore». Reemplázala por el proyecto pedido: ${raw.slice(0, 300)}`,
            );
          } else {
            toast.message(
              "El preview sigue en plantilla de bienvenida. Escribe de nuevo qué proyecto quieres en el chat.",
              { duration: 10_000 },
            );
            offerGenerationRollback("El build no reemplazó la plantilla de bienvenida.");
          }
        } else {
          toast.success("Proyecto aplicado al preview", { duration: 5000 });
        }

        if (
          runFunctional &&
          shouldAutoRetryValidation(issues) &&
          !isVisualOnlyTweak(raw) &&
          !validationAutoRetryUsedRef.current
        ) {
          const canRetry =
            isAdmin ||
            isUnlimitedDaily ||
            isFairUseCreadorPlan ||
            balance >= COST_PER_REQUEST;
          if (!canRetry) {
            toast.error("Sin créditos para el reintento automático de corrección.");
          } else {
            validationAutoRetryUsedRef.current = true;
            toast.message("Corrigiendo validación (1 reintento automático)…", { duration: 5000 });
            setHealthPhase("fixing_error");
            await advancePipeline("retry", "retrying");
            const fixInstruction =
              FUNCTIONAL_FIRST_BUILD_PREFIX +
              buildValidationFixInstruction(issues, raw || coreText);
            const fixHistory: ChatMsg[] = [
              ...history,
              { role: "user", content: instruction },
              { role: "assistant", content: replyText },
            ];
            const retryResult = await requestGafcoreGeneration(
              tok,
              fixHistory,
              fixInstruction,
              merged,
              ac.signal,
              myEpoch,
              raw || coreText,
              { preferReliableJson: true },
            );
            if (myEpoch === requestEpochRef.current && retryResult.files?.length) {
              const retryReply = sanitizeUserFacingAiText(retryResult.reply || "Corregido.");
              appendMessageDeduped("ai", retryReply);
              scrollChatToBottomSoon("auto");
              void persistMessage("assistant", retryReply);
              const retryBatch = await applyGenerationFiles(
                merged,
                retryResult.files,
                fixInstruction,
                raw,
                { runFunctionalAudit: true },
              );
              merged = retryBatch.merged;
              issues = retryBatch.issues;
              if (!hasBlockingValidationIssues(issues)) {
                setLastError(issues.length > 0 ? formatValidationForUser(issues) : null);
                if (!pipelineRunIdRef.current) {
                  void persistValidationMemory(issues, true);
                }
                toast.success(
                  issues.length > 0
                    ? "Corrección aplicada (quedan avisos menores)"
                    : "Corrección de validación aplicada",
                );
              } else {
                const blockText = formatValidationForUser(
                  issues.filter((i) => i.severity === "error"),
                );
                if (isPreviewAutofixAiEnabled()) {
                  scheduleRuntimeAutofixRef.current(blockText);
                  toast.message("Aún hay errores; la IA está corrigiendo automáticamente…", {
                    description: issues[0]?.message,
                    duration: 8000,
                  });
                } else {
                  setLastError(blockText);
                  toast.warning("Hay errores de validación. Corrígelos en el chat o restaura una versión (reloj).", {
                    duration: 10_000,
                  });
                  offerGenerationRollback("La corrección automática dejó errores de validación.");
                }
              }
            }
          }
        } else if (issues.some((i) => i.severity === "error")) {
          const blockText = formatValidationForUser(
            issues.filter((i) => i.severity === "error"),
          );
          if (isPreviewAutofixAiEnabled()) {
            scheduleRuntimeAutofixRef.current(blockText);
            toast.message("Corrigiendo validación automáticamente…", {
              description: issues.find((i) => i.severity === "error")?.message,
              duration: 8000,
            });
          } else {
            setLastError(blockText);
          }
        } else if (effectiveBuild) {
          if (!issues.some((i) => i.severity === "error")) {
            setLastError(null);
          }
          toast.success("Build aplicado. Revisa el preview y publica cuando quieras.", {
            duration: 6000,
          });
          if (
            !hasBlockingValidationIssues(issues) &&
            !isBlockingPreviewError(lastErrorRef.current) &&
            !aiReplyNeedsUserInput(replyText)
          ) {
            scheduleGuideAfterBuild = true;
          }
        }
      }

      if (effectiveBuild && aiReplyNeedsUserInput(replyText)) {
        const paused = {
          ...guideAutopilotRef.current,
          active: true,
          paused: true,
          pauseReason: extractGuidePauseHint(replyText),
        };
        guideAutopilotRef.current = paused;
        setGuideAutopilotUi(paused);
        toast.message(`Guía en pausa: ${extractGuidePauseHint(replyText)}`, {
          description: "Responde abajo y pulsa Construir para continuar.",
          duration: 8000,
        });
        scheduleGuideAfterBuild = false;
      }
    } catch (error: any) {
      if (
        error?.name === "AbortError" ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        setStreamChars(null);
        setHealthPhase(null);
        setPipelineStatus(null);
        pipelineRunIdRef.current = null;
        toast.message("Solicitud detenida o cancelada por tiempo.");
        return;
      }
      if (myEpoch !== requestEpochRef.current) return;
      const msg = String(error?.message || "");
      if (
        msg.includes("INSUFFICIENT_CREDITS") ||
        msg.includes("insufficient_credits") ||
        /sin créditos|créditos.*agotad/i.test(msg)
      ) {
        setCreditsOut(true);
        appendMessageDeduped(
          "ai",
          "Te has quedado sin créditos de IA. Tus funciones de IA están en pausa hasta que recargues. Cada solicitud al asistente consume 1 crédito; los créditos se usan para pagar el costo del modelo de IA que responde tu mensaje. Recarga abajo para reactivar el asistente.",
        );
        scrollChatToBottomSoon("auto");
      } else {
        const errMsg = String(error?.message ?? "");
        const aiCfg =
          errMsg === "AI_NO_CONFIGURADA" ||
          errMsg.includes("ai_not_configured") ||
          /AI.*no.*configurad/i.test(errMsg);
        const streamHint = describeGafcoreStreamFailure(msg);
        // Mensaje al usuario SIEMPRE genérico: no exponemos nombres de proveedores ni de variables.
        const friendly = aiCfg
          ? "El asistente IA de GafCore no está disponible un momento. Estamos al tanto, inténtalo de nuevo en unos minutos."
          : (streamHint ?? "No pude responder en este momento. Inténtalo de nuevo.");
        if (aiCfg) {
          // Loguear detalle para devs sin mostrarlo al usuario.
          logClientWarn("gafcore-chat ai_not_configured", errMsg);
          toast.error("Asistente IA no disponible", { duration: 8_000 });
        }
        appendMessageDeduped("ai", sanitizeUserFacingAiText(friendly));
        scrollChatToBottomSoon("auto");
      }
    } finally {
      window.clearTimeout(chatTimeoutId);
      abortControllerRef.current = null;
      setStreamChars(null);
      sendInFlightRef.current = false;
      if (myEpoch === requestEpochRef.current) {
        setLoading(false);
        setHealthPhase(null);
        if (scheduleGuideAfterBuild && effectiveBuild && !guideAutopilotRef.current.paused) {
          const advanceGate = evaluateCoreOrchestrationGate({
            instruction: "",
            rawUserText: "",
            mode,
            factoryMode,
            multiAgentMode,
            visualEditOn,
            buildConfirmed: true,
            blockingError: lastErrorRef.current,
            validationBlocked: false,
          });
          if (!advanceGate.blockAutonomousAdvance) {
            scheduleGuideAutopilotAdvance();
          }
        }
      }
      refreshCredits();
    }
  };

  const empty = messages.length === 0;

  const nextSteps = useMemo(
    () =>
      getGafcoreChatNextSteps({
        messages,
        files: files.map((f) => ({ name: f.name, content: f.content })),
        mode,
        factoryMode,
        visualEditOn,
        multiAgentMode,
        factoryAutoDeploy,
        lastError,
        pipelineStatus,
        validationLabel,
      }),
    [
      messages,
      files,
      mode,
      factoryMode,
      visualEditOn,
      multiAgentMode,
      factoryAutoDeploy,
      lastError,
      pipelineStatus,
      validationLabel,
    ],
  );

  const openPinConvention = (content: string) => {
    setPinConventionBody(content);
    setPinConventionOpen(true);
  };

  return (
    <div className="grid h-full min-h-0 w-full max-w-full grid-rows-[auto_minmax(0,1fr)_auto_auto] overflow-hidden bg-background">
      <FixConventionDialog
        open={pinConventionOpen}
        onOpenChange={setPinConventionOpen}
        projectId={projectId}
        initialBody={pinConventionBody}
      />
      <div className="shrink-0 border-b border-border/60 px-2 py-1 max-md:overflow-hidden md:px-3 md:py-1.5">
        <div className="flex min-w-0 items-center justify-between gap-1.5 overflow-hidden">
          <span
            className="hidden min-w-0 flex-1 truncate text-[10px] font-semibold text-foreground sm:block md:text-[11px]"
            title={planDisplayLabel}
          >
            {planDisplayLabel}
          </span>
          {projectId ? (
            <Link
              to="/gafcore/settings/project"
              search={{ section: "memory" }}
              className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-primary"
              title="Memoria IA del proyecto"
            >
              <Brain className="h-3.5 w-3.5" />
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => user?.id && setCreditsOut(true)}
            className="group ml-auto inline-flex max-w-[min(100%,11rem)] shrink-0 items-center gap-1 overflow-hidden rounded-full border border-border/70 bg-muted/40 px-2 py-1 text-[11px] font-medium text-foreground/80 transition hover:border-primary/50 hover:bg-primary/10 hover:text-foreground sm:max-w-none sm:gap-1.5 sm:px-2.5"
            title="Créditos de IA disponibles. Click para recargar."
          >
            <Coins className="h-3 w-3 shrink-0 text-amber-400" />
            {creditsLoading || subLoading ? (
              <span className="text-foreground/75">…</span>
            ) : isAdmin ? (
              <span className="inline-flex min-w-0 items-center gap-1 truncate">
                <span className="font-semibold text-foreground max-sm:hidden">Administrador</span>
                <span className="font-semibold text-foreground sm:hidden">Admin</span>
                <span className="text-foreground/75 max-sm:hidden">·</span>
                <span className="truncate">Ilimitado</span>
              </span>
            ) : isFairUseCreadorPlan || isUnlimitedDaily ? (
              <span>Ilimitado</span>
            ) : (
              <>
                <span className="tabular-nums">{balance.toLocaleString()}</span>
                <span className="text-foreground/75">/</span>
                <span className="tabular-nums">{displayMonthly.toLocaleString()}</span>
                <span className="text-foreground/75">créditos</span>
              </>
            )}
            <span className="ml-1 hidden text-[10px] text-primary/80 group-hover:inline">
              + Recargar
            </span>
          </button>
        </div>
        {healthPhase && !loading ? (
          <div className="mt-1.5">
            <HealthStatus phase={healthPhase} />
          </div>
        ) : null}
        {pipelineStatus || validationLabel || factoryMode ? (
          <p
            className="mt-1 truncate text-[10px] text-muted-foreground"
            title={[factoryMode ? "Fábrica" : null, pipelineStatus, validationLabel]
              .filter(Boolean)
              .join(" · ")}
          >
            {[factoryMode ? "Fábrica" : null, pipelineStatus, validationLabel]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        {activeWorkflowRunId || backgroundWorkflowRunId || workflowTasks.length > 0 ? (
          <WorkflowTaskStrip
            className="mt-2"
            tasks={workflowTasks}
            planSummary={workflowPlanSummary}
            workflowState={workflowState}
            metrics={workflowMetrics}
            onCancel={
              activeWorkflowRunId || backgroundWorkflowRunId ? handleCancelWorkflow : undefined
            }
            cancelPending={workflowCancelPending}
          />
        ) : null}
        {!isAdmin ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="mt-2 h-8 w-full text-[12px] font-medium"
            onClick={() => setCreditsOut(true)}
          >
            Agregar créditos
          </Button>
        ) : null}
      </div>
      {/* Conversation */}
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
      >
        <div
          ref={messagesContentRef}
          className={`box-border w-full max-w-full min-w-0 px-3 py-4 sm:px-4 sm:py-5 ${isMobile ? "pb-4" : "pb-32"}`}
        >
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center pt-10 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="text-[15px] font-semibold tracking-tight">
                ¿Qué quieres construir hoy?
              </h2>
              <p className="mt-1 max-w-[280px] text-[12.5px] text-foreground/80">
                Describe en el chat qué app o sitio quieres construir y pulsa Construir.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl bg-muted px-3.5 py-2 text-[13px] leading-relaxed text-foreground whitespace-pre-wrap break-words">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="group flex flex-col gap-1.5">
                    <div className="flex gap-2">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-foreground whitespace-pre-wrap break-words">
                        {m.content}
                      </div>
                    </div>
                    {projectId && m.content.trim().length > 0 ? (
                      <div className="flex flex-wrap gap-1 pl-9">
                        <button
                          type="button"
                          onClick={() => openPinConvention(m.content)}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-foreground hover:border-primary/40 hover:bg-primary/10"
                        >
                          <BookmarkPlus className="h-3 w-3" />
                          Fijar convención
                        </button>
                      </div>
                    ) : null}
                  </div>
                ),
              )}
              {loading && (
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2.5">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex items-center gap-1.5 pt-1.5">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 pl-9">
                    <HealthStatus phase={healthPhase} />
                    {streamChars != null && streamChars > 0 && (
                      <p className="text-[11px] text-foreground/75">
                        Recibiendo respuesta… ~{Math.max(1, Math.round(streamChars / 1024))} KB texto
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} className="h-px w-full shrink-0 scroll-mb-28" aria-hidden />
        </div>
      </div>

      {/* Composer */}
      <div
        ref={composerSectionRef}
        className="z-10 w-full min-w-0 max-w-full shrink-0 border-t border-border/40 bg-background"
        style={{
          paddingBottom: isMobile
            ? "max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.875rem))"
            : "max(0.75rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="px-2 pt-2 sm:px-3">
        {lastError && (
          <div
            className={
              autoFixActive
                ? "mb-2 rounded-lg border border-primary/40 bg-primary/10 p-2.5 text-[12px]"
                : "mb-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-[12px]"
            }
          >
            <div className="flex items-start gap-2">
              {autoFixActive ? (
                <span className="mt-0.5 inline-block size-3 shrink-0 animate-pulse rounded-full bg-primary" />
              ) : (
                <span className="mt-0.5 text-destructive">⚠</span>
              )}
              <div className="flex-1 min-w-0">
                <p
                  className={
                    autoFixActive
                      ? "font-semibold text-primary"
                      : "font-semibold text-destructive"
                  }
                >
                  {autoFixActive ? "Auto-corrigiendo con IA…" : "Construcción fallida"}
                </p>
                <p
                  className={
                    autoFixActive
                      ? "mt-0.5 line-clamp-2 text-primary/80"
                      : "mt-0.5 line-clamp-2 text-destructive/80"
                  }
                >
                  {autoFixActive
                    ? "GafCore detectó un error de runtime y está reescribiendo el código. Esto toma 20-40 segundos."
                    : lastError}
                </p>
              </div>
            </div>
            {!autoFixActive && (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => {
                    setFiles((current) =>
                      sanitizeProjectJsxFiles(
                        current.map((f) =>
                          /\.(jsx|tsx|js|ts)$/i.test(f.name)
                            ? { ...f, content: repairCommonJsxSyntaxErrors(f.content) }
                            : f,
                        ),
                      ),
                    );
                    onCodeGenerated?.();
                    send(
                      `Arregla este error de runtime (React #31 u otro). NUNCA renderices objetos en JSX — usa .title/.label o JSX dentro del .map:\n\n\`\`\`\n${lastError}\n\`\`\``,
                    );
                    setLastError(null);
                  }}
                  className="rounded-md bg-destructive px-2.5 py-1 text-[11px] font-semibold text-destructive-foreground hover:opacity-90"
                >
                  Intenta arreglarlo
                </button>
                <button
                  type="button"
                  onClick={() => void resetProjectToBlank()}
                  className="rounded-md border border-primary/50 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/15"
                >
                  Empezar de cero
                </button>
                <button
                  onClick={() => setLastError(null)}
                  className="rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-muted"
                >
                  Descartar
                </button>
              </div>
            )}
          </div>
        )}
        {pendingComposerImages.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2 rounded-lg border border-border bg-muted/30 px-2 py-2">
            {pendingComposerImages.map((img) => (
              <div
                key={img.id}
                className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-background shadow-sm"
              >
                <img
                  src={img.previewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
                <button
                  type="button"
                  title="Quitar imagen"
                  aria-label="Quitar imagen adjunta"
                  className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-background/95 text-foreground shadow-sm ring-1 ring-border hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => removePendingComposerImage(img.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {pendingBuildConfirmation ? (
          <div className="mb-2 rounded-lg border border-primary/35 bg-primary/5 px-3 py-2.5">
            <p className="text-[11px] font-medium leading-snug text-foreground">
              Plan listo — confirma para comenzar la construcción
            </p>
            <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
              {pendingBuildConfirmation.raw}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                disabled={loading}
                onClick={() => confirmPendingBuildConfirmation()}
              >
                Comenzar construcción
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={loading}
                onClick={() => cancelPendingBuildConfirmation()}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
        <ChatNextStepSuggestions
          steps={nextSteps}
          disabled={loading}
          autopilotStatus={guideAutopilotStatusMessage(guideAutopilotUi)}
          onSelect={(step) => {
            if (loading) return;
            setInput(step.prompt);
            setComposerHighlight(true);
            window.setTimeout(() => setComposerHighlight(false), 2200);
            requestAnimationFrame(() => {
              composerSectionRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
              taRef.current?.focus();
              const el = taRef.current;
              if (el) {
                el.selectionStart = el.selectionEnd = step.prompt.length;
                el.scrollTop = el.scrollHeight;
              }
            });
          }}
        />
        <div
          className={`min-w-0 max-w-full rounded-2xl border bg-background shadow-sm transition focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15 ${
            composerHighlight
              ? "border-primary ring-2 ring-primary/25"
              : "border-border"
          }`}
        >
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              handleComposerPaste(e);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              mode === "chat"
                ? isMobile
                  ? "Pide crear o modificar algo…"
                  : "Pide a la IA que cree o modifique algo…"
                : deepModel
                  ? isMobile
                    ? "Modo profundo: describe el cambio…"
                    : "Modelo profundo activo: describe el cambio con detalle…"
                  : isMobile
                    ? "Describe tu idea…"
                    : "Pide a la IA que cree o modifique algo… (opcional: escribe [modo profundo] al inicio o activa el interruptor)"
            }
            rows={isMobile ? 2 : 3}
            className="box-border block w-full max-w-full min-w-0 resize-none border-0 bg-transparent px-3 pt-2.5 text-[13px] leading-relaxed text-foreground placeholder:text-foreground/55 focus:outline-none min-h-[52px] max-h-[200px] overflow-y-auto sm:min-h-[64px] sm:max-h-[320px] sm:px-3.5 sm:pt-3"
          />
          <div className="flex min-w-0 flex-col gap-1.5 px-2 pb-2 md:flex-row md:items-center md:justify-between md:gap-2">
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] md:flex-1 md:overflow-visible md:gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.txt,.md,.json,.js,.jsx,.mjs,.cjs,.ts,.tsx,.css,.html,.svg,.xml,.sql,.yaml,.yml,.env,.vue,.svelte,.png,.jpg,.jpeg,.webp,.gif,.bmp,.ico"
                className="hidden"
                onChange={handleAttachFile}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAttachImage}
              />
              <button
                type="button"
                title="Adjuntar archivo al proyecto"
                aria-label="Adjuntar archivo al proyecto"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground/70 hover:bg-muted hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Adjuntar imagen (foto)"
                aria-label="Adjuntar imagen"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground/70 hover:bg-muted hover:text-foreground"
                onClick={() => imageInputRef.current?.click()}
              >
                <ImageIcon className="h-3.5 w-3.5" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    title="Más opciones"
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-foreground/70 hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-60">
                  <DropdownMenuItem onSelect={() => onOpenSettings?.()}>
                    <SettingsIcon className="mr-2 h-4 w-4" />
                    <span className="flex-1">Ajustes</span>
                    <span className="text-xs text-foreground/70">Ctrl</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onOpenHistory?.()}>
                    <History className="mr-2 h-4 w-4" />
                    <span className="flex-1">Historia</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => window.open("/gafcore", "_blank", "noopener,noreferrer")}
                  >
                    <Info className="mr-2 h-4 w-4" />
                    <span className="flex-1">Centro GafCore</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      window.open("https://github.com/login", "_blank", "noopener,noreferrer")
                    }
                  >
                    <GitFork className="mr-2 h-4 w-4" />
                    <span className="flex-1">GitHub</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onOpenConnectors?.()}>
                    <Plug className="mr-2 h-4 w-4" />
                    <span className="flex-1">Conectores</span>
                    <ChevronRight className="h-4 w-4 text-foreground/70" />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setFactoryMode((v) => {
                        const next = !v;
                        try {
                          window.localStorage.setItem("gafcore_factory_mode", next ? "1" : "0");
                          if (next) {
                            window.localStorage.setItem("gafcore_multi_agent", "1");
                            window.localStorage.setItem("gafcore_multi_agent_bg", "0");
                          }
                        } catch {
                          /* */
                        }
                        if (next) {
                          setMultiAgentMode(true);
                          setMultiAgentBg(false);
                        }
                        toast.message(
                          next
                            ? "Modo Fábrica: plan → código → validación → diseño (un solo envío)."
                            : "Modo Fábrica desactivado.",
                        );
                        return next;
                      });
                    }}
                  >
                    <Factory className="mr-2 h-4 w-4" />
                    <span className="flex-1">Modo Fábrica</span>
                    {factoryMode ? (
                      <span className="text-[10px] font-medium text-primary">ON</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">OFF</span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!factoryMode}
                    onSelect={(e) => {
                      e.preventDefault();
                      if (!factoryMode) {
                        toast.message("Activa Modo Fábrica primero.");
                        return;
                      }
                      setFactoryAutoDeploy((v) => {
                        const next = !v;
                        try {
                          window.localStorage.setItem(
                            "gafcore_factory_auto_deploy",
                            next ? "1" : "0",
                          );
                        } catch {
                          /* */
                        }
                        toast.message(
                          next
                            ? "Al terminar la fábrica se publicará si pasa el gate de calidad."
                            : "Publicar automático desactivado (usa Publicar manual).",
                        );
                        return next;
                      });
                    }}
                  >
                    <Globe className="mr-2 h-4 w-4" />
                    <span className="flex-1">Fábrica → Publicar al terminar</span>
                    {factoryAutoDeploy ? (
                      <span className="text-[10px] font-medium text-primary">ON</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">OFF</span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={factoryMode}
                    onSelect={(e) => {
                      e.preventDefault();
                      if (factoryMode) {
                        toast.message("Desactiva Modo Fábrica para usar solo Multiagente.");
                        return;
                      }
                      setMultiAgentMode((v) => {
                        const next = !v;
                        try {
                          window.localStorage.setItem("gafcore_multi_agent", next ? "1" : "0");
                        } catch {
                          /* */
                        }
                        toast.message(
                          next
                            ? "Multiagente activado: el siguiente build usará planner + tareas."
                            : "Multiagente desactivado: chat directo.",
                        );
                        return next;
                      });
                    }}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    <span className="flex-1">Multiagente (beta)</span>
                    {multiAgentMode ? (
                      <span className="text-[10px] font-medium text-primary">ON</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">OFF</span>
                    )}
                  </DropdownMenuItem>
                  {multiAgentMode && workflowPacks.length > 0 ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled
                        className="text-xs text-muted-foreground focus:bg-transparent"
                      >
                        Pack workflow
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setSelectedWorkflowPackSlug(null);
                          toast.message("Multiagente: plan generado por IA");
                        }}
                      >
                        <span className="flex-1">Plan IA (sin pack)</span>
                        {!selectedWorkflowPackSlug ? (
                          <span className="text-[10px] font-medium text-primary">✓</span>
                        ) : null}
                      </DropdownMenuItem>
                      {workflowPacks.map((pack) => (
                        <DropdownMenuItem
                          key={pack.slug}
                          onSelect={() => {
                            setSelectedWorkflowPackSlug(pack.slug);
                            toast.message(`Pack: ${pack.name}`);
                          }}
                        >
                          <span className="flex-1 truncate">{pack.name}</span>
                          {selectedWorkflowPackSlug === pack.slug ? (
                            <span className="text-[10px] font-medium text-primary">✓</span>
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </>
                  ) : null}
                  <DropdownMenuItem
                    disabled={!multiAgentMode}
                    onSelect={(e) => {
                      e.preventDefault();
                      if (!multiAgentMode) {
                        toast.message("Activa Multiagente (beta) primero.");
                        return;
                      }
                      setMultiAgentBg((v) => {
                        const next = !v;
                        try {
                          window.localStorage.setItem("gafcore_multi_agent_bg", next ? "1" : "0");
                        } catch {
                          /* */
                        }
                        toast.message(
                          next
                            ? "Segundo plano: planifica y ejecuta sin bloquear el chat."
                            : "Segundo plano desactivado: ejecución síncrona por olas.",
                        );
                        return next;
                      });
                    }}
                  >
                    <GitFork className="mr-2 h-4 w-4" />
                    <span className="flex-1">Multiagente en 2º plano</span>
                    {multiAgentBg ? (
                      <span className="text-[10px] font-medium text-primary">ON</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">OFF</span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void handleScreenshot()}>
                    <ImageIcon className="mr-2 h-4 w-4" />
                    <span className="flex-1">Toma una captura de pantalla</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      imageInputRef.current?.click();
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    <span className="flex-1">Agregar referencia</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }}
                  >
                    <Folder className="mr-2 h-4 w-4" />
                    <span className="flex-1">Adjuntar</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {aiPluginNames.length > 0 ? (
                <Link
                  to="/gafcore/settings/project"
                  search={{ section: "marketplace" }}
                  className="hidden h-7 max-w-[11rem] items-center gap-1 truncate rounded-full border border-primary/30 bg-primary/5 px-2.5 text-[11px] font-medium text-foreground hover:bg-primary/10 sm:inline-flex"
                  title={`Plugins IA activos: ${aiPluginNames.join(", ")}`}
                >
                  <Sparkles className="h-3 w-3 shrink-0 text-primary" />
                  <span className="truncate">{aiPluginNames[0]}</span>
                  {aiPluginNames.length > 1 ? (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      +{aiPluginNames.length - 1}
                    </span>
                  ) : null}
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setDeepModel((v) => {
                    const next = !v;
                    toast[next ? "success" : "message"](
                      next
                        ? "Modelo profundo: más calidad y detalle (puede tardar un poco más)."
                        : "Modelo profundo desactivado.",
                    );
                    return next;
                  });
                }}
                disabled={mode === "chat"}
                className={
                  "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 sm:px-2.5 " +
                  (deepModel
                    ? "border-primary bg-primary/10 text-foreground shadow-[0_0_0_3px_hsl(var(--primary)/0.2)] ring-1 ring-primary"
                    : "border-border bg-background text-foreground hover:bg-muted")
                }
                title={
                  mode === "chat"
                    ? "Modelo profundo solo en modo Construir"
                    : "Activa el modelo más capaz (más lento/caro). También puedes escribir [modo profundo] al inicio del mensaje."
                }
                aria-label={deepModel ? "Modelo profundo activado" : "Activar modelo profundo"}
              >
                <Brain className="h-3 w-3 shrink-0" />
                <span className="hidden sm:inline">Profundo</span>
                {deepModel && <span className="text-[10px] font-semibold sm:ml-0.5">ON</span>}
              </button>
              <button
                type="button"
                onClick={() => {
                  setVisualEditOn((v) => {
                    const next = !v;
                    toast[next ? "success" : "message"](
                      next
                        ? "Ediciones visuales activadas: la IA solo cambiará UI/estilos."
                        : "Ediciones visuales desactivadas.",
                    );
                    return next;
                  });
                }}
                className={
                  "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-[12px] font-medium transition sm:px-2.5 " +
                  (visualEditOn
                    ? "border-primary bg-primary text-primary-foreground shadow-[0_0_0_3px_hsl(var(--primary)/0.25)] ring-1 ring-primary"
                    : "border-border bg-background text-foreground hover:bg-muted")
                }
                title="Activar/Desactivar ediciones visuales"
                aria-label={visualEditOn ? "Ediciones visuales activadas" : "Activar ediciones visuales"}
              >
                <Pencil className="h-3 w-3 shrink-0" />
                <span className="hidden sm:inline">Ediciones visuales</span>
                {visualEditOn && <span className="text-[10px] font-semibold sm:ml-1">ON</span>}
              </button>
            </div>

            <div className="flex w-full shrink-0 items-center justify-end gap-1 md:w-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={
                      "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium transition sm:h-7 " +
                      (mode === "chat"
                        ? "border-blue-500 bg-blue-500 text-white shadow-[0_0_0_3px_rgb(59_130_246/0.25)]"
                        : "border-primary bg-primary text-primary-foreground shadow-[0_0_0_3px_hsl(var(--primary)/0.25)]")
                    }
                    title="Modo de respuesta"
                  >
                    {mode === "build" ? "Construir" : "Chatear"}
                    {mode === "build" && factoryMode ? (
                      <span className="max-w-[4.5rem] truncate rounded-full bg-primary-foreground/20 px-1.5 text-[9px] font-semibold leading-tight">
                        Fábrica
                      </span>
                    ) : null}
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="w-44">
                  <DropdownMenuItem
                    onClick={() => {
                      setMode("build");
                      toast.success("Modo Construir");
                    }}
                  >
                    <span className="flex-1">Construir</span>
                    {mode === "build" && <span className="text-primary">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setMode("chat");
                      toast.success("Modo Chatear");
                    }}
                  >
                    <span className="flex-1">Chatear</span>
                    {mode === "chat" && <span className="text-primary">✓</span>}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                onClick={toggleMic}
                title={recording ? "Detener dictado" : "Dictado por voz"}
                className={
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition sm:h-7 sm:w-7 " +
                  (recording
                    ? "bg-red-500/15 text-red-500 animate-pulse"
                    : "text-foreground/75 hover:bg-muted hover:text-foreground")
                }
              >
                <Mic className="h-3.5 w-3.5" />
              </button>
              <Button
                size="icon"
                onClick={() => {
                  if (loading) {
                    abortControllerRef.current?.abort();
                    requestEpochRef.current += 1;
                    sendInFlightRef.current = false;
                    setLoading(false);
                    setStreamChars(null);
                    setPipelineStatus(null);
                    pipelineRunIdRef.current = null;
                    toast.message("Solicitud cancelada — ya puedes escribir de nuevo.");
                    return;
                  }
                  send();
                }}
                disabled={!loading && !input.trim()}
                className="h-9 w-9 shrink-0 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-40 sm:h-7 sm:w-7"
                title={loading ? "Detener / descartar respuesta pendiente" : "Enviar"}
                aria-label={loading ? "Detener" : "Enviar"}
              >
                {loading ? (
                  <Square className="h-3 w-3 fill-current" />
                ) : (
                  <ArrowUp className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
        </div>
      </div>
      <CreditsOutModal
        open={creditsOut}
        onOpenChange={setCreditsOut}
        userId={user?.id}
        userEmail={user?.email}
        reason="insufficient"
        returnUrl={
          typeof window !== "undefined"
            ? `${window.location.origin}/gafcore/app?credits=success&session_id={CHECKOUT_SESSION_ID}`
            : "/gafcore/app"
        }
      />
    </div>
  );
}


