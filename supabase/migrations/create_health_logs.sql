-- GafCore: historial de auto-diagnóstico sistémico (Gemini + reparación sugerida)
-- Aplicar con Supabase CLI o panel SQL. Idempotente.

CREATE TABLE IF NOT EXISTS public.gafcore_health_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  componente text NOT NULL,
  error_original text NOT NULL,
  diagnostico_ia jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado text NOT NULL CHECK (estado IN ('fallido', 'auto_reparado')),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gafcore_health_logs_creado_en
  ON public.gafcore_health_logs (creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_gafcore_health_logs_componente
  ON public.gafcore_health_logs (componente, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_gafcore_health_logs_estado
  ON public.gafcore_health_logs (estado, creado_en DESC);

ALTER TABLE public.gafcore_health_logs ENABLE ROW LEVEL SECURITY;

-- Solo administradores leen desde el cliente autenticado; escrituras vía service_role (servidor).
DROP POLICY IF EXISTS "admins read gafcore_health_logs" ON public.gafcore_health_logs;
CREATE POLICY "admins read gafcore_health_logs"
  ON public.gafcore_health_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.gafcore_health_logs IS
  'Registro de fallos API GafCore con diagnóstico IA (Gemini) y estado de reparación.';
