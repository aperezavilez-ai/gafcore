import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { authAbsoluteUrl } from "@/lib/auth-email-redirect";
import { supabase } from "@/lib/gafcore-supabase-client-proxy";
import { signInWithOAuth } from "@/lib/supabase-oauth";
import { AuthCard } from "./AuthCard";

interface InlineAuthPanelProps {
  redirectTo?: string;
  defaultTab?: "login" | "register";
  title?: string;
  subtitle?: string;
  onSuccess?: () => void;
}

export function InlineAuthPanel({
  redirectTo = "/gafcore/app",
  defaultTab = "register",
  title,
  subtitle,
  onSuccess,
}: InlineAuthPanelProps) {
  const [tab, setTab] = useState<"login" | "register">(defaultTab);
  const [showPw, setShowPw] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [artistName, setArtistName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleGoogle = async () => {
    setError("");
    const r = await signInWithOAuth("google", redirectTo);
    if (r.error) setError(r.error);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    if (tab === "login") {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (err) {
        setError(
          err.message === "Invalid login credentials"
            ? "Correo o contraseña incorrectos."
            : err.message
        );
        return;
      }
      onSuccess?.();
      navigate({ to: redirectTo as never });
    } else {
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: authAbsoluteUrl(redirectTo),
          data: { first_name: firstName, last_name: lastName, artist_name: artistName },
        },
      });
      setLoading(false);
      if (err) {
        setError(err.message);
        return;
      }
      setMessage("¡Cuenta creada! Revisa tu correo para confirmar y luego inicia sesión.");
    }
  };

  return (
    <AuthCard
      compact
      title={title ?? (tab === "login" ? "Inicia sesión" : "Crea tu cuenta")}
      subtitle={
        subtitle ??
        (tab === "login"
          ? "Accede para guardar tus proyectos en GafCore."
          : "Regístrate para crear con IA en GafCore.")
      }
    >
      {/* Tabs */}
      <div className="mb-5 flex rounded-full border border-border bg-background/40 p-1">
        <button
          type="button"
          onClick={() => setTab("register")}
          className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
            tab === "register"
              ? "bg-[image:var(--gradient-auth-accent)] text-primary-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Registrarse
        </button>
        <button
          type="button"
          onClick={() => setTab("login")}
          className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
            tab === "login"
              ? "bg-[image:var(--gradient-auth-accent)] text-primary-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Iniciar sesión
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-3 rounded-lg bg-success/10 border border-success/20 px-3 py-2 text-sm text-success">
          {message}
        </div>
      )}

      <Button variant="outline" className="mb-3 h-12 w-full border-border bg-background/40 hover:bg-accent" onClick={handleGoogle}>
        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Continuar con Google
      </Button>

      <div className="relative my-3">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">o</span></div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {tab === "register" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                placeholder="Nombre"
                className="auth-input"
              />
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                placeholder="Apellido"
                className="auth-input"
              />
            </div>
            <input
              type="text"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              placeholder="Nombre artístico (opcional)"
              className="auth-input"
            />
          </>
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="tu@correo.com"
          className="auth-input"
        />
        <div className="relative">
          <input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="Contraseña"
            className="auth-input pr-10"
          />
          <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="h-12 w-full rounded-xl border-0 bg-[image:var(--gradient-auth-accent)] font-semibold text-primary-foreground hover:opacity-95"
        >
          {loading ? "..." : tab === "login" ? "Iniciar sesión" : "Crear cuenta"}
          <ArrowRight size={16} className="ml-1" />
        </Button>
      </form>
    </AuthCard>
  );
}
