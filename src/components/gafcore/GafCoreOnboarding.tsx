import { useMemo, useState } from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  Globe,
  Smartphone,
  Code2,
  Store,
  UtensilsCrossed,
  GraduationCap,
  HeartPulse,
  Briefcase,
  Music,
  Sparkles,
  LogIn,
  CreditCard,
  Bell,
  Map,
  BarChart2,
  MessageCircle,
  Moon,
  Sun,
  Palette,
  Minimize2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const GAFCORE_ONBOARDING_DONE_KEY = "gafcore-onboarding-done";

type ProjectType = "saas" | "store" | "landing" | "mobile" | "api" | "marketplace";
type Industry = "restaurant" | "education" | "health" | "business" | "music" | "general";
type FeatureId = "login" | "stripe" | "notifications" | "maps" | "analytics" | "chat";
type VisualStyle = "dark" | "light" | "colorful" | "minimal";

type Props = {
  open: boolean;
  onComplete: (prompt: string) => void;
  onSkip: () => void;
};

const PROJECT_TYPES: Array<{
  id: ProjectType;
  label: string;
  desc: string;
  icon: React.ElementType;
}> = [
  { id: "saas", label: "SaaS / Dashboard", desc: "Planes, métricas y panel de usuario", icon: LayoutDashboard },
  { id: "store", label: "Tienda online", desc: "Catálogo, carrito y checkout", icon: ShoppingBag },
  { id: "landing", label: "Sitio web / Landing", desc: "Marketing, hero y conversión", icon: Globe },
  { id: "mobile", label: "App móvil", desc: "Mobile-first o PWA táctil", icon: Smartphone },
  { id: "api", label: "API / Backend", desc: "REST, auth y persistencia", icon: Code2 },
  { id: "marketplace", label: "Marketplace", desc: "Multi-vendedor y comisiones", icon: Store },
];

const INDUSTRIES: Array<{ id: Industry; label: string; icon: React.ElementType }> = [
  { id: "restaurant", label: "Restaurante", icon: UtensilsCrossed },
  { id: "education", label: "Educación", icon: GraduationCap },
  { id: "health", label: "Salud", icon: HeartPulse },
  { id: "business", label: "Negocios", icon: Briefcase },
  { id: "music", label: "Música", icon: Music },
  { id: "general", label: "General", icon: Sparkles },
];

const FEATURES: Array<{ id: FeatureId; label: string; icon: React.ElementType }> = [
  { id: "login", label: "Login / Auth", icon: LogIn },
  { id: "stripe", label: "Pagos Stripe", icon: CreditCard },
  { id: "notifications", label: "Notificaciones", icon: Bell },
  { id: "maps", label: "Mapas", icon: Map },
  { id: "analytics", label: "Analytics", icon: BarChart2 },
  { id: "chat", label: "Chat", icon: MessageCircle },
];

const STYLES: Array<{ id: VisualStyle; label: string; icon: React.ElementType }> = [
  { id: "dark", label: "Dark moderno", icon: Moon },
  { id: "light", label: "Light limpio", icon: Sun },
  { id: "colorful", label: "Colorido", icon: Palette },
  { id: "minimal", label: "Minimalista", icon: Minimize2 },
];

const PROJECT_LABELS: Record<ProjectType, string> = {
  saas: "aplicación SaaS con dashboard",
  store: "tienda online",
  landing: "sitio web / landing page",
  mobile: "app móvil",
  api: "API / backend",
  marketplace: "marketplace",
};

const INDUSTRY_LABELS: Record<Industry, string> = {
  restaurant: "restaurantes y hostelería",
  education: "educación",
  health: "salud",
  business: "negocios",
  music: "música",
  general: "uso general",
};

const STYLE_LABELS: Record<VisualStyle, string> = {
  dark: "dark moderno con acentos violeta",
  light: "light limpio y profesional",
  colorful: "colorido y vibrante",
  minimal: "minimalista con mucho espacio en blanco",
};

const FEATURE_PROMPTS: Record<FeatureId, string> = {
  login: "login y autenticación de usuarios",
  stripe: "pagos con Stripe",
  notifications: "notificaciones push o por email",
  maps: "mapas y geolocalización",
  analytics: "analytics y métricas",
  chat: "chat en vivo o mensajería",
};

export function buildGafcoreOnboardingPrompt(opts: {
  projectType: ProjectType;
  industry: Industry;
  features: FeatureId[];
  visualStyle: VisualStyle;
}): string {
  const featuresText =
    opts.features.length > 0
      ? opts.features.map((f) => FEATURE_PROMPTS[f]).join(", ")
      : "las funcionalidades esenciales del tipo de proyecto";

  return [
    `Crea una ${PROJECT_LABELS[opts.projectType]} para la industria de ${INDUSTRY_LABELS[opts.industry]}.`,
    `Incluye: ${featuresText}.`,
    `Estilo visual: ${STYLE_LABELS[opts.visualStyle]}.`,
    "Usa React + Vite, componentes funcionales, datos en localStorage donde aplique, y deja el proyecto listo para iterar en el IDE de GafCore.",
  ].join(" ");
}

export function isGafcoreOnboardingDone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(GAFCORE_ONBOARDING_DONE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markGafcoreOnboardingDone(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GAFCORE_ONBOARDING_DONE_KEY, "1");
  } catch {
    /* quota */
  }
}

function SelectionCard({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border text-left transition-all duration-200",
        selected
          ? "border-violet-400/60 bg-violet-500/15 shadow-[0_0_24px_-6px_rgba(139,92,246,0.55)] ring-1 ring-violet-400/40"
          : "border-white/10 bg-white/[0.03] hover:border-violet-400/35 hover:bg-violet-500/8",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function GafCoreOnboarding({ open, onComplete, onSkip }: Props) {
  const [step, setStep] = useState(0);
  const [projectType, setProjectType] = useState<ProjectType | null>(null);
  const [industry, setIndustry] = useState<Industry | null>(null);
  const [features, setFeatures] = useState<FeatureId[]>([]);
  const [visualStyle, setVisualStyle] = useState<VisualStyle | null>(null);

  const canNext = useMemo(() => {
    if (step === 0) return projectType !== null;
    if (step === 1) return industry !== null;
    if (step === 2) return true;
    if (step === 3) return visualStyle !== null;
    return false;
  }, [step, projectType, industry, visualStyle]);

  const toggleFeature = (id: FeatureId) => {
    setFeatures((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
    );
  };

  const finish = () => {
    if (!projectType || !industry || !visualStyle) return;
    markGafcoreOnboardingDone();
    onComplete(
      buildGafcoreOnboardingPrompt({ projectType, industry, features, visualStyle }),
    );
  };

  const skip = () => {
    markGafcoreOnboardingDone();
    onSkip();
  };

  const goNext = () => {
    if (step < 3) {
      setStep((s) => s + 1);
      return;
    }
    finish();
  };

  const titles = [
    "¿Qué quieres construir?",
    "¿Para qué industria?",
    "¿Qué funciones necesitas?",
    "¿Estilo visual?",
  ];

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden border-violet-500/20 bg-[#0a0c14] p-0 text-slate-100 shadow-2xl shadow-violet-950/40 sm:max-w-xl"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-violet-600/25 via-fuchsia-600/10 to-transparent"
          aria-hidden
        />

        <DialogHeader className="relative space-y-1 border-b border-white/10 px-6 py-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }}
              >
                G
              </div>
              <DialogTitle className="text-base font-semibold text-white">
                Bienvenido a GafCore
              </DialogTitle>
            </div>
            <span className="text-xs text-violet-200/70 tabular-nums">{step + 1} / 4</span>
          </div>
          <DialogDescription className="text-slate-300">{titles[step]}</DialogDescription>
          <div className="flex gap-1.5 pt-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-all duration-300",
                  i <= step
                    ? "bg-gradient-to-r from-violet-500 to-fuchsia-500"
                    : "bg-white/10",
                )}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="relative max-h-[min(52vh,420px)] overflow-y-auto px-6 py-5">
          {step === 0 ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {PROJECT_TYPES.map(({ id, label, desc, icon: Icon }) => (
                <SelectionCard
                  key={id}
                  selected={projectType === id}
                  onClick={() => setProjectType(id)}
                  className="p-3"
                >
                  <Icon className="mb-2 h-5 w-5 text-violet-300" />
                  <div className="text-sm font-semibold text-white">{label}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{desc}</div>
                </SelectionCard>
              ))}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {INDUSTRIES.map(({ id, label, icon: Icon }) => (
                <SelectionCard
                  key={id}
                  selected={industry === id}
                  onClick={() => setIndustry(id)}
                  className="flex items-center gap-2 px-3 py-2.5"
                >
                  <Icon className="h-4 w-4 shrink-0 text-violet-300" />
                  <span className="text-sm font-medium text-white">{label}</span>
                </SelectionCard>
              ))}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <p className="col-span-full mb-1 text-[11px] text-slate-400">
                Selección múltiple — elige todas las que necesites
              </p>
              {FEATURES.map(({ id, label, icon: Icon }) => {
                const on = features.includes(id);
                return (
                  <SelectionCard
                    key={id}
                    selected={on}
                    onClick={() => toggleFeature(id)}
                    className="flex items-center gap-2 px-3 py-2.5"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-violet-300" />
                    <span className="text-sm font-medium text-white">{label}</span>
                  </SelectionCard>
                );
              })}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid grid-cols-2 gap-2.5">
              {STYLES.map(({ id, label, icon: Icon }) => (
                <SelectionCard
                  key={id}
                  selected={visualStyle === id}
                  onClick={() => setVisualStyle(id)}
                  className="flex items-center gap-2 px-3 py-3"
                >
                  <Icon className="h-4 w-4 shrink-0 text-violet-300" />
                  <span className="text-sm font-medium text-white">{label}</span>
                </SelectionCard>
              ))}
            </div>
          ) : null}
        </div>

        <div className="relative flex items-center justify-between gap-2 border-t border-white/10 bg-black/20 px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:bg-white/5 hover:text-white"
            onClick={skip}
          >
            Saltar
          </Button>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                onClick={() => setStep((s) => s - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Atrás
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={!canNext}
              className="border-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-40"
              onClick={goNext}
            >
              {step === 3 ? "Empezar" : "Siguiente"}
              {step < 3 ? <ChevronRight className="h-4 w-4" /> : null}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
