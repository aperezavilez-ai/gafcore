import {
  useEffect,
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
  Plug,
  Image as ImageIcon,
  Folder,
  ChevronRight,
  ChevronDown,
  Paperclip,
  Coins,
  Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { assignGafcoreAccountType } from "@/lib/gafcore-roles.functions";
import { validateGafcoreSources } from "@/lib/gafcore-validate.functions";
import { enrichGafcoreMedia } from "@/lib/enrich-gafcore-media.functions";
import { repairGafcoreProjectMedia } from "@/lib/gafcore-media.shared";
import type { FileItem } from "@/components/ide/CodeEditor";
import { CreditsOutModal } from "@/components/CreditsOutModal";
import { supabase } from "@/integrations/supabase/client";
import { useCredits } from "@/hooks/useCredits";
import { useSubscription } from "@/hooks/useSubscription";
import { sanitizeUserFacingAiText } from "@/lib/gafcore-user-facing-errors";
import { displayMonthlyAllowanceForUi } from "@/lib/gafcore-plan-credits.shared";
import { COST_PER_REQUEST } from "@/lib/gafcore-chat.shared";

type Msg = { role: "user" | "ai"; content: string; ts?: number };

type PendingComposerImage = { id: string; previewUrl: string; fileName: string };

async function readSseJsonPayload(
  res: Response,
  signal: AbortSignal,
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
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
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

/** Mensajes claros para códigos devueltos por POST /api/gafcore/chat/stream (evita “IA no conecta” genérico). */
function describeGafcoreStreamFailure(message: string): string | null {
  if (message.startsWith("UPSTREAM:")) {
    const st = Number(message.slice("UPSTREAM:".length));
    if (st === 401 || st === 403) {
      return "El backend no pudo autenticarse con el proveedor de IA (clave incorrecta o revocada). En producción, quien administra el despliegue debe revisar OPENROUTER_API_KEY, OPENAI_API_KEY o AI_CHAT_COMPLETIONS_URL + AI_API_KEY en el panel del host.";
    }
    if (st === 429) {
      return "El proveedor de IA está limitando peticiones. Espera unos minutos y vuelve a intentarlo.";
    }
    if (st === 402) {
      return "El proveedor de IA (OpenRouter/OpenAI) indica falta de saldo o facturación en esa cuenta. Los créditos que ves en GafCore autorizan el uso en la app; el servidor también necesita una clave y saldo válidos en el proveedor.";
    }
    if (st >= 500) {
      return "El proveedor de IA respondió con un error temporal. Inténtalo de nuevo en unos minutos.";
    }
    return "El proveedor de IA rechazó la solicitud. Si ocurre a menudo, revisa modelos y límites en el panel del proveedor.";
  }
  if (message === "CREDITS_VERIFY_FAILED") {
    return "No pudimos verificar tus créditos en el servidor. Recarga la página. Si persiste, puede haber un fallo de base de datos o de configuración del backend (clave de servicio).";
  }
  if (message === "NO_STREAM_BODY") {
    return "La IA no devolvió contenido utilizable en esta respuesta. Prueba de nuevo o acorta la petición.";
  }
  return null;
}

const SUGGESTIONS = [
  "Crea una landing moderna con hero",
  "Agrega un formulario de contacto",
  "Diseña un dashboard con tarjetas",
  "Convierte esto a modo oscuro",
];

const FOLLOWUPS = [
  "Persistir tamaño del panel",
  "Hacer responsive el layout",
  "Agregar modo oscuro",
  "Mejorar el diseño",
];

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
  projectId,
}: {
  files: FileItem[];
  setFiles: Dispatch<SetStateAction<FileItem[]>>;
  onCodeGenerated?: () => void;
  onOpenSettings?: () => void;
  onOpenHistory?: () => void;
  onOpenConnectors?: () => void;
  projectId?: string | null;
}) {
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [streamChars, setStreamChars] = useState<number | null>(null);
  /** Invalida respuestas tardías si el usuario envía otra cosa o pulsa detener. */
  const requestEpochRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const freeCreditsRescueDone = useRef(false);
  const freeCreditsRescueUserId = useRef<string | null>(null);

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
          const ts = new Date(r.created_at).getTime();
          setMessages((prev) => {
            // dedupe: skip if last message has same content+role within 2s
            const last = prev[prev.length - 1];
            if (
              last &&
              last.content === r.content &&
              (last.role === "ai") === (r.role === "assistant") &&
              Math.abs((last.ts ?? 0) - ts) < 2000
            ) {
              return prev;
            }
            return [
              ...prev,
              { role: r.role === "assistant" ? "ai" : "user", content: r.content, ts },
            ];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, user?.id]);

  // Persist a message (best-effort)
  const persistMessage = async (role: "user" | "assistant", content: string) => {
    if (!projectId || !user?.id) return;
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
  ): Promise<boolean> => {
    if (!projectId || !user?.id || generated.length === 0) return false;
    try {
      const { error } = await supabase.from("project_files").upsert(
        generated.map((f) => ({
          project_id: projectId,
          name: f.name,
          language: f.language ?? "typescript",
          content: f.content,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "project_id,name" },
      );
      if (error) {
        console.error("[ChatPanel] syncFilesToDb:", error);
        return false;
      }
      return true;
    } catch (e) {
      console.error("[ChatPanel] syncFilesToDb:", e);
      return false;
    }
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
      const ok = await syncFilesToDb([item]);
      if (!ok) {
        toast.error("No se pudo guardar la imagen en la nube; sigue en el editor local.");
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
        const ok = await syncFilesToDb([item]);
        if (ok) {
          toast.success(`Archivo “${file.name}” añadido y guardado en el proyecto`);
        } else {
          toast.error(
            "No se pudo guardar el archivo en la nube. Sigue en el editor; reintenta o revisa permisos.",
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" });
  }, [messages, loading]);

  // Broadcast visual-edit toggle to all preview iframes
  useEffect(() => {
    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((f) => {
      try {
        f.contentWindow?.postMessage({ type: "ve-toggle", on: visualEditOn }, "*");
      } catch {}
    });
  }, [visualEditOn]);

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
      } else if (data.type === "preview-error") {
        setLastError(String(data.message || "Error desconocido"));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const callGafcoreChat = useServerFn(gafcoreChat);
  const callValidateSources = useServerFn(validateGafcoreSources);
  const callEnrichMedia = useServerFn(enrichGafcoreMedia);

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

  const send = async (text?: string) => {
    const raw = (text ?? input).trim();
    const pendingSnapshot = [...pendingComposerImages];
    const pendingRef =
      pendingSnapshot.length > 0
        ? `\n[Referencia visual en archivos del proyecto: ${pendingSnapshot.map((p) => p.fileName).join(", ")}.]`
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
    const deepPrefix =
      deepModel && mode === "build"
        ? "[modo profundo] Prioriza análisis cuidadoso, UI cuidada y código robusto; la salida sigue siendo solo el JSON del contrato. "
        : "";
    const chatPrefix =
      mode === "chat"
        ? "[Modo chat] Responde sin generar código a menos que se solicite explícitamente. "
        : "";
    const visualPrefix = visualEditOn
      ? "[Edición visual] Enfócate solo en cambios de UI/estilos sin tocar lógica. "
      : "";
    const instruction = deepPrefix + chatPrefix + visualPrefix + coreText + pendingRef;
    if (!instruction.trim() || loading) return;
    const myEpoch = ++requestEpochRef.current;
    setInput("");
    setPendingComposerImages([]);
    const userDisplay = [raw, pendingSnapshot.length > 0 ? `📎 ${pendingSnapshot.length} imagen` : ""]
      .filter(Boolean)
      .join("\n");
    setMessages((m) => [
      ...m,
      { role: "user", content: userDisplay || "📎 Imagen de referencia", ts: Date.now() },
    ]);
    void persistMessage("user", instruction);
    setLoading(true);
    setStreamChars(null);
    const ac = new AbortController();
    abortControllerRef.current = ac;
    try {
      const history: ChatMsg[] = messages
        .slice(-6)
        .map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.content }));

      const { data: sess } = await supabase.auth.getSession();
      const tok = sess.session?.access_token;
      if (!tok) {
        toast.error("Inicia sesión para usar el asistente.");
        throw new Error("no_session");
      }

      let result: {
        reply: string;
        files?: Array<{ name: string; language?: string; content: string }>;
        balance?: number | null;
      };

      try {
        const res = await fetch("/api/gafcore/chat/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tok}`,
          },
          body: JSON.stringify({ history, instruction, files }),
          signal: ac.signal,
        });

        const ct = res.headers.get("content-type") || "";

        if (!res.ok) {
          let errCode = `HTTP ${res.status}`;
          try {
            const ej = (await res.json()) as { error?: string; detail?: string };
            if (ej?.error === "insufficient_credits") errCode = "INSUFFICIENT_CREDITS";
            else if (ej?.error === "ai_not_configured") errCode = "AI_NO_CONFIGURADA";
            else if (ej?.error === "invalid_body")
              errCode = "Petición inválida (revisa el texto o archivos).";
            else if (ej?.error === "upstream") errCode = `UPSTREAM:${res.status}`;
            else if (ej?.error === "credits_error") errCode = "CREDITS_VERIFY_FAILED";
            else if (ej?.error === "no_stream_body") errCode = "NO_STREAM_BODY";
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
            balance?: number | null;
          };
          result = {
            reply: typeof j.reply === "string" ? j.reply : "Listo.",
            files: Array.isArray(j.files) ? j.files : [],
            balance: j.balance,
          };
        } else {
          const text = await readSseJsonPayload(res, ac.signal, (n) => {
            if (myEpoch === requestEpochRef.current) setStreamChars(n);
          });
          if (myEpoch !== requestEpochRef.current) return;
          let parsed: { reply?: string; files?: unknown };
          try {
            parsed = JSON.parse(text || "{}");
          } catch {
            throw new Error("No se pudo interpretar la respuesta del modelo.");
          }
          const rawFiles = Array.isArray(parsed.files) ? parsed.files : [];
          result = {
            reply: typeof parsed.reply === "string" ? parsed.reply : "Listo.",
            files: rawFiles as Array<{ name: string; language?: string; content: string }>,
          };
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        if ((err as Error)?.name === "AbortError") throw err;
        const msg = String((err as Error)?.message || "");
        if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
          result = await callGafcoreChat({
            data: { history, instruction, files: files as any },
          });
        } else {
          throw err;
        }
      }

      if (myEpoch !== requestEpochRef.current) return;

      const replyText = sanitizeUserFacingAiText(result.reply || "Listo.");
      setStreamChars(null);
      setMessages((m) => [...m, { role: "ai", content: replyText, ts: Date.now() }]);
      void persistMessage("assistant", replyText);
      if (result.files && result.files.length > 0) {
        try {
          const { createSnapshot } = await import("@/lib/userSupabase");
          const snippet = raw.slice(0, 60);
          void createSnapshot(files, `auto: ${snippet}`);
        } catch {}
        let outFiles = repairGafcoreProjectMedia(
          result.files,
          files.map((f) => ({ name: f.name, content: f.content, language: f.language })),
        );
        try {
          const enriched = await callEnrichMedia({
            data: {
              files: outFiles,
              projectFiles: files.map((f) => ({
                name: f.name,
                content: f.content,
                language: f.language,
              })),
              instruction,
            },
          });
          if (enriched?.files?.length) outFiles = enriched.files;
        } catch {
          /* reparación local ya aplicada */
        }
        const merged = mergeGeneratedFiles(files, outFiles);
        setFiles(merged);
        void syncFilesToDb(outFiles);
        onCodeGenerated?.();

        try {
          const v = await callValidateSources({
            data: outFiles.map((f) => ({ name: f.name, content: f.content })),
          });
          if (!v.ok && Array.isArray(v.errors) && v.errors.length > 0) {
            setLastError(v.errors.map((e) => `${e.name}: ${e.message}`).join("\n"));
          }
        } catch {
          /* validación best-effort */
        }
      }
    } catch (error: any) {
      if (
        error?.name === "AbortError" ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        setStreamChars(null);
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
        setMessages((m) => [
          ...m,
          {
            role: "ai",
            content:
              "Te has quedado sin créditos de IA. Tus funciones de IA están en pausa hasta que recargues. Cada solicitud al asistente consume 1 crédito; los créditos se usan para pagar el costo del modelo de IA que responde tu mensaje. Recarga abajo para reactivar el asistente.",
            ts: Date.now(),
          },
        ]);
      } else {
        const errMsg = String(error?.message ?? "");
        const aiCfg =
          errMsg === "AI_NO_CONFIGURADA" ||
          errMsg.includes("ai_not_configured") ||
          /AI.*no.*configurad/i.test(errMsg);
        const streamHint = describeGafcoreStreamFailure(msg);
        const friendly = aiCfg
          ? "El asistente de IA no encuentra clave en el servidor. En local: crea o edita **.env.local** (o `.env`) en la **raíz del proyecto** con `OPENROUTER_API_KEY`, `OPENAI_API_KEY` o la pareja `AI_CHAT_COMPLETIONS_URL` + `AI_API_KEY`, guarda y **reinicia** el servidor (`cmd /c \"npm run dev\"` si PowerShell bloquea npm). Ejecuta `npm run gafcore:doctor` para ver qué falta. En producción, define las mismas variables en el host (p. ej. Vercel)."
          : (streamHint ?? error?.message ?? "No pude responder en este momento. Inténtalo de nuevo.");
        if (aiCfg) toast.error("IA no configurada", { duration: 12_000 });
        setMessages((m) => [
          ...m,
          {
            role: "ai",
            content: sanitizeUserFacingAiText(friendly),
            ts: Date.now(),
          },
        ]);
      }
    } finally {
      abortControllerRef.current = null;
      setStreamChars(null);
      if (myEpoch === requestEpochRef.current) {
        setLoading(false);
      }
      refreshCredits();
    }
  };

  const empty = messages.length === 0;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Plan + créditos (chat) + recarga */}
      <div className="border-b border-border/60 px-3 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className="min-w-0 flex-1 truncate text-[10px] font-semibold text-foreground md:text-[11px]"
            title={planDisplayLabel}
          >
            {planDisplayLabel}
          </span>
          <button
            type="button"
            onClick={() => user?.id && setCreditsOut(true)}
            className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground/80 transition hover:border-primary/50 hover:bg-primary/10 hover:text-foreground"
            title="Créditos de IA disponibles. Click para recargar."
          >
            <Coins className="h-3 w-3 text-amber-400" />
            {creditsLoading || subLoading ? (
              <span className="text-muted-foreground">…</span>
            ) : isAdmin ? (
              <span className="inline-flex items-center gap-1">
                <span className="font-semibold text-foreground">Administrador</span>
                <span className="text-muted-foreground">·</span>
                <span>Ilimitado</span>
              </span>
            ) : isFairUseCreadorPlan || isUnlimitedDaily ? (
              <span>Ilimitado</span>
            ) : (
              <>
                <span className="tabular-nums">{balance.toLocaleString()}</span>
                <span className="text-muted-foreground">/</span>
                <span className="tabular-nums">{displayMonthly.toLocaleString()}</span>
                <span className="text-muted-foreground">créditos</span>
              </>
            )}
            <span className="ml-1 hidden text-[10px] text-primary/80 group-hover:inline">
              + Recargar
            </span>
          </button>
        </div>
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
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-5">
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center pt-10 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="text-[15px] font-semibold tracking-tight">
                ¿Qué quieres construir hoy?
              </h2>
              <p className="mt-1 max-w-[260px] text-[12.5px] text-muted-foreground">
                Describe tu idea y la IA generará el código por ti.
              </p>
              <div className="mt-6 flex w-full max-w-[320px] flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-left text-[12.5px] text-foreground transition hover:border-primary/40 hover:bg-muted"
                  >
                    {s}
                  </button>
                ))}
              </div>
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
                  <div
                    key={i}
                    className="flex-1 text-[13px] leading-relaxed text-foreground whitespace-pre-wrap break-words"
                  >
                    {m.content}
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
                    <p className="pl-9 text-[11px] text-muted-foreground">
                      Recibiendo respuesta… ~{Math.max(1, Math.round(streamChars / 1024))} KB texto
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Composer */}
      <div className="px-3 pb-3 pt-2">
        {lastError && (
          <div className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-[12px]">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-destructive">⚠</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-destructive">Construcción fallida</p>
                <p className="mt-0.5 line-clamp-2 text-destructive/80">{lastError}</p>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  send(`Arregla este error de build:\n\n\`\`\`\n${lastError}\n\`\`\``);
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
        <div className="rounded-2xl border border-border bg-background shadow-sm transition focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15">
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
                ? "Pide a la IA que cree o modifique algo…"
                : deepModel
                  ? "Modelo profundo activo: describe el cambio con detalle…"
                  : "Pide a la IA que cree o modifique algo… (opcional: escribe [modo profundo] al inicio o activa el interruptor)"
            }
            rows={3}
            className="block w-full resize-none border-0 bg-transparent px-3.5 pt-3 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none min-h-[64px] max-h-[320px] overflow-y-auto"
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <div className="flex items-center gap-1.5">
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
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Adjuntar imagen (foto)"
                aria-label="Adjuntar imagen"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => imageInputRef.current?.click()}
              >
                <ImageIcon className="h-3.5 w-3.5" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    title="Más opciones"
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-60">
                  <DropdownMenuItem onSelect={() => onOpenSettings?.()}>
                    <SettingsIcon className="mr-2 h-4 w-4" />
                    <span className="flex-1">Ajustes</span>
                    <span className="text-xs text-muted-foreground">Ctrl</span>
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
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
                  "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 " +
                  (deepModel
                    ? "border-primary bg-primary/10 text-foreground shadow-[0_0_0_3px_hsl(var(--primary)/0.2)] ring-1 ring-primary"
                    : "border-border bg-background text-foreground hover:bg-muted")
                }
                title={
                  mode === "chat"
                    ? "Modelo profundo solo en modo Construir"
                    : "Activa el modelo más capaz (más lento/caro). También puedes escribir [modo profundo] al inicio del mensaje."
                }
              >
                <Brain className="h-3 w-3" />
                Profundo
                {deepModel && <span className="ml-0.5 text-[10px]">ON</span>}
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
                  "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium transition " +
                  (visualEditOn
                    ? "border-primary bg-primary text-primary-foreground shadow-[0_0_0_3px_hsl(var(--primary)/0.25)] ring-1 ring-primary"
                    : "border-border bg-background text-foreground hover:bg-muted")
                }
                title="Activar/Desactivar ediciones visuales"
              >
                <Pencil className="h-3 w-3" />
                Ediciones visuales
                {visualEditOn && <span className="ml-1 text-[10px]">ON</span>}
              </button>
            </div>

            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={
                      "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium transition " +
                      (mode === "chat"
                        ? "border-blue-500 bg-blue-500 text-white shadow-[0_0_0_3px_rgb(59_130_246/0.25)]"
                        : "border-primary bg-primary text-primary-foreground shadow-[0_0_0_3px_hsl(var(--primary)/0.25)]")
                    }
                    title="Modo de respuesta"
                  >
                    {mode === "build" ? "Construir" : "Chatear"}
                    <ChevronDown className="h-3 w-3" />
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
                  "flex h-7 w-7 items-center justify-center rounded-full transition " +
                  (recording
                    ? "bg-red-500/15 text-red-500 animate-pulse"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground")
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
                    setLoading(false);
                    setStreamChars(null);
                    toast.message("Solicitud cancelada.");
                    return;
                  }
                  send();
                }}
                disabled={!loading && !input.trim()}
                className="h-7 w-7 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-40"
                title={loading ? "Detener / descartar respuesta pendiente" : "Enviar"}
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
