-- Memoria IA por proyecto (errores frecuentes y soluciones reutilizables).

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
