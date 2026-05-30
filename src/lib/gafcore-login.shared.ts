/**
 * @locked Flujo de inicio de sesión GafCore (email + contraseña).
 * No modificar salvo bug confirmado en /gafcore/login — probar autofill, Entrar y redirect.
 */
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase-env.shared";

async function ensureGafcoreProfile(user: User): Promise<void> {
  await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      email: user.email ?? null,
    },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
}

/** Correos que se confunden en el panel (avilez vs avilery). La cuenta real en Auth es avilery. */
const KNOWN_EMAIL_TYPOS: Record<string, string> = {
  "alfonsoavilez@icloud.com": "alfonsoavilery@icloud.com",
  "alfonsoaviery@icloud.com": "alfonsoavilery@icloud.com",
};

export function normalizeGafcoreLoginEmail(raw: string): { email: string; typoHint?: string } {
  const email = raw.trim().toLowerCase();
  const corrected = KNOWN_EMAIL_TYPOS[email];
  if (corrected) return { email: corrected, typoHint: `Se usará ${corrected} (correo registrado en Supabase).` };
  return { email };
}

export function formatGafcoreSignInError(raw: string, attemptedEmail?: string): string {
  const m = raw.trim();
  if (m === "Invalid login credentials") {
    const typo = attemptedEmail ? KNOWN_EMAIL_TYPOS[attemptedEmail.trim().toLowerCase()] : undefined;
    const typoLine = typo
      ? ` En Authentication el correo registrado es ${typo}, no ${attemptedEmail?.trim().toLowerCase()}.`
      : "";
    return (
      "El correo o la contraseña no coinciden con una cuenta con contraseña en este proyecto." +
      typoLine +
      " Si no recuerdas la contraseña, usa «¿Olvidaste tu contraseña?»."
    );
  }
  if (/email not confirmed|confirm.*email|not.*verified|email.*confirm/i.test(m)) {
    return (
      "Aún debes confirmar tu correo. Revisa la bandeja de entrada y spam, o usa «¿Olvidaste tu contraseña?»."
    );
  }
  if (/rate limit|too many requests|over_request_rate_limit|429/i.test(m)) {
    return "Demasiados intentos seguidos. Espera un minuto e inténtalo de nuevo.";
  }
  return m;
}

export type GafcoreLoginResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

/** Lee credenciales del DOM (autofill) con fallback a estado React. */
export function readLoginCredentials(
  form: HTMLFormElement | null | undefined,
  fallback: { email: string; password: string },
): { email: string; password: string } {
  const emailEl = form?.elements.namedItem("email") as HTMLInputElement | null;
  const passwordEl = form?.elements.namedItem("password") as HTMLInputElement | null;
  const byIdEmail = typeof document !== "undefined" ? document.getElementById("gc-email") : null;
  const byIdPw = typeof document !== "undefined" ? document.getElementById("gc-pw") : null;
  const email = (
    emailEl?.value ||
    (byIdEmail instanceof HTMLInputElement ? byIdEmail.value : "") ||
    fallback.email
  )
    .trim()
    .toLowerCase();
  const password =
    passwordEl?.value ||
    (byIdPw instanceof HTMLInputElement ? byIdPw.value : "") ||
    fallback.password;
  return { email, password };
}

export function resolveGafcoreLoginRedirect(redirectTo: string): string {
  if (redirectTo.startsWith("http")) return redirectTo;
  const path = redirectTo.startsWith("/") ? redirectTo : `/${redirectTo}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

/** Inicio de sesión estable: signIn → redirect. Sin timeouts ni polling innecesario. */
export async function gafcoreLoginWithPassword(input: {
  email: string;
  password: string;
  redirectTo: string;
}): Promise<GafcoreLoginResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error:
        "Falta configurar Supabase (VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY). Revisa Vercel y redeploy.",
    };
  }

  const { email: normalized, typoHint } = normalizeGafcoreLoginEmail(input.email);
  const password = input.password;
  if (!normalized || !password) {
    return { ok: false, error: "Escribe tu correo y contraseña para iniciar sesión." };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email: normalized, password });
  if (error) {
    const base = formatGafcoreSignInError(error.message, input.email);
    return { ok: false, error: typoHint ? `${typoHint} ${base}` : base };
  }

  if (data.session?.user) {
    await ensureGafcoreProfile(data.session.user);
    return { ok: true, redirectTo: resolveGafcoreLoginRedirect(input.redirectTo) };
  }

  for (let i = 0; i < 15; i++) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) {
      await ensureGafcoreProfile(sessionData.session.user);
      return { ok: true, redirectTo: resolveGafcoreLoginRedirect(input.redirectTo) };
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  return {
    ok: false,
    error:
      "El inicio de sesión respondió pero no se guardó la sesión. Permite cookies para gafcore.com o prueba otro navegador.",
  };
}

export function gafcoreLoginRedirectNow(url: string): void {
  window.location.assign(url);
}
