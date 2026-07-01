alter table public.attendance_settings
  add column if not exists absence_penalty_amount integer not null default 150000 check (absence_penalty_amount >= 0);

comment on column public.attendance_settings.absence_penalty_amount
  is 'Flat daily deduction applied when an expected staff member has no check-in record for a closed attendance date.';

create or replace function private.get_attendance_expected_staff()
returns table (
  id uuid,
  name text,
  role text,
  initials text,
  avatar_url text,
  avatar_crop_x numeric,
  avatar_crop_y numeric,
  avatar_zoom numeric
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
    p.avatar_zoom
  from public.profiles p
  where coalesce(p.is_hidden_owner, false) = false
    and p.role in ('KASIR', 'TEKNISI')
    and (
      (select auth.uid()) = p.id
      or (select private.has_permission('manage_users'))
    )
  order by
    case p.role when 'KASIR' then 1 when 'TEKNISI' then 2 else 3 end,
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
  avatar_zoom numeric
)
language sql
stable
set search_path = public
as $$
  select *
  from private.get_attendance_expected_staff();
$$;

grant execute on function public.get_attendance_expected_staff() to authenticated;
