-- Engagement type — orthogonal to pipeline status. Distinguishes ongoing
-- retainer clients from one-off project work and inactive relationships.
do $$ begin
  create type engagement_type as enum ('retainer', 'project', 'inactive');
exception when duplicate_object then null; end $$;

alter table public.brands
  add column if not exists engagement_type engagement_type not null default 'retainer';

create index if not exists brands_engagement_type_idx on public.brands(engagement_type);
