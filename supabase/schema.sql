-- ScanCraft database schema
-- Run this in the Supabase SQL editor (or via supabase db push).
-- RLS is enabled on every table — users only see their own data.

-- ---------------------------------------------------------------------------
-- profiles: extends auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  subscription_tier text not null default 'free'
    check (subscription_tier in ('free', 'pro')),
  stripe_customer_id text,
  alert_email_enabled boolean not null default true,
  slack_webhook_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- projects: a saved app the user scans repeatedly
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  deployed_url text not null,
  github_repo_url text,
  platform text
    check (platform is null or platform in (
      'lovable', 'bolt', 'cursor', 'v0', 'replit', 'other'
    )),
  weekly_rescan_enabled boolean not null default false,
  last_auto_scan_at timestamptz,
  next_auto_scan_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects(user_id);

alter table public.projects enable row level security;

create policy "Users can view own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users can insert own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update own projects"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "Users can delete own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- scans: one run of the scanner against a project
-- ---------------------------------------------------------------------------
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'complete', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  overall_verdict text
    check (overall_verdict is null or overall_verdict in ('at_risk', 'secure')),
  is_preview boolean not null default false,
  error_message text,
  trigger text not null default 'manual'
    check (trigger in ('manual', 'scheduled')),
  created_at timestamptz not null default now()
);

create index if not exists scans_project_id_idx on public.scans(project_id);
create index if not exists scans_status_idx on public.scans(status);

alter table public.scans enable row level security;

create policy "Users can view own scans"
  on public.scans for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = scans.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can insert own scans"
  on public.scans for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = scans.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can update own scans"
  on public.scans for update
  using (
    exists (
      select 1 from public.projects
      where projects.id = scans.project_id
        and projects.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- findings: individual results from one scan
-- ---------------------------------------------------------------------------
create table if not exists public.findings (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  check_id text not null,
  severity text not null
    check (severity in ('critical', 'warning', 'info', 'pass')),
  title text not null,
  location text,
  detail text not null,
  evidence text,
  fix_type text
    check (fix_type is null or fix_type in ('code', 'prompt', 'manual')),
  fix_content text,
  created_at timestamptz not null default now()
);

create index if not exists findings_scan_id_idx on public.findings(scan_id);
create index if not exists findings_severity_idx on public.findings(severity);

alter table public.findings enable row level security;

create policy "Users can view own findings"
  on public.findings for select
  using (
    exists (
      select 1 from public.scans
      join public.projects on projects.id = scans.project_id
      where scans.id = findings.scan_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can insert own findings"
  on public.findings for insert
  with check (
    exists (
      select 1 from public.scans
      join public.projects on projects.id = scans.project_id
      where scans.id = findings.scan_id
        and projects.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- preview_scans: anonymous free preview scans (no auth required)
-- Limited checks; no project ownership. Rate-limit in application layer.
-- ---------------------------------------------------------------------------
create table if not exists public.preview_scans (
  id uuid primary key default gen_random_uuid(),
  target_url text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'complete', 'failed')),
  overall_verdict text
    check (overall_verdict is null or overall_verdict in ('at_risk', 'secure')),
  findings jsonb not null default '[]'::jsonb,
  error_message text,
  client_ip text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Preview scans are written by the service role (API route) and readable by id.
-- No user-scoped RLS — anonymous visitors use a shareable scan id.
alter table public.preview_scans enable row level security;

-- Allow anyone to read a preview scan by id (results page after free scan).
create policy "Anyone can read preview scans by id"
  on public.preview_scans for select
  using (true);

-- Inserts/updates go through the service-role key from API routes only.
-- No insert/update policies for authenticated/anon clients.
