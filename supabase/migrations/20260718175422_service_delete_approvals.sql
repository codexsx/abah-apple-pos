-- Soft-delete service records through the existing manager approval flow.
-- A deleted service remains auditable, while its catalog parts are returned
-- and a held stock unit is restored to the appropriate status.

alter table public.service_change_requests
  add column if not exists action text not null default 'edit';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'service_change_requests_action_check'
      and conrelid = 'public.service_change_requests'::regclass
  ) then
    alter table public.service_change_requests
      add constraint service_change_requests_action_check
      check (action in ('edit', 'delete'));
  end if;
end;
$$;

alter table public.service_records
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id),
  add column if not exists delete_reason text;

create index if not exists service_records_active_created_at_idx
  on public.service_records(created_at desc)
  where deleted_at is null;

create or replace function private.review_service_change_request(
  p_request_id uuid,
  p_decision text,
  p_review_note text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.service_change_requests%rowtype;
  v_service public.service_records%rowtype;
  v_usage public.service_sparepart_usages%rowtype;
  v_stock_id uuid;
  v_restore_status text;
begin
  if not private.has_permission('manage_users') then
    raise exception 'Tidak memiliki akses approval';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Keputusan approval tidak valid';
  end if;

  select * into v_request
  from public.service_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request perubahan tidak ditemukan';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Request perubahan sudah diproses';
  end if;

  if p_decision = 'approved' then
    if v_request.action = 'delete' then
      select * into v_service
      from public.service_records
      where id = v_request.service_record_id
      for update;

      if not found or v_service.deleted_at is not null then
        raise exception 'Servis tidak ditemukan atau sudah dihapus';
      end if;
      if coalesce(v_service.wage_paid, false) then
        raise exception 'Servis dengan upah yang sudah dibayar tidak dapat dihapus';
      end if;

      for v_usage in
        select * from public.service_sparepart_usages
        where service_record_id = v_service.id
        for update
      loop
        if v_usage.sparepart_id is not null then
          update public.spareparts
          set stock = stock + v_usage.quantity,
              updated_at = now()
          where id = v_usage.sparepart_id;
        end if;
      end loop;

      if nullif(v_service.stk_id, '') is not null then
        begin
          v_stock_id := v_service.stk_id::uuid;
        exception when invalid_text_representation then
          v_stock_id := null;
        end;
      end if;

      if v_stock_id is not null then
        v_restore_status := case
          when v_service.service_type = 'Klaim Garansi' then 'TERJUAL'
          when v_service.service_type = 'Toko Sendiri' then 'READY'
          else null
        end;

        if v_restore_status is not null then
          update public.stock_items
          set status = v_restore_status,
              updated_at = now()
          where id = v_stock_id
            and status = 'SERVIS';
        end if;
      end if;

      update public.service_records
      set deleted_at = now(),
          deleted_by = auth.uid(),
          delete_reason = v_request.reason
      where id = v_service.id;
    else
      perform private.apply_service_edit_request(v_request);
    end if;
  end if;

  update public.service_change_requests
  set status = p_decision,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = left(coalesce(p_review_note, ''), 500)
  where id = p_request_id;
end;
$$;
