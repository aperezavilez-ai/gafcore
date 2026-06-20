import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Mic, Monitor, Paperclip, Pencil, Send, Smartphone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getGafcoreSupabaseBrowser } from "@/lib/gafcore-supabase-browser";
import { GafcoreLogo } from "@/components/gafcore/GafcoreBuilderLogo";
import { GafCoreWireframeCard } from "@/components/gafcore/GafCoreWireframeCard";
import { GafCoreBuilderTopBar } from "@/components/gafcore/GafCoreBuilderTopBar";
import {
  getBuilderSteps,
  type GafcoreBuilderStep,
} from "@/lib/gafcore-builder-steps.shared";
import { cn } from "@/lib/utils";

type BuilderMessageBase = {
  id: string;
};

type TextMessage = BuilderMessageBase & {
  kind: "text";
  role: "user" | "system";
  text: string;
};

type PlanSection = {
  id: string;
  label: string;
  description: string;
};

type PlanMessage = BuilderMessageBase & {
  kind: "plan";
  sections: PlanSection[];
  /** Una vez aprobado o reemplazado por un plan nuevo, deja de ser interactivo. */
  resolved: boolean;
};

type BuilderMessage = TextMessage | PlanMessage;

type GenerateResponse = {
  html: string;
  model: string;
};

type PlanResponse = {
  sections: PlanSection[];
  model: string;
};

type BuilderProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
};

type BuilderProjectWithHtml = BuilderProjectSummary & {
  html: string;
};

type ChatMode = "build" | "chat";

/**
 * GafCore Builder V2 — generador de sitios con identidad visual GafCore.
 *
 * Flujo: el primer prompt del usuario dispara un PLAN (wireframe de
 * secciones) que se muestra como tarjeta en el chat. El usuario aprueba
 * ("Construir este sitio") y entonces se genera el HTML real. Los cambios
 * posteriores (ya con sitio generado) van directo, sin plan previo.
 *
 * El motor de generación sigue siendo deliberadamente simple (un solo HTML
 * autónomo vía Claude) para no heredar la fragilidad del IDE legado.
 */
export function GafCoreBuilderV2() {
  const [messages, setMessages] = useState<BuilderMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [html, setHtml] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deepMode, setDeepMode] = useState(true);
  const [chatMode, setChatMode] = useState<ChatMode>("build");
  const [visualEditMode, setVisualEditMode] = useState(false);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [comingSoonAudit, setComingSoonAudit] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState("Mi proyecto");
  const [projects, setProjects] = useState<BuilderProjectSummary[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const pendingPlanPromptRef = useRef<string | null>(null);
  const idCounter = useRef(0);

  const nextId = () => `msg-${++idCounter.current}`;

  const firstUserMessage = useMemo(
    () =>
      messages.find((m): m is TextMessage => m.kind === "text" && m.role === "user")
        ?.text ?? "",
    [messages],
  );

  const steps = useMemo(
    () => getBuilderSteps(firstUserMessage, html),
    [firstUserMessage, html],
  );

  useEffect(() => {
    let active = true;
    getGafcoreSupabaseBrowser()
      .then((sb) => sb.auth.getSession())
      .then(({ data }) => {
        if (active) setUserEmail(data.session?.user?.email ?? null);
      })
      .catch(() => {
        if (active) setUserEmail(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      const pendingId = window.localStorage.getItem("gafcore:builder-v2:openProjectId");
      if (pendingId) {
        window.localStorage.removeItem("gafcore:builder-v2:openProjectId");
        void handleSelectProject(pendingId);
      }
    } catch {
      // No es crítico si localStorage no está disponible.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshProjects = useMemo(
    () => async () => {
      try {
        const authHeader = await getAuthHeader();
        const res = await fetch("/api/gafcore/builder-v2/projects", {
          headers: { Authorization: authHeader },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { projects: BuilderProjectSummary[] };
        setProjects(data.projects);
      } catch {
        // Silencioso: la lista de proyectos es una mejora, no algo crítico.
      }
    },
    [],
  );

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  function rememberLastProjectId(projectId: string | null) {
    try {
      if (projectId) {
        window.localStorage.setItem("gafcore:builder-v2:lastProjectId", projectId);
      } else {
        window.localStorage.removeItem("gafcore:builder-v2:lastProjectId");
      }
    } catch {
      // No es crítico si localStorage no está disponible.
    }
  }

  async function persistProject(nextHtml: string, nameOverride?: string) {
    setSaveStatus("saving");
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch("/api/gafcore/builder-v2/project/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({
          projectId: currentProjectId,
          name: nameOverride ?? currentProjectName,
          html: nextHtml,
        }),
      });
      if (!res.ok) throw new Error("save_failed");
      const saved = (await res.json()) as BuilderProjectSummary;
      setCurrentProjectId(saved.id);
      setCurrentProjectName(saved.name);
      setSaveStatus("saved");
      rememberLastProjectId(saved.id);
      refreshProjects();
    } catch {
      setSaveStatus("error");
    }
  }

  async function handleSelectProject(projectId: string) {
    setSaveStatus("idle");
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch(`/api/gafcore/builder-v2/project/${projectId}`, {
        headers: { Authorization: authHeader },
      });
      if (!res.ok) return;
      const project = (await res.json()) as BuilderProjectWithHtml;
      setCurrentProjectId(project.id);
      setCurrentProjectName(project.name);
      setHtml(project.html);
      rememberLastProjectId(project.id);
      setMessages([
        {
          id: nextId(),
          kind: "text",
          role: "system",
          text: `Cargué el proyecto "${project.name}". Puedes seguir pidiendo cambios.`,
        },
      ]);
    } catch {
      // Si falla la carga, dejamos el estado actual sin tocar.
    }
  }

  function handleNewProject() {
    setCurrentProjectId(null);
    setCurrentProjectName("Mi proyecto");
    setHtml(null);
    setMessages([]);
    setSaveStatus("idle");
    rememberLastProjectId(null);
  }

  function handleOpenProjectsList() {
    window.location.href = "/gafcore/app-v2/projects";
  }

  async function handleDeleteProject(projectId: string): Promise<boolean> {
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch(`/api/gafcore/builder-v2/project/${projectId}`, {
        method: "DELETE",
        headers: { Authorization: authHeader },
      });
      if (!res.ok) return false;
      if (projectId === currentProjectId) {
        handleNewProject();
      }
      await refreshProjects();
      return true;
    } catch {
      return false;
    }
  }

  async function handleSignOut() {
    const sb = await getGafcoreSupabaseBrowser();
    await sb.auth.signOut();
    window.location.href = "/gafcore/login";
  }

  function handleSelectStep(step: GafcoreBuilderStep) {
    setActiveStepId(step.id);
    setPrompt(step.prompt);
  }

  async function getAuthHeader(): Promise<string> {
    const sb = await getGafcoreSupabaseBrowser();
    const { data } = await sb.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) {
      throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    }
    return `Bearer ${accessToken}`;
  }

  async function callPlanApi(nextPrompt: string): Promise<PlanResponse> {
    const authHeader = await getAuthHeader();
    const res = await fetch("/api/gafcore/builder-v2/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({ prompt: nextPrompt }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(detail || `Error del servidor (${res.status})`);
    }
    return (await res.json()) as PlanResponse;
  }

  async function callBuilderApi(
    nextPrompt: string,
    currentHtml: string | null,
  ): Promise<GenerateResponse> {
    const authHeader = await getAuthHeader();
    const res = await fetch("/api/gafcore/builder-v2/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        prompt: nextPrompt,
        ...(currentHtml ? { currentHtml } : {}),
        deepMode,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(detail || `Error del servidor (${res.status})`);
    }
    return (await res.json()) as GenerateResponse;
  }

  async function generateApprovedSite(originalPrompt: string, sections: PlanSection[]) {
    const authHeader = await getAuthHeader();
    const res = await fetch("/api/gafcore/builder-v2/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({ prompt: originalPrompt, approvedPlan: sections, deepMode }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(detail || `Error del servidor (${res.status})`);
    }
    return (await res.json()) as GenerateResponse;
  }

  function markPlanMessagesResolved() {
    setMessages((prev) =>
      prev.map((m) => (m.kind === "plan" ? { ...m, resolved: true } : m)),
    );
  }

  async function handleApprovePlan(planMessageId: string, sections: PlanSection[]) {
    const originalPrompt = pendingPlanPromptRef.current;
    if (!originalPrompt) return;

    setMessages((prev) =>
      prev.map((m) => (m.id === planMessageId ? { ...m, resolved: true } : m)),
    );
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const result = await generateApprovedSite(originalPrompt, sections);
      setHtml(result.html);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== planMessageId),
        {
          id: nextId(),
          kind: "text",
          role: "system",
          text: "Listo, construí tu sitio con esa estructura. Puedes pedirme ajustes (colores, textos, secciones) y los aplico al instante.",
        },
      ]);
      if (!currentProjectId) {
        const initialName = originalPrompt.trim().slice(0, 60) || "Mi proyecto";
        setCurrentProjectName(initialName);
        void persistProject(result.html, initialName);
      } else {
        void persistProject(result.html);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado.";
      setErrorMsg(message);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), kind: "text", role: "system", text: `No pude completar eso: ${message}` },
      ]);
    } finally {
      setIsLoading(false);
      pendingPlanPromptRef.current = null;
    }
  }

  function handleRequestPlanChanges(planMessageId: string) {
    markPlanMessagesResolved();
    setMessages((prev) =>
      prev.map((m) => (m.id === planMessageId ? { ...m, resolved: true } : m)),
    );
    setMessages((prev) => [
      ...prev,
      {
        id: nextId(),
        kind: "text",
        role: "system",
        text: "Dime qué quieres cambiar del plan (agregar, quitar o reordenar secciones) y te propongo uno nuevo.",
      },
    ]);
  }

  async function handleSend() {
    const trimmed = prompt.trim();
    if (!trimmed || isLoading) return;

    setErrorMsg(null);
    setMessages((prev) => [
      ...prev,
      { id: nextId(), kind: "text", role: "user", text: trimmed },
    ]);
    setPrompt("");
    setActiveStepId(null);

  if (chatMode === "chat") {
    setIsLoading(true);
    try {
      const response = await fetch("/api/gafcore/builder-v2/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, currentHtml: html || undefined }),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody?.error ?? "No pude responder en este momento.");
      }
      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        { id: nextId(), kind: "text", role: "system", text: data.text },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado.";
      setErrorMsg(message);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), kind: "text", role: "system", text: `No pude responder: ${message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
    return;
  }


    setIsLoading(true);

    if (!html) {
      try {
        const planResult = await callPlanApi(trimmed);
        pendingPlanPromptRef.current = trimmed;
        setMessages((prev) => [
          ...prev,
          { id: nextId(), kind: "plan", sections: planResult.sections, resolved: false },
        ]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error inesperado.";
        setErrorMsg(message);
        setMessages((prev) => [
          ...prev,
          { id: nextId(), kind: "text", role: "system", text: `No pude completar eso: ${message}` },
        ]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      const result = await callBuilderApi(trimmed, html);
      setHtml(result.html);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), kind: "text", role: "system", text: "Listo, actualicé el sitio con ese cambio." },
      ]);
      void persistProject(result.html);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado.";
      setErrorMsg(message);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), kind: "text", role: "system", text: `No pude completar eso: ${message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleDownload() {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sitio.html";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#0b0518]">
      <GafCoreBuilderTopBar
        projectName={currentProjectName}
        userEmail={userEmail}
        html={html}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onSignOut={handleSignOut}
        projects={projects}
        currentProjectId={currentProjectId}
        onSelectProject={handleSelectProject}
        onNewProject={handleNewProject}
        onOpenProjectsList={handleOpenProjectsList}
        onDeleteProject={handleDeleteProject}
        saveStatus={saveStatus}
        getAuthHeader={getAuthHeader}
        onRestoreHtml={setHtml}
      />
      <div className="flex flex-1 flex-col md:flex-row">
      <div className="flex w-full flex-col border-b border-neutral-200 bg-white md:w-[460px] md:border-b-0 md:border-r">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
                <Sparkles className="h-6 w-6 text-violet-500" />
              </div>
              <h3 className="text-base font-semibold text-neutral-900">
                ¿Qué quieres construir hoy?
              </h3>
              <p className="text-sm text-neutral-500">
                Describe en el chat qué app o sitio quieres construir y pulsa Construir.
              </p>
            </div>
          )}

          {messages.map((m) => {
            if (m.kind === "plan") {
              return (
                <GafCoreWireframeCard
                  key={m.id}
                  sections={m.sections}
                  isBuilding={isLoading}
                  onApprove={() => handleApprovePlan(m.id, m.sections)}
                  onRequestChanges={() => handleRequestPlanChanges(m.id)}
                />
              );
            }
            return (
              <div
                key={m.id}
                className={
                  m.role === "user"
                    ? "rounded-lg bg-violet-100 px-3 py-2 text-sm text-violet-900"
                    : "rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-600"
                }
              >
                {m.text}
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {deepMode ? "Generando con más detalle (puede tardar un poco más)..." : "Generando..."}
            </div>
          )}
        </div>

        <div className="border-t border-neutral-200 p-3 space-y-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {steps.map((step) => (
              <button
                key={step.id}
                type="button"
                onClick={() => handleSelectStep(step)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  step.id === activeStepId
                    ? "border-violet-400 bg-violet-100 text-violet-700"
                    : step.status === "completed"
                      ? "border-neutral-200 bg-neutral-50 text-neutral-400"
                      : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50",
                )}
              >
                {step.status === "completed" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                )}
                {step.status === "current" && step.id !== activeStepId && (
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500" aria-hidden />
                )}
                {step.label}
              </button>
            ))}
          </div>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              chatMode === "chat"
                ? "Pregúntame algo sobre tu sitio..."
                : html
                  ? "Pide un cambio: 'cambia el color a azul', 'agrega testimonios'..."
                  : "Describe el sitio que quieres crear..."
            }
            className="min-h-[70px] resize-none border-neutral-200 bg-neutral-50 text-neutral-900 placeholder:text-neutral-400"
            disabled={isLoading}
          />

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-neutral-400 hover:text-neutral-600"
              title="Adjuntar archivo (próximamente)"
              disabled
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            <button
              type="button"
              onClick={() => setDeepMode((v) => !v)}
              className={cn(
                "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-1.5 text-xs font-medium transition-colors",
                deepMode
                  ? "border-violet-300 bg-violet-100 text-violet-700"
                  : "border-neutral-200 text-neutral-500 hover:bg-neutral-100",
              )}
              title="Modelo profundo: más calidad y detalle (puede tardar un poco más)"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Profundo {deepMode ? "ON" : "OFF"}
            </button>

            <button
              type="button"
              onClick={() => setVisualEditMode((v) => !v)}
              className={cn(
                "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-1.5 text-xs font-medium transition-colors",
                visualEditMode
                  ? "border-violet-300 bg-violet-100 text-violet-700"
                  : "border-neutral-200 text-neutral-500 hover:bg-neutral-100",
              )}
              title="Ediciones visuales: selecciona un elemento del preview para editarlo (próximamente)"
            >
              <Pencil className="h-3.5 w-3.5" />
              Ediciones
            </button>

            <div className="ml-auto flex shrink-0 items-center gap-1">
              <div className="flex items-center rounded-full border border-neutral-200 bg-neutral-50 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setChatMode("build")}
                  className={cn(
                    "whitespace-nowrap rounded-full px-2 py-1 font-medium transition-colors",
                    chatMode === "build"
                      ? "bg-violet-500 text-white"
                      : "text-neutral-500 hover:text-neutral-800",
                  )}
                >
                  Construir
                </button>
                <button
                  type="button"
                  onClick={() => setChatMode("chat")}
                  className={cn(
                    "whitespace-nowrap rounded-full px-2 py-1 font-medium transition-colors",
                    chatMode === "chat"
                      ? "bg-violet-500 text-white"
                      : "text-neutral-500 hover:text-neutral-800",
                  )}
                >
                  Chatear
                </button>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-neutral-400 hover:text-neutral-600"
                title="Dictado por voz (próximamente)"
                disabled
              >
                <Mic className="h-4 w-4" />
              </Button>

              <Button
                onClick={handleSend}
                disabled={isLoading || !prompt.trim()}
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full bg-violet-500 hover:bg-violet-600"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
        </div>
      </div>

      <div className="flex flex-1 flex-col bg-[#0b0518]">
        <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2">
          <div className="flex items-center gap-3">
            {viewMode === "code" && (
              <span className="text-sm font-medium text-neutral-500">Código</span>
            )}
            {viewMode === "preview" && (
              <div className="flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setPreviewDevice("desktop")}
                  title="Vista horizontal (escritorio)"
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded",
                    previewDevice === "desktop"
                      ? "bg-violet-500 text-white"
                      : "text-neutral-400 hover:text-neutral-700",
                  )}
                >
                  <Monitor className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice("mobile")}
                  title="Vista vertical (móvil)"
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded",
                    previewDevice === "mobile"
                      ? "bg-violet-500 text-white"
                      : "text-neutral-400 hover:text-neutral-700",
                  )}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-violet-500 text-white hover:bg-violet-600"
              onClick={() => setComingSoonAudit(true)}
            >
              <Sparkles className="h-4 w-4" />
              Auditar y mejorar
            </Button>
            {html && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownload}
                className="border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100"
              >
                <Download className="h-4 w-4" />
                Descargar HTML
              </Button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {html && viewMode === "code" ? (
            <pre className="h-full overflow-auto bg-[#0d0d14] p-4 text-xs text-white/80">
              <code>{html}</code>
            </pre>
          ) : html ? (
            <div
              className={cn(
                "h-full",
                previewDevice === "mobile" && "flex items-center justify-center bg-[#0b0518] py-6",
              )}
            >
              <iframe
                title="Vista previa del sitio generado"
                srcDoc={html}
                sandbox="allow-scripts"
                className={cn(
                  "border-0 bg-white",
                  previewDevice === "mobile" ? "h-[700px] w-[375px] rounded-2xl shadow-2xl" : "h-full w-full",
                )}
              />
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 overflow-y-auto bg-gradient-to-br from-[#1a0b3d] via-[#2a0f4d] to-[#0b0518] px-6 py-8 text-center">
              <GafcoreLogo variant="hero" className="scale-90" />
              <p className="max-w-md text-base text-white/70">
                Diseña, construye y publica tu sitio web describiéndolo en lenguaje
                natural. La IA escribe el código, tú diriges la visión.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {["Diseño profesional", "Generación con IA", "Vista previa en vivo"].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-white/80"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-sm text-white/40">
                Empieza escribiendo en el chat lo que quieres construir.
              </p>
            </div>
          )}
        </div>
      </div>
      </div>

      <Dialog open={comingSoonAudit} onOpenChange={setComingSoonAudit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Auditar y mejorar</DialogTitle>
            <DialogDescription>
              Esta función llega en una próxima fase del Builder V2: análisis automático
              de tu sitio con sugerencias de mejora de diseño y contenido.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
