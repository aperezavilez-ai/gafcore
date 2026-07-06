/**
 * @locked Flujo de inicio de sesión GafCore (email + contraseña).
 * No modificar salvo bug confirmado en /gafcore/login — probar autofill, Entrar y redirect.
 */
import type { Session, User } from "@supabase/supabase-js";

const LOGIN_AUTH_TIMEOUT_MS = 30_000;
const LOGIN_CLIENT_ENV_TIMEOUT_MS = 8_000;

type GafcorePasswordGrantResponse = {
  ok?: boolean;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  storage_key?: string;
  user?: User;
  error?: string;
  error_description?: string;
  msg?: string;
  message?: string;
};

type GafcoreClientEnvResponse = {
  ok?: boolean;
  url?: string;
  publishableKey?: string;
};

function withAbortTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timeout),
  };
}

function persistSupabaseSessionFromGrant(body: GafcorePasswordGrantResponse): Session | null {
  if (typeof window === "undefined") return null;
  if (!body.access_token || !body.refresh_token || !body.storage_key) return null;
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600;
  const session = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_in: expiresIn,
    expires_at: now + expiresIn,
    token_type: body.token_type || "bearer",
    user: body.user ?? null,
  };
  window.localStorage.setItem(body.storage_key, JSON.stringify(session));
  return session as Session;
}

async function signInWithPasswordGrant(
  email: string,
  password: string,
): Promise<{ session: Session | null; user: User | null; error?: string }> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), LOGIN_AUTH_TIMEOUT_MS);
  try {
    const res = await fetch("/api/gafcore/auth-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => ({}))) as GafcorePasswordGrantResponse;
    if (!res.ok || body.ok === false) {
      return {
        session: null,
        user: null,
        error: body.error_description || body.msg || body.message || body.error || "No se pudo iniciar sesion.",
      };
    }

    if (!body.access_token || !body.refresh_token || !body.storage_key) {
      return {
        session: null,
        user: body.user ?? null,
        error: "Supabase respondio el inicio de sesion sin tokens de sesion.",
      };
    }

    const session = persistSupabaseSessionFromGrant(body);
    if (!session) {
      return {
        session: null,
        user: body.user ?? null,
        error: "No se pudo guardar la sesion local del navegador.",
      };
    }
    return { session, user: body.user ?? null };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    return {
      session: null,
      user: null,
      error: aborted
        ? "No se recibio respuesta del servidor de autenticacion. Revisa tu conexion y vuelve a intentar."
        : err instanceof Error
          ? err.message
          : "No se pudo contactar el servidor de autenticacion.",
    };
  } finally {
    window.clearTimeout(timeout);
  }
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

export type GafcoreStoredSessionInfo = {
  email: string | null;
  expiresAt: number | null;
  live: boolean;
};

export function readStoredGafcoreSession(): Session | null {
  if (typeof window === "undefined") return null;
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i) ?? "";
    if (!/^sb-.+-auth-token$/.test(key)) continue;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<Session>;
      const expiresAt = typeof parsed.expires_at === "number" ? parsed.expires_at : 0;
      const live = expiresAt * 1000 > Date.now() + 30_000;
      if (
        live &&
        typeof parsed.access_token === "string" &&
        parsed.access_token &&
        typeof parsed.refresh_token === "string" &&
        parsed.refresh_token
      ) {
        return parsed as Session;
      }
    } catch {
      /* ignore corrupt storage */
    }
  }
  return null;
}

export function readStoredGafcoreSessionInfo(): GafcoreStoredSessionInfo | null {
  const session = readStoredGafcoreSession();
  if (!session) return null;
  const expiresAt = typeof session.expires_at === "number" ? session.expires_at : null;
  const email = typeof session.user?.email === "string" ? session.user.email : null;
  return { email, expiresAt, live: Boolean(email && expiresAt) };
}

export function clearStoredGafcoreSessions(): void {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i) ?? "";
    if (/^sb-.+-auth-token$/.test(key)) keys.push(key);
  }
  for (const key of keys) window.localStorage.removeItem(key);
}

export async function isGafcoreAuthServerReady(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const timer = withAbortTimeout(LOGIN_CLIENT_ENV_TIMEOUT_MS);
  try {
    const res = await fetch("/api/gafcore/client-env", {
      cache: "no-store",
      signal: timer.signal,
    });
    const body = (await res.json().catch(() => ({}))) as GafcoreClientEnvResponse;
    return Boolean(res.ok && body.ok && body.url && body.publishableKey);
  } catch {
    return false;
  } finally {
    timer.clear();
  }
}

export async function sendGafcorePasswordReset(email: string, redirectTo: string): Promise<string | null> {
  if (typeof window === "undefined") return "No se pudo preparar el enlace en este navegador.";
  const timer = withAbortTimeout(LOGIN_CLIENT_ENV_TIMEOUT_MS);
  try {
    const envRes = await fetch("/api/gafcore/client-env", {
      cache: "no-store",
      signal: timer.signal,
    });
    const env = (await envRes.json().catch(() => ({}))) as GafcoreClientEnvResponse;
    if (!envRes.ok || !env.ok || !env.url || !env.publishableKey) {
      return "Supabase no esta disponible para enviar el enlace.";
    }
    const res = await fetch(`${env.url}/auth/v1/recover`, {
      method: "POST",
      headers: {
        apikey: env.publishableKey,
        Authorization: `Bearer ${env.publishableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, redirect_to: redirectTo }),
    });
    if (res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as {
      msg?: string;
      message?: string;
      error_description?: string;
    };
    return body.error_description || body.msg || body.message || "No se pudo enviar el enlace.";
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    return aborted ? "El servidor tardo demasiado en responder." : "No se pudo contactar el servidor.";
  } finally {
    timer.clear();
  }
}

/** Inicio de sesión estable: signIn → redirect. Sin timeouts ni polling innecesario. */
export async function gafcoreLoginWithPassword(input: {
  email: string;
  password: string;
  redirectTo: string;
}): Promise<GafcoreLoginResult> {
  const { email: normalized, typoHint } = normalizeGafcoreLoginEmail(input.email);
  const password = input.password;
  if (!normalized || !password) {
    return { ok: false, error: "Escribe tu correo y contraseña para iniciar sesión." };
  }

  const { session: grantSession, error } = await signInWithPasswordGrant(normalized, password);
  if (error) {
    const base = formatGafcoreSignInError(error, input.email);
    return { ok: false, error: typoHint ? `${typoHint} ${base}` : base };
  }

  if (grantSession?.access_token) {
    return { ok: true, redirectTo: resolveGafcoreLoginRedirect(input.redirectTo) };
  }

  return {
    ok: false,
    error:
      "El inicio de sesión respondió pero no se guardó la sesión. Permite cookies para gafcore.com o prueba otro navegador.",
  };
}

export function gafcoreLoginRedirectNow(url: string): void {
  window.location.replace(url);
  window.setTimeout(() => {
    window.location.href = url;
  }, 500);
}
