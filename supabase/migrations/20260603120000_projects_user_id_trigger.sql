-- Asegura user_id en proyectos nuevos y mejora listado por usuario.

CREATE OR REPLACE FUNCTION public.projects_default_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_default_user_id ON public.projects;
CREATE TRIGGER trg_projects_default_user_id
  BEFORE INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.projects_default_user_id();

DROP POLICY IF EXISTS "create own projects" ON public.projects;
CREATE POLICY "create own projects" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_projects_user_id_updated_at
  ON public.projects (user_id, updated_at DESC NULLS LAST);

COMMENT ON FUNCTION public.projects_default_user_id() IS
  'Asigna user_id = auth.uid() en INSERT si el cliente no lo envía.';
