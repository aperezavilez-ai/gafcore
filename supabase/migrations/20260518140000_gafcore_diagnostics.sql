-- GafCore: Auto Diagnostic + Admin Approval (solo administradores vía RLS)

CREATE TABLE IF NOT EXISTS public.diagnostic_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  module text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  possible_root_cause text,
  impact text,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'pending_analysis' CHECK (
    status IN (
      'pending_analysis',
      'pending_approval',
      'approved',
      'rejected',
      'deferred',
      'executing',
      'completed',
      'failed'
    )
  ),
  source text NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis_json jsonb,
  proposed_fix text,
  modified_fix text,
  admin_decision text CHECK (admin_decision IN ('approve', 'reject', 'modify', 'defer')),
  decided_by uuid,
  decided_at timestamptz,
  fix_type text,
  execution_result jsonb,
  environment text NOT NULL DEFAULT 'production'
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_reports_created_at
  ON public.diagnostic_reports (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_diagnostic_reports_status
  ON public.diagnostic_reports (status, severity);

CREATE TABLE IF NOT EXISTS public.diagnostic_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.diagnostic_reports (id) ON DELETE CASCADE,
  actor_id uuid,
  event_type text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_audit_log_report_id
  ON public.diagnostic_audit_log (report_id, created_at DESC);

ALTER TABLE public.diagnostic_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostic_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage diagnostic_reports" ON public.diagnostic_reports;
CREATE POLICY "admins manage diagnostic_reports"
  ON public.diagnostic_reports
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins manage diagnostic_audit_log" ON public.diagnostic_audit_log;
CREATE POLICY "admins manage diagnostic_audit_log"
  ON public.diagnostic_audit_log
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS diagnostic_reports_set_updated_at ON public.diagnostic_reports;
CREATE TRIGGER diagnostic_reports_set_updated_at
  BEFORE UPDATE ON public.diagnostic_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
