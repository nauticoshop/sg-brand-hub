-- Closed Won webhook idempotency.
--
-- The Monday webhook can fire more than once for the same deal (Monday retries,
-- humans flipping the column back and forth, etc). Previously we used the
-- brand_projects table as our dedup anchor, but we no longer auto-create
-- brand_projects rows on Closed Won — brands flow through the intake form,
-- projects flow through Brief Tool's Project Request modal.
--
-- This table is the new anchor. One row per Monday deal id, written by the
-- webhook handler after notifications dispatch successfully.

create table if not exists public.closed_won_dispatches (
  monday_deal_id text primary key,
  brand_id uuid references public.brands(id) on delete set null,
  kind text not null check (kind in ('new_client', 'returning_client')),
  dispatched_at timestamptz not null default now()
);

create index if not exists closed_won_dispatches_brand_idx
  on public.closed_won_dispatches(brand_id);

alter table public.closed_won_dispatches enable row level security;

-- Internal app only; no anon access.
create policy "auth all on closed_won_dispatches"
  on public.closed_won_dispatches
  for all
  to authenticated
  using (true)
  with check (true);
