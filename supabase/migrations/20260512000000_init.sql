-- SG Brand Hub — initial schema

-- Enums
do $$ begin
  create type brand_status as enum ('draft', 'submitted', 'in_review', 'approved', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type brand_vertical as enum (
    'marine',
    'private_aviation',
    'automotive',
    'luxury_real_estate',
    'home_services',
    'resort_travel',
    'multifamily_residential',
    'other'
  );
exception when duplicate_object then null; end $$;

-- brands
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,

  status brand_status not null default 'draft',
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,

  business_name text not null,
  website text,
  vertical brand_vertical,
  client_monday_board_url text,
  dropbox_folder_url text,
  canva_brand_kit_url text,
  brand_guideline_pdf_url text,

  instagram text,
  facebook text,
  youtube text,
  tiktok text,
  linkedin text,

  overview_client_raw text,
  overview_polished text,
  look_and_feel text,
  brand_voice text,
  what_to_avoid text,
  inspiration_references text,

  audience_gender text,
  audience_age text,
  audience_type text,

  coloring_tone text,
  music_mood text[] default '{}'::text[],
  music_genre text[] default '{}'::text[],
  music_notes text,

  colors jsonb not null default '[]'::jsonb,
  fonts jsonb not null default '[]'::jsonb,

  internal_notes text,

  ai_enriched_at timestamptz,
  ai_enrichment_version text
);

create index if not exists brands_status_idx on public.brands(status);
create index if not exists brands_created_at_idx on public.brands(created_at desc);

-- brand_logos
create table if not exists public.brand_logos (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  created_at timestamptz not null default now(),
  file_name text not null,
  file_path text not null,
  public_url text not null,
  dropbox_path text,
  logo_type text,
  colorway text,
  display_order integer not null default 0
);

create index if not exists brand_logos_brand_idx on public.brand_logos(brand_id, display_order);

-- brand_activity_log
create table if not exists public.brand_activity_log (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb
);

create index if not exists activity_brand_idx on public.brand_activity_log(brand_id, created_at desc);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists brands_set_updated_at on public.brands;
create trigger brands_set_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();

-- Row Level Security
alter table public.brands enable row level security;
alter table public.brand_logos enable row level security;
alter table public.brand_activity_log enable row level security;

-- Authenticated team members can read/write everything.
-- Domain restriction is enforced at the auth layer (middleware + callback).
drop policy if exists "brands_select_authenticated" on public.brands;
create policy "brands_select_authenticated" on public.brands
  for select to authenticated using (true);

drop policy if exists "brands_insert_authenticated" on public.brands;
create policy "brands_insert_authenticated" on public.brands
  for insert to authenticated with check (true);

drop policy if exists "brands_update_authenticated" on public.brands;
create policy "brands_update_authenticated" on public.brands
  for update to authenticated using (true) with check (true);

drop policy if exists "brands_delete_authenticated" on public.brands;
create policy "brands_delete_authenticated" on public.brands
  for delete to authenticated using (true);

-- Public can INSERT a submission (server route uses service role anyway, but allow anon insert for resilience)
drop policy if exists "brands_insert_anon_submission" on public.brands;
create policy "brands_insert_anon_submission" on public.brands
  for insert to anon with check (status = 'submitted');

drop policy if exists "logos_all_authenticated" on public.brand_logos;
create policy "logos_all_authenticated" on public.brand_logos
  for all to authenticated using (true) with check (true);

drop policy if exists "logos_insert_anon" on public.brand_logos;
create policy "logos_insert_anon" on public.brand_logos
  for insert to anon with check (true);

drop policy if exists "activity_select_authenticated" on public.brand_activity_log;
create policy "activity_select_authenticated" on public.brand_activity_log
  for select to authenticated using (true);

drop policy if exists "activity_insert_authenticated" on public.brand_activity_log;
create policy "activity_insert_authenticated" on public.brand_activity_log
  for insert to authenticated with check (true);
