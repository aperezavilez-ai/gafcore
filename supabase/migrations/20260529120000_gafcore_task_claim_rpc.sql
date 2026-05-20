-- B0: claim atómico multi-worker (FOR UPDATE SKIP LOCKED) + leases vencidos.

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
