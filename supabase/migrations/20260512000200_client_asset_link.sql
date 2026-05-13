-- Allow clients to share an external folder link (Dropbox/Drive) instead of
-- (or in addition to) uploading files directly through the intake form.
alter table public.brands
  add column if not exists client_asset_folder_url text;
