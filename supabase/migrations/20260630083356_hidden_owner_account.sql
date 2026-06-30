alter table public.profiles
  add column if not exists is_hidden_owner boolean not null default false;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(new.email, ''));
  v_username text := split_part(lower(coalesce(new.email, '')), '@', 1);
  v_is_hidden_owner boolean := lower(coalesce(new.email, '')) = 'exe14102000@gmail.com';
  v_owner_permissions jsonb := jsonb_build_object(
    'finance', true,
    'manage_users', true,
    'penjualan', true,
    'pembelian', true,
    'servis', true,
    'pengeluaran', true,
    'tukar_tambah', true,
    'stok', true,
    'agen', true
  );
begin
  insert into public.profiles (
    id,
    name,
    role,
    initials,
    username,
    permissions,
    is_hidden_owner
  )
  values (
    new.id,
    case
      when v_is_hidden_owner then coalesce(new.raw_user_meta_data->>'name', 'Owner')
      else coalesce(new.raw_user_meta_data->>'name', v_username)
    end,
    case
      when v_is_hidden_owner then 'MANAJER'
      else coalesce(new.raw_user_meta_data->>'role', 'KASIR')
    end,
    case
      when v_is_hidden_owner then coalesce(new.raw_user_meta_data->>'initials', 'OW')
      else coalesce(new.raw_user_meta_data->>'initials', upper(left(v_username, 2)))
    end,
    coalesce(new.raw_user_meta_data->>'username', v_username),
    case
      when v_is_hidden_owner then v_owner_permissions
      else coalesce((new.raw_user_meta_data->'permissions')::jsonb, '{}'::jsonb)
    end,
    v_is_hidden_owner
  )
  on conflict (id) do update
  set
    name = excluded.name,
    role = excluded.role,
    initials = excluded.initials,
    username = excluded.username,
    permissions = excluded.permissions,
    is_hidden_owner = excluded.is_hidden_owner,
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

with owner_user as (
  select
    u.id,
    lower(coalesce(u.email, '')) as email,
    split_part(lower(coalesce(u.email, '')), '@', 1) as username,
    u.raw_user_meta_data
  from auth.users u
  where lower(coalesce(u.email, '')) = 'exe14102000@gmail.com'
),
owner_permissions as (
  select jsonb_build_object(
    'finance', true,
    'manage_users', true,
    'penjualan', true,
    'pembelian', true,
    'servis', true,
    'pengeluaran', true,
    'tukar_tambah', true,
    'stok', true,
    'agen', true
  ) as permissions
)
insert into public.profiles (
  id,
  name,
  role,
  initials,
  username,
  permissions,
  is_hidden_owner
)
select
  owner_user.id,
  coalesce(owner_user.raw_user_meta_data->>'name', 'Owner'),
  'MANAJER',
  coalesce(owner_user.raw_user_meta_data->>'initials', 'OW'),
  coalesce(owner_user.raw_user_meta_data->>'username', owner_user.username),
  owner_permissions.permissions,
  true
from owner_user
cross join owner_permissions
on conflict (id) do update
set
  role = 'MANAJER',
  permissions = excluded.permissions,
  is_hidden_owner = true,
  updated_at = now();

drop policy if exists "Public read login profiles" on public.profiles;
create policy "Public read login profiles"
  on public.profiles
  for select
  to anon
  using (username is not null and is_hidden_owner = false);
