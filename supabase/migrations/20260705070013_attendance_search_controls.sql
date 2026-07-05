alter table public.profiles
  add column if not exists attendance_required boolean not null default true;

comment on column public.profiles.attendance_required
  is 'Controls whether the staff member is expected in attendance absence calculations.';

alter table public.attendance_records
  add column if not exists late_reason text check (late_reason is null or char_length(btrim(late_reason)) <= 300);

comment on column public.attendance_records.late_reason
  is 'Optional staff note explaining a late check-in.';

create table if not exists public.attendance_auto_off_dates (
  attendance_date date primary key,
  label text not null default 'Libur toko' check (char_length(btrim(label)) between 1 and 120),
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

comment on table public.attendance_auto_off_dates
  is 'Manager-defined store off dates that automatically suppress absence penalties.';

alter table public.attendance_auto_off_dates enable row level security;

grant select, insert, update, delete on public.attendance_auto_off_dates to authenticated;

drop policy if exists "Authenticated read attendance auto off dates" on public.attendance_auto_off_dates;
create policy "Authenticated read attendance auto off dates"
  on public.attendance_auto_off_dates
  for select
  to authenticated
  using (true);

drop policy if exists "Managers insert attendance auto off dates" on public.attendance_auto_off_dates;
create policy "Managers insert attendance auto off dates"
  on public.attendance_auto_off_dates
  for insert
  to authenticated
  with check ((select private.has_permission('manage_users')));

drop policy if exists "Managers update attendance auto off dates" on public.attendance_auto_off_dates;
create policy "Managers update attendance auto off dates"
  on public.attendance_auto_off_dates
  for update
  to authenticated
  using ((select private.has_permission('manage_users')))
  with check ((select private.has_permission('manage_users')));

drop policy if exists "Managers delete attendance auto off dates" on public.attendance_auto_off_dates;
create policy "Managers delete attendance auto off dates"
  on public.attendance_auto_off_dates
  for delete
  to authenticated
  using ((select private.has_permission('manage_users')));

drop function if exists public.get_attendance_expected_staff();
drop function if exists private.get_attendance_expected_staff();
drop function if exists public.get_attendance_staff(uuid[]);
drop function if exists private.get_attendance_staff(uuid[]);
drop function if exists public.get_attendance_staff_directory();
drop function if exists private.get_attendance_staff_directory();
drop function if exists public.set_staff_attendance_required(uuid, boolean);

create or replace function private.get_attendance_expected_staff()
returns table (
  id uuid,
  name text,
  role text,
  initials text,
  avatar_url text,
  avatar_crop_x numeric,
  avatar_crop_y numeric,
  avatar_zoom numeric,
  attendance_required boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.role,
    p.initials,
    p.avatar_url,
    p.avatar_crop_x,
    p.avatar_crop_y,
    p.avatar_zoom,
    coalesce(p.attendance_required, true) as attendance_required
  from public.profiles p
  where coalesce(p.is_hidden_owner, false) = false
    and coalesce(p.attendance_required, true) = true
    and p.role in ('KASIR', 'TEKNISI', 'KEUANGAN')
    and (
      (select auth.uid()) = p.id
      or (select private.has_permission('manage_users'))
    )
  order by
    case p.role when 'KASIR' then 1 when 'TEKNISI' then 2 when 'KEUANGAN' then 3 else 4 end,
    p.name;
$$;

revoke all on function private.get_attendance_expected_staff() from public, anon, authenticated;
grant execute on function private.get_attendance_expected_staff() to authenticated;

create or replace function public.get_attendance_expected_staff()
returns table (
  id uuid,
  name text,
  role text,
  initials text,
  avatar_url text,
  avatar_crop_x numeric,
  avatar_crop_y numeric,
  avatar_zoom numeric,
  attendance_required boolean
)
language sql
stable
set search_path = public
as $$
  select *
  from private.get_attendance_expected_staff();
$$;

revoke all on function public.get_attendance_expected_staff() from public, anon, authenticated;
grant execute on function public.get_attendance_expected_staff() to authenticated;

create or replace function private.get_attendance_staff(p_staff_ids uuid[])
returns table (
  id uuid,
  name text,
  role text,
  initials text,
  avatar_url text,
  avatar_crop_x numeric,
  avatar_crop_y numeric,
  avatar_zoom numeric,
  attendance_required boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.role,
    p.initials,
    p.avatar_url,
    p.avatar_crop_x,
    p.avatar_crop_y,
    p.avatar_zoom,
    coalesce(p.attendance_required, true) as attendance_required
  from public.profiles p
  where p.id = any(coalesce(p_staff_ids, array[]::uuid[]))
    and coalesce(p.is_hidden_owner, false) = false
    and ((select auth.uid()) = p.id or (select private.has_permission('manage_users')));
$$;

revoke all on function private.get_attendance_staff(uuid[]) from public, anon, authenticated;
grant execute on function private.get_attendance_staff(uuid[]) to authenticated;

create or replace function public.get_attendance_staff(p_staff_ids uuid[])
returns table (
  id uuid,
  name text,
  role text,
  initials text,
  avatar_url text,
  avatar_crop_x numeric,
  avatar_crop_y numeric,
  avatar_zoom numeric,
  attendance_required boolean
)
language sql
stable
set search_path = public
as $$
  select *
  from private.get_attendance_staff(p_staff_ids);
$$;

revoke all on function public.get_attendance_staff(uuid[]) from public, anon, authenticated;
grant execute on function public.get_attendance_staff(uuid[]) to authenticated;

create or replace function private.get_attendance_staff_directory()
returns table (
  id uuid,
  name text,
  role text,
  initials text,
  avatar_url text,
  avatar_crop_x numeric,
  avatar_crop_y numeric,
  avatar_zoom numeric,
  attendance_required boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.role,
    p.initials,
    p.avatar_url,
    p.avatar_crop_x,
    p.avatar_crop_y,
    p.avatar_zoom,
    coalesce(p.attendance_required, true) as attendance_required
  from public.profiles p
  where coalesce(p.is_hidden_owner, false) = false
    and p.role in ('KASIR', 'TEKNISI', 'KEUANGAN')
    and (select private.has_permission('manage_users'))
  order by
    case p.role when 'KASIR' then 1 when 'TEKNISI' then 2 when 'KEUANGAN' then 3 else 4 end,
    p.name;
$$;

revoke all on function private.get_attendance_staff_directory() from public, anon, authenticated;
grant execute on function private.get_attendance_staff_directory() to authenticated;

create or replace function public.get_attendance_staff_directory()
returns table (
  id uuid,
  name text,
  role text,
  initials text,
  avatar_url text,
  avatar_crop_x numeric,
  avatar_crop_y numeric,
  avatar_zoom numeric,
  attendance_required boolean
)
language sql
stable
set search_path = public
as $$
  select *
  from private.get_attendance_staff_directory();
$$;

revoke all on function public.get_attendance_staff_directory() from public, anon, authenticated;
grant execute on function public.get_attendance_staff_directory() to authenticated;

create or replace function public.set_staff_attendance_required(
  p_staff_id uuid,
  p_required boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select private.has_permission('manage_users')) then
    raise exception 'permission denied for attendance staff settings';
  end if;

  update public.profiles
  set
    attendance_required = coalesce(p_required, true),
    updated_at = now()
  where id = p_staff_id
    and coalesce(is_hidden_owner, false) = false;
end;
$$;

revoke all on function public.set_staff_attendance_required(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_staff_attendance_required(uuid, boolean) to authenticated;
