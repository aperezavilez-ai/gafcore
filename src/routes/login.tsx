import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getPasswordRecoveryRedirectTo } from "@/lib/auth-email-redirect";
import { supabase } from "@/lib/gafcore-supabase-client-proxy";
import { AuthCard } from "@/components/AuthCard";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const redirectTo = search.redirect;
    return typeof redirectTo === "string" &&
      redirectTo.startsWith("/") &&
      !redirectTo.startsWith("//")
      ? { redirect: redirectTo }
      : {};
  },
  beforeLoad: ({ search }) => {
    const next: { redirect?: string } = {};
    if (search.redirect) next.redirect = search.redirect;
    throw redirect({ to: "/gafcore/login", search: next, replace: true });
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

          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">correo y contraseña</span></div>
          </div>

          <form className="space-y-4" method="post" action="/login" onSubmit={handleSubmit} autoComplete="on">
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
