import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getPasswordRecoveryRedirectTo } from "@/lib/auth-email-redirect";
import { supabase } from "@/integrations/supabase/client";
import { signInWithOAuth } from "@/lib/supabase-oauth";
import { AuthCard } from "@/components/AuthCard";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const redirect = search.redirect;
    return typeof redirect === "string" && redirect.startsWith("/") && !redirect.startsWith("//")
      ? { redirect }
      : {};
  },
  component: LoginPage,
});

function LoginPage() {
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const { t } = useI18n();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    setError("");
    setMessage("");
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (authError) {
      setLoading(false);
      setError(
        authError.message === "Invalid login credentials"
          ? normalizedEmail === "aperezavilez@gmail.com"
            ? "La cuenta demo ya existe, pero esa contraseña no coincide. Usa la contraseña demo actual o presiona “¿Olvidaste tu contraseña?” para crear una nueva."
            : "El correo o la contraseña no coinciden. Si no recuerdas la contraseña, usa “¿Olvidaste tu contraseña?” para crear una nueva."
          : authError.message
      );
      return;
    }
    window.location.assign(redirect || "/gafcore/app");
  };

  const handlePasswordReset = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Escribe tu correo electrónico para enviarte el enlace de recuperación.");
      return;
    }

    setError("");
    setMessage("");
    setResetLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: getPasswordRecoveryRedirectTo(),
    });
    setResetLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setMessage("Te envié un enlace para crear una contraseña nueva. Revisa tu correo.");
  };

  const handleGoogleSignIn = async () => {
    const r = await signInWithOAuth("google", redirect || "/gafcore/app");
    if (r.error) setError(r.error);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10 overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background:var(--gradient-auth-glow)]" />
      <div className="w-full max-w-md">
        <div className="mb-4">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={16} />
            {t("auth.backToHome")}
          </Link>
        </div>

        <AuthCard title={t("auth.welcomeBack")} subtitle={t("auth.signInDesc")}>
          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 rounded-lg bg-success/10 border border-success/20 px-4 py-3 text-sm text-success">
              {message}
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

          <form className="space-y-4" onSubmit={handleSubmit} autoComplete="on">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="login-email">{t("auth.email")}</label>
              <input id="login-email" name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required className="auth-input" placeholder="you@example.com" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="login-password">{t("auth.password")}</label>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="auth-input pr-10"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <Button type="submit" variant="hero" className="h-12 w-full rounded-xl" size="lg" disabled={loading}>
              {loading ? "..." : t("auth.signIn")} <ArrowRight size={16} />
            </Button>
          </form>

          <button
            type="button"
            onClick={handlePasswordReset}
            disabled={resetLoading}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 text-sm font-medium text-primary transition-colors hover:underline disabled:pointer-events-none disabled:opacity-60"
          >
            <KeyRound size={15} />
            {resetLoading ? "Enviando..." : "¿Olvidaste tu contraseña?"}
          </button>
        </AuthCard>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("auth.noAccount")}{" "}
            <Link to="/register" className="font-medium text-primary hover:underline">{t("auth.signUp")}</Link>
          </p>
          <LanguageSwitcher variant="compact" />
        </div>
      </div>
    </div>
  );
}
