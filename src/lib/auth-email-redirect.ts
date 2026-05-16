import { getPublicSiteOrigin } from "@/lib/public-site-url";

function trimOrigin(s: string | undefined): string | undefined {
  const t = s?.trim();
  if (!t) return undefined;
  return t.replace(/\/$/, "");
}

/** Orígenes locales: no deben ir en enlaces de correo (recovery / confirmación). */
function isUnsuitableEmailOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local");
  } catch {
    return true;
  }
}

/**
 * Origen usado en `redirectTo` de Supabase Auth (recovery, etc.).
 * Debe coincidir con una URL permitida en Supabase → Authentication → URL Configuration.
 *
 * Prioridad: variables de entorno → origen público del navegador (solo si no es localhost)
 * → `https://gafcore.com`. Así un “¿Olvidaste contraseña?” lanzado desde `localhost:3000` en dev
 * no mete ese host en el correo (evita ERR_CONNECTION_REFUSED al abrir el enlace).
 */
export function getAuthEmailRedirectOrigin(): string {
  const fromEmail = trimOrigin(import.meta.env.VITE_AUTH_EMAIL_REDIRECT_ORIGIN as string | undefined);
  if (fromEmail && (fromEmail.startsWith("http://") || fromEmail.startsWith("https://"))) {
    return fromEmail;
  }
  const fromPublic = trimOrigin(import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined);
  if (fromPublic && (fromPublic.startsWith("http://") || fromPublic.startsWith("https://"))) {
    return fromPublic;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    const o = window.location.origin.replace(/\/$/, "");
    if (!isUnsuitableEmailOrigin(o)) return o;
  }
  return getPublicSiteOrigin();
}

export function getPasswordRecoveryRedirectTo(): string {
  return `${getAuthEmailRedirectOrigin()}/reset-password`;
}

/** `path` debe empezar por `/` (p. ej. `/gafcore/app`). */
export function authAbsoluteUrl(path: string): string {
  const origin = getAuthEmailRedirectOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${p}`;
}
