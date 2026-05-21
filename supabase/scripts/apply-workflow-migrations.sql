-- =============================================================================
-- GafCore — Workflow / multiagente (copiar todo en Supabase → SQL Editor → Run)
-- Idempotente: CREATE IF NOT EXISTS, DROP POLICY IF EXISTS, CREATE OR REPLACE FUNCTION
-- =============================================================================

-- --- 1/3 Pipeline (FK de workflow_runs) ---
-- (contenido de 20260525120000_gafcore_pipeline_runs.sql)

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

-- --- 2/3 Agent Task System ---
-- (contenido de 20260528120000_gafcore_agent_tasks.sql)

CREATE TABLE IF NOT EXISTS public.gafcore_workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN (
      'pending', 'planning', 'executing', 'validating', 'merging',
      'completed', 'failed', 'cancelled'
    )),
  instruction text NOT NULL DEFAULT '',
  pipeline_run_id uuid REFERENCES public.gafcore_pipeline_runs(id) ON DELETE SET NULL,
  plan_artifact_id uuid,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gafcore_workflow_runs_project_idx
  ON public.gafcore_workflow_runs(project_id, created_at DESC);

ALTER TABLE public.gafcore_workflow_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own workflow runs" ON public.gafcore_workflow_runs;
CREATE POLICY "users read own workflow runs"
  ON public.gafcore_workflow_runs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users insert own workflow runs" ON public.gafcore_workflow_runs;
CREATE POLICY "users insert own workflow runs"
  ON public.gafcore_workflow_runs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users update own workflow runs" ON public.gafcore_workflow_runs;
CREATE POLICY "users update own workflow runs"
  ON public.gafcore_workflow_runs FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.gafcore_agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id uuid NOT NULL REFERENCES public.gafcore_workflow_runs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  agent_type text NOT NULL
    CHECK (agent_type IN (
      'planner', 'frontend', 'backend', 'database', 'validation',
      'deployment', 'documentation', 'refactor', 'debug'
    )),
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN (
      'pending', 'blocked', 'ready', 'running', 'validating',
      'succeeded', 'failed', 'cancelled'
    )),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  title text NOT NULL DEFAULT '',
  instruction text NOT NULL DEFAULT '',
  file_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  file_locks text[] NOT NULL DEFAULT '{}',
  input_artifact_ids uuid[] NOT NULL DEFAULT '{}',
  output_artifact_ids uuid[] NOT NULL DEFAULT '{}',
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 1,
  idempotency_key text,
  lease_expires_at timestamptz,
  error_code text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_run_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS gafcore_agent_tasks_workflow_idx
  ON public.gafcore_agent_tasks(workflow_run_id, state);

CREATE INDEX IF NOT EXISTS gafcore_agent_tasks_ready_idx
  ON public.gafcore_agent_tasks(project_id, state)
  WHERE state IN ('ready', 'running');

ALTER TABLE public.gafcore_agent_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own agent tasks" ON public.gafcore_agent_tasks;
CREATE POLICY "users read own agent tasks"
  ON public.gafcore_agent_tasks FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users insert own agent tasks" ON public.gafcore_agent_tasks;
CREATE POLICY "users insert own agent tasks"
  ON public.gafcore_agent_tasks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users update own agent tasks" ON public.gafcore_agent_tasks;
CREATE POLICY "users update own agent tasks"
  ON public.gafcore_agent_tasks FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.gafcore_task_dependencies (
  task_id uuid NOT NULL REFERENCES public.gafcore_agent_tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES public.gafcore_agent_tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

ALTER TABLE public.gafcore_task_dependencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read task deps via task" ON public.gafcore_task_dependencies;
CREATE POLICY "users read task deps via task"
  ON public.gafcore_task_dependencies FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gafcore_agent_tasks t
      WHERE t.id = task_id AND t.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.gafcore_workflow_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id uuid NOT NULL REFERENCES public.gafcore_workflow_runs(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.gafcore_agent_tasks(id) ON DELETE SET NULL,
  kind text NOT NULL,
  content_hash text NOT NULL DEFAULT '',
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gafcore_workflow_artifacts_run_idx
  ON public.gafcore_workflow_artifacts(workflow_run_id, created_at DESC);

ALTER TABLE public.gafcore_workflow_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own workflow artifacts" ON public.gafcore_workflow_artifacts;
CREATE POLICY "users read own workflow artifacts"
  ON public.gafcore_workflow_artifacts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gafcore_workflow_runs w
      WHERE w.id = workflow_run_id AND w.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.gafcore_agent_task_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.gafcore_agent_tasks(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error')),
  event text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  meta_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gafcore_agent_task_logs_task_idx
  ON public.gafcore_agent_task_logs(task_id, created_at ASC);

ALTER TABLE public.gafcore_agent_task_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read task logs via task" ON public.gafcore_agent_task_logs;
CREATE POLICY "users read task logs via task"
  ON public.gafcore_agent_task_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gafcore_agent_tasks t
      WHERE t.id = task_id AND t.user_id = auth.uid()
    )
  );

-- --- 3/3 Claim RPC (B0) ---
-- (contenido de 20260529120000_gafcore_task_claim_rpc.sql)

CREATE OR REPLACE FUNCTION public.claim_gafcore_agent_tasks(
  p_workflow_run_id uuid,
  p_user_id uuid,
  p_limit int DEFAULT 3,
  p_lease_seconds int DEFAULT 300
)
RETURNS SETOF public.gafcore_agent_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 3), 12));
  v_lease timestamptz := now() + make_interval(secs => GREATEST(60, COALESCE(p_lease_seconds, 300)));
BEGIN
  UPDATE public.gafcore_agent_tasks
  SET
    state = 'ready',
    lease_expires_at = NULL,
    updated_at = now()
  WHERE workflow_run_id = p_workflow_run_id
    AND user_id = p_user_id
    AND state = 'running'
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at < now();

  RETURN QUERY
  WITH picked AS (
    SELECT t.id
    FROM public.gafcore_agent_tasks t
    WHERE t.workflow_run_id = p_workflow_run_id
      AND t.user_id = p_user_id
      AND t.state = 'ready'
    ORDER BY
      CASE t.priority
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'normal' THEN 2
        ELSE 3
      END,
      t.created_at ASC
    LIMIT v_limit
    FOR UPDATE OF t SKIP LOCKED
  )
  UPDATE public.gafcore_agent_tasks t
  SET
    state = 'running',
    lease_expires_at = v_lease,
    started_at = COALESCE(t.started_at, now()),
    updated_at = now()
  FROM picked p
  WHERE t.id = p.id
    AND t.state = 'ready'
  RETURNING t.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_gafcore_agent_tasks(uuid, uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_gafcore_agent_tasks(uuid, uuid, int, int) TO service_role;

CREATE INDEX IF NOT EXISTS gafcore_agent_tasks_workflow_ready_idx
  ON public.gafcore_agent_tasks(workflow_run_id, state, priority)
  WHERE state = 'ready';

-- Verificación rápida (debe devolver 3 filas + función claim)
SELECT 'gafcore_pipeline_runs' AS obj, COUNT(*)::text AS ok FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'gafcore_pipeline_runs'
UNION ALL
SELECT 'gafcore_workflow_runs', COUNT(*)::text FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'gafcore_workflow_runs'
UNION ALL
SELECT 'claim_gafcore_agent_tasks', COUNT(*)::text FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'claim_gafcore_agent_tasks';
