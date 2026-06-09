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
  { id: "saas", label: "SaaS", desc: "App con planes, dashboard y usuarios", icon: LayoutDashboard },
  { id: "store", label: "Tienda", desc: "E-commerce con catálogo y checkout", icon: ShoppingBag },
  { id: "landing", label: "Landing", desc: "Sitio de marketing y conversión", icon: Globe },
  { id: "mobile", label: "Móvil", desc: "App táctil, mobile-first o PWA", icon: Smartphone },
  { id: "api", label: "API", desc: "Backend REST con auth y datos", icon: Code2 },
  { id: "marketplace", label: "Marketplace", desc: "Plataforma multi-vendedor", icon: Store },
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
  { id: "login", label: "Login / registro", icon: LogIn },
  { id: "stripe", label: "Pagos Stripe", icon: CreditCard },
  { id: "notifications", label: "Notificaciones", icon: Bell },
  { id: "maps", label: "Mapas / ubicación", icon: Map },
  { id: "analytics", label: "Analytics", icon: BarChart2 },
  { id: "chat", label: "Chat en vivo", icon: MessageCircle },
];

const STYLES: Array<{ id: VisualStyle; label: string; icon: React.ElementType }> = [
  { id: "dark", label: "Oscuro", icon: Moon },
  { id: "light", label: "Claro", icon: Sun },
  { id: "colorful", label: "Colorido", icon: Palette },
  { id: "minimal", label: "Minimalista", icon: Minimize2 },
];

const PROJECT_LABELS: Record<ProjectType, string> = {
  saas: "aplicación SaaS",
  store: "tienda online",
  landing: "landing page",
  mobile: "app móvil",
  api: "API REST",
  marketplace: "marketplace",
};

const INDUSTRY_LABELS: Record<Industry, string> = {
  restaurant: "restaurantes y hostelería",
  education: "educación y formación",
  health: "salud y bienestar",
  business: "negocios y servicios profesionales",
  music: "música y entretenimiento",
  general: "uso general",
};

const STYLE_LABELS: Record<VisualStyle, string> = {
  dark: "tema oscuro elegante",
  light: "tema claro limpio",
  colorful: "diseño colorido y vibrante",
  minimal: "estilo minimalista con mucho espacio en blanco",
};

const FEATURE_PROMPTS: Record<FeatureId, string> = {
  login: "autenticación con registro, login y sesión de usuario",
  stripe: "pagos con Stripe (checkout o suscripciones)",
  notifications: "notificaciones push o por email",
  maps: "mapas interactivos y geolocalización",
  analytics: "panel de analytics y métricas de uso",
  chat: "chat en vivo o mensajería entre usuarios",
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
    `Crea una ${PROJECT_LABELS[opts.projectType]} para el sector de ${INDUSTRY_LABELS[opts.industry]}.`,
    `Incluye: ${featuresText}.`,
    `Diseño visual: ${STYLE_LABELS[opts.visualStyle]}.`,
    "Usa React + Vite, componentes funcionales, datos persistentes en localStorage donde aplique, y deja el proyecto listo para seguir iterando en el IDE de GafCore.",
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
    "¿Qué quieres crear?",
    "¿Para qué industria?",
    "¿Qué funcionalidades necesitas?",
    "¿Qué estilo visual prefieres?",
  ];

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-xl"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-1 border-b border-border px-6 py-4">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-base">Bienvenido a GafCore</DialogTitle>
            <span className="text-xs text-muted-foreground tabular-nums">
              {step + 1} / 4
            </span>
          </div>
          <DialogDescription>{titles[step]}</DialogDescription>
          <div className="flex gap-1 pt-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= step ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="max-h-[min(52vh,420px)] overflow-y-auto px-6 py-4">
          {step === 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PROJECT_TYPES.map(({ id, label, desc, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setProjectType(id)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition",
                    projectType === id
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border bg-muted/30 hover:border-primary/40",
                  )}
                >
                  <Icon className="mb-2 h-5 w-5 text-primary" />
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{desc}</div>
                </button>
              ))}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {INDUSTRIES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setIndustry(id)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition",
                    industry === id
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border bg-muted/30 hover:border-primary/40",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FEATURES.map(({ id, label, icon: Icon }) => {
                const on = features.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleFeature(id)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition",
                      on
                        ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                        : "border-border bg-muted/30 hover:border-primary/40",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid grid-cols-2 gap-2">
              {STYLES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setVisualStyle(id)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm transition",
                    visualStyle === id
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border bg-muted/30 hover:border-primary/40",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="ghost" size="sm" onClick={skip}>
            Saltar
          </Button>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep((s) => s - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Atrás
              </Button>
            ) : null}
            <Button type="button" size="sm" disabled={!canNext} onClick={goNext}>
              {step === 3 ? "Empezar" : "Siguiente"}
              {step < 3 ? <ChevronRight className="h-4 w-4" /> : null}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
