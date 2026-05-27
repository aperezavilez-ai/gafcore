/**
 * Rate limit compartido para APIs HTTP de GafCore (chat IDE, crítica, etc.).
 * Usa la misma RPC Postgres que /api/v1 (`api_rate_limit_hit`).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type GafcoreRateLimitConfig = {
  bucket: string;
  windowSeconds: number;
  max: number;
};

/** Chat IDE: stream + complete + reintentos / auto-fix (más holgado que /api/v1/ai). */
export const GAFCORE_CHAT_IDE_LIMIT: GafcoreRateLimitConfig = {
  bucket: "gafcore_chat",
  windowSeconds: 60,
  max: 25,
};

/** Crítica de diseño (menos frecuente que mensajes de chat). */
export const GAFCORE_DESIGN_CRITIQUE_LIMIT: GafcoreRateLimitConfig = {
  bucket: "gafcore_design_critique",
  windowSeconds: 60,
  max: 12,
};

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function rateLimitResponse(cfg: GafcoreRateLimitConfig): Response {
  const res = new Response(
    JSON.stringify({
      error: "rate_limited",
      message: `Demasiadas solicitudes. Inténtalo de nuevo en ${cfg.windowSeconds}s.`,
    }),
    { status: 429, headers: JSON_HEADERS },
  );
  res.headers.set("Retry-After", String(cfg.windowSeconds));
  res.headers.set("X-RateLimit-Limit", String(cfg.max));
  res.headers.set("X-RateLimit-Remaining", "0");
  return res;
}

export async function enforceGafcoreRateLimit(
  userId: string,
  cfg: GafcoreRateLimitConfig,
): Promise<Response | null> {
  const { data, error } = await supabaseAdmin.rpc("api_rate_limit_hit", {
    p_user_id: userId,
    p_bucket: cfg.bucket,
    p_window_seconds: cfg.windowSeconds,
  });
  if (error) {
    console.warn(`[gafcore-ratelimit] rpc error bucket=${cfg.bucket}:`, error.message);
    return null;
  }
  const count = Number(data ?? 0);
  if (count > cfg.max) {
    return rateLimitResponse(cfg);
  }
  return null;
}

export function enforceGafcoreChatRateLimit(userId: string): Promise<Response | null> {
  return enforceGafcoreRateLimit(userId, GAFCORE_CHAT_IDE_LIMIT);
}

export function enforceGafcoreDesignCritiqueRateLimit(userId: string): Promise<Response | null> {
  return enforceGafcoreRateLimit(userId, GAFCORE_DESIGN_CRITIQUE_LIMIT);
}
