-- GafCore — brand del proyecto (Fase 3)
-- 1:1 con public.projects. Persistido como jsonb para evolucionar el schema sin migrar columnas.

create table if not exists public.gafcore_project_brands (
  project_id uuid primary key references public.projects(id) on delete cascade,
  brand jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gafcore_project_brands enable row level security;

drop policy if exists "Users can view brand of own projects" on public.gafcore_project_brands;
create policy "Users can view brand of own projects"
  on public.gafcore_project_brands for select
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = gafcore_project_brands.project_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert brand for own projects" on public.gafcore_project_brands;
create policy "Users can insert brand for own projects"
  on public.gafcore_project_brands for insert
  to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = gafcore_project_brands.project_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update brand of own projects" on public.gafcore_project_brands;
create policy "Users can update brand of own projects"
  on public.gafcore_project_brands for update
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = gafcore_project_brands.project_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = gafcore_project_brands.project_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete brand of own projects" on public.gafcore_project_brands;
create policy "Users can delete brand of own projects"
  on public.gafcore_project_brands for delete
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = gafcore_project_brands.project_id
        and p.user_id = auth.uid()
    )
  );

drop trigger if exists gafcore_project_brands_set_updated_at on public.gafcore_project_brands;
create trigger gafcore_project_brands_set_updated_at
  before update on public.gafcore_project_brands
  for each row execute function public.set_updated_at();

create index if not exists gafcore_project_brands_updated_at_idx
  on public.gafcore_project_brands (updated_at desc);
