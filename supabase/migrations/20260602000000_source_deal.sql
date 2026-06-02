-- Track which Monday deal a brand came from when it was auto-created via the
-- Closed Won webhook (S6). NULL for brands that came in via the public intake
-- form or were created manually.

alter table public.brands
  add column if not exists source_deal_id text,
  add column if not exists source_deal_url text;

-- Lookup by deal_id when the webhook fires — used for idempotency so a single
-- deal doesn't produce two brand drafts if Monday re-emits the event.
create index if not exists brands_source_deal_idx on public.brands(source_deal_id);
