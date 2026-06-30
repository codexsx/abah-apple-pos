alter table public.profiles
  add column if not exists avatar_crop_x numeric not null default 50,
  add column if not exists avatar_crop_y numeric not null default 50,
  add column if not exists avatar_zoom numeric not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_avatar_crop_x_range'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_crop_x_range
      check (avatar_crop_x >= 0 and avatar_crop_x <= 100);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_avatar_crop_y_range'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_crop_y_range
      check (avatar_crop_y >= 0 and avatar_crop_y <= 100);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_avatar_zoom_range'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_zoom_range
      check (avatar_zoom >= 0.8 and avatar_zoom <= 2.5);
  end if;
end $$;

grant select (
  id,
  name,
  role,
  initials,
  username,
  avatar_url,
  avatar_crop_x,
  avatar_crop_y,
  avatar_zoom
) on public.profiles to anon;

grant update (
  avatar_url,
  avatar_crop_x,
  avatar_crop_y,
  avatar_zoom,
  updated_at
) on public.profiles to authenticated;
