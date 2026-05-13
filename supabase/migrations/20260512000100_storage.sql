-- Brand logos storage bucket
insert into storage.buckets (id, name, public)
values ('brand-logos', 'brand-logos', true)
on conflict (id) do nothing;

-- Brand PDFs storage bucket (generated guidelines)
insert into storage.buckets (id, name, public)
values ('brand-pdfs', 'brand-pdfs', true)
on conflict (id) do nothing;

-- Storage policies — authenticated read/write on both buckets,
-- anon insert allowed on brand-logos (so the public intake form can upload).
drop policy if exists "logos_public_read" on storage.objects;
create policy "logos_public_read" on storage.objects
  for select to public using (bucket_id in ('brand-logos', 'brand-pdfs'));

drop policy if exists "logos_authenticated_write" on storage.objects;
create policy "logos_authenticated_write" on storage.objects
  for insert to authenticated with check (bucket_id in ('brand-logos', 'brand-pdfs'));

drop policy if exists "logos_authenticated_update" on storage.objects;
create policy "logos_authenticated_update" on storage.objects
  for update to authenticated using (bucket_id in ('brand-logos', 'brand-pdfs'));

drop policy if exists "logos_authenticated_delete" on storage.objects;
create policy "logos_authenticated_delete" on storage.objects
  for delete to authenticated using (bucket_id in ('brand-logos', 'brand-pdfs'));

drop policy if exists "logos_anon_intake_upload" on storage.objects;
create policy "logos_anon_intake_upload" on storage.objects
  for insert to anon with check (bucket_id = 'brand-logos');
