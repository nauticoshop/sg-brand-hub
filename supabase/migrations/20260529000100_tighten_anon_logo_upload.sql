-- Round 3, fix #1 — restrict anonymous logo uploads to fresh intake submissions.
--
-- Previous state: any anonymous caller could insert a brand_logos row pointing
-- at ANY brand_id, and could upload to ANY path under the brand-logos storage
-- bucket. Practically nobody knew the UUIDs so the risk was theoretical, but
-- it was a real opening.
--
-- New rule: anon inserts only allowed when:
--   1. The brand exists
--   2. The brand was created in the last 15 minutes (covers the public intake
--      form, which uploads logos immediately after creating the brand row)
--   3. The brand status is still 'submitted' or 'draft' (once the AM picks it
--      up and changes it to 'in_review', no more anon writes)
--
-- Authenticated team members are unaffected (separate policy).

-- ── brand_logos table ──────────────────────────────────────────────────────
drop policy if exists "logos_insert_anon" on public.brand_logos;
drop policy if exists "logos_insert_anon_recent" on public.brand_logos;
create policy "logos_insert_anon_recent" on public.brand_logos
  for insert to anon with check (
    exists (
      select 1 from public.brands b
      where b.id = brand_logos.brand_id
        and b.status in ('submitted', 'draft')
        and b.created_at > now() - interval '15 minutes'
    )
  );

-- ── brand-logos storage bucket ─────────────────────────────────────────────
-- The intake form uploads to paths like `${brand_id}/${timestamp}-${file}`,
-- so we extract the brand UUID from the first path segment and apply the
-- same recency + status check.
drop policy if exists "logos_anon_intake_upload" on storage.objects;
drop policy if exists "logos_anon_intake_upload_recent" on storage.objects;
create policy "logos_anon_intake_upload_recent" on storage.objects
  for insert to anon with check (
    bucket_id = 'brand-logos'
    and exists (
      select 1 from public.brands b
      where b.id::text = split_part(name, '/', 1)
        and b.status in ('submitted', 'draft')
        and b.created_at > now() - interval '15 minutes'
    )
  );
