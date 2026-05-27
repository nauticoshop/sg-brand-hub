-- Brief Tool migration: briefs table
-- Maps creative briefs to brand records

create table if not exists public.briefs (
  id text primary key,
  brand_id uuid references public.brands(id) on delete set null,
  data_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists briefs_brand_idx on public.briefs(brand_id);
create index if not exists briefs_updated_idx on public.briefs(updated_at desc);

-- updated_at trigger
drop trigger if exists briefs_set_updated_at on public.briefs;
create trigger briefs_set_updated_at
  before update on public.briefs
  for each row execute function public.set_updated_at();

-- RLS
alter table public.briefs enable row level security;

create policy "briefs_all_authenticated" on public.briefs
  for all to authenticated using (true) with check (true);

create policy "briefs_anon_read" on public.briefs
  for select to anon using (true);

-- Also add brief-specific columns to brands table if missing
alter table public.brands
  add column if not exists am text,
  add column if not exists poc_name text,
  add column if not exists poc_num text,
  add column if not exists poc_email text,
  add column if not exists logo_placement text,
  add column if not exists monday_board_id text;
