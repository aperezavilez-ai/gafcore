-- GafCore: gobernanza — kill switches + auditoría unificada (solo admins vía RLS)

CREATE TABLE IF NOT EXISTS public.system_controls (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  message text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.system_controls (key, enabled, message) VALUES
  ('ai_enabled', true, NULL),
  ('chat_enabled', true, NULL),
  ('factory_enabled', true, NULL),
  ('publish_enabled', true, NULL),
  ('maintenance_mode', false, 'GafCore está en mantenimiento. Vuelve en unos minutos.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  risk_level text CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_score integer,
  outcome text NOT NULL CHECK (outcome IN ('allowed', 'blocked', 'pending_approval', 'completed')),
  instruction_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_events_created_at
  ON public.audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor_id
  ON public.audit_events (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_action
  ON public.audit_events (action, created_at DESC);

ALTER TABLE public.system_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage system_controls" ON public.system_controls;
CREATE POLICY "admins manage system_controls"
  ON public.system_controls
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins read audit_events" ON public.audit_events;
CREATE POLICY "admins read audit_events"
  ON public.audit_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Inserciones solo vía service role (servidor); admins leen en panel ops.

DROP TRIGGER IF EXISTS system_controls_set_updated_at ON public.system_controls;
CREATE TRIGGER system_controls_set_updated_at
  BEFORE UPDATE ON public.system_controls
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
