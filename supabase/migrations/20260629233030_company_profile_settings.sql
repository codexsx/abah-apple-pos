create table if not exists public.company_settings (
  id text primary key,
  name text not null default 'Sixcode Smart OS',
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_settings_name_not_blank check (length(trim(name)) > 0),
  constraint company_settings_name_length check (char_length(name) <= 80)
);

alter table public.company_settings enable row level security;

drop policy if exists "Authenticated read company settings" on public.company_settings;
create policy "Authenticated read company settings"
  on public.company_settings for select
  to authenticated
  using (true);

drop policy if exists "Authenticated insert company settings" on public.company_settings;
create policy "Authenticated insert company settings"
  on public.company_settings for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated update company settings" on public.company_settings;
create policy "Authenticated update company settings"
  on public.company_settings for update
  to authenticated
  using (true)
  with check (true);

grant select, insert, update on public.company_settings to authenticated;

insert into public.company_settings (id, name)
values ('company_profile', 'Sixcode Smart OS')
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-assets',
  'company-assets',
  true,
  5242880,
  array['image/png', 'image/gif', 'image/webp', 'image/jpeg']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Company assets public read" on storage.objects;
create policy "Company assets public read" on storage.objects
  for select using (bucket_id = 'company-assets');

drop policy if exists "Authenticated insert company assets" on storage.objects;
create policy "Authenticated insert company assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'company-assets');

drop policy if exists "Authenticated update company assets" on storage.objects;
create policy "Authenticated update company assets" on storage.objects
  for update to authenticated
  using (bucket_id = 'company-assets')
  with check (bucket_id = 'company-assets');

drop policy if exists "Authenticated delete company assets" on storage.objects;
create policy "Authenticated delete company assets" on storage.objects
  for delete to authenticated
  using (bucket_id = 'company-assets');
