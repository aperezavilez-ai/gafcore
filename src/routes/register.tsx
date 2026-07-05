import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { authAbsoluteUrl } from "@/lib/auth-email-redirect";
import { supabase } from "@/lib/gafcore-supabase-client-proxy";
import { claimMasterAccess } from "@/lib/server-fns/admin.functions";
import { AuthCard } from "@/components/AuthCard";
import { GafcoreLogo } from "@/components/GafcoreLogo";
import { setPlanChoicePending } from "@/lib/gafcore-plan-choice";
import { useServerFn } from "@tanstack/react-start";
import { assertGafcoreSignupAllowed } from "@/lib/gafcore-register.functions";
import { TurnstileWidget, isTurnstileSiteKeyConfigured } from "@/components/TurnstileWidget";

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>): { plan?: string; redirect?: string } => {
    const plan = typeof search.plan === "string" ? search.plan : undefined;
    const redirect = typeof search.redirect === "string" && search.redirect.startsWith("/") && !search.redirect.startsWith("//")
      ? search.redirect
      : undefined;
    return { plan, redirect };
  },
  component: RegisterPage,
});

function RegisterPage() {
  const [showPw, setShowPw] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [artistName, setArtistName] = useState("");
  const [masterCode, setMasterCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileMountKey, setTurnstileMountKey] = useState(0);
  const { t } = useI18n();
  const { plan, redirect } = Route.useSearch();
  const redirectTo =
    redirect ||
    (plan ? `/gafcore?plan=${encodeURIComponent(plan)}` : "/gafcore?pick_plan=1");

  const assertSignup = useServerFn(assertGafcoreSignupAllowed);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const normalizedEmail = email.trim().toLowerCase();
    if (isTurnstileSiteKeyConfigured() && !turnstileToken?.trim()) {
      setLoading(false);
      setError("Completa la verificación (Turnstile) antes de crear la cuenta.");
      return;
    }
    try {
      await assertSignup({
        data: {
          email: normalizedEmail,
          turnstileToken: turnstileToken?.trim() || undefined,
        },
      });
    } catch (preErr) {
      setLoading(false);
      const code = preErr instanceof Error ? preErr.message : "";
      if (code === "EMAIL_ALREADY_REGISTERED") {
        setError(
          "Este correo ya tiene una cuenta en GafCore. Inicia sesión o recupera tu contraseña.",
        );
        return;
      }
      if (code === "SIGNUP_IP_RATE_LIMIT") {
        setError(
          "Se alcanzó el límite de registros nuevos desde esta red por hoy. Inténtalo mañana o desde otra conexión.",
        );
        return;
      }
      if (code === "TURNSTILE_REQUIRED" || code === "INVALID_TURNSTILE") {
        setTurnstileToken(null);
        setTurnstileMountKey((k) => k + 1);
        setError(
          code === "TURNSTILE_REQUIRED"
            ? "Falta la verificación humana. Vuelve a completar el recuadro de Turnstile."
            : "La verificación humana no fue válida. Inténtalo de nuevo.",
        );
        return;
      }
      setError(preErr instanceof Error ? preErr.message : "No se pudo iniciar el registro.");
      return;
    }

    const { error: authError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: authAbsoluteUrl(redirectTo),
        data: { first_name: firstName, last_name: lastName, artist_name: artistName },
      },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    // Create profile after signup when a session is available
    const { data: { user } } = await supabase.auth.getUser();
    if (user && artistName) {
      await supabase.from("profiles").upsert(
        {
          user_id: user.id,
          first_name: firstName || null,
          last_name: lastName || null,
          artist_name: artistName || null,
        },
        { onConflict: "user_id", ignoreDuplicates: true }
      );
    }

    // If a master code was provided AND we have a session, claim admin access
    if (user && masterCode.trim()) {
      try {
        await claimMasterAccess({ data: { code: masterCode.trim() } });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid master code");
        return;
      }
    }

    if (user) {
      setPlanChoicePending(user.id);
      window.location.assign(redirectTo.startsWith("/") ? `${window.location.origin}${redirectTo}` : redirectTo);
      return;
    }

    setSuccess(true);
  };

  if (success) {
    return (
      <div className="flex min-h-dvh items-start justify-center overflow-y-auto bg-background px-4 py-8 sm:py-10">
        <div className="w-full max-w-md text-center">
          <div className="mb-4 text-left">
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft size={16} />
              {t("auth.backToHome")}
            </Link>
          </div>
          <div className="flex justify-center mb-6">
            <GafcoreLogo variant="full" linkTo="/gafcore" />
          </div>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 mx-auto mb-6">
            <svg className="h-8 w-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Check your email</h1>
          <p className="text-muted-foreground mb-6">
            We sent a verification link to <strong className="text-foreground">{email}</strong>. Click the link to activate your account.
          </p>
          <Link to="/login" className="text-primary hover:underline text-sm font-medium">Back to login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh items-start justify-center overflow-y-auto bg-background px-4 py-8 sm:py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background:var(--gradient-auth-glow)]" />
      <div className="w-full max-w-md">
        <div className="mb-4">
          <Link
            to="/gafcore"
            search={plan ? { plan } : {}}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            {plan ? "Volver a planes" : t("auth.backToHome")}
          </Link>
        </div>

        <AuthCard title={t("auth.createAccount")} subtitle={t("auth.createAccountDesc")}>
          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">registro por correo</span></div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">{t("auth.firstName")}</label>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="auth-input" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">{t("auth.lastName")}</label>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required className="auth-input" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">{t("auth.email")}</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="auth-input" placeholder="you@example.com" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">{t("auth.artistName")}</label>
              <input type="text" value={artistName} onChange={(e) => setArtistName(e.target.value)} className="auth-input" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">{t("auth.password")}</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="auth-input pr-10"
                  placeholder={t("auth.minChars")}
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {isTurnstileSiteKeyConfigured() ? (
              <div className="flex justify-center pt-1">
                <TurnstileWidget key={turnstileMountKey} theme="auto" onToken={setTurnstileToken} />
              </div>
            ) : null}
            <Button type="submit" variant="hero" className="h-12 w-full rounded-xl" size="lg" disabled={loading}>
              {loading ? "..." : t("auth.createBtn")} <ArrowRight size={16} />
            </Button>
          </form>
        </AuthCard>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("auth.hasAccount")}{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">{t("auth.signInLink")}</Link>
          </p>
          <LanguageSwitcher variant="compact" />
        </div>
      </div>
    </div>
  );
}
