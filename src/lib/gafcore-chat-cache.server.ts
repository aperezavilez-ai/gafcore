/**
 * Caché persistente de respuestas chat (Supabase) — ahorra créditos en preguntas idénticas.
 * Complementa la caché en memoria del proceso (TTL corto).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CachedPayload } from "@/lib/gafcore-chat.shared";
import { logDev } from "@/lib/gafcore-logger.server";

const PERSIST_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

type CacheRow = {
  cache_key: string;
  reply: string;
  files: CachedPayload["files"];
  expires_at: string;
};

export async function getPersistedChatCache(cacheKey: string): Promise<CachedPayload | null> {
  try {
    const now = new Date().toISOString();
    const { data, error } = await (
      supabaseAdmin as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, val: string) => {
              gt: (col: string, val: string) => {
                maybeSingle: () => Promise<{
                  data: CacheRow | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      }
    )
      .from("gafcore_chat_response_cache")
      .select("cache_key, reply, files, expires_at")
      .eq("cache_key", cacheKey)
      .gt("expires_at", now)
      .maybeSingle();

    if (error || !data) return null;
    logDev("chat_cache_hit", { source: "supabase" });
    return {
      reply: data.reply,
      files: Array.isArray(data.files) ? data.files : [],
    };
  } catch {
    return null;
  }
}

export async function setPersistedChatCache(
  cacheKey: string,
  userId: string,
  model: string,
  payload: CachedPayload,
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + PERSIST_TTL_MS).toISOString();
    const row = {
      cache_key: cacheKey,
      user_id: userId,
      model,
      reply: payload.reply,
      files: payload.files,
      expires_at: expiresAt,
    };
    await (
      supabaseAdmin as unknown as {
        from: (t: string) => {
          upsert: (r: typeof row, opts: { onConflict: string }) => Promise<unknown>;
        };
      }
    )
      .from("gafcore_chat_response_cache")
      .upsert(row, { onConflict: "cache_key" });
    logDev("chat_cache_set", { source: "supabase" });
  } catch {
    /* tabla no migrada aún — no bloquear chat */
  }
}
