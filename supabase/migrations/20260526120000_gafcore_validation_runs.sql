-- AI Validation Layer — informes por proyecto / pipeline run.

CREATE TABLE IF NOT EXISTS public.gafcore_validation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id uuid REFERENCES public.gafcore_pipeline_runs(id) ON DELETE SET NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  phase text NOT NULL DEFAULT 'post_generate'
    CHECK (phase IN ('post_generate', 'pre_deploy', 'manual')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'approved', 'approved_with_warnings', 'failed')),
  overall_score integer NOT NULL DEFAULT 0 CHECK (overall_score >= 0 AND overall_score <= 100),
  dimensions_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  issues_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  fixes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  logs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gafcore_validation_runs_project_idx
  ON public.gafcore_validation_runs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS gafcore_validation_runs_pipeline_idx
  ON public.gafcore_validation_runs(pipeline_run_id)
  WHERE pipeline_run_id IS NOT NULL;

ALTER TABLE public.gafcore_validation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own validation runs" ON public.gafcore_validation_runs;
CREATE POLICY "users read own validation runs"
  ON public.gafcore_validation_runs FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users insert own validation runs" ON public.gafcore_validation_runs;
CREATE POLICY "users insert own validation runs"
  ON public.gafcore_validation_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );
