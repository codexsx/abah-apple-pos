create table if not exists public.attendance_revision_requests (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid not null references public.attendance_records(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  current_shift_id text not null,
  current_shift_name text not null,
  current_start_time time not null,
  requested_shift_id text not null,
  requested_shift_name text not null,
  requested_start_time time not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid not null default auth.uid() references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_revision_review_fields_consistent check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or
    (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);

create unique index if not exists attendance_revision_one_pending_per_record
  on public.attendance_revision_requests (attendance_record_id)
  where status = 'pending';

create index if not exists attendance_revision_requests_staff_status_idx
  on public.attendance_revision_requests (staff_id, status, created_at desc);

alter table public.attendance_revision_requests enable row level security;

grant select, insert, update, delete on public.attendance_revision_requests to authenticated;

create or replace function private.set_attendance_revision_updated_at()
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

revoke all on function private.set_attendance_revision_updated_at() from public, anon, authenticated;

drop trigger if exists attendance_revision_requests_set_updated_at on public.attendance_revision_requests;
create trigger attendance_revision_requests_set_updated_at
  before update on public.attendance_revision_requests
  for each row
  execute function private.set_attendance_revision_updated_at();

drop policy if exists "Users read own attendance revisions or managers all" on public.attendance_revision_requests;
create policy "Users read own attendance revisions or managers all"
  on public.attendance_revision_requests
  for select
  to authenticated
  using (
    (select auth.uid()) = staff_id
    or (select auth.uid()) = requested_by
    or (select private.has_permission('manage_users'))
  );

drop policy if exists "Users create own pending attendance revisions" on public.attendance_revision_requests;
create policy "Users create own pending attendance revisions"
  on public.attendance_revision_requests
  for insert
  to authenticated
  with check (
    (select auth.uid()) = staff_id
    and (select auth.uid()) = requested_by
    and exists (
      select 1
      from public.attendance_records r
      where r.id = attendance_revision_requests.attendance_record_id
        and r.staff_id = attendance_revision_requests.staff_id
    )
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

drop policy if exists "Managers review attendance revisions" on public.attendance_revision_requests;
create policy "Managers review attendance revisions"
  on public.attendance_revision_requests
  for update
  to authenticated
  using ((select private.has_permission('manage_users')))
  with check (
    (select private.has_permission('manage_users'))
    and status in ('approved', 'rejected')
    and reviewed_by = (select auth.uid())
    and reviewed_at is not null
  );

drop policy if exists "Managers delete attendance revisions" on public.attendance_revision_requests;
create policy "Managers delete attendance revisions"
  on public.attendance_revision_requests
  for delete
  to authenticated
  using ((select private.has_permission('manage_users')));

create or replace function public.review_attendance_revision_request(
  p_request_id uuid,
  p_status text,
  p_review_note text default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_request public.attendance_revision_requests%rowtype;
begin
  if not (select private.has_permission('manage_users')) then
    raise exception 'Tidak punya akses approval absensi.';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Keputusan revisi absensi tidak valid.';
  end if;

  select *
  into v_request
  from public.attendance_revision_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request revisi absensi tidak ditemukan.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Request revisi absensi sudah diproses.';
  end if;

  update public.attendance_revision_requests
  set
    status = p_status,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(btrim(coalesce(p_review_note, '')), '')
  where id = p_request_id;

  if p_status = 'approved' then
    update public.attendance_records
    set
      shift_id = v_request.requested_shift_id,
      shift_name = v_request.requested_shift_name,
      scheduled_start_time = v_request.requested_start_time,
      verification_note = concat_ws(
        E'\n',
        nullif(verification_note, ''),
        'Revisi shift disetujui: '
          || v_request.current_shift_name || ' '
          || left(v_request.current_start_time::text, 5)
          || ' -> '
          || v_request.requested_shift_name || ' '
          || left(v_request.requested_start_time::text, 5)
      ),
      verified_by = auth.uid(),
      verified_at = now()
    where id = v_request.attendance_record_id
      and staff_id = v_request.staff_id;
  end if;
end;
$$;

revoke all on function public.review_attendance_revision_request(uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_attendance_revision_request(uuid, text, text) to authenticated;
