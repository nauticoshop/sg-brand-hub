-- Track which Monday.com items each brand maps to so the Approve & Sync
-- action can be idempotent (update existing instead of creating duplicates).
alter table public.brands
  add column if not exists monday_intake_item_id text,
  add column if not exists monday_all_projects_item_id text;

create index if not exists brands_monday_intake_idx
  on public.brands(monday_intake_item_id);
