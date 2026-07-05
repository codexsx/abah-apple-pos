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
