-- Add a public share token to every brand so we can build Google-Docs-style
-- "anyone with the link" share pages.
alter table public.brands
  add column if not exists share_token text;

-- Backfill existing rows with random tokens (32-char hex).
update public.brands
  set share_token = replace(gen_random_uuid()::text, '-', '')
  where share_token is null;

alter table public.brands
  alter column share_token set default replace(gen_random_uuid()::text, '-', ''),
  alter column share_token set not null;

create unique index if not exists brands_share_token_idx on public.brands(share_token);
