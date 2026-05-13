-- Deliverables & assignment: surface video assets folder + account manager
-- so the AM has one place to see all the links per client.
alter table public.brands
  add column if not exists video_assets_folder_url text,
  add column if not exists account_manager text;
