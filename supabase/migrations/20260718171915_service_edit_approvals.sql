-- Service detail edits are submitted as approval requests. The edit itself is
-- applied only by the manager-only RPC below, so records and sparepart totals
-- stay consistent.

create schema if not exists private;

create table if not exists public.service_change_requests (
  id uuid primary key default gen_random_uuid(),
  service_record_id uuid not null references public.service_records(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  proposed jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists service_change_requests_service_record_id_idx
  on public.service_change_requests(service_record_id);
create index if not exists service_change_requests_requested_by_idx
  on public.service_change_requests(requested_by);
create index if not exists service_change_requests_status_created_at_idx
  on public.service_change_requests(status, created_at desc);

alter table public.service_change_requests enable row level security;

drop policy if exists "Managers read service change requests" on public.service_change_requests;
create policy "Managers read service change requests"
  on public.service_change_requests
  for select
  to authenticated
  using (private.has_permission('manage_users'));

drop policy if exists "Users read own service change requests" on public.service_change_requests;
create policy "Users read own service change requests"
  on public.service_change_requests
  for select
  to authenticated
  using (requested_by = auth.uid());

drop policy if exists "Users insert own pending service change requests" on public.service_change_requests;
create policy "Users insert own pending service change requests"
  on public.service_change_requests
  for insert
  to authenticated
  with check (
    requested_by = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

grant select, insert on public.service_change_requests to authenticated;

create or replace function private.apply_service_edit_request(
  v_request public.service_change_requests
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fields jsonb := coalesce(v_request.proposed -> 'fields', '{}'::jsonb);
  v_row jsonb;
  v_usage public.service_sparepart_usages%rowtype;
  v_quantity integer;
  v_unit_cost bigint;
  v_delta integer;
  v_sparepart_id uuid;
  v_manual_name text;
begin
  if v_fields ? 'battery_health'
     and v_fields ->> 'battery_health' is not null
     and ((v_fields ->> 'battery_health')::integer < 0 or (v_fields ->> 'battery_health')::integer > 100) then
    raise exception 'Battery health harus 0-100';
  end if;

  update public.service_records
  set
    customer_name = case when v_fields ? 'customer_name' then nullif(btrim(v_fields ->> 'customer_name'), '') else customer_name end,
    phone_model = case when v_fields ? 'phone_model' then nullif(btrim(v_fields ->> 'phone_model'), '') else phone_model end,
    capacity = case when v_fields ? 'capacity' then nullif(btrim(v_fields ->> 'capacity'), '') else capacity end,
    condition = case when v_fields ? 'condition' then nullif(btrim(v_fields ->> 'condition'), '') else condition end,
    color = case when v_fields ? 'color' then nullif(btrim(v_fields ->> 'color'), '') else color end,
    imei = case when v_fields ? 'imei' then left(nullif(btrim(v_fields ->> 'imei'), ''), 20) else imei end,
    battery_health = case
      when v_fields ? 'battery_health' then nullif(v_fields ->> 'battery_health', '')::integer
      else battery_health
    end,
    issue = case when v_fields ? 'issue' then nullif(btrim(v_fields ->> 'issue'), '') else issue end,
    additional_note = case when v_fields ? 'additional_note' then nullif(btrim(v_fields ->> 'additional_note'), '') else additional_note end,
    technician = case when v_fields ? 'technician' then nullif(btrim(v_fields ->> 'technician'), '') else technician end,
    wage_amount = case when v_fields ? 'wage_amount' then greatest((v_fields ->> 'wage_amount')::bigint, 0) else wage_amount end,
    work_cost = case when v_fields ? 'wage_amount' then greatest((v_fields ->> 'wage_amount')::bigint, 0) else work_cost end
  where id = v_request.service_record_id;

  if not found then
    raise exception 'Service tidak ditemukan';
  end if;

  for v_row in select value from jsonb_array_elements(coalesce(v_request.proposed -> 'usages_delete', '[]'::jsonb))
  loop
    select * into v_usage
    from public.service_sparepart_usages
    where id = (v_row #>> '{}')::uuid
      and service_record_id = v_request.service_record_id
    for update;

    if not found then
      raise exception 'Baris sparepart tidak ditemukan';
    end if;

    if v_usage.sparepart_id is not null then
      update public.spareparts
      set stock = stock + v_usage.quantity,
          updated_at = now()
      where id = v_usage.sparepart_id;
    end if;

    delete from public.service_sparepart_usages where id = v_usage.id;
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(v_request.proposed -> 'usages_upsert', '[]'::jsonb))
  loop
    v_quantity := (v_row ->> 'quantity')::integer;
    v_unit_cost := (v_row ->> 'unit_cost')::bigint;
    if v_quantity < 1 or v_unit_cost < 0 then
      raise exception 'Data sparepart tidak valid';
    end if;

    if v_row ? 'id' and nullif(v_row ->> 'id', '') is not null then
      select * into v_usage
      from public.service_sparepart_usages
      where id = (v_row ->> 'id')::uuid
        and service_record_id = v_request.service_record_id
      for update;

      if not found then
        raise exception 'Baris sparepart tidak ditemukan';
      end if;

      if v_usage.sparepart_id is not null then
        v_delta := v_quantity - v_usage.quantity;
        update public.spareparts
        set stock = stock - v_delta,
            updated_at = now()
        where id = v_usage.sparepart_id
          and stock >= v_delta;

        if not found then
          raise exception 'Stok sparepart tidak cukup';
        end if;
      end if;

      update public.service_sparepart_usages
      set quantity = v_quantity,
          unit_cost = v_unit_cost
      where id = v_usage.id;
    else
      if coalesce(v_row ->> 'sparepart_id', '') <> '' then
        raise exception 'Tambah sparepart katalog harus melalui menu Tambah Part';
      end if;

      v_manual_name := coalesce(nullif(btrim(v_row ->> 'sparepart_name'), ''), 'Spare Part Manual');
      insert into public.service_sparepart_usages (
        service_record_id, sparepart_id, sparepart_name, quantity, unit_cost
      ) values (
        v_request.service_record_id, null, v_manual_name, v_quantity, v_unit_cost
      );
    end if;
  end loop;

  perform public.recalculate_service_total_cost(v_request.service_record_id);
end;
$$;

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
    perform private.apply_service_edit_request(v_request);
  end if;

  update public.service_change_requests
  set status = p_decision,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = left(coalesce(p_review_note, ''), 500)
  where id = p_request_id;
end;
$$;

create or replace function public.review_service_change_request(
  p_request_id uuid,
  p_decision text,
  p_review_note text default ''
)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform private.review_service_change_request(p_request_id, p_decision, p_review_note);
end;
$$;

revoke all on function public.review_service_change_request(uuid, text, text) from public;
grant execute on function public.review_service_change_request(uuid, text, text) to authenticated;
