-- Per-project history for a brand. A retainer client may have many projects
-- spanning years; each Closed Won deal that involves Content service produces
-- a project row + dedicated Dropbox subfolder. Non-Content deals (Social,
-- Website, Brand Strategy) also produce rows here for tracking, but without
-- a Dropbox project subfolder or brief.
--
-- Each row tracks one (deal × service_type) pair, because a single deal can
-- close with multiple service types tagged and each becomes its own project.

create table if not exists public.brand_projects (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,

  monday_deal_id text,
  -- Service type tagged on the Monday deal at close (one of Content, Social,
  -- Website, Brand Strategy). Single value per project even if deal had many.
  service_type text not null,

  project_name text not null,
  year integer,
  deal_value numeric,
  deal_type text,                            -- 'One Time' or 'Recurring'

  -- Only set for Content projects. URL of the Dropbox project subfolder.
  dropbox_project_folder_url text,

  -- Only set for Content projects. Brief Tool brief id (text PK in briefs).
  brief_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brand_projects_brand_idx on public.brand_projects(brand_id, created_at desc);
-- Lookup by (deal × service) for webhook idempotency.
create unique index if not exists brand_projects_deal_service_idx
  on public.brand_projects(monday_deal_id, service_type)
  where monday_deal_id is not null;

-- updated_at trigger reuses the public.set_updated_at() function defined in
-- the init migration.
drop trigger if exists brand_projects_set_updated_at on public.brand_projects;
create trigger brand_projects_set_updated_at
  before update on public.brand_projects
  for each row execute function public.set_updated_at();

alter table public.brand_projects enable row level security;

drop policy if exists "brand_projects_all_authenticated" on public.brand_projects;
create policy "brand_projects_all_authenticated" on public.brand_projects
  for all to authenticated using (true) with check (true);

drop policy if exists "brand_projects_anon_read" on public.brand_projects;
create policy "brand_projects_anon_read" on public.brand_projects
  for select to anon using (true);

comment on table public.brand_projects is
  'Per-project history for brands. One row per (deal × service_type) — a deal '
  'tagged with multiple Service Types on Monday produces one row per service.';
