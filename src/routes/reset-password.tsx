import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/gafcore-supabase-client-proxy";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        if (session?.user) setSessionReady(true);
      }
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.user) setSessionReady(true);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const { data: pre } = await supabase.auth.getSession();
    if (!pre.session?.user) {
      setLoading(false);
      setError(
        "El enlace de recuperación no es válido o ha caducado. Solicita otro correo desde «¿Olvidaste tu contraseña?» en el inicio de sesión de GafCore.",
      );
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage("Contraseña actualizada. Ya puedes iniciar sesión.");
    setTimeout(() => navigate({ to: "/gafcore/login", search: { redirect: "/gafcore/app" } }), 1200);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-4">
          <Link
            to="/gafcore/login"
            search={{ redirect: "/gafcore/app" }}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={16} />
            Volver al login
          </Link>
        </div>

        <div className="mb-8 text-center">
          <div className="mb-6 flex justify-center">
            <Link to="/gafcore" className="inline-flex items-center gap-2" aria-label="GafCore">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
                G
              </span>
              <span className="text-xl font-bold text-foreground">GafCore</span>
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Crear nueva contraseña</h1>
          <p className="mt-1 text-sm text-muted-foreground">Escribe una contraseña nueva para tu cuenta.</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
              {message}
            </div>
          )}

          {!sessionReady && !error && !message && (
            <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Comprobando el enlace de recuperación… Si esta pantalla no avanza, el enlace puede haber caducado: vuelve a
              solicitar el correo desde{" "}
              <Link to="/gafcore/login" search={{ redirect: "/gafcore/app" }} className="text-primary underline">
                GafCore
              </Link>
              .
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Nueva contraseña</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 pr-10 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Mín. 6 caracteres"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Confirmar contraseña</label>
              <input
                type={showPw ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                placeholder="Repite la contraseña"
              />
            </div>

            <Button type="submit" variant="hero" className="w-full" size="lg" disabled={loading || !sessionReady}>
              {loading ? "Guardando..." : "Guardar contraseña"} <ArrowRight size={16} />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}