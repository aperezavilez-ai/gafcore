-- Plantillas de proyecto GafCore (Etapa 6). Seed vía servidor en primer listado.

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
