/** Confirmación por correo: solo en Supabase (Auth → Email → “Confirm email”). El cliente no la apaga. */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Mail, Lock, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signInWithOAuth } from "@/lib/supabase-oauth";
import { useServerFn } from "@tanstack/react-start";
import { assignGafcoreAccountType } from "@/lib/gafcore-roles.functions";

type AccountType = "user" | "demo" | "admin";

export const Route = createFileRoute("/gafcore_/register")({
  validateSearch: (search: Record<string, unknown>): { plan?: string; redirect?: string } => {
    const plan = typeof search.plan === "string" ? search.plan : undefined;
    const redirect =
      typeof search.redirect === "string" &&
      search.redirect.startsWith("/") &&
      !search.redirect.startsWith("//")
        ? search.redirect
        : undefined;
    return { plan, redirect };
  },
  component: GafCoreRegisterPage,
  head: () => ({ meta: [{ title: "Crear cuenta — GafCore" }] }),
});

function GafCoreRegisterPage() {
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const light = false;
  const { plan, redirect } = Route.useSearch();
  /** Tras crear cuenta o verificar correo: siempre a planes primero; solo si eligieron plan de pago → URL con ?plan= para abrir checkout. */
  const postRegisterPath = (() => {
    if (redirect?.startsWith("/gafcore") && redirect.includes("plan=") && !redirect.includes("plan=free")) {
      return redirect.startsWith("/") ? redirect : `/${redirect}`;
    }
    if (plan && plan !== "free") return `/gafcore?plan=${encodeURIComponent(plan)}`;
    if (plan && plan !== "free") return `/gafcore?plan=${encodeURIComponent(plan)}`;
    return "/gafcore#planes";
  })();
  const assignRole = useServerFn(assignGafcoreAccountType);

  const accountType: AccountType = "user";

  const checks = {
    length: password.length >= 8,
    number: /\d/.test(password),
    upper: /[A-Z]/.test(password),
  };
  const allValid = checks.length && checks.number && checks.upper;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const normalizedEmail = String(formData.get("email") ?? email).trim().toLowerCase();
    const currentPassword = String(formData.get("password") ?? password);
    if (!allValid) {
      setError("La contraseña no cumple los requisitos.");
      return;
    }
    if (!normalizedEmail || !currentPassword) {
      setError("Escribe tu correo y contraseña.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const signUpPromise = supabase.auth.signUp({
        email: normalizedEmail,
        password: currentPassword,
        options: { emailRedirectTo: `${window.location.origin}/gafcore?pick_plan=1` },
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("La conexión tardó demasiado. Revisa tu internet e intenta de nuevo.")), 18000);
      });
      const { data: signUpData, error: authError } = await Promise.race([signUpPromise, timeoutPromise]);
      if (authError && authError.message !== "User already registered") {
        setLoading(false);
        setError(authError.message);
        return;
      }

      /** Con "confirmar correo" desactivado en Supabase, `signUp` suele traer `session` ya lista. */
      let user = signUpData.session?.user ?? null;

      if (!user) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: currentPassword,
        });
        if (signInError) {
          setLoading(false);
          if (authError?.message === "User already registered") {
            setError(
              "Esta cuenta ya existe. Si la contraseña no coincide, usa iniciar sesión o recupera tu contraseña.",
            );
          } else {
            const hint = signInError.message ?? "";
            const needsEmail =
              /email not confirmed|confirm.*email|not.*verified/i.test(hint) ||
              hint.toLowerCase().includes("confirm");
            setError(
              needsEmail
                ? "Cuenta creada. Revisa tu correo y confirma el enlace; después te llevaremos a elegir tu plan (puedes empezar gratis con 10 créditos)."
                : "Cuenta creada. Pulsa «Inicia sesión» abajo con el mismo correo y contraseña.",
            );
          }
          return;
        }
        user = signInData.user ?? null;
      }

      const userId = user?.id ?? signUpData.user?.id;
      if (!userId) {
        setLoading(false);
        setError("No se pudo completar el acceso. Prueba «Inicia sesión» abajo.");
        return;
      }
      try {
        await assignRole({ data: { accountType } });
      } catch (err) {
        setLoading(false);
        setError(err instanceof Error ? err.message : "Error asignando tipo de cuenta");
        return;
      }
      setLoading(false);
      window.location.replace(
        typeof window !== "undefined" ? `${window.location.origin}${postRegisterPath}` : postRegisterPath,
      );
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta. Intenta de nuevo.");
    }
  };

  const handleGoogleSignIn = async () => {
    const r = await signInWithOAuth("google", "/gafcore?pick_plan=1");
    if (r.error) setError(r.error);
  };

  const handleAppleSignIn = async () => {
    const r = await signInWithOAuth("apple", "/gafcore?pick_plan=1");
    if (r.error) setError(r.error);
  };

  const bg = light ? "bg-[#f6f7fb] text-slate-900" : "bg-[#0a0c14] text-slate-100";
  const cardBg = light
    ? "bg-white border-slate-200"
    : "bg-[#0f1320]/80 border-white/10";
  const subtleText = light ? "text-slate-600" : "text-slate-400";
  const inputBg = light
    ? "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400"
    : "bg-[#141828] border-white/10 text-slate-100 placeholder:text-slate-500";

  return (
    <div className={`relative min-h-dvh ${bg} px-4 py-8 sm:py-12 transition-colors`}>
      <div aria-hidden className="absolute inset-0 auth-stars opacity-60" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0"
        style={{
          background: light
            ? "radial-gradient(ellipse 60% 50% at 80% 20%, rgba(168,85,247,0.10), transparent 60%), radial-gradient(ellipse 50% 40% at 20% 80%, rgba(99,102,241,0.10), transparent 60%)"
            : "radial-gradient(ellipse 60% 50% at 80% 20%, rgba(168,85,247,0.18), transparent 60%), radial-gradient(ellipse 50% 40% at 20% 80%, rgba(99,102,241,0.18), transparent 60%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-md">
        <div className="mb-4">
          <Link to="/gafcore" className={`inline-flex items-center gap-1.5 text-sm ${subtleText} hover:opacity-80`}>
            <ArrowLeft size={16} /> Volver a GafCore
          </Link>
        </div>

        <div className={`relative overflow-hidden rounded-3xl border ${cardBg} shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)] backdrop-blur-xl`}>
          {/* Top right controls */}
          <div className="absolute right-5 top-5 z-10 flex items-center gap-2">
            <button
              className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${light ? "text-slate-700 hover:bg-slate-100" : "text-slate-300 hover:bg-white/5"}`}
            >
              🌐 EN
            </button>
          </div>

          <div className="p-7 sm:p-9">
            <div className="mb-6 mt-2 text-center">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Welcome to <span className="auth-title-gaf">GafCore</span>
              </h1>
              <p className={`mt-2 text-sm ${subtleText}`}>
                Crea tu cuenta y empieza a construir<br />
                cosas increíbles con IA ✨
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-2.5 mb-5">
              <button type="button" onClick={handleGoogleSignIn} className="auth-google-light">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continuar con Google
              </button>
              <button type="button" onClick={handleAppleSignIn} className="auth-dark-btn">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.365 1.43c0 1.14-.42 2.21-1.13 3.01-.77.86-2.04 1.52-3.06 1.43-.13-1.13.43-2.31 1.12-3.07.78-.85 2.13-1.5 3.07-1.37zM20.5 17.27c-.55 1.27-.81 1.83-1.51 2.94-.98 1.55-2.36 3.48-4.07 3.49-1.52.02-1.91-.99-3.97-.97-2.06.01-2.5.99-4.02.97-1.71-.02-3.02-1.78-4-3.32C.16 16.04-.42 9.59 2.36 6.21c1.57-1.92 4.04-3.04 6.36-3.04 2.36 0 3.85 1.3 5.79 1.3 1.89 0 3.04-1.3 5.77-1.3 2.06 0 4.24 1.12 5.79 3.06-5.09 2.79-4.26 10.06.43 11.04z"/>
                </svg>
                Continuar con Apple
              </button>
            </div>

            <div className={`my-5 flex items-center gap-3 text-xs ${subtleText}`}>
              <div className={`h-px flex-1 ${light ? "bg-slate-200" : "bg-white/10"}`} />
              <span>o continúa con tu correo</span>
              <div className={`h-px flex-1 ${light ? "bg-slate-200" : "bg-white/10"}`} />
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className={`mb-1.5 block text-sm font-medium ${light ? "text-slate-700" : "text-slate-200"}`}>
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail size={17} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${subtleText}`} />
                  <input
                    name="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="Escribe tu correo"
                    className={`h-12 w-full rounded-xl border px-11 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30 ${inputBg}`}
                  />
                </div>
              </div>
              <div>
                <label className={`mb-1.5 block text-sm font-medium ${light ? "text-slate-700" : "text-slate-200"}`}>
                  Contraseña
                </label>
                <div className="relative">
                  <Lock size={17} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${subtleText}`} />
                  <input
                    name="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Crea una contraseña"
                    className={`h-12 w-full rounded-xl border pl-11 pr-11 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30 ${inputBg}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 ${subtleText} hover:opacity-80`}
                    aria-label={showPw ? "Ocultar" : "Mostrar"}
                  >
                    {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs">
                  {[
                    { ok: checks.length, t: "Mínimo 8 caracteres" },
                    { ok: checks.number, t: "Incluye un número" },
                    { ok: checks.upper, t: "Incluye una mayúscula" },
                  ].map((r) => (
                    <li key={r.t} className="flex items-center gap-2">
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full ${r.ok ? "bg-emerald-500/20 text-emerald-400" : (light ? "bg-slate-200 text-slate-400" : "bg-white/5 text-slate-500")}`}>
                        <Check size={11} />
                      </span>
                      <span className={r.ok ? (light ? "text-slate-700" : "text-slate-300") : subtleText}>{r.t}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button type="submit" disabled={loading} className="auth-grad-btn mt-2">
                {loading ? "Creando..." : "Crear cuenta"} <ArrowRight size={16} />
              </button>
            </form>

            <p className={`mt-5 text-center text-sm ${subtleText}`}>
              ¿Ya tienes cuenta?{" "}
              <Link
                to="/gafcore/login"
                search={{ redirect: "/gafcore/app" }}
                className="font-semibold text-violet-400 hover:underline"
              >
                Inicia sesión
              </Link>
            </p>
            <p className={`mt-3 text-center text-xs ${subtleText}`}>
              Al crear una cuenta aceptas nuestros{" "}
              <Link to="/terms" className="text-violet-400 hover:underline">Términos</Link>{" "}
              y la{" "}
              <Link to="/privacy" className="text-violet-400 hover:underline">Política de privacidad</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
