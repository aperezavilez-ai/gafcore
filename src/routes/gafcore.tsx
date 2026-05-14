import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { assignGafcoreAccountType } from "@/lib/gafcore-roles.functions";
import { Button } from "@/components/ui/button";
import {
  Check, ArrowRight, Rocket, Zap, Crown, Gift,
  Sparkles, Database, Cloud, Shield, Layers, Headphones,
  Palette, Wand2, MousePointerClick,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckoutExperience } from "@/components/CheckoutExperience";
import { GafcoreContactSupportDialog } from "@/components/GafcoreContactSupportDialog";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/i18n/I18nProvider";
import { clearPlanChoicePending } from "@/lib/gafcore-plan-choice";
import { toast } from "sonner";

type ThemeKey = "black" | "white" | "blue" | "gray";
const THEME_KEY = "gafcore-theme";
const THEMES: { key: ThemeKey; label: string; swatch: string }[] = [
  { key: "black", label: "Negro", swatch: "#0b0d12" },
  { key: "white", label: "Blanco", swatch: "#ffffff" },
  { key: "blue", label: "Azul", swatch: "#1e40af" },
  { key: "gray", label: "Gris", swatch: "#6b7280" },
];

function useGafcoreTheme() {
  const [theme, setTheme] = useState<ThemeKey>("black");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY) as ThemeKey | null;
      if (saved && THEMES.some((t) => t.key === saved)) setTheme(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }, [theme]);
  return { theme, setTheme };
}

function ThemeSwitcher({
  theme, setTheme,
}: { theme: ThemeKey; setTheme: (t: ThemeKey) => void }) {
  return (
    <div
      className="flex items-center gap-1 rounded-full border p-1 shadow-[inset_0_1px_0_0_color-mix(in_oklab,var(--gc-fg)_6%,transparent)]"
      style={{
        borderColor: "color-mix(in oklab, var(--gc-border) 50%, transparent)",
        background: "color-mix(in oklab, var(--gc-fg) 5%, transparent)",
      }}
    >
      <Palette className="ml-2 mr-1 h-3.5 w-3.5 gc-muted" />
      {THEMES.map((t) => {
        const active = t.key === theme;
        return (
          <button
            key={t.key}
            onClick={() => setTheme(t.key)}
            title={t.label}
            aria-label={`Tema ${t.label}`}
            className="h-6 w-6 rounded-full transition-transform hover:scale-110"
            style={{
              background: t.swatch,
              border: t.key === "white" ? "1px solid #d4d4d8" : "1px solid rgba(255,255,255,0.15)",
              outline: active ? "2px solid var(--gc-accent)" : "none",
              outlineOffset: 2,
            }}
          />
        );
      })}
    </div>
  );
}

const GAFCORE_PLANS_UI = [
  { id: "free", price: 0, credits: "10", icon: Gift, highlight: false },
  { id: "plan_basico_monthly", price: 19, credits: "70", icon: Rocket, highlight: false },
  { id: "plan_pro_monthly", price: 49, credits: "150", icon: Zap, highlight: true },
  { id: "plan_premium_monthly", price: 99, credits: "350", icon: Crown, highlight: false },
] as const;

function planNameKey(id: string): string {
  if (id === "free") return "gc.plan.free";
  if (id === "plan_basico_monthly") return "gc.names.starter";
  if (id === "plan_pro_monthly") return "gc.names.creator";
  return "gc.names.pro";
}

const FEATURE_ROWS = [
  { icon: Sparkles, titleKey: "gc.feat.ai.title", descKey: "gc.feat.ai.desc" },
  { icon: MousePointerClick, titleKey: "gc.feat.editor.title", descKey: "gc.feat.editor.desc" },
  { icon: Database, titleKey: "gc.feat.db.title", descKey: "gc.feat.db.desc" },
  { icon: Cloud, titleKey: "gc.feat.deploy.title", descKey: "gc.feat.deploy.desc" },
  { icon: Wand2, titleKey: "gc.feat.multi.title", descKey: "gc.feat.multi.desc" },
  { icon: Layers, titleKey: "gc.feat.integ.title", descKey: "gc.feat.integ.desc" },
] as const;

const BOTTOM_ROWS = [
  { icon: Sparkles, titleKey: "gc.bottom.ai.title", descKey: "gc.bottom.ai.desc" },
  { icon: Shield, titleKey: "gc.bottom.sec.title", descKey: "gc.bottom.sec.desc" },
  { icon: Cloud, titleKey: "gc.bottom.scale.title", descKey: "gc.bottom.scale.desc" },
  { icon: Headphones, titleKey: "gc.bottom.support.title", descKey: "gc.bottom.support.desc" },
] as const;

function GafCoreLanding() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const assignUserWelcome = useServerFn(assignGafcoreAccountType);
  const { theme, setTheme } = useGafcoreTheme();
  const [checkoutPriceId, setCheckoutPriceId] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);

  /** Tras verificar correo: URL con ?pick_plan=1 → tabla de planes (añadir en Supabase Auth URL redirects). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("pick_plan") !== "1") return;
    url.searchParams.delete("pick_plan");
    const qs = url.searchParams.toString();
    window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
    queueMicrotask(() => {
      document.getElementById("planes")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  /** Créditos bienvenida / reparación al entrar con sesión (misma lógica que /gafcore/app). */
  useEffect(() => {
    if (authLoading || !user?.id) return;
    void (async () => {
      const id = user.id;
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(`gafcore_welcome_sync_v2_${id}`);
      }
      const k = `gafcore_welcome_sync_v3_${id}`;
      if (typeof window !== "undefined" && sessionStorage.getItem(k)) return;
      try {
        await assignUserWelcome({ data: { accountType: "user" } });
        if (typeof window !== "undefined") {
          sessionStorage.setItem(k, "1");
          window.dispatchEvent(new Event("gafcore:credits-refresh"));
        }
      } catch {
        /* reintento en la próxima visita */
      }
    })();
  }, [authLoading, user?.id, assignUserWelcome]);

  useEffect(() => {
    if (!user?.id) return;
    const url = new URL(window.location.href);
    const planParam = url.searchParams.get("plan");
    if (!planParam) return;
    url.searchParams.delete("plan");
    const qs = url.searchParams.toString();
    window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
    if (planParam === "free") {
      clearPlanChoicePending(user.id);
      toast.success("Plan gratis: entra al editor con 10 créditos de bienvenida.");
      navigate({ to: "/gafcore/app" });
      return;
    }
    setCheckoutPriceId(planParam);
  }, [user?.id, navigate]);

  const choosePlan = (planId: string) => {
    if (user?.id) {
      navigate({ to: "/gafcore", search: { plan: planId } });
      return;
    }
    navigate({ to: "/gafcore/register", search: { plan: planId, redirect: `/gafcore?plan=${planId}` } });
  };

  return (
    <div className={`gafcore-theme-${theme} gc-surface min-h-screen`}>
      {/* Header */}
      <header className="border-b gc-border" style={{ background: "color-mix(in oklab, var(--gc-bg) 80%, transparent)", backdropFilter: "blur(10px)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/gafcore" className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white text-lg"
              style={{ background: "var(--gc-cta)", fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700 }}
            >G</div>
            <span className="text-lg font-bold" style={{ color: "var(--gc-fg)" }}>GafCore</span>
          </Link>
          <nav className="flex flex-1 flex-wrap items-center justify-center gap-4 text-sm gc-muted md:gap-6">
            <a href="#producto" className="hover:opacity-80">{t("gc.nav.product")}</a>
            <a href="#planes" className="hover:opacity-80">{t("gc.nav.pricing")}</a>
            <a href="#empresa" className="hover:opacity-80">{t("gc.nav.company")}</a>
            <button
              type="button"
              onClick={() => setContactOpen(true)}
              className="bg-transparent p-0 font-inherit hover:opacity-80"
            >
              {t("gc.nav.contact")}
            </button>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher variant="compact" />
            <Button asChild size="sm" variant="ghost" className="rounded-full px-4">
              <Link to="/gafcore/login" search={{ redirect: "/gafcore/app" }}>{t("gc.auth.login")}</Link>
            </Button>
            <Button asChild size="sm" className="gc-cta rounded-full px-4">
              <Link to="/gafcore/register" search={{ redirect: "/gafcore#planes" }}>{t("gc.auth.register")}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gc-hero-glow pointer-events-none" />
        <div className="relative mx-auto max-w-5xl px-6 pt-20 pb-10 text-center">
          <span className="gc-chip mb-6">
            <Sparkles className="h-3.5 w-3.5" /> {t("gc.hero.badge")}
          </span>
          <h1
            className="text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.05] tracking-tight"
            style={{ color: "var(--gc-fg)" }}
          >
            {t("gc.hero.title1")} <br className="hidden sm:block" />
            {t("gc.hero.title2")}{" "}
            <span style={{
              background: "var(--gc-cta)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>{t("gc.hero.titleAccent")}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg gc-muted">
            {t("gc.hero.subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="gc-cta rounded-full px-7 h-12 text-base font-semibold">
              <a href="#plan-free">{t("gc.hero.cta")}</a>
            </Button>
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            <span className="gc-chip"><Check className="h-3 w-3" /> {t("gc.hero.trust0")}</span>
            <span className="gc-chip"><Check className="h-3 w-3" /> {t("gc.hero.trust1")}</span>
            <span className="gc-chip"><Check className="h-3 w-3" /> {t("gc.hero.trust2")}</span>
            <span className="gc-chip"><Check className="h-3 w-3" /> {t("gc.hero.trust3")}</span>
          </div>
        </div>
      </section>

      {/* Plans — justo tras el hero; ancla #plan-free para CTA "Comenzar gratis" */}
      <section id="planes" className="scroll-mt-24 pb-20 pt-2" style={{ background: "var(--gc-bg-soft)" }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold" style={{ color: "var(--gc-fg)" }}>{t("gc.plans.title")}</h2>
            <p className="mt-3 gc-muted">{t("gc.plans.subtitle")}</p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            {GAFCORE_PLANS_UI.map((plan) => {
              const Icon = plan.icon;
              const highlight = plan.highlight;
              const featLines = t(`gc.plan.${plan.id}.f`).split("|").filter(Boolean);
              return (
                <div
                  key={plan.id}
                  id={plan.id === "free" ? "plan-free" : undefined}
                  className={`gc-card gc-card--dim relative flex scroll-mt-28 flex-col p-6 sm:p-6 ${highlight ? "gc-card--popular" : ""}`}
                >
                  {highlight && (
                    <span
                      className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider shadow-sm backdrop-blur-sm"
                      style={{
                        border: "1px solid color-mix(in oklab, var(--gc-accent) 40%, transparent)",
                        background: "color-mix(in oklab, var(--gc-accent) 12%, var(--gc-card))",
                        color: "var(--gc-accent)",
                      }}
                    >
                      {t("gc.plans.popular")}
                    </span>
                  )}
                  <div className="mb-4 flex items-center gap-2.5">
                    <div className="gc-feature-icon h-9 w-9 rounded-lg">
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </div>
                    <h3 className="text-base font-semibold tracking-tight" style={{ color: "var(--gc-fg)" }}>
                      {t(planNameKey(plan.id))}
                    </h3>
                  </div>
                  <div className="mb-1 flex items-baseline gap-1" style={{ color: "var(--gc-fg)" }}>
                    {plan.id === "free"
                      ? <span className="text-2xl font-bold tracking-tight">{t("gc.plan.free")}</span>
                      : <><span className="text-2xl font-bold tracking-tight">${plan.price}</span><span className="text-xs gc-muted">{t("gc.plan.perMonth")}</span></>}
                  </div>
                  <p className="mb-4 text-xs leading-relaxed gc-muted">{t(`gc.plan.${plan.id}.desc`)}</p>
                  <div
                    className="mb-4 rounded-lg px-3 py-2 text-xs shadow-[inset_0_1px_0_0_color-mix(in_oklab,var(--gc-fg)_4%,transparent)]"
                    style={{
                      background: "color-mix(in oklab, var(--gc-fg) 5%, transparent)",
                      color: "var(--gc-fg)",
                    }}
                  >
                    <span className="font-semibold tabular-nums">{plan.credits}</span>{" "}
                    {plan.id === "free" ? t("gc.plan.creditsWelcome") : t("gc.plan.creditsMonth")}
                  </div>
                  <ul className="mb-5 flex-1 space-y-2">
                    {featLines.map((line, i) => (
                      <li key={`${plan.id}-${i}`} className="flex items-start gap-2 text-xs leading-snug gc-muted">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-90" style={{ color: "var(--gc-accent)" }} />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={() => {
                      if (plan.id === "free") {
                        if (user?.id) {
                          clearPlanChoicePending(user.id);
                          navigate({ to: "/gafcore/app" });
                          return;
                        }
                        navigate({
                          to: "/gafcore/register",
                          search: { plan: "free" },
                        });
                        return;
                      }
                      choosePlan(plan.id);
                    }}
                    className={highlight ? "w-full gc-cta" : "w-full"}
                    variant={highlight ? "default" : "outline"}
                    style={highlight ? undefined : { borderColor: "color-mix(in oklab, var(--gc-border) 35%, transparent)", color: "var(--gc-fg)", background: "transparent" }}
                  >
                    {plan.id === "free" ? t("gc.plan.ctaFree") : t("gc.plan.ctaPaid")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features — cuadrícula responsive, sin columna única tipo lista */}
      <section id="producto" className="relative scroll-mt-24 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold" style={{ color: "var(--gc-fg)" }}>
              {t("gc.features.title")}
            </h2>
            <p className="mt-3 max-w-2xl mx-auto gc-muted">{t("gc.features.subtitle")}</p>
          </div>
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-10 lg:grid-cols-3 lg:gap-x-10">
            {FEATURE_ROWS.map(({ icon: Icon, titleKey, descKey }) => (
              <div key={titleKey} className="flex gap-4 text-left sm:gap-4">
                <div className="gc-feature-icon mt-0.5 h-10 w-10 shrink-0 rounded-lg sm:h-11 sm:w-11 sm:rounded-xl">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold tracking-tight sm:text-base" style={{ color: "var(--gc-fg)" }}>
                    {t(titleKey)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed gc-muted">{t(descKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom benefits — banda continua, sin tarjetas */}
      <section
        id="recursos"
        className="scroll-mt-24 border-t py-12 gc-border"
        style={{
          borderColor: "color-mix(in oklab, var(--gc-border) 35%, transparent)",
          background: "color-mix(in oklab, var(--gc-bg-soft) 70%, var(--gc-bg) 30%)",
        }}
      >
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex flex-col md:flex-row md:items-start">
            {BOTTOM_ROWS.map(({ icon: Icon, titleKey, descKey }, i) => (
              <div
                key={titleKey}
                className={
                  i > 0
                    ? "flex flex-1 flex-row items-start gap-3 border-t py-6 md:flex-col md:items-center md:border-l md:border-t-0 md:px-6 md:py-0 md:text-center lg:px-8"
                    : "flex flex-1 flex-row items-start gap-3 py-6 md:flex-col md:items-center md:py-0 md:text-center"
                }
                style={{
                  borderColor: "color-mix(in oklab, var(--gc-border) 14%, transparent)",
                }}
              >
                <div className="gc-feature-icon h-10 w-10 shrink-0 rounded-lg">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 md:mt-3">
                  <div className="text-sm font-semibold tracking-tight" style={{ color: "var(--gc-fg)" }}>
                    {t(titleKey)}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed gc-muted">{t(descKey)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer — bloque único + links en fila */}
      <footer id="empresa" className="scroll-mt-24 border-t gc-border" style={{ background: "var(--gc-bg-soft)" }}>
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-sm shrink-0">
              <div className="mb-3 flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-md text-white"
                  style={{ background: "var(--gc-cta)", fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700 }}
                >
                  G
                </div>
                <span className="text-base font-bold" style={{ color: "var(--gc-fg)" }}>
                  GafCore
                </span>
              </div>
              <p className="text-xs leading-relaxed gc-muted">{t("gc.footer.tagline")}</p>
            </div>
            <nav className="flex flex-wrap gap-x-10 gap-y-8 text-xs">
              <div>
                <p className="mb-2.5 font-semibold" style={{ color: "var(--gc-fg)" }}>
                  {t("gc.footer.product")}
                </p>
                <ul className="space-y-1.5 gc-muted">
                  <li>
                    <a href="#producto" className="transition-opacity hover:opacity-80">
                      {t("gc.footer.feat")}
                    </a>
                  </li>
                  <li>
                    <a href="#planes" className="transition-opacity hover:opacity-80">
                      {t("gc.footer.templates")}
                    </a>
                  </li>
                  <li>
                    <a href="#planes" className="transition-opacity hover:opacity-80">
                      {t("gc.footer.pricing")}
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <p className="mb-2.5 font-semibold" style={{ color: "var(--gc-fg)" }}>
                  {t("gc.footer.resources")}
                </p>
                <ul className="space-y-1.5 gc-muted">
                  <li>
                    <a href="#" className="transition-opacity hover:opacity-80">
                      {t("gc.footer.docs")}
                    </a>
                  </li>
                  <li>
                    <a href="#" className="transition-opacity hover:opacity-80">
                      {t("gc.footer.guides")}
                    </a>
                  </li>
                  <li>
                    <a href="#" className="transition-opacity hover:opacity-80">
                      {t("gc.footer.blog")}
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <p className="mb-2.5 font-semibold" style={{ color: "var(--gc-fg)" }}>
                  {t("gc.footer.legal")}
                </p>
                <ul className="space-y-1.5 gc-muted">
                  <li>
                    <a href="/privacy" className="transition-opacity hover:opacity-80">
                      {t("gc.footer.privacy")}
                    </a>
                  </li>
                  <li>
                    <a href="/terms" className="transition-opacity hover:opacity-80">
                      {t("gc.footer.terms")}
                    </a>
                  </li>
                  <li>
                    <a href="/refund" className="transition-opacity hover:opacity-80">
                      {t("gc.footer.refunds")}
                    </a>
                  </li>
                </ul>
              </div>
            </nav>
          </div>
          <p className="mt-10 border-t pt-6 text-center text-xs gc-muted gc-border">
            © {new Date().getFullYear()} GafCore™. {t("gc.footer.rights")}
          </p>
        </div>
      </footer>

      <Dialog open={!!checkoutPriceId} onOpenChange={(o) => !o && setCheckoutPriceId(null)}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-5 sm:p-7">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("gc.checkout.title")}</DialogTitle>
          </DialogHeader>
          {checkoutPriceId && user && (() => {
            const selected = GAFCORE_PLANS_UI.find((p) => p.id === checkoutPriceId);
            if (!selected) return null;
            const featLines = t(`gc.plan.${selected.id}.f`).split("|").filter(Boolean);
            return (
              <CheckoutExperience
                brand="gafcore"
                plan={{
                  id: selected.id,
                  name: t(planNameKey(selected.id)),
                  price: selected.price,
                  credits: selected.credits,
                  desc: t(`gc.plan.${selected.id}.desc`),
                  features: featLines,
                }}
                user={{ id: user.id, email: user.email }}
                returnUrl={`${window.location.origin}/gafcore/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`}
              />
            );
          })()}
        </DialogContent>
      </Dialog>

      <GafcoreContactSupportDialog open={contactOpen} onOpenChange={setContactOpen} />
    </div>
  );
}

export const Route = createFileRoute("/gafcore")({
  validateSearch: (search: Record<string, unknown>): { plan?: string } => ({
    plan: typeof search.plan === "string" ? search.plan : undefined,
  }),
  component: GafCoreLanding,
  head: () => ({
    meta: [
      { title: "GafCore — Construye cualquier app o sitio web con IA" },
      { name: "description", content: "Describe tu idea en lenguaje natural y GafCore se encarga del código, diseño, base de datos y despliegue." },
    ],
  }),
});
