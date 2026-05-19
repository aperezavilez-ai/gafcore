-- Reparación idempotente si ya ejecutaste migraciones 20260521/20260522 y falló solo CREATE POLICY.
-- Seguro volver a ejecutar: no duplica políticas ni tablas.

-- project_ai_memory
CREATE TABLE IF NOT EXISTS public.project_ai_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('error', 'solution')),
  fingerprint text NOT NULL,
  message text NOT NULL,
  solution_hint text,
  hit_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, kind, fingerprint)
);

CREATE INDEX IF NOT EXISTS project_ai_memory_project_idx
  ON public.project_ai_memory(project_id, updated_at DESC);

ALTER TABLE public.project_ai_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own project_ai_memory" ON public.project_ai_memory;
CREATE POLICY "users read own project_ai_memory"
  ON public.project_ai_memory FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users insert own project_ai_memory" ON public.project_ai_memory;
CREATE POLICY "users insert own project_ai_memory"
  ON public.project_ai_memory FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users update own project_ai_memory" ON public.project_ai_memory;
CREATE POLICY "users update own project_ai_memory"
  ON public.project_ai_memory FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- gafcore_project_templates
CREATE TABLE IF NOT EXISTS public.gafcore_project_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'starter'
    CHECK (category IN ('starter', 'landing', 'ecommerce')),
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gafcore_project_templates_active_idx
  ON public.gafcore_project_templates (is_active, sort_order);

ALTER TABLE public.gafcore_project_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read active templates" ON public.gafcore_project_templates;
CREATE POLICY "authenticated read active templates"
  ON public.gafcore_project_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "admin manage templates" ON public.gafcore_project_templates;
CREATE POLICY "admin manage templates"
  ON public.gafcore_project_templates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
