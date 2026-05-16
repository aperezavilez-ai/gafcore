create type public.app_role as enum ('admin', 'user');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null unique,
  email text,
  first_name text,
  last_name text,
  artist_name text,
  avatar_url text,
  bio text,
  handle text unique,
  onboarding_completed boolean not null default false,
  onboarding_data jsonb not null default '{}'::jsonb,
  public_enabled boolean not null default false,
  referral_code text unique,
  referred_by_code text,
  social_links jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id)
);

create table if not exists public.user_roles (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create table if not exists public.user_credits (
  user_id uuid not null primary key,
  balance integer not null default 0,
  monthly_allowance integer not null default 0,
  daily_limit integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  amount integer not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  paddle_subscription_id text,
  paddle_customer_id text,
  product_id text,
  price_id text,
  plan_tier text,
  status text not null default 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  environment text not null default 'live',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  type text not null,
  title text not null,
  message text,
  link text,
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid,
  name text not null default 'AI Studio Project',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Table may have been created earlier in the dashboard without `user_id`; RLS below requires it.
alter table public.projects add column if not exists user_id uuid;

create table if not exists public.project_files (
  id uuid not null default gen_random_uuid() primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  language text not null default 'typescript',
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, name)
);

create table if not exists public.support_tickets (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  subject text not null,
  message text,
  category text not null default 'general',
  status text not null default 'open',
  admin_response text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.releases (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  title text not null,
  artist_name text not null,
  artist_type text not null default 'primary',
  artist_role text,
  contributors jsonb not null default '[]'::jsonb,
  cover_path text,
  selected_stores text[] not null default '{}',
  genre text,
  release_date date,
  submitted_at timestamptz not null default now(),
  review_status text not null default 'draft',
  distribution_status text not null default 'draft',
  express_release boolean not null default false,
  rejection_reason text,
  approved_at timestamptz,
  upc text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payout_accounts (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  type text not null default 'bank',
  holder_name text,
  details jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payout_transactions (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  account_id uuid references public.payout_accounts(id) on delete set null,
  type text not null,
  status text not null default 'pending',
  amount numeric not null default 0,
  currency text not null default 'MXN',
  method text,
  reference text,
  notes text,
  receipt_number text not null default ('RCPT-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  receipt_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  module text not null,
  prompt text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, first_name, last_name, artist_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'artist_name'
  )
  on conflict (user_id) do update set email = excluded.email;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id, role) do nothing;

  insert into public.user_credits (user_id, balance, monthly_allowance, daily_limit)
  values (new.id, 25, 25, 25)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();
drop trigger if exists project_files_set_updated_at on public.project_files;
create trigger project_files_set_updated_at before update on public.project_files for each row execute function public.set_updated_at();
drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at before update on public.support_tickets for each row execute function public.set_updated_at();
drop trigger if exists releases_set_updated_at on public.releases;
create trigger releases_set_updated_at before update on public.releases for each row execute function public.set_updated_at();
drop trigger if exists payout_accounts_set_updated_at on public.payout_accounts;
create trigger payout_accounts_set_updated_at before update on public.payout_accounts for each row execute function public.set_updated_at();
drop trigger if exists payout_transactions_set_updated_at on public.payout_transactions;
create trigger payout_transactions_set_updated_at before update on public.payout_transactions for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_credits enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.projects enable row level security;
alter table public.project_files enable row level security;
alter table public.support_tickets enable row level security;
alter table public.releases enable row level security;
alter table public.payout_accounts enable row level security;
alter table public.payout_transactions enable row level security;
alter table public.generations enable row level security;

-- Replacing policies first defined in 20260508000000_create_profiles.sql (admin-aware select).
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "Users can insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own profile" on public.profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can view own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create policy "Users can view own credits" on public.user_credits for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "Users can view own credit transactions" on public.credit_transactions for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create policy "Users can view own subscriptions" on public.subscriptions for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create policy "Users can view own notifications" on public.notifications for select to authenticated using (auth.uid() = user_id);
create policy "Users can update own notifications" on public.notifications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own notifications" on public.notifications for delete to authenticated using (auth.uid() = user_id);

create policy "Users can view own projects" on public.projects for select to authenticated using (user_id is null or auth.uid() = user_id);
create policy "Users can create own projects" on public.projects for insert to authenticated with check (user_id is null or auth.uid() = user_id);
create policy "Users can update own projects" on public.projects for update to authenticated using (user_id is null or auth.uid() = user_id) with check (user_id is null or auth.uid() = user_id);
create policy "Users can delete own projects" on public.projects for delete to authenticated using (user_id is null or auth.uid() = user_id);

create policy "Users can view own project files" on public.project_files for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and (p.user_id is null or p.user_id = auth.uid())));
create policy "Users can create own project files" on public.project_files for insert to authenticated with check (exists (select 1 from public.projects p where p.id = project_id and (p.user_id is null or p.user_id = auth.uid())));
create policy "Users can update own project files" on public.project_files for update to authenticated using (exists (select 1 from public.projects p where p.id = project_id and (p.user_id is null or p.user_id = auth.uid()))) with check (exists (select 1 from public.projects p where p.id = project_id and (p.user_id is null or p.user_id = auth.uid())));
create policy "Users can delete own project files" on public.project_files for delete to authenticated using (exists (select 1 from public.projects p where p.id = project_id and (p.user_id is null or p.user_id = auth.uid())));

create policy "Users can manage own support tickets" on public.support_tickets for all to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin')) with check (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "Users can manage own releases" on public.releases for all to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin')) with check (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "Users can manage own payout accounts" on public.payout_accounts for all to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin')) with check (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "Users can manage own payout transactions" on public.payout_transactions for all to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin')) with check (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

-- Same policy names as 20260508120000_create_generations.sql; drop before recreate.
drop policy if exists "users select own generations" on public.generations;
drop policy if exists "users insert own generations" on public.generations;
drop policy if exists "users delete own generations" on public.generations;
create policy "users select own generations" on public.generations for select to authenticated using (auth.uid() = user_id);
create policy "users insert own generations" on public.generations for insert to authenticated with check (auth.uid() = user_id);
create policy "users delete own generations" on public.generations for delete to authenticated using (auth.uid() = user_id);

create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text default null,
  p_link text default null,
  p_resource_type text default null,
  p_resource_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.notifications (user_id, type, title, message, link, resource_type, resource_id, metadata)
  values (p_user_id, p_type, p_title, p_message, p_link, p_resource_type, p_resource_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.add_credits(p_user_id uuid, p_amount integer, p_reason text default 'manual', p_metadata jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_balance integer;
begin
  insert into public.user_credits (user_id, balance, monthly_allowance, daily_limit)
  values (p_user_id, greatest(p_amount, 0), greatest(p_amount, 0), greatest(p_amount, 0))
  on conflict (user_id) do update set balance = public.user_credits.balance + p_amount, updated_at = now()
  returning balance into v_balance;
  insert into public.credit_transactions (user_id, amount, reason, metadata) values (p_user_id, p_amount, p_reason, coalesce(p_metadata, '{}'::jsonb));
  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

create or replace function public.consume_credits(p_user_id uuid, p_amount integer, p_reason text default 'usage', p_metadata jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_balance integer;
declare v_allowance integer;
begin
  if p_amount <= 0 then
    return jsonb_build_object('ok', true, 'balance', 0);
  end if;

  insert into public.user_credits (user_id, balance, monthly_allowance, daily_limit)
  values (p_user_id, 25, 25, 25)
  on conflict (user_id) do nothing;

  select balance, monthly_allowance into v_balance, v_allowance from public.user_credits where user_id = p_user_id for update;

  if v_allowance >= 1000 then
    insert into public.credit_transactions (user_id, amount, reason, metadata) values (p_user_id, 0, p_reason, coalesce(p_metadata, '{}'::jsonb));
    return jsonb_build_object('ok', true, 'balance', v_balance, 'unlimited', true, 'daily_limit', v_allowance);
  end if;

  if v_balance < p_amount then
    return jsonb_build_object('ok', false, 'balance', v_balance, 'error', 'insufficient_credits');
  end if;

  update public.user_credits set balance = balance - p_amount, updated_at = now() where user_id = p_user_id returning balance into v_balance;
  insert into public.credit_transactions (user_id, amount, reason, metadata) values (p_user_id, -p_amount, p_reason, coalesce(p_metadata, '{}'::jsonb));
  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;