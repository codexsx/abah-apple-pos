create table if not exists public.attendance_off_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  attendance_date date not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid not null default auth.uid() references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_off_one_request_per_staff_date unique (staff_id, attendance_date),
  constraint attendance_off_review_fields_consistent check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or
    (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);

create index if not exists attendance_off_requests_date_status_idx
  on public.attendance_off_requests (attendance_date desc, status);

create index if not exists attendance_off_requests_staff_date_idx
  on public.attendance_off_requests (staff_id, attendance_date desc);

alter table public.attendance_off_requests enable row level security;

grant select, insert, update, delete on public.attendance_off_requests to authenticated;

create or replace function private.set_attendance_off_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_attendance_off_updated_at() from public, anon, authenticated;

drop trigger if exists attendance_off_requests_set_updated_at on public.attendance_off_requests;
create trigger attendance_off_requests_set_updated_at
  before update on public.attendance_off_requests
  for each row
  execute function private.set_attendance_off_updated_at();

drop policy if exists "Users read own off requests or managers all" on public.attendance_off_requests;
create policy "Users read own off requests or managers all"
  on public.attendance_off_requests
  for select
  to authenticated
  using (
    (select auth.uid()) = staff_id
    or (select auth.uid()) = requested_by
    or (select private.has_permission('manage_users'))
  );

drop policy if exists "Users create own pending off requests" on public.attendance_off_requests;
create policy "Users create own pending off requests"
  on public.attendance_off_requests
  for insert
  to authenticated
  with check (
    (select auth.uid()) = staff_id
    and (select auth.uid()) = requested_by
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

drop policy if exists "Managers review attendance off requests" on public.attendance_off_requests;
create policy "Managers review attendance off requests"
  on public.attendance_off_requests
  for update
  to authenticated
  using ((select private.has_permission('manage_users')))
  with check (
    (select private.has_permission('manage_users'))
    and status in ('approved', 'rejected')
    and reviewed_by = (select auth.uid())
    and reviewed_at is not null
  );

drop policy if exists "Managers delete attendance off requests" on public.attendance_off_requests;
create policy "Managers delete attendance off requests"
  on public.attendance_off_requests
  for delete
  to authenticated
  using ((select private.has_permission('manage_users')));
