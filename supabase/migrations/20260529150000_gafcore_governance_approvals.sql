-- GafCore: approval flows para acciones críticas (delete, publish)

CREATE TABLE IF NOT EXISTS public.governance_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL DEFAULT 'project',
  resource_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'executed', 'expired', 'cancelled')
  ),
  risk_level text CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_score integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  executed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_governance_approvals_actor_pending
  ON public.governance_approvals (actor_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_governance_approvals_resource
  ON public.governance_approvals (resource_type, resource_id, created_at DESC);

ALTER TABLE public.governance_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own governance_approvals" ON public.governance_approvals;
CREATE POLICY "users read own governance_approvals"
  ON public.governance_approvals
  FOR SELECT
  TO authenticated
  USING (auth.uid() = actor_id OR public.has_role(auth.uid(), 'admin'));

-- Escritura solo vía service role (servidor).
