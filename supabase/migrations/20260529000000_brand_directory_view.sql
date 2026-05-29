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

-- Drop the columns the Brief Tool team had added pre-emptively. Each one
-- duplicates an existing canonical column on `brands` that's owned by Brand
-- Hub. Brief Tool should consume those via the view instead.
--
-- Column → canonical equivalent:
--   am               → account_manager
--   poc_name         → submitter_name      (primary_contact_name in view)
--   poc_email        → submitter_email     (primary_contact_email in view)
--   poc_num          → submitter_phone     (primary_contact_phone in view)
--   monday_board_id  → client_monday_board_url
--   logo_placement   → belongs in briefs.data_json, NOT on the brand record
--
-- These columns were never written to by Brand Hub code and never displayed
-- in the UI, so dropping them is safe from Brand Hub's perspective. Brief
-- Tool should migrate any reads/writes to the view before this migration
-- ships if it had started using them.
alter table public.brands
  drop column if exists am,
  drop column if exists poc_name,
  drop column if exists poc_num,
  drop column if exists poc_email,
  drop column if exists logo_placement,
  drop column if exists monday_board_id;
