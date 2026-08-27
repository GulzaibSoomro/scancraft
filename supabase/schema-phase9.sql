-- Phase 9: scheduled re-scans + alert preferences
-- Run in Supabase SQL editor after the base schema.

alter table public.profiles
  add column if not exists alert_email_enabled boolean not null default true;

alter table public.profiles
  add column if not exists slack_webhook_url text;

alter table public.projects
  add column if not exists weekly_rescan_enabled boolean not null default false;

alter table public.projects
  add column if not exists last_auto_scan_at timestamptz;

alter table public.projects
  add column if not exists next_auto_scan_at timestamptz;

alter table public.scans
  add column if not exists trigger text not null default 'manual'
    check (trigger in ('manual', 'scheduled'));

create index if not exists projects_next_auto_scan_idx
  on public.projects (next_auto_scan_at)
  where weekly_rescan_enabled = true;
