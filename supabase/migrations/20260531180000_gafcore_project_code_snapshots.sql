-- Snapshot de estructura de código por proyecto (ediciones incrementales / recuperación de contexto).

CREATE TABLE IF NOT EXISTS public.gafcore_project_code_snapshots (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  fingerprint text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gafcore_project_code_snapshots_user_idx
  ON public.gafcore_project_code_snapshots(user_id, updated_at DESC);

ALTER TABLE public.gafcore_project_code_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own gafcore_project_code_snapshots" ON public.gafcore_project_code_snapshots;
CREATE POLICY "users read own gafcore_project_code_snapshots"
  ON public.gafcore_project_code_snapshots FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users insert own gafcore_project_code_snapshots" ON public.gafcore_project_code_snapshots;
CREATE POLICY "users insert own gafcore_project_code_snapshots"
  ON public.gafcore_project_code_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users update own gafcore_project_code_snapshots" ON public.gafcore_project_code_snapshots;
CREATE POLICY "users update own gafcore_project_code_snapshots"
  ON public.gafcore_project_code_snapshots FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());
