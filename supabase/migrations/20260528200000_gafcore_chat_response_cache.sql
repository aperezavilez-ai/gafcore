-- Caché de respuestas IA (misma instrucción + modelo + proyecto) — ahorro de créditos API
-- Solo escritura/lectura vía service_role (servidor GafCore).

CREATE TABLE IF NOT EXISTS public.gafcore_chat_response_cache (
  cache_key text PRIMARY KEY,
  user_id uuid NOT NULL,
  model text NOT NULL,
  reply text NOT NULL,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gafcore_chat_response_cache_expires
  ON public.gafcore_chat_response_cache (expires_at);

CREATE INDEX IF NOT EXISTS idx_gafcore_chat_response_cache_user
  ON public.gafcore_chat_response_cache (user_id, created_at DESC);

ALTER TABLE public.gafcore_chat_response_cache ENABLE ROW LEVEL SECURITY;

-- Sin políticas para authenticated: solo backend con service_role.

COMMENT ON TABLE public.gafcore_chat_response_cache IS
  'Respuestas cacheadas del chat IDE; TTL 24h; no consume créditos en hit.';
