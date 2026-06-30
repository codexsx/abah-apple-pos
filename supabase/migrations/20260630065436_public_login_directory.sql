-- Public login screen needs a limited account directory before authentication.
-- Keep the exposed surface narrow: names, roles, usernames, initials, avatars,
-- and company logo/name only. Passwords remain in Supabase Auth and are never
-- exposed through public tables.

revoke all on public.profiles from anon;
grant select (id, name, role, initials, username, avatar_url) on public.profiles to anon;

revoke all on public.company_settings from anon;
grant select (id, name, logo_url, updated_at) on public.company_settings to anon;

drop policy if exists "Public read login profiles" on public.profiles;
create policy "Public read login profiles"
  on public.profiles
  for select
  to anon
  using (username is not null);

drop policy if exists "Public read company settings" on public.company_settings;
create policy "Public read company settings"
  on public.company_settings
  for select
  to anon
  using (true);

-- Re-state authenticated privileges used by the app after narrowing anon.
grant select on public.profiles to authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (avatar_url, updated_at) on public.profiles to authenticated;

grant select, insert, update on public.company_settings to authenticated;
