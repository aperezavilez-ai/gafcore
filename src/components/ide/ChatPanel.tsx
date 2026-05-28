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
import { FixConventionDialog } from "@/components/ide/FixConventionDialog";
import { ChatNextStepSuggestions } from "@/components/ide/ChatNextStepSuggestions";
import { getGafcoreChatNextSteps } from "@/lib/gafcore-chat-suggestions.shared";
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
import type { FactoryRunResult } from "@/lib/gafcore-factory.shared";
import {
  FACTORY_PROFILE_AUTO_ID,
  listFactoryProfileSelectorOptions,
} from "@/lib/gafcore-factory-templates.shared";

const FACTORY_PROFILE_OPTIONS = listFactoryProfileSelectorOptions();
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
  isConversationalOnly,
  isSubstantiveBuildRequest,
  isVisualOnlyTweak,
  softenRoboticReply,
  userWantsHeroBackgroundChange,
  buildLiteralVisualChangePrefix,
} from "@/lib/gafcore-chat-intent.shared";
import { formatValidationScoreShort } from "@/validation/runner";
import { parseJsonLoose } from "@/lib/gafcore-json-loose.shared";
import { classifyUserIntent } from "@/orchestrator/intent.classifier";
import { selectTemplateSlug } from "@/orchestrator/template.selector";
import { ChatJourneyStrip } from "@/components/ide/ChatJourneyStrip";
import { deriveGafcoreJourneyPhase } from "@/lib/gafcore-journey-phase.shared";
import type { ProjectDeployStatus } from "@/lib/gafcore-deploy.shared";
import { BUILTIN_PROJECT_TEMPLATES } from "@/lib/gafcore-templates.shared";

type Msg = { role: "user" | "ai"; content: string; ts?: number };

/** Evita chat/preview “trabado” si el stream o la validación no terminan. */
const CHAT_REQUEST_TIMEOUT_MS = 180_000;

type PendingComposerImage = { id: string; previewUrl: string; fileName: string };

function filesFromBuiltinTemplateByInstruction(
  instruction: string,
): Array<{ name: string; language?: string; content: string }> {
  const intent = classifyUserIntent(instruction, { mode: "build", visualEdit: false });
  const slug = selectTemplateSlug(intent);
  const tpl = BUILTIN_PROJECT_TEMPLATES.find((t) => t.slug === slug);
  if (!tpl?.files?.length) return [];
  return tpl.files.map((f) => ({
    name: f.name.replace(/^src\//i, "").replace(/^public\//i, ""),
    language: f.language,
    content: f.content,
  }));
}

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
  if (message === "project_not_found") {
    return "No se encontró el proyecto abierto. Recarga la página o elige otro proyecto.";
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

function dataUrlFromImageFileViaCanvas(
  file: File,
  maxEdge: number,
  quality: number,
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
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
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

async function compressChatImageFile(file: File): Promise<string> {
  let q = 0.82;
  let edge = 1280;
  for (let attempt = 0; attempt < 7; attempt++) {
    const dataUrl = await dataUrlFromImageFileViaCanvas(file, edge, q);
    if (dataUrl.length <= CHAT_IMAGE_DATA_URL_MAX_CHARS) return dataUrl;
    q = Math.max(0.38, q - 0.1);
    edge = Math.round(edge * 0.78);
  }
  return dataUrlFromImageFileViaCanvas(file, 512, 0.38);
}

export function ChatPanel({
  files,
  setFiles,
  onCodeGenerated,
  onOpenSettings,
  onOpenHistory,
  onOpenConnectors,
  onOpenPublish,
  projectId,
  projectName,
  deployLiveStatus = "idle",
  deploySiteHost = null,
}: {
  files: FileItem[];
  setFiles: Dispatch<SetStateAction<FileItem[]>>;
  onCodeGenerated?: () => void;
  onOpenSettings?: () => void;
  onOpenHistory?: () => void;
  onOpenConnectors?: () => void;
  onOpenPublish?: () => void;
  projectId?: string | null;
  projectName?: string | null;
  deployLiveStatus?: ProjectDeployStatus;
  deploySiteHost?: string | null;
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
  const [factoryProfileId, setFactoryProfileId] = useState(() => {
    if (typeof window === "undefined") return FACTORY_PROFILE_AUTO_ID;
    try {
      return localStorage.getItem("gafcore_factory_profile") || FACTORY_PROFILE_AUTO_ID;
    } catch {
      return FACTORY_PROFILE_AUTO_ID;
    }
  });
  const [validationLabel, setValidationLabel] = useState<string | null>(null);
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
    if (!projectId || !user?.id) return;
    markLocalEcho(role, content);
    try {
      await supabase.from("chat_messages").insert({
        project_id: projectId,
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
    if (!projectId || !user?.id || generated.length === 0) {
      return { ok: false, detail: "no_project" };
    }
    const { upsertSingleProjectFile } = await import("@/lib/userSupabase");
    for (const f of generated) {
      const r = await upsertSingleProjectFile(projectId, {
        name: f.name,
        language: f.language ?? "typescript",
        content: f.content,
      });
      if (!r.ok) return r;
    }
    return { ok: true };
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
      const dataUrl = await compressChatImageFile(file);
      if (dataUrl.length > CHAT_IMAGE_DATA_URL_MAX_CHARS + 500) {
        toast.error(
          "La imagen sigue siendo demasiado grande tras comprimir. Prueba otra más pequeña.",
        );
        return;
      }
      const relName = `assets/gafcore-ref-${Date.now()}.jpg`;
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
              new File([blob], "pegado.jpg", { type: blob.type || "image/jpeg" }),
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

      const errKey = msg.slice(0, 120);
      const looksLikeJsxGlue =
        /SyntaxError|Unexpected token/i.test(msg) ||
        /"[^"]*"(https?:\/\/)/.test(msg);
      const looksLikeObjectChild =
        /Objects are not valid as a React child/i.test(msg) ||
        /Minified React error #31/i.test(msg) ||
        /error #31/i.test(msg);
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

      // 1) Auto-repair LOCAL (rápido, gratis): sintaxis rota o React #31 (objeto en JSX).
      if (looksLikeJsxGlue || looksLikeObjectChild) {
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
                looksLikeObjectChild
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
        if (looksLikeObjectChild) {
          setFiles((current) => {
            const next = sanitizeProjectJsxFiles(current);
            const changed = next.some((f, i) => f.content !== current[i]?.content);
            if (changed) return next;
            return next.map((f) => ({ ...f }));
          });
          queueMicrotask(() => {
            onCodeGenerated?.();
            toast.message("Recargando preview con protección anti-error #31…", { duration: 4000 });
          });
          return;
        }
        if (looksLikeJsxGlue) {
          setLastError(msg);
          return;
        }
      }

      // 2) Cualquier otro error de runtime: intentar auto-fix con IA (máx. 1 por sesión).
      setLastError(msg);

      const alreadyTried = autoFixAttemptedErrorsRef.current.has(errKey);
      const canAutoFix =
        !autoFixInFlightRef.current &&
        !sendInFlightRef.current &&
        !alreadyTried &&
        autoFixSessionCountRef.current < 3 &&
        Boolean(projectId) &&
        files.length > 0 &&
        !/No se pudo cargar:|Failed to load|404|net::ERR/i.test(msg);

      if (!canAutoFix) return;

      autoFixAttemptedErrorsRef.current.add(errKey);
      autoFixSessionCountRef.current += 1;
      autoFixInFlightRef.current = true;
      setAutoFixActive(true);
      void (async () => {
        const toastId = toast.loading("Corrigiendo error del preview con IA…", {
          duration: 90_000,
        });
        try {
          const tok = await getAuthAccessToken();
          if (!tok) {
            toast.dismiss(toastId);
            return;
          }
          const fixInstruction = [
            "El preview del proyecto falla con este error de runtime:",
            "",
            "```",
            msg.slice(0, 800),
            "```",
            "",
            "Corrige el código para que el preview funcione. Reglas críticas:",
            "- React error #31 = renderizar un objeto en JSX. NUNCA hagas `<div>{obj}</div>`",
            "  con un objeto literal. Accede a sus campos: `<div>{obj.title}</div>`.",
            "- Cuando mapees listas de objetos, devuelve JSX dentro del map, NO el objeto:",
            "  `items.map(it => <Card key={it.id}>{it.label}</Card>)`.",
            "- Los nombres de iconos de `lucide-react` deben ser válidos. Si dudas, usa",
            "  `Sparkles`, `Zap`, `Star`, `Heart`, `StickyNote`, `Settings`, `Mail`, `Check`.",
            "- Todo `<a>` debe tener `href` real. Todo `<button onClick>` lógica real.",
            "- `LucideIcon`, `LucideProps`, `IconNode` solo como `type` import.",
            "- Devuelve los archivos COMPLETOS (no parches, no fragmentos).",
          ].join("\n");

          const result = await fetchGafcoreChatComplete(
            tok,
            [],
            fixInstruction,
            files,
            new AbortController() as unknown as AbortSignal,
            fixInstruction,
          );
          if (Array.isArray(result.files) && result.files.length > 0) {
            await applyGenerationFiles(
              files,
              repairGeneratedSourceFiles(result.files),
              fixInstruction,
              fixInstruction,
              {
              runFunctionalAudit: false,
              snapshotLabel: `auto-fix preview: ${msg.slice(0, 40)}`,
            });
            toast.dismiss(toastId);
            toast.success("Error del preview corregido automáticamente", { duration: 5000 });
            setLastError(null);
          } else {
            toast.dismiss(toastId);
            toast.warning("No se pudo auto-corregir. Usa 'Intenta arreglarlo' o describe el cambio.", {
              duration: 7000,
            });
          }
        } catch (e) {
          console.warn("[gafcore-autofix-preview]", e);
          toast.dismiss(toastId);
        } finally {
          autoFixInFlightRef.current = false;
          setAutoFixActive(false);
        }
      })();
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
    if (options.snapshotLabel) {
      try {
        const { createSnapshot } = await import("@/lib/userSupabase");
        void createSnapshot(baseFiles, options.snapshotLabel);
      } catch {
        /* */
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
    const merged = sanitizeProjectJsxFiles(mergeGeneratedFiles(baseFiles, outFiles));
    setFiles(merged);
    const toPersist = outFiles.map((o) => merged.find((m) => m.name === o.name) ?? o);
    void syncFilesToDb(toPersist);
    onCodeGenerated?.();

    try {
      const v = await callValidateSources({
        data: toPersist.map((f) => ({ name: f.name, content: f.content })),
      });
      if (!v.ok && Array.isArray(v.errors) && v.errors.length > 0) {
        setLastError(v.errors.map((e) => `${e.name}: ${e.message}`).join("\n"));
      }
    } catch {
      /* */
    }

    let issues: ProjectValidationIssue[] = [];
    let mergedForReturn = merged;
    if (options.runFunctionalAudit) {
      const validation = await runProjectValidation(merged);
      issues = validation.issues;
      if (validation.patchedFiles?.length) {
        mergedForReturn = mergeGeneratedFiles(merged, validation.patchedFiles);
        setFiles(mergedForReturn);
        void syncFilesToDb(
          validation.patchedFiles.map((f) => ({
            name: f.name,
            content: f.content,
            language: f.language,
          })),
        );
      }
      if (issues.length > 0) {
        const blocking = issues.filter((i) => i.severity === "error");
        const warnings = issues.filter((i) => i.severity !== "error");
        if (blocking.length > 0) {
          const text = formatValidationForUser(blocking);
          setLastError((prev) =>
            prev ? `${prev}\n\n[Validación GafCore]\n${text}` : `[Validación GafCore]\n${text}`,
          );
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
      console.error("[workflow] cancel:", e);
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
        console.error("[workflow-bg] poll:", e);
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
        ...(projectId ? { projectId } : {}),
      }),
      signal: ac.signal,
    });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok || ct.includes("text/html")) {
      let errCode = `HTTP ${res.status}`;
      try {
        if (!ct.includes("text/html")) {
          const ej = (await res.json()) as { error?: string };
          if (ej?.error === "insufficient_credits") errCode = "INSUFFICIENT_CREDITS";
          else if (ej?.error === "ai_not_configured") errCode = "AI_NO_CONFIGURADA";
          else if (ej?.error === "rate_limited") errCode = "rate_limited";
          else if (ej?.error === "project_not_found") errCode = "project_not_found";
          else if (res.status === 429) errCode = "rate_limited";
          else if (typeof ej?.error === "string") errCode = ej.error;
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
    };
    return {
      reply: softenRoboticReply(userTextForTone, typeof j.reply === "string" ? j.reply : "Listo."),
      files: Array.isArray(j.files) ? j.files : [],
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
  ): Promise<{
    reply: string;
    files: Array<{ name: string; language?: string; content: string }>;
  }> => {
    const chatPayload = {
      history,
      instruction,
      files: contextFiles,
      ...(projectId ? { projectId } : {}),
    };
    try {
      const res = await fetch("/api/gafcore/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${tok}`,
        },
        body: JSON.stringify(chatPayload),
        signal: ac.signal,
      });

      const ct = res.headers.get("content-type") || "";

      if (ct.includes("text/html")) {
        return fetchGafcoreChatComplete(
          tok,
          history,
          instruction,
          contextFiles,
          ac,
          userTextForTone,
        );
      }

      if (!res.ok) {
        let errCode = `HTTP ${res.status}`;
        try {
          const ej = (await res.json()) as { error?: string; detail?: string };
          if (ej?.error === "insufficient_credits") errCode = "INSUFFICIENT_CREDITS";
          else if (ej?.error === "ai_not_configured") errCode = "AI_NO_CONFIGURADA";
          else if (ej?.error === "rate_limited") errCode = "rate_limited";
          else if (ej?.error === "project_not_found") errCode = "project_not_found";
          else if (ej?.error === "invalid_body")
            errCode = "Petición inválida (revisa el texto o archivos).";
          else if (ej?.error === "upstream") errCode = `UPSTREAM:${res.status}`;
          else if (ej?.error === "credits_error") errCode = "CREDITS_VERIFY_FAILED";
          else if (ej?.error === "no_stream_body") errCode = "NO_STREAM_BODY";
          else if (res.status === 429) errCode = "rate_limited";
          else if (typeof ej?.error === "string") errCode = ej.error;
          else if (res.status === 500 && ej?.detail)
            errCode = `Error del servidor: ${String(ej.detail).slice(0, 200)}`;
        } catch {
          /* */
        }
        throw new Error(errCode);
      }

      if (ct.includes("application/json")) {
        const j = (await res.json()) as {
          reply?: string;
          files?: Array<{ name: string; language?: string; content: string }>;
        };
        const replyRaw = typeof j.reply === "string" ? j.reply : "Listo.";
        return {
          reply: softenRoboticReply(userTextForTone, replyRaw),
          files: Array.isArray(j.files) ? j.files : [],
        };
      }

      const text = await readSseJsonPayload(res, ac?.signal, (n) => {
        if (myEpoch === requestEpochRef.current) setStreamChars(n);
      });
      // Tolerante: el modelo a veces envuelve el JSON en ```json ... ``` o prepone texto.
      const parsed = parseJsonLoose<{ reply?: string; files?: unknown }>(text || "{}") ?? {};
      const rawFiles = Array.isArray(parsed.files) ? parsed.files : [];
      const replyRaw = typeof parsed.reply === "string" ? parsed.reply : "Listo.";
      return {
        reply: softenRoboticReply(userTextForTone, replyRaw),
        files: rawFiles as Array<{ name: string; language?: string; content: string }>,
      };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if ((err as Error)?.name === "AbortError") throw err;
      const msg = String((err as Error)?.message || "");
      if (
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("HTML_RESPONSE") ||
        msg.startsWith("HTTP 5")
      ) {
        try {
          return await fetchGafcoreChatComplete(
            tok,
            history,
            instruction,
            contextFiles,
            ac,
            userTextForTone,
          );
        } catch (fallbackErr) {
          if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
            return callGafcoreChat({
              data: {
                history,
                instruction,
                files: contextFiles as any,
                ...(projectId ? { projectId } : {}),
              },
            });
          }
          throw fallbackErr;
        }
      }
      throw err;
    }
  };

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

    if (factoryRes.templateProfile) {
      toast.message(`Plantilla fábrica: ${factoryRes.templateProfile.label}`, { duration: 4000 });
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

  const send = async (text?: string) => {
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

    const functionalPrefix =
      effectiveBuild && !visualEditOn ? FUNCTIONAL_FIRST_BUILD_PREFIX : "";
    const preservePrefix =
      effectiveBuild && !visualEditOn ? buildPreserveExistingPrefix(files.length) : "";
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
    const instruction =
      conversationalPrefix +
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
    sendInFlightRef.current = true;
    setLoading(true);
    const myEpoch = ++requestEpochRef.current;
    setInput("");
    setPendingComposerImages([]);
    const userDisplay = [raw, pendingSnapshot.length > 0 ? `📎 ${pendingSnapshot.length} imagen` : ""]
      .filter(Boolean)
      .join("\n");
    const userBubble = userDisplay || "📎 Imagen de referencia";
    stickToBottomRef.current = true;
    appendMessageDeduped("user", userBubble);
    stickToBottomRef.current = true;
    forceScrollToBottom();
    scrollChatToBottomSoon("auto");
    void persistMessage("user", userBubble);
    if (effectiveBuild && projectId) void startPipelineRun(instruction);
    if (effectiveBuild && files.length > 0) {
      void (async () => {
        try {
          const { createSnapshot } = await import("@/lib/userSupabase");
          await createSnapshot(files, `antes: ${(raw || "build").slice(0, 48)}`);
        } catch {
          /* best-effort */
        }
      })();
    }
    setStreamChars(null);
    const ac = new AbortController();
    abortControllerRef.current = ac;
    const chatTimeoutId = window.setTimeout(() => {
      if (!sendInFlightRef.current) return;
      ac.abort();
      toast.error("La solicitud tardó demasiado. Pulsa el cuadrado (detener) o envía de nuevo.", {
        duration: 8000,
      });
    }, CHAT_REQUEST_TIMEOUT_MS);
    try {
      const history: ChatMsg[] = [
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

      let result: {
        reply: string;
        files: Array<{ name: string; language?: string; content: string }>;
      };

      if (effectiveBuild && factoryMode && projectId) {
        result = await runFactoryBuild(
          instruction,
          myEpoch,
          raw,
          effectiveBuild,
          visualEditOn,
        );
      } else if (effectiveBuild && multiAgentMode && projectId) {
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
          files,
          ac.signal,
          myEpoch,
          raw,
        );
      }

      if (myEpoch !== requestEpochRef.current) return;

      let replyText = sanitizeUserFacingAiText(
        softenRoboticReply(raw, result.reply || "Listo."),
      );
      setStreamChars(null);

      let filesToApply = repairGeneratedSourceFiles(result.files ?? []);
      if (effectiveBuild && filesToApply.length === 0) {
        const localPatch = patchProjectFilesVisually(
          files.map((f) => ({ name: f.name, language: f.language, content: f.content })),
          instruction,
        );
        if (localPatch.length > 0) {
          filesToApply = localPatch;
          replyText = sanitizeUserFacingAiText(
            `${replyText}\n\nApliqué el fondo de ciudad en ${localPatch.map((f) => f.name).join(", ")} (parche local; la IA no envió archivos).`,
          );
          toast.success("Fondo de ciudad aplicado en el preview", { duration: 5000 });
        } else if (userWantsHeroBackgroundChange(raw) || /cambia|modifica|añade|agrega|aplica/i.test(raw)) {
          toast.error("No encontré App.tsx/JSX para parchear. Abre Código y confirma que existe App.tsx.", {
            duration: 10_000,
          });
        } else if (isSubstantiveBuildRequest(raw)) {
          const strictInstruction =
            FUNCTIONAL_FIRST_BUILD_PREFIX +
            "[modo build estricto] Debes devolver `files` con proyecto funcional completo. " +
            "Si no hay cambios, reescribe App.tsx y main.tsx igualmente para inicializar el proyecto. " +
            "Prohibido responder con files vacío.\n\n" +
            (raw || coreText);
          const strictHistory: ChatMsg[] = [
            ...history,
            { role: "assistant", content: replyText },
            { role: "user", content: strictInstruction },
          ];
          const strictRetry = await requestGafcoreGeneration(
            tok,
            strictHistory,
            strictInstruction,
            files,
            ac.signal,
            myEpoch,
            raw || coreText,
          );
          const strictFiles = repairGeneratedSourceFiles(strictRetry.files ?? []);
          if (strictFiles.length > 0) {
            filesToApply = strictFiles;
            replyText = sanitizeUserFacingAiText(
              strictRetry.reply ||
                `${replyText}\n\nApliqué un reintento automático estricto y ya generé archivos.`,
            );
            toast.success("Proyecto generado tras reintento automático", { duration: 6000 });
          } else {
            const bootstrapFiles = filesFromBuiltinTemplateByInstruction(raw || coreText);
            if (bootstrapFiles.length > 0) {
              filesToApply = bootstrapFiles;
              replyText = sanitizeUserFacingAiText(
                `${replyText}\n\nInicialicé automáticamente una base funcional del proyecto para evitar bloqueo. Ahora sigue pidiendo ajustes y funciones.`,
              );
              toast.message("Inicialicé base del proyecto para desbloquear el build", {
                duration: 8000,
              });
            } else {
              toast.error(
                "El cerebro respondió sin archivos. Intenta de nuevo con un prompt más corto y claro (ej: 'Crea la landing de X').",
                { duration: 12_000 },
              );
              replyText = sanitizeUserFacingAiText(
                `${replyText}\n\nNo recibí archivos generados en dos intentos automáticos.`,
              );
            }
          }
        }
      }

      appendMessageDeduped("ai", replyText);
      forceScrollToBottom();
      scrollChatToBottomSoon("auto");
      void persistMessage("assistant", replyText);

      if (filesToApply.length > 0 && effectiveBuild) {
        const runFunctional = effectiveBuild && !visualEditOn;
        let { merged, issues } = await applyGenerationFiles(files, filesToApply, instruction, raw, {
          runFunctionalAudit: runFunctional,
          snapshotLabel: `auto: ${raw.slice(0, 60)}`,
        });

        if (
          runFunctional &&
          shouldAutoRetryValidation(issues) &&
          !isVisualOnlyTweak(raw)
        ) {
          const canRetry =
            isAdmin ||
            isUnlimitedDaily ||
            isFairUseCreadorPlan ||
            balance >= COST_PER_REQUEST;
          if (!canRetry) {
            toast.error("Sin créditos para el reintento automático de corrección.");
          } else {
            toast.message("Corrigiendo validación (1 reintento automático)…", { duration: 5000 });
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
                toast.message("Aún hay errores tras el reintento automático", {
                  description: issues[0]?.message,
                });
              }
            }
          }
        } else if (issues.some((i) => i.severity === "error")) {
          toast.message("Revisa validación del proyecto", {
            description: issues.find((i) => i.severity === "error")?.message,
            duration: 8000,
          });
        } else if (effectiveBuild) {
          const publishGuide =
            "✅ Build aplicado. Siguiente paso recomendado:\n" +
            "1) Prueba la vista previa y corrige detalles visuales/funcionales.\n" +
            "2) Cuando quede listo, pulsa **Publicar** para llevarlo a producción.\n" +
            "3) Si algo falla al publicar, te ayudo a corregir y reintentar.";
          appendMessageDeduped("ai", publishGuide);
          scrollChatToBottomSoon("auto");
          void persistMessage("assistant", publishGuide);
        }
      }
    } catch (error: any) {
      if (
        error?.name === "AbortError" ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        setStreamChars(null);
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
          console.warn("[gafcore-chat] ai_not_configured:", errMsg);
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
      }
      refreshCredits();
    }
  };

  const empty = messages.length === 0;

  const workflowActive = Boolean(
    activeWorkflowRunId || backgroundWorkflowRunId || workflowTasks.length > 0,
  );

  const journeyPhase = useMemo(
    () =>
      deriveGafcoreJourneyPhase({
        files: files.map((f) => ({ name: f.name, content: f.content })),
        loading,
        autoFixActive,
        pipelineStatus,
        validationLabel,
        lastError,
        workflowActive,
        deployStatus: deployLiveStatus,
        deploySiteHost: deploySiteHost ?? null,
      }),
    [
      files,
      loading,
      autoFixActive,
      pipelineStatus,
      validationLabel,
      lastError,
      workflowActive,
      deployLiveStatus,
      deploySiteHost,
    ],
  );

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
    <div className="grid h-full min-h-0 w-full max-w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-background">
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
        {pipelineStatus || validationLabel || (factoryMode && factoryProfileId) ? (
          <p
            className="mt-1 truncate text-[10px] text-muted-foreground"
            title={[
              factoryMode
                ? `Fábrica · ${FACTORY_PROFILE_OPTIONS.find((o) => o.id === factoryProfileId)?.label ?? "Auto"}`
                : null,
              pipelineStatus,
              validationLabel,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            {[
              factoryMode
                ? `Fábrica: ${FACTORY_PROFILE_OPTIONS.find((o) => o.id === factoryProfileId)?.label ?? "Auto"}`
                : null,
              pipelineStatus,
              validationLabel,
            ]
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
        {projectId ? (
          <ChatJourneyStrip
            className="mt-2"
            phase={journeyPhase}
            deploySiteHost={deploySiteHost}
            onPublish={onOpenPublish}
            publishing={deployLiveStatus === "building"}
          />
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
              <Link
                to="/gafcore/marketplace"
                className="mt-6 inline-flex rounded-lg border border-primary/50 bg-primary/10 px-3 py-2 text-[12.5px] font-medium text-primary transition hover:bg-primary/15"
              >
                Ver plantillas en Marketplace
              </Link>
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
                  {streamChars != null && streamChars > 0 && (
                    <p className="pl-9 text-[11px] text-foreground/75">
                      Recibiendo respuesta… ~{Math.max(1, Math.round(streamChars / 1024))} KB texto
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} className="h-px w-full shrink-0 scroll-mb-28" aria-hidden />
        </div>
      </div>

      {/* Composer */}
      <div
        className="z-10 w-full min-w-0 max-w-full shrink-0 border-t border-border/40 bg-background px-2 pt-2 sm:px-3"
        style={{
          paddingBottom: isMobile
            ? "max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.875rem))"
            : "max(0.75rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
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
                  onClick={() => setLastError(null)}
                  className="rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-muted"
                >
                  Descartar
                </button>
              </div>
            )}
          </div>
        )}
        <ChatNextStepSuggestions
          steps={nextSteps}
          disabled={loading}
          onSelect={(step) => {
            if (loading) return;
            setInput(step.prompt);
            setComposerHighlight(true);
            window.setTimeout(() => setComposerHighlight(false), 1600);
            taRef.current?.focus();
            requestAnimationFrame(() => {
              const el = taRef.current;
              if (el) {
                el.selectionStart = el.selectionEnd = step.prompt.length;
                el.scrollTop = el.scrollHeight;
              }
            });
          }}
        />
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
                  {factoryMode ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled
                        className="text-xs text-muted-foreground focus:bg-transparent"
                      >
                        Plantilla fábrica
                      </DropdownMenuItem>
                      {FACTORY_PROFILE_OPTIONS.map((opt) => (
                        <DropdownMenuItem
                          key={opt.id}
                          onSelect={() => {
                            setFactoryProfileId(opt.id);
                            try {
                              localStorage.setItem("gafcore_factory_profile", opt.id);
                            } catch {
                              /* */
                            }
                            toast.message(
                              opt.id === FACTORY_PROFILE_AUTO_ID
                                ? "Plantilla: detección automática"
                                : `Plantilla: ${opt.label}`,
                            );
                          }}
                        >
                          <span className="flex-1 truncate">{opt.label}</span>
                          {factoryProfileId === opt.id ? (
                            <span className="text-[10px] font-medium text-primary">✓</span>
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </>
                  ) : null}
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
                      <span
                        className="max-w-[4.5rem] truncate rounded-full bg-primary-foreground/20 px-1.5 text-[9px] font-semibold leading-tight"
                        title={
                          FACTORY_PROFILE_OPTIONS.find((o) => o.id === factoryProfileId)?.label ??
                          "Fábrica"
                        }
                      >
                        {(() => {
                          const opt = FACTORY_PROFILE_OPTIONS.find(
                            (o) => o.id === factoryProfileId,
                          );
                          if (!opt) return "Fábrica";
                          if (opt.id === FACTORY_PROFILE_AUTO_ID) return "Auto";
                          return opt.label.split(" ")[0] ?? opt.label;
                        })()}
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


