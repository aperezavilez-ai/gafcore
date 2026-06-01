/**
 * @locked Flujo de inicio de sesión GafCore (email + contraseña).
 * No modificar salvo bug confirmado en /gafcore/login — probar autofill, Entrar y redirect.
 */
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { getGafcoreSupabaseBrowser } from "@/lib/gafcore-supabase-browser";
import { isSupabaseReadyOnClient } from "@/lib/gafcore-supabase-browser";

/** Tras signIn, espera a que la sesión quede en storage (Chrome / red lenta). */
export async function waitForGafcoreAuthSession(
  supabase: SupabaseClient,
  maxMs = 5_000,
): Promise<Session | null> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) return data.session;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

async function ensureGafcoreProfile(user: User): Promise<void> {
  const supabase = await getGafcoreSupabaseBrowser();
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
  "alfonsoavilerry@icloud.com": "alfonsoavilery@icloud.com",
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

const LOGIN_EMAIL_IDS = ["gc-login-email", "gc-email"] as const;
const LOGIN_PASSWORD_IDS = ["gc-login-pw", "gc-pw"] as const;

function readInputByIds(ids: readonly string[]): string {
  if (typeof document === "undefined") return "";
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement && el.value.trim()) return el.value;
  }
  return "";
}

/** Lee credenciales: estado React primero; DOM solo si autofill no actualizó React. */
export function readLoginCredentials(
  form: HTMLFormElement | null | undefined,
  fallback: { email: string; password: string },
): { email: string; password: string } {
  const emailEl = form?.elements.namedItem(LOGIN_FORM_EMAIL_NAME) as HTMLInputElement | null;
  const passwordEl = form?.elements.namedItem(LOGIN_FORM_PASSWORD_NAME) as HTMLInputElement | null;
  const domEmail = (emailEl?.value ?? readInputByIds(LOGIN_EMAIL_IDS)).trim();
  const domPassword = passwordEl?.value ?? readInputByIds(LOGIN_PASSWORD_IDS) ?? "";
  const email = (fallback.email.trim() || domEmail).trim().toLowerCase();
  const password = fallback.password || domPassword;
  return { email, password };
}

/** Ejecuta en <head> antes de React: quita contraseña/correo de la URL al instante. */
export const GAFCORE_LOGIN_URL_STRIP_SCRIPT = `(function(){try{var p=location.pathname;if(p.indexOf("/gafcore/login")===-1)return;var u=new URL(location.href);var f=["password","pwd","pass","email","username","gafcore_email","gafcore_password","access_token","refresh_token","token"];var d=false;for(var i=0;i<f.length;i++){if(u.searchParams.has(f[i])){d=true;u.searchParams.delete(f[i]);}}if(!d)return;var q=u.searchParams.toString();var t=u.pathname+(q?"?"+q:"")+(u.hash||"");history.replaceState(null,"",t);}catch(e){}})();`;

/** Vacía campos que Chrome rellena antes de hidratar React (no guardamos credenciales). */
export const GAFCORE_LOGIN_CLEAR_FIELDS_SCRIPT = `(function(){function c(){try{if(location.pathname.indexOf("/gafcore/login")===-1)return;var e=document.getElementById("gc-login-email");var w=document.getElementById("gc-login-pw");if(e)e.value="";if(w)w.value=""}catch(x){}}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",c);c();setTimeout(c,0);setTimeout(c,120);setTimeout(c,400);})();`;

const LOGIN_FORM_EMAIL_NAME = "gafcore_user";
const LOGIN_FORM_PASSWORD_NAME = "gafcore_secret";

/** Limpia inputs en el DOM (autofill de Chrome no pasa por React). */
export function clearLoginCredentialFieldsDom(): void {
  if (typeof document === "undefined") return;
  for (const id of LOGIN_EMAIL_IDS) {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement) el.value = "";
  }
  for (const id of LOGIN_PASSWORD_IDS) {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement) el.value = "";
  }
}

/** Parámetros que nunca deben aparecer en la barra de direcciones. */
const LOGIN_URL_FORBIDDEN_PARAMS = [
  "password",
  "pwd",
  "pass",
  "email",
  "username",
  "gafcore_email",
  "gafcore_password",
  "access_token",
  "refresh_token",
  "token",
] as const;

/** Quita secretos de ?password=… en /gafcore/login (historial, referrers, capturas). */
export function stripSecretsFromLoginUrl(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  if (!url.pathname.includes("/gafcore/login")) return false;
  let changed = false;
  for (const key of LOGIN_URL_FORBIDDEN_PARAMS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) return false;
  const qs = url.searchParams.toString();
  const next = `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`;
  window.history.replaceState(null, "", next);
  return true;
}

export function loginUrlHasForbiddenParams(url: URL): boolean {
  if (!url.pathname.includes("/gafcore/login")) return false;
  return LOGIN_URL_FORBIDDEN_PARAMS.some((key) => url.searchParams.has(key));
}

export function buildSanitizedLoginUrl(url: URL): string {
  const clean = new URL(url.toString());
  for (const key of LOGIN_URL_FORBIDDEN_PARAMS) clean.searchParams.delete(key);
  const qs = clean.searchParams.toString();
  return `${clean.origin}${clean.pathname}${qs ? `?${qs}` : ""}${clean.hash}`;
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
  if (!(await isSupabaseReadyOnClient())) {
    return {
      ok: false,
      error:
        "Supabase no está disponible en este sitio. En Vercel añade VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY (o VITE_SUPABASE_ANON_KEY) en Production y Build, y redeploy.",
    };
  }

  const { email: normalized, typoHint } = normalizeGafcoreLoginEmail(input.email);
  const password = input.password;
  if (!normalized || !password) {
    return { ok: false, error: "Escribe tu correo y contraseña para iniciar sesión." };
  }

  const supabase = await getGafcoreSupabaseBrowser();
  const { data, error } = await supabase.auth.signInWithPassword({ email: normalized, password });
  if (error) {
    const base = formatGafcoreSignInError(error.message, input.email);
    return { ok: false, error: typoHint ? `${typoHint} ${base}` : base };
  }

  const session =
    data.session ??
    (await waitForGafcoreAuthSession(supabase, 5_000));
  if (session?.user) {
    await ensureGafcoreProfile(session.user);
    return { ok: true, redirectTo: resolveGafcoreLoginRedirect(input.redirectTo) };
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
