-- GafCore: historial de versiones por proyecto (automáticas + manuales).
-- Reemplaza almacenamiento localStorage con persistencia en BD.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.gafcore_project_versions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL,
  label        text        NOT NULL DEFAULT '',
  files        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  file_count   int         NOT NULL DEFAULT 0,
  is_auto      boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gafcore_project_versions_project_idx
  ON public.gafcore_project_versions (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS gafcore_project_versions_user_idx
  ON public.gafcore_project_versions (user_id, created_at DESC);

ALTER TABLE public.gafcore_project_versions ENABLE ROW LEVEL SECURITY;

-- SELECT: solo el dueño del proyecto
DROP POLICY IF EXISTS "users read own project versions" ON public.gafcore_project_versions;
CREATE POLICY "users read own project versions"
  ON public.gafcore_project_versions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT: solo el dueño
DROP POLICY IF EXISTS "users insert own project versions" ON public.gafcore_project_versions;
CREATE POLICY "users insert own project versions"
  ON public.gafcore_project_versions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- DELETE: solo el dueño
DROP POLICY IF EXISTS "users delete own project versions" ON public.gafcore_project_versions;
CREATE POLICY "users delete own project versions"
  ON public.gafcore_project_versions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.gafcore_project_versions IS
  'Historial de versiones del IDE (automáticas tras build exitoso + manuales). Máx 30 por proyecto, gestionado desde servidor.';
