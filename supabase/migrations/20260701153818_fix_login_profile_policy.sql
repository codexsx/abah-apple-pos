-- The login page reads a limited public directory from profiles before a user
-- is authenticated. A live policy accidentally applied manager checks to the
-- `public` role, so anon requests evaluated private.is_manager() and failed.
-- Keep anon on the narrow login policy and reserve manager checks for signed-in
-- users only.

drop policy if exists "Users can view own or manager views all" on public.profiles;
create policy "Users can view own or manager views all"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id or private.is_manager());

drop policy if exists "Public read login profiles" on public.profiles;
create policy "Public read login profiles"
  on public.profiles
  for select
  to anon
  using (username is not null and is_hidden_owner = false);

grant select (
  id,
  name,
  role,
  initials,
  username,
  avatar_url,
  avatar_crop_x,
  avatar_crop_y,
  avatar_zoom,
  is_hidden_owner
) on public.profiles to anon;

grant select on public.profiles to authenticated;

notify pgrst, 'reload schema';
