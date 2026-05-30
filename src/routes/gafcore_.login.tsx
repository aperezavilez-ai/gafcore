import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Mail, Lock, KeyRound, Sparkles, Zap, Shield, Code2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getPasswordRecoveryRedirectTo } from "@/lib/auth-email-redirect";
import { isSupabaseConfigured } from "@/lib/supabase-env.shared";

export const Route = createFileRoute("/gafcore_/login")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: string; signedOut?: boolean; email?: string } => {
    const redirect =
      typeof search.redirect === "string" && search.redirect.startsWith("/") && !search.redirect.startsWith("//")
        ? search.redirect
        : undefined;
    const raw = search.signedOut;
    const signedOut =
      raw === true || raw === "true" || raw === "1" || raw === 1 || raw === "yes";
    const email =
      typeof search.email === "string" && search.email.includes("@")
        ? search.email.trim().toLowerCase().slice(0, 320)
        : undefined;
    const out: { redirect?: string; signedOut?: boolean; email?: string } = {};
    if (redirect) out.redirect = redirect;
    if (signedOut) out.signedOut = true;
    if (email) out.email = email;
    return out;
  },
  component: GafCoreLoginPage,
  head: () => ({ meta: [{ title: "Entrar — GafCore" }] }),
});

/** Mensajes de GoTrue/Supabase Auth en español + pistas útiles (OAuth-only, etc.). */
function formatGafcoreSignInError(raw: string): string {
  const m = raw.trim();
  if (m === "Invalid login credentials") {
    return (
      "El correo o la contraseña no coinciden con una cuenta con contraseña en este proyecto. " +
      "Si no recuerdas la contraseña, usa «¿Olvidaste tu contraseña?»."
    );
  }
  if (/email not confirmed|confirm.*email|not.*verified|email.*confirm/i.test(m)) {
    return (
      "Aún debes confirmar tu correo. Revisa la bandeja de entrada y spam, o crea de nuevo la contraseña con «¿Olvidaste tu contraseña?» " +
      "si el proyecto tiene confirmación activada."
    );
  }
  if (/rate limit|too many requests|over_request_rate_limit|429/i.test(m)) {
    return "Demasiados intentos seguidos. Espera un minuto e inténtalo de nuevo.";
  }
  return m;
}

function GafCoreLoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [activeSessionEmail, setActiveSessionEmail] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  /** Tras cerrar sesión: evita que el gestor del navegador rellene al instante; se quita al enfocar un campo. */
  const [blockAutofillUntilFocus, setBlockAutofillUntilFocus] = useState(() => Boolean(search.signedOut));
  const light = false;
  const { redirect, signedOut, email: emailFromUrl } = search;
  const redirectTo = redirect || "/gafcore/app";
  const [urlPasswordWarning, setUrlPasswordWarning] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const supabaseReady = isSupabaseConfigured();

  const cleanLoginUrl = useCallback(
    (prefillEmail?: string) => {
      const nextSearch: { redirect?: string; email?: string } = {};
      if (redirect) nextSearch.redirect = redirect;
      const e = (prefillEmail ?? emailFromUrl ?? "").trim().toLowerCase();
      if (e.includes("@")) nextSearch.email = e;
      void navigate({ to: "/gafcore/login", replace: true, search: nextSearch });
    },
    [emailFromUrl, navigate, redirect],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const hadPasswordInUrl = params.has("password");
    if (hadPasswordInUrl) {
      setUrlPasswordWarning(true);
      setPassword("");
      setBlockAutofillUntilFocus(false);
      const mail = params.get("email")?.trim().toLowerCase() ?? emailFromUrl ?? "";
      if (mail.includes("@")) setEmail(mail);
      cleanLoginUrl(mail);
      return;
    }
    if (emailFromUrl && !signedOut) {
      setEmail(emailFromUrl);
      setBlockAutofillUntilFocus(false);
    }
  }, [emailFromUrl, signedOut, cleanLoginUrl]);

  useEffect(() => {
    if (!signedOut) return;
    setEmail("");
    setPassword("");
    setError("");
    setMessage("");
    setBlockAutofillUntilFocus(true);
    navigate({
      to: "/gafcore/login",
      replace: true,
      search: redirect ? { redirect } : {},
    });
  }, [signedOut, redirect, navigate]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session?.user) {
        window.location.replace(redirectTo);
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      if (active && userData.user?.email) setActiveSessionEmail(userData.user.email);
    })();
    return () => {
      active = false;
    };
  }, [redirectTo]);

  const openCredentialFields = () => {
    setBlockAutofillUntilFocus(false);
  };

  const syncEmailFromInput = (value: string) => {
    setBlockAutofillUntilFocus(false);
    setEmail(value);
  };

  const syncPasswordFromInput = (value: string) => {
    setBlockAutofillUntilFocus(false);
    setPassword(value);
  };

  const toggleShowPassword = () => {
    setBlockAutofillUntilFocus(false);
    const el = passwordRef.current;
    const next = !showPw;
    if (el) el.type = next ? "text" : "password";
    setShowPw(next);
  };

  const switchAccount = async () => {
    setSwitching(true);
    await supabase.auth.signOut();
    setActiveSessionEmail(null);
    setEmail("");
    setPassword("");
    setBlockAutofillUntilFocus(true);
    setSwitching(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const emailEl = form.elements.namedItem("email") as HTMLInputElement | null;
    const passwordEl = form.elements.namedItem("password") as HTMLInputElement | null;
    const normalizedEmail = (emailEl?.value ?? email).trim().toLowerCase();
    const currentPassword = passwordEl?.value ?? password;

    setError("");
    setMessage("");
    if (!supabaseReady) {
      const msg =
        "Falta configurar Supabase en el servidor (VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en Vercel).";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (!normalizedEmail || !currentPassword) {
      const msg = "Escribe tu correo y contraseña para iniciar sesión.";
      setError(msg);
      toast.error(msg);
      return;
    }

    setLoading(true);
    try {
      const signInTask = supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: currentPassword,
      });
      const timeoutTask = new Promise<never>((_, reject) => {
        window.setTimeout(
          () => reject(new Error("La conexión tardó demasiado. Revisa tu internet e intenta de nuevo.")),
          18_000,
        );
      });
      const { data: signInData, error: authError } = await Promise.race([signInTask, timeoutTask]);

      if (authError) {
        const msg = formatGafcoreSignInError(authError.message);
        setError(msg);
        toast.error(msg);
        return;
      }

      if (signInData.session) {
        toast.success("Sesión iniciada. Entrando…");
        window.location.assign(redirectTo);
        return;
      }

      let sessionOk = false;
      for (let i = 0; i < 40; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          sessionOk = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      if (!sessionOk) {
        const msg =
          "El inicio de sesión respondió pero no se guardó la sesión. Permite cookies/almacenamiento para gafcore.com o prueba otro navegador.";
        setError(msg);
        toast.error(msg);
        return;
      }

      toast.success("Sesión iniciada. Entrando…");
      window.location.assign(redirectTo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo iniciar sesión. Intenta de nuevo.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) { setError("Escribe tu correo para enviarte el enlace."); return; }
    setError(""); setMessage(""); setResetLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: getPasswordRecoveryRedirectTo(),
    });
    setResetLoading(false);
    if (resetError) { setError(resetError.message); return; }
    setMessage("Te envié un enlace para crear una contraseña nueva.");
  };

  const bg = light ? "bg-[#f6f7fb] text-slate-900" : "bg-[#0a0c14] text-slate-100";
  const cardBg = light ? "bg-white border-slate-200" : "bg-[#0f1320]/80 border-white/10";
  const subtleText = light ? "text-slate-600" : "text-slate-400";
  const inputBg = light
    ? "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400"
    : "bg-[#141828] border-white/10 text-slate-100 placeholder:text-slate-500";

  return (
    <div className={`relative flex min-h-dvh w-full flex-col ${bg} transition-colors`}>
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

      {/* flex-1 + justify-center: en móvil / preview estrecha el formulario no queda “colgado” arriba con mucho marco vacío */}
      <div className="relative z-[1] flex w-full flex-1 flex-col justify-center px-4 py-8 sm:py-12 lg:justify-start lg:pt-12 lg:pb-12">
      <div className="relative mx-auto w-full max-w-md lg:max-w-6xl">
        <div className="mb-4 lg:mb-6">
          <Link to="/gafcore" className={`inline-flex items-center gap-1.5 text-sm ${subtleText} hover:opacity-80`}>
            <ArrowLeft size={16} /> Volver a GafCore
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.05fr_minmax(0,440px)] lg:items-center lg:gap-14">
          {/* Left panel — desktop only */}
          <aside className="hidden lg:flex flex-col justify-center pr-2">
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
              <Sparkles size={13} /> Plataforma todo-en-uno con IA
            </div>
            <h2 className="mt-5 text-4xl xl:text-5xl font-bold leading-[1.1] tracking-tight">
              Construye apps y sitios web con{" "}
              <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
                IA generativa
              </span>
            </h2>
            <p className={`mt-4 text-base max-w-lg ${subtleText}`}>
              Entra a tu panel de GafCore y sigue construyendo proyectos completos: frontend, backend, base de datos y despliegue — todo con un solo prompt.
            </p>

            <ul className="mt-8 space-y-4 max-w-md">
              {[
                { Icon: Zap, title: "Generación con IA multi-agente", desc: "Diseño, código, base de datos y despliegue en paralelo." },
                { Icon: Code2, title: "Editor visual + código", desc: "Edita por chat o ve directo al código cuando quieras." },
                { Icon: Shield, title: "Seguridad de nivel bancario", desc: "Tus datos y proyectos siempre cifrados y protegidos." },
              ].map(({ Icon, title, desc }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-violet-500/20 text-violet-300 ring-1 ring-violet-400/30">
                    <Icon size={16} />
                  </span>
                  <div>
                    <div className={`text-sm font-semibold ${light ? "text-slate-800" : "text-slate-100"}`}>{title}</div>
                    <div className={`text-sm ${subtleText}`}>{desc}</div>
                  </div>
                </li>
              ))}
            </ul>

            <div className={`mt-10 flex items-center gap-3 text-xs ${subtleText}`}>
              <div className="flex -space-x-2">
                {["from-fuchsia-500 to-pink-500", "from-violet-500 to-indigo-500", "from-cyan-500 to-blue-500"].map((g, i) => (
                  <span key={i} className={`h-7 w-7 rounded-full bg-gradient-to-br ${g} ring-2 ring-[#0a0c14]`} />
                ))}
              </div>
              <span>Más de 5,000 creadores ya construyen con GafCore</span>
            </div>
          </aside>

          {/* Right form */}
          <div className="w-full max-w-md mx-auto lg:mx-0 lg:justify-self-end">

        <div className={`relative overflow-hidden rounded-3xl border ${cardBg} shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)] backdrop-blur-xl`}>
          <div className="absolute right-5 top-5 z-10 flex items-center gap-2">
            <button className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${light ? "text-slate-700 hover:bg-slate-100" : "text-slate-300 hover:bg-white/5"}`}>
              🌐 EN
            </button>
          </div>

          <div className="p-7 sm:p-9">
            <div className="mb-6 mt-2 text-center">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Bienvenido a <span className="auth-title-gaf">GafCore</span>
              </h1>
              <p className={`mt-2 text-sm ${subtleText}`}>
                Entra a tu panel<br />
                y sigue construyendo con IA ✨
              </p>
            </div>

            {!supabaseReady ? (
              <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-red-300">
                Supabase no está configurado en este despliegue. Revisa las variables VITE_SUPABASE_* en Vercel y
                vuelve a desplegar.
              </div>
            ) : null}
            {urlPasswordWarning ? (
              <div className="mb-4 space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
                <p>
                  La contraseña en la barra de direcciones <strong>no inicia sesión</strong>. Escribe la
                  contraseña en el campo de abajo y pulsa <strong>Entrar</strong>.
                </p>
                <button
                  type="button"
                  className="text-xs font-medium underline underline-offset-2 hover:opacity-90"
                  onClick={() => {
                    setUrlPasswordWarning(false);
                    cleanLoginUrl();
                  }}
                >
                  Limpiar enlace seguro
                </button>
              </div>
            ) : null}
            {error && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                {error}
              </div>
            )}
            {message && (
              <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-400">
                {message}
              </div>
            )}

            {activeSessionEmail !== null && (
              <div className="mb-5 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm">
                <p className="text-slate-200">
                  Ya hay una sesión activa{activeSessionEmail ? ` como ${activeSessionEmail}` : ""}.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => window.location.replace(redirectTo)}
                    className="rounded-md bg-violet-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-400"
                  >
                    Continuar a GafCore
                  </button>
                  <button
                    type="button"
                    onClick={switchAccount}
                    disabled={switching}
                    className="rounded-md border border-white/15 bg-transparent px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/5 disabled:opacity-60"
                  >
                    {switching ? "Cerrando sesión..." : "Entrar con otra cuenta"}
                  </button>
                </div>
              </div>
            )}

            <div className={`my-5 flex items-center gap-3 text-xs ${subtleText}`}>
              <div className={`h-px flex-1 ${light ? "bg-slate-200" : "bg-white/10"}`} />
              <span>Inicia sesión con tu correo</span>
              <div className={`h-px flex-1 ${light ? "bg-slate-200" : "bg-white/10"}`} />
            </div>

            <form
              className="space-y-4"
              method="post"
              action="#"
              onSubmit={handleSubmit}
              autoComplete="on"
              noValidate
            >
              {blockAutofillUntilFocus && (
                <p className={`text-xs ${subtleText}`}>
                  Tras cerrar sesión, vuelve a escribir tu correo y contraseña en los campos de abajo.
                </p>
              )}
              <div>
                <label className={`mb-1.5 block text-sm font-medium ${light ? "text-slate-700" : "text-slate-200"}`} htmlFor="gc-email">
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail
                    size={17}
                    aria-hidden
                    className={`pointer-events-none absolute left-3.5 top-1/2 z-[1] -translate-y-1/2 ${subtleText}`}
                  />
                  <input
                    id="gc-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onFocus={openCredentialFields}
                    onChange={(e) => syncEmailFromInput(e.target.value)}
                    onInput={(e) => syncEmailFromInput(e.currentTarget.value)}
                    required
                    placeholder="tu@correo.com"
                    className={`relative z-[2] h-12 w-full rounded-xl border px-11 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30 ${inputBg}`}
                  />
                </div>
              </div>
              <div>
                <label className={`mb-1.5 block text-sm font-medium ${light ? "text-slate-700" : "text-slate-200"}`} htmlFor="gc-pw">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock
                    size={17}
                    aria-hidden
                    className={`pointer-events-none absolute left-3.5 top-1/2 z-[1] -translate-y-1/2 ${subtleText}`}
                  />
                  <input
                    ref={passwordRef}
                    id="gc-pw"
                    name="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onFocus={openCredentialFields}
                    onChange={(e) => syncPasswordFromInput(e.target.value)}
                    onInput={(e) => syncPasswordFromInput(e.currentTarget.value)}
                    required
                    placeholder="••••••••"
                    className={`relative z-[2] h-12 w-full rounded-xl border pl-11 pr-12 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30 ${inputBg}`}
                  />
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleShowPassword();
                    }}
                    className={`absolute right-2 top-1/2 z-[3] flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-slate-100`}
                    aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                    aria-pressed={showPw}
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="auth-grad-btn mt-2">
                {loading ? "Entrando..." : "Entrar"} <ArrowRight size={16} />
              </button>
            </form>

            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={resetLoading}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 text-sm font-medium text-violet-400 hover:underline disabled:opacity-60"
            >
              <KeyRound size={15} />
              {resetLoading ? "Enviando..." : "¿Olvidaste tu contraseña?"}
            </button>

            <p className={`mt-5 text-center text-sm ${subtleText}`}>
              ¿No tienes cuenta?{" "}
              <Link
                to="/gafcore/register"
                search={{ redirect: redirectTo }}
                className="font-semibold text-violet-400 hover:underline"
              >
                Crea una
              </Link>
            </p>
          </div>
        </div>
        </div>
        </div>
      </div>
      </div>
    </div>
  );
}
