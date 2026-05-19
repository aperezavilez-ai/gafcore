-- Estado de deploy Vercel por proyecto (polling + webhook).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS deploy_status text NOT NULL DEFAULT 'idle'
    CHECK (deploy_status IN ('idle', 'building', 'ready', 'error')),
  ADD COLUMN IF NOT EXISTS deploy_status_at timestamptz,
  ADD COLUMN IF NOT EXISTS vercel_deployment_id text,
  ADD COLUMN IF NOT EXISTS deploy_error text;

COMMENT ON COLUMN public.projects.deploy_status IS 'idle | building | ready | error';
COMMENT ON COLUMN public.projects.vercel_deployment_id IS 'Último deployment Vercel rastreado';

CREATE INDEX IF NOT EXISTS projects_deploy_status_idx
  ON public.projects (id, deploy_status)
  WHERE deploy_status = 'building';
