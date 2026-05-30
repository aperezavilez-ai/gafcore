/**
 * Variables permitidas en el bundle del cliente (prefijo VITE_).
 * Nunca expongas claves de IA, Stripe secret, service role, etc. con VITE_.
 */
export const GAFCORE_CLIENT_ENV_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_PUBLIC_SITE_URL",
  "VITE_AUTH_EMAIL_REDIRECT_ORIGIN",
  "VITE_PAYMENTS_CLIENT_TOKEN",
  "VITE_TURNSTILE_SITE_KEY",
  "VITE_GAFCORE_MOBILE_SERVER_URL",
  "VITE_GAFCORE_PLAY_STORE_URL",
  "VITE_GAFCORE_APP_STORE_URL",
] as const;

/** Patrones que no deben aparecer en import.meta.env del cliente. */
const FORBIDDEN_CLIENT_ENV_PATTERN =
  /^(VITE_.*(SECRET|SERVICE_ROLE|PRIVATE|OPENAI|OPENROUTER|ANTHROPIC|STRIPE_SECRET|PADDLE_API|AI_API|WEBHOOK))/i;

export function assertSafeClientEnvKey(key: string): void {
  if (FORBIDDEN_CLIENT_ENV_PATTERN.test(key)) {
    throw new Error(
      `[gafcore-env] La variable "${key}" no puede exponerse al cliente. Usa server functions o process.env en *.server.ts.`,
    );
  }
}
