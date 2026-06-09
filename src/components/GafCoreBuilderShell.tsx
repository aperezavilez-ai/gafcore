import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, Home, FolderKanban, Wand2, Rocket, LayoutTemplate, Database,
  Plug2, Globe, Coins, BookOpen, Users, LifeBuoy, Bell, Send, Paperclip,
  ShoppingBag, Code2, Settings as SettingsIcon, Eye, Smartphone, Monitor,
  RefreshCw, ChevronDown, History, Crown, Menu, X, ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import {
  GafCoreOnboarding,
  isGafcoreOnboardingDone,
} from "@/components/gafcore/GafCoreOnboarding";

interface BuilderShellProps {
  onStart: (prompt: string) => void;
  onExitToCreator?: () => void;
  userName?: string;
}

const QUICK_STARTS = [
  { icon: LayoutTemplate, title: "Crear una app SaaS", desc: "Sistema de gestión de tareas con dashboards", prompt: "Crea una app SaaS de gestión de tareas con dashboards, autenticación y planes de pago." },
  { icon: Globe, title: "Crear un sitio web", desc: "Landing page para un producto de IA", prompt: "Crea una landing page moderna para un producto de IA con hero, features, pricing y FAQ." },
  { icon: ShoppingBag, title: "Crear una tienda online", desc: "E-commerce para productos digitales", prompt: "Crea una tienda online para productos digitales con catálogo, carrito y checkout." },
  { icon: Code2, title: "Crear una API", desc: "API REST para gestionar usuarios y contenidos", prompt: "Crea una API REST con autenticación JWT para gestionar usuarios y contenidos." },
];

const NAV_ITEMS = [
  { id: "inicio", label: "Inicio", icon: Home },
  { id: "proyectos", label: "Proyectos", icon: FolderKanban },
  { id: "ia", label: "IA Builder", icon: Wand2 },
  { id: "despliegues", label: "Despliegues", icon: Rocket },
  { id: "plantillas", label: "Plantillas", icon: LayoutTemplate },
  { id: "db", label: "Base de datos", icon: Database },
  { id: "integraciones", label: "Integraciones", icon: Plug2 },
  { id: "dominios", label: "Dominios", icon: Globe },
  { id: "creditos", label: "Créditos", icon: Coins },
];

const ACTIVITY = [
  { label: "Entendiendo tu idea", desc: "Analizando requerimientos…", color: "bg-violet-500" },
  { label: "Diseñando interfaz", desc: "Creando componentes…", color: "bg-fuchsia-500" },
  { label: "Construyendo lógica", desc: "Escribiendo código…", color: "bg-slate-500/40" },
  { label: "Conectando servicios", desc: "Integrando APIs y DB…", color: "bg-slate-500/40" },
  { label: "Optimizando", desc: "Mejorando rendimiento…", color: "bg-slate-500/40" },
  { label: "Preparando despliegue", desc: "Casi listo…", color: "bg-slate-500/40" },
];

export function GafCoreBuilderShell({ onStart, onExitToCreator, userName }: BuilderShellProps) {
  const [active, setActive] = useState<string>("ia");
  const [prompt, setPrompt] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [navOpen, setNavOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuth();
  const { balance } = useCredits(user?.id);

  const greeting = useMemo(() => userName?.split(" ")[0] || "creador", [userName]);

  useEffect(() => {
    if (!isGafcoreOnboardingDone()) setOnboardingOpen(true);
  }, []);

  useEffect(() => {
    if (!onboardingOpen) taRef.current?.focus();
  }, [onboardingOpen]);

  const submit = (text: string) => {
    const v = text.trim();
    if (!v) return;
    try { sessionStorage.setItem("gafcore_initial_prompt", v); } catch {}
    onStart(v);
  };

  const currentBalance = balance ?? 200;
  const balanceMax = Math.max(450, currentBalance);
  const balancePct = Math.min(100, Math.max(0, (currentBalance / balanceMax) * 100));
  const formatNum = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
    : n >= 10_000 ? `${(n / 1000).toFixed(0)}k`
    : n.toLocaleString("es");

  return (
    <div className="flex h-dvh w-full bg-[#0a0c14] text-slate-100">
      <GafCoreOnboarding
        open={onboardingOpen}
        onComplete={(generated) => {
          setOnboardingOpen(false);
          setPrompt(generated);
          submit(generated);
        }}
        onSkip={() => setOnboardingOpen(false)}
      />
      {/* Mobile drawer overlay */}
      {navOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      {/* Sidebar (desktop) + Drawer (mobile) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-white/5 bg-[#0b0f1a] transition-transform duration-200 md:static md:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl text-white font-bold text-lg"
              style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }}>G</div>
            <span className="text-base font-bold tracking-tight">GafCore</span>
          </div>
          <button
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/5"
            onClick={() => setNavOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="px-3 mt-2 flex-1 overflow-y-auto">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((it) => {
              const Icon = it.icon;
              const isActive = active === it.id;
              return (
                <li key={it.id}>
                  <button
                    onClick={() => { setActive(it.id); setNavOpen(false); }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                      isActive
                        ? "bg-violet-500/15 text-white border border-violet-500/30"
                        : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <Icon size={16} className={isActive ? "text-violet-400" : "text-slate-400"} />
                    {it.label}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="my-4 h-px bg-white/5" />

          <ul className="space-y-0.5">
            {[
              { l: "Documentación", i: BookOpen },
              { l: "Comunidad", i: Users },
              { l: "Soporte", i: LifeBuoy },
            ].map(({ l, i: Icon }) => (
              <li key={l}>
                <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5">
                  <Icon size={16} className="text-slate-400" /> {l}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Credits card */}
        <div className="m-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <div className="text-xs text-slate-400">Créditos</div>
          <div className="mt-1 flex items-baseline gap-1 min-w-0">
            <span className="text-2xl font-bold text-white truncate" title={String(currentBalance)}>{formatNum(currentBalance)}</span>
            <span className="text-xs text-slate-500 shrink-0">/ {formatNum(balanceMax)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full" style={{ width: `${balancePct}%`, background: "linear-gradient(90deg,#6366f1,#a855f7)" }} />
          </div>
          <div className="mt-2 text-[11px] text-slate-500">Renueva el 1 Jun 2025</div>
          <button className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/25 border border-violet-500/30">
            <Crown size={13} /> Actualizar plan
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between gap-2 border-b border-white/5 bg-[#0b0f1a] px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <button
              className="md:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-white/5"
              onClick={() => setNavOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu size={18} />
            </button>
            <button className="inline-flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-white hover:bg-white/5">
              <span className="truncate max-w-[120px] sm:max-w-none">Mi proyecto</span>
              <ChevronDown size={14} className="text-slate-400 shrink-0" />
            </button>
            {onExitToCreator ? (
              <button
                type="button"
                onClick={onExitToCreator}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-500/20"
                title="Volver al panel creador"
              >
                <ArrowLeft size={14} />
                <span className="hidden sm:inline">Panel creador</span>
              </button>
            ) : null}
            <span className="hidden xs:inline rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-300">Admin · IA Builder</span>
          </div>

          <div className="hidden lg:flex items-center gap-1 rounded-full border border-white/5 bg-white/[0.03] p-1">
            {["Builder", "Base de datos", "API", "Configuración"].map((t, i) => (
              <button
                key={t}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                  i === 0 ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
                }`}
              >{t}</button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button className="hidden sm:inline-flex rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10">
              Vista previa
            </button>
            <button className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }}>
              Publicar
            </button>
            <button className="hidden sm:flex ml-1 h-9 w-9 items-center justify-center rounded-full text-slate-300 hover:bg-white/5">
              <Bell size={16} />
            </button>
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-violet-500/30 text-sm font-semibold text-white">
              {greeting.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Body — split */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          {/* Asistente */}
          <section className="min-h-0 overflow-y-auto border-r border-white/5 p-6 lg:p-8">
            <div className="mb-5 flex items-center justify-between">
              <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-200">
                <Sparkles size={16} className="text-violet-400" /> Asistente de IA
              </div>
              <div className="flex items-center gap-1 text-slate-400">
                <button className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/5"><History size={15} /></button>
                <button className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/5"><SettingsIcon size={15} /></button>
              </div>
            </div>

            <h1 className="text-3xl font-bold tracking-tight">¡Hola, {greeting}! <span className="inline-block">👋</span></h1>
            <p className="mt-1 text-sm text-slate-400">Estoy aquí para ayudarte a construir lo que imaginas.</p>

            {/* Quick start cards */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {QUICK_STARTS.map((q) => {
                const Icon = q.icon;
                return (
                  <button
                    key={q.title}
                    onClick={() => submit(q.prompt)}
                    className="group rounded-xl border border-white/5 bg-white/[0.02] p-4 text-left transition hover:border-violet-500/40 hover:bg-violet-500/5"
                  >
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300 group-hover:bg-violet-500/25">
                      <Icon size={18} />
                    </div>
                    <div className="text-sm font-semibold text-white">{q.title}</div>
                    <div className="mt-1 text-xs text-slate-400">{q.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* Prompt input */}
            <div className="mt-7">
              <div className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-violet-300">
                Describe tu idea…
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); submit(prompt); }}
                className="rounded-2xl border border-white/10 bg-[#0f1320] p-3 focus-within:border-violet-400/50"
              >
                <textarea
                  ref={taRef}
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(prompt); } }}
                  placeholder="Ejemplo: Crea una plataforma de música con suscripciones, pagos y dashboard para artistas"
                  className="w-full resize-none bg-transparent px-2 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
                />
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/5" aria-label="Adjuntar">
                      <Paperclip size={15} />
                    </button>
                    <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/10">
                      <Sparkles size={13} className="text-violet-400" /> Mejorar prompt
                    </button>
                  </div>
                  <button
                    type="submit"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                    style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }}
                    aria-label="Enviar"
                  >
                    <Send size={15} />
                  </button>
                </div>
              </form>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">Modelo</label>
                  <button className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 hover:bg-white/5">
                    GafCore AI Pro <ChevronDown size={14} className="text-slate-400" />
                  </button>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">Modo</label>
                  <button className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 hover:bg-white/5">
                    Automático <ChevronDown size={14} className="text-slate-400" />
                  </button>
                </div>
              </div>

              <p className="mt-3 text-center text-[11px] text-slate-500">
                La IA puede cometer errores. Verifica siempre los resultados.
              </p>
            </div>
          </section>

          {/* Vista previa */}
          <section className="min-h-0 overflow-hidden bg-[#0a0c14] p-6 lg:p-8">
            <div className="mb-5 flex items-center justify-between">
              <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-200">
                <Eye size={15} className="text-violet-400" /> Vista previa
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                  <button
                    onClick={() => setDevice("desktop")}
                    className={`flex h-7 w-7 items-center justify-center rounded-md ${device === "desktop" ? "bg-violet-500/20 text-violet-300" : "text-slate-400 hover:text-white"}`}
                    aria-label="Escritorio"
                  ><Monitor size={14} /></button>
                  <button
                    onClick={() => setDevice("mobile")}
                    className={`flex h-7 w-7 items-center justify-center rounded-md ${device === "mobile" ? "bg-violet-500/20 text-violet-300" : "text-slate-400 hover:text-white"}`}
                    aria-label="Móvil"
                  ><Smartphone size={14} /></button>
                </div>
                <button className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/5"><RefreshCw size={14} /></button>
                <button className="hidden sm:inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-white/5">
                  Ancho completo <ChevronDown size={13} />
                </button>
              </div>
            </div>

            <div className="relative flex h-[calc(100%-3rem)] items-center justify-center rounded-2xl border border-white/5 bg-[#0a0d18]">
              <div className="text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl text-white text-2xl font-bold shadow-2xl"
                  style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)", boxShadow: "0 20px 60px -10px rgba(168,85,247,0.45)" }}>G</div>
                <h2 className="text-xl font-bold text-white">Tu proyecto se verá aquí</h2>
                <p className="mx-auto mt-2 max-w-xs text-sm text-slate-400">
                  Describe tu idea en el chat y la IA comenzará a construir tu aplicación.
                </p>
              </div>
              {/* Decorative arrow */}
              <svg className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2" width="120" height="80" viewBox="0 0 120 80" fill="none">
                <path d="M10 70 C 30 30, 70 20, 100 50" stroke="url(#g)" strokeWidth="2" strokeLinecap="round" fill="none" strokeDasharray="3 4"/>
                <path d="M100 50 L 92 44 M100 50 L 96 60" stroke="url(#g)" strokeWidth="2" strokeLinecap="round"/>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="120" y2="80" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#6366f1"/><stop offset="1" stopColor="#a855f7"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </section>
        </div>

        {/* Activity bar */}
        <div className="border-t border-white/5 bg-[#0b0f1a] px-4 py-3">
          <div className="mb-2 text-xs font-medium text-slate-300">Actividad de la IA</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {ACTIVITY.map((a) => (
              <div key={a.label} className="flex min-w-[180px] items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${a.color}`} />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-white">{a.label}</div>
                  <div className="truncate text-[11px] text-slate-400">{a.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
