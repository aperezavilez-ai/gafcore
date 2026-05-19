-- Pipeline runs del Project Orchestrator (Etapa 7).

CREATE TABLE IF NOT EXISTS public.gafcore_pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN (
      'pending', 'interpreting', 'generating', 'validating', 'retrying',
      'persisting_memory', 'documenting', 'deploying', 'completed', 'failed', 'cancelled'
    )),
  current_step text
    CHECK (current_step IS NULL OR current_step IN (
      'interpret', 'generate', 'validate', 'retry', 'memory', 'document', 'deploy'
    )),
  instruction text NOT NULL DEFAULT '',
  intent_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  events_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gafcore_pipeline_runs_project_idx
  ON public.gafcore_pipeline_runs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS gafcore_pipeline_runs_user_idx
  ON public.gafcore_pipeline_runs(user_id, updated_at DESC);

ALTER TABLE public.gafcore_pipeline_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own pipeline runs" ON public.gafcore_pipeline_runs;
CREATE POLICY "users read own pipeline runs"
  ON public.gafcore_pipeline_runs FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users insert own pipeline runs" ON public.gafcore_pipeline_runs;
CREATE POLICY "users insert own pipeline runs"
  ON public.gafcore_pipeline_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users update own pipeline runs" ON public.gafcore_pipeline_runs;
CREATE POLICY "users update own pipeline runs"
  ON public.gafcore_pipeline_runs FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );
