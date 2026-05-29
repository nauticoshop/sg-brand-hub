-- Brand Hub → Brief Tool contract
--
-- The Brief Tool sits in a sibling app sharing this Supabase project. It needs
-- read-only access to Brand Hub data so a brief can be authored with the right
-- brand colors, fonts, voice, AM contact, etc. Rather than hand Brief Tool
-- direct access to the `brands` table (which would couple it to internal
-- refactors), we publish a stable view: `public.brand_directory`.
--
-- This view is the canonical contract. Renames or additions on `brands` are
-- safe as long as the view keeps the same output shape; if we ever need to
-- change the view's columns, that's a coordinated breaking change.
--
-- Brief Tool should NEVER select from `brands` directly. It should select from
-- `brand_directory` only.

create or replace view public.brand_directory as
select
  b.id                              as brand_id,
  b.business_name,
  b.share_token,
  b.account_manager,
  -- Primary point of contact from the intake form. Brief Tool can fall back
  -- to account_manager when null.
  b.submitter_name                  as primary_contact_name,
  b.submitter_email                 as primary_contact_email,
  b.submitter_phone                 as primary_contact_phone,
  b.tagline,
  b.brand_voice,
  b.look_and_feel,
  b.what_to_avoid,
  b.audience_type,
  b.audience_age,
  b.audience_gender,
  b.overview_polished               as overview,
  -- JSONB arrays. Shape documented in lib/contracts/brand-directory.ts.
  b.colors,
  b.fonts,
  b.music_notes,
  b.music_mood,
  b.music_genre,
  b.coloring_tone,
  b.vertical,
  b.engagement_type,
  -- External URLs Brief Tool needs to link out to.
  b.dropbox_folder_url,
  b.client_monday_board_url,
  b.brand_guideline_pdf_url,
  -- Canonical share URL for the editorial guideline (the public-facing one
  -- a brief can embed). Built from share_token so Brief Tool never has to
  -- string-concat URLs.
  ('https://sg-brand-hub.vercel.app/share/' || b.share_token) as share_url,
  -- The first non-reference logo, ordered by display_order. Used as the
  -- visual reference on a brief.
  (
    select l.public_url
    from public.brand_logos l
    where l.brand_id = b.id
      and coalesce(l.logo_type, '') <> 'reference'
    order by l.display_order
    limit 1
  ) as primary_logo_url,
  b.status,
  b.approved_at,
  b.updated_at
from public.brands b
-- Never expose draft rows to Brief Tool — those aren't real client records.
where b.status in ('in_review', 'approved');

-- Open the view to both authenticated app users (Brief Tool editor) and anon
-- (in case Brief Tool has a public preview surface). RLS still gates the
-- underlying brands table, but the view inherits the security context of the
-- caller's session, and brands.RLS already permits these reads.
grant select on public.brand_directory to authenticated, anon;

comment on view public.brand_directory is
  'Stable read contract for the Brief Tool. Brief Tool should select from '
  'this view only — never the brands table directly. Column changes here are '
  'breaking and require coordination.';

-- ─────────────────────────────────────────────────────────────────────────
-- Two-way column sync between canonical Brand Hub fields and Brief Tool's
-- duplicate columns. Brief Tool currently reads + writes these in ~30 places
-- — refactoring is a separate effort. In the meantime, this trigger keeps
-- the two sides perfectly in sync so editing either app shows up in both.
--
-- Pairs synced:
--   account_manager  ↔ am
--   submitter_name   ↔ poc_name
--   submitter_email  ↔ poc_email
--   submitter_phone  ↔ poc_num
--
-- Not synced (different concepts):
--   monday_board_id (Brief Tool's board reference, not a Brand Hub URL)
--   logo_placement  (brief-specific, doesn't belong on brand row but okay)
--
-- The trigger detects which side of a pair was just updated and copies that
-- value to the other side. If both sides change in the same UPDATE statement,
-- the canonical side wins.
-- ─────────────────────────────────────────────────────────────────────────

-- Two functions: one for UPDATEs (compares NEW vs OLD to detect which side
-- changed), one for INSERTs (just fills whichever side is null from the
-- other). Brief Tool's "Add client" flow inserts rows with only the dupe
-- columns; Brand Hub's intake form inserts with only the canonical columns.
-- Either way we end up with both sides populated.

create or replace function public.sync_brand_dupe_columns()
returns trigger as $$
begin
  -- account_manager ↔ am
  if new.account_manager is distinct from old.account_manager then
    new.am := new.account_manager;
  elsif new.am is distinct from old.am then
    new.account_manager := new.am;
  end if;

  -- submitter_name ↔ poc_name
  if new.submitter_name is distinct from old.submitter_name then
    new.poc_name := new.submitter_name;
  elsif new.poc_name is distinct from old.poc_name then
    new.submitter_name := new.poc_name;
  end if;

  -- submitter_email ↔ poc_email
  if new.submitter_email is distinct from old.submitter_email then
    new.poc_email := new.submitter_email;
  elsif new.poc_email is distinct from old.poc_email then
    new.submitter_email := new.poc_email;
  end if;

  -- submitter_phone ↔ poc_num
  if new.submitter_phone is distinct from old.submitter_phone then
    new.poc_num := new.submitter_phone;
  elsif new.poc_num is distinct from old.poc_num then
    new.submitter_phone := new.poc_num;
  end if;

  return new;
end;
$$ language plpgsql;

create or replace function public.sync_brand_dupe_columns_on_insert()
returns trigger as $$
begin
  if new.account_manager is null and new.am is not null then
    new.account_manager := new.am;
  elsif new.am is null and new.account_manager is not null then
    new.am := new.account_manager;
  end if;

  if new.submitter_name is null and new.poc_name is not null then
    new.submitter_name := new.poc_name;
  elsif new.poc_name is null and new.submitter_name is not null then
    new.poc_name := new.submitter_name;
  end if;

  if new.submitter_email is null and new.poc_email is not null then
    new.submitter_email := new.poc_email;
  elsif new.poc_email is null and new.submitter_email is not null then
    new.poc_email := new.submitter_email;
  end if;

  if new.submitter_phone is null and new.poc_num is not null then
    new.submitter_phone := new.poc_num;
  elsif new.poc_num is null and new.submitter_phone is not null then
    new.poc_num := new.submitter_phone;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists sync_brand_dupes on public.brands;
create trigger sync_brand_dupes
  before update on public.brands
  for each row execute function public.sync_brand_dupe_columns();

drop trigger if exists sync_brand_dupes_insert on public.brands;
create trigger sync_brand_dupes_insert
  before insert on public.brands
  for each row execute function public.sync_brand_dupe_columns_on_insert();

-- One-shot backfill: copy whatever each side has into the other for existing
-- rows so Brief Tool's Clients view immediately shows real values for the
-- brands imported via Brand Hub.
update public.brands set
  am               = coalesce(am,               account_manager),
  poc_name         = coalesce(poc_name,         submitter_name),
  poc_email        = coalesce(poc_email,        submitter_email),
  poc_num          = coalesce(poc_num,          submitter_phone),
  account_manager  = coalesce(account_manager,  am),
  submitter_name   = coalesce(submitter_name,   poc_name),
  submitter_email  = coalesce(submitter_email,  poc_email),
  submitter_phone  = coalesce(submitter_phone,  poc_num);

-- The 6 duplicate columns (am, poc_name, poc_num, poc_email, monday_board_id,
-- logo_placement) intentionally REMAIN. They are now synced and safe to use
-- from either side. A future migration can drop them after Brief Tool has
-- been fully refactored to use `brand_directory`.
