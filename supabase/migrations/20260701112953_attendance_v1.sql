create table if not exists public.attendance_settings (
  id text primary key default 'default' check (id = 'default'),
  store_name text not null default 'Abah Apple Pontianak',
  store_latitude numeric(10, 7) not null default -0.0249301,
  store_longitude numeric(10, 7) not null default 109.3188553,
  radius_meters integer not null default 150 check (radius_meters between 10 and 1000),
  tolerance_minutes integer not null default 10 check (tolerance_minutes between 0 and 180),
  penalty_per_minute integer not null default 50000 check (penalty_per_minute >= 0),
  retention_days integer not null default 35 check (retention_days between 1 and 365),
  shifts jsonb not null default '[
    {"id":"pagi","name":"Pagi","start_time":"10:00"},
    {"id":"middle","name":"Middle","start_time":"12:00"},
    {"id":"sore","name":"Sore","start_time":"15:00"}
  ]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.attendance_settings enable row level security;

grant select, insert, update, delete on public.attendance_settings to authenticated;

drop policy if exists "Authenticated read attendance settings" on public.attendance_settings;
create policy "Authenticated read attendance settings"
  on public.attendance_settings
  for select
  to authenticated
  using (true);

drop policy if exists "Managers manage attendance settings" on public.attendance_settings;
drop policy if exists "Managers insert attendance settings" on public.attendance_settings;
drop policy if exists "Managers update attendance settings" on public.attendance_settings;
drop policy if exists "Managers delete attendance settings" on public.attendance_settings;

create policy "Managers insert attendance settings"
  on public.attendance_settings
  for insert
  to authenticated
  with check ((select private.has_permission('manage_users')));

create policy "Managers update attendance settings"
  on public.attendance_settings
  for update
  to authenticated
  using ((select private.has_permission('manage_users')))
  with check ((select private.has_permission('manage_users')));

create policy "Managers delete attendance settings"
  on public.attendance_settings
  for delete
  to authenticated
  using ((select private.has_permission('manage_users')));

insert into public.attendance_settings (id)
values ('default')
on conflict (id) do nothing;

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  attendance_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  shift_id text not null,
  shift_name text not null,
  scheduled_start_time time not null,
  tolerance_minutes integer not null default 10 check (tolerance_minutes >= 0),
  penalty_per_minute integer not null default 50000 check (penalty_per_minute >= 0),
  check_in_at timestamptz not null default now(),
  photo_path text not null unique,
  store_latitude numeric(10, 7) not null,
  store_longitude numeric(10, 7) not null,
  latitude numeric(10, 7) not null,
  longitude numeric(10, 7) not null,
  accuracy_meters numeric(10, 2),
  distance_meters integer not null check (distance_meters >= 0),
  within_radius boolean not null default false,
  late_minutes integer not null default 0 check (late_minutes >= 0),
  penalty_amount integer not null default 0 check (penalty_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  verification_note text,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint attendance_one_checkin_per_day unique (staff_id, attendance_date)
);

create index if not exists attendance_records_staff_date_idx
  on public.attendance_records (staff_id, attendance_date desc);

create index if not exists attendance_records_date_status_idx
  on public.attendance_records (attendance_date desc, status);

create index if not exists attendance_records_verified_by_idx
  on public.attendance_records (verified_by)
  where verified_by is not null;

alter table public.attendance_records enable row level security;

grant select, insert, update, delete on public.attendance_records to authenticated;

drop policy if exists "Users read own attendance or managers all" on public.attendance_records;
create policy "Users read own attendance or managers all"
  on public.attendance_records
  for select
  to authenticated
  using ((select auth.uid()) = staff_id or (select private.has_permission('manage_users')));

drop policy if exists "Users insert own attendance" on public.attendance_records;
create policy "Users insert own attendance"
  on public.attendance_records
  for insert
  to authenticated
  with check (
    (select auth.uid()) = staff_id
    and status = 'pending'
    and verified_by is null
    and verified_at is null
  );

drop policy if exists "Managers update attendance verification" on public.attendance_records;
create policy "Managers update attendance verification"
  on public.attendance_records
  for update
  to authenticated
  using ((select private.has_permission('manage_users')))
  with check ((select private.has_permission('manage_users')));

drop policy if exists "Managers delete attendance" on public.attendance_records;
create policy "Managers delete attendance"
  on public.attendance_records
  for delete
  to authenticated
  using ((select private.has_permission('manage_users')));

create or replace function private.set_attendance_calculation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scheduled_at timestamptz;
  v_grace_at timestamptz;
  v_late numeric;
begin
  new.check_in_at := coalesce(new.check_in_at, now());
  new.attendance_date := coalesce(new.attendance_date, (new.check_in_at at time zone 'Asia/Jakarta')::date);

  v_scheduled_at := ((new.attendance_date::text || ' ' || new.scheduled_start_time::text)::timestamp at time zone 'Asia/Jakarta');
  v_grace_at := v_scheduled_at + make_interval(mins => greatest(new.tolerance_minutes, 0));
  v_late := extract(epoch from (new.check_in_at - v_grace_at)) / 60.0;

  new.late_minutes := greatest(0, ceil(v_late)::integer);
  new.penalty_amount := case
    when new.late_minutes > 0 then greatest(new.penalty_per_minute, 0)
    else 0
  end;
  new.created_at := coalesce(new.created_at, now());

  return new;
end;
$$;

revoke all on function private.set_attendance_calculation() from public, anon, authenticated;

drop trigger if exists attendance_records_set_calculation on public.attendance_records;
create trigger attendance_records_set_calculation
  before insert or update of check_in_at, attendance_date, scheduled_start_time, tolerance_minutes, penalty_per_minute
  on public.attendance_records
  for each row
  execute function private.set_attendance_calculation();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attendance-photos',
  'attendance-photos',
  false,
  3145728,
  array['image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read own attendance photos or managers all" on storage.objects;
create policy "Users read own attendance photos or managers all"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'attendance-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.has_permission('manage_users'))
    )
  );

drop policy if exists "Users insert own attendance photos" on storage.objects;
create policy "Users insert own attendance photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'attendance-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users delete own attendance photos or managers all" on storage.objects;
create policy "Users delete own attendance photos or managers all"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'attendance-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.has_permission('manage_users'))
    )
  );

create or replace function private.cleanup_old_attendance()
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_deleted integer := 0;
  v_retention_days integer := 35;
begin
  select retention_days
  into v_retention_days
  from public.attendance_settings
  where id = 'default';

  v_retention_days := coalesce(v_retention_days, 35);

  with expired as (
    select id, photo_path
    from public.attendance_records
    where attendance_date < ((now() at time zone 'Asia/Jakarta')::date - v_retention_days)
  ),
  removed_objects as (
    delete from storage.objects o
    using expired e
    where o.bucket_id = 'attendance-photos'
      and o.name = e.photo_path
    returning 1
  ),
  removed_records as (
    delete from public.attendance_records r
    using expired e
    where r.id = e.id
    returning 1
  )
  select count(*) into v_deleted from removed_records;

  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function private.cleanup_old_attendance() from public, anon, authenticated;
grant execute on function private.cleanup_old_attendance() to authenticated;

create or replace function public.cleanup_old_attendance()
returns integer
language sql
set search_path = public
as $$
  select private.cleanup_old_attendance();
$$;

grant execute on function public.cleanup_old_attendance() to authenticated;

create or replace function private.get_attendance_staff(p_staff_ids uuid[])
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
  where p.id = any(coalesce(p_staff_ids, array[]::uuid[]))
    and p.is_hidden_owner = false
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
  avatar_zoom numeric
)
language sql
stable
set search_path = public
as $$
  select *
  from private.get_attendance_staff(p_staff_ids);
$$;

grant execute on function public.get_attendance_staff(uuid[]) to authenticated;
