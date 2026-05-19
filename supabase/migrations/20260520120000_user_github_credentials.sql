-- Token GitHub por usuario (cifrado con secrets_v1, mismo esquema que project_secrets).

CREATE TABLE IF NOT EXISTS public.user_github_credentials (
  user_id uuid PRIMARY KEY,
  token_encrypted bytea NOT NULL,
  github_login text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_github_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own github credential meta"
  ON public.user_github_credentials FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Escritura solo vía service role (API /api/gafcore/github-connect).

CREATE OR REPLACE FUNCTION public.decrypt_user_github_token(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
  v bytea;
BEGIN
  SELECT value INTO k FROM public._app_keys WHERE name = 'secrets_v1';
  SELECT token_encrypted INTO v FROM public.user_github_credentials WHERE user_id = p_user_id;
  IF v IS NULL OR k IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_decrypt(v, k);
END;
$$;

REVOKE ALL ON FUNCTION public.decrypt_user_github_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_user_github_token(uuid) TO service_role;
