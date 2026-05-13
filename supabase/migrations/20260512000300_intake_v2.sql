-- Intake v2: new vertical values, "other" specifier, submitter contact, tagline.

-- New vertical enum values (replacing luxury_real_estate concept).
-- Postgres can't drop enum values without recreating the type, so we leave
-- 'luxury_real_estate' in place; the form just won't expose it anymore.
alter type brand_vertical add value if not exists 'real_estate';
alter type brand_vertical add value if not exists 'real_estate_development';

alter table public.brands
  add column if not exists vertical_other text,
  add column if not exists submitter_name text,
  add column if not exists submitter_email text,
  add column if not exists submitter_phone text,
  add column if not exists tagline text;
