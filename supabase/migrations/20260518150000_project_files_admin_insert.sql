-- Admin puede insertar archivos en proyectos propios (alineado con SELECT/UPDATE/DELETE).
DROP POLICY IF EXISTS "Users can create own project files" ON public.project_files;

CREATE POLICY "Users can create own project files" ON public.project_files
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_files.project_id
      AND (p.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);
