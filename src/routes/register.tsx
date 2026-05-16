import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { authAbsoluteUrl } from "@/lib/auth-email-redirect";
import { supabase } from "@/integrations/supabase/client";
import { signInWithOAuth } from "@/lib/supabase-oauth";
import { claimMasterAccess } from "@/lib/server-fns/admin.functions";
import { AuthCard } from "@/components/AuthCard";
import logo from "@/assets/gafsuite-logo.png";
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

  const handleGoogleSignIn = async () => {
    const r = await signInWithOAuth("google", redirectTo);
    if (r.error) setError(r.error);
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
            <Link to="/">
              <img src={logo} alt="GafCore" className="h-24 w-auto" />
            </Link>
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

          <Button variant="outline" className="mb-4 h-12 w-full border-border bg-background/40 hover:bg-accent" size="lg" onClick={handleGoogleSignIn}>
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continuar con Google
          </Button>

          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">o</span></div>
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
