-- Memory System M0/M1: decisiones procedimentales + grafo de imports por proyecto.

CREATE TABLE IF NOT EXISTS public.project_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'chat'
    CHECK (source IN ('chat', 'validation', 'template', 'user', 'system')),
  pipeline_run_id uuid REFERENCES public.gafcore_pipeline_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_decisions_project_idx
  ON public.project_decisions(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.project_graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  path text NOT NULL,
  node_kind text NOT NULL DEFAULT 'file'
    CHECK (node_kind IN ('file', 'module', 'package')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, path)
);

CREATE TABLE IF NOT EXISTS public.project_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  from_path text NOT NULL,
  to_path text NOT NULL,
  edge_kind text NOT NULL DEFAULT 'imports'
    CHECK (edge_kind IN ('imports', 'depends_on', 'routes_to')),
  confidence real NOT NULL DEFAULT 1.0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, from_path, to_path, edge_kind)
);

CREATE INDEX IF NOT EXISTS project_graph_edges_from_idx
  ON public.project_graph_edges(project_id, from_path);

CREATE INDEX IF NOT EXISTS project_graph_edges_to_idx
  ON public.project_graph_edges(project_id, to_path);

ALTER TABLE public.project_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_graph_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own project_decisions" ON public.project_decisions;
CREATE POLICY "users read own project_decisions"
  ON public.project_decisions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users insert own project_decisions" ON public.project_decisions;
CREATE POLICY "users insert own project_decisions"
  ON public.project_decisions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users read own project_graph_nodes" ON public.project_graph_nodes;
CREATE POLICY "users read own project_graph_nodes"
  ON public.project_graph_nodes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_graph_nodes.project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users read own project_graph_edges" ON public.project_graph_edges;
CREATE POLICY "users read own project_graph_edges"
  ON public.project_graph_edges FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_graph_edges.project_id AND p.user_id = auth.uid()
    )
  );

-- Escritura solo vía service role (servidor GafCore).
DROP POLICY IF EXISTS "service role all project_graph_nodes" ON public.project_graph_nodes;
CREATE POLICY "service role all project_graph_nodes"
  ON public.project_graph_nodes FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service role all project_graph_edges" ON public.project_graph_edges;
CREATE POLICY "service role all project_graph_edges"
  ON public.project_graph_edges FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service role all project_decisions" ON public.project_decisions;
CREATE POLICY "service role all project_decisions"
  ON public.project_decisions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
