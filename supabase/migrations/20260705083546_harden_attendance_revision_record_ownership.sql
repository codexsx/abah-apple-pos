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
