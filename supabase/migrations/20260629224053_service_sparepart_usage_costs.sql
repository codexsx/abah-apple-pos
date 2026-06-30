alter table public.service_records add column if not exists work_cost bigint;

update public.service_records
set work_cost = coalesce(work_cost, estimated_cost, 0)
where work_cost is null;

alter table public.service_records
  alter column work_cost set default 0,
  alter column work_cost set not null;

alter table public.service_records drop constraint if exists service_records_work_cost_check;
alter table public.service_records
  add constraint service_records_work_cost_check check (work_cost >= 0);

create table if not exists public.service_sparepart_usages (
  id uuid primary key default gen_random_uuid(),
  service_record_id uuid not null references public.service_records(id) on delete cascade,
  sparepart_id uuid references public.spareparts(id) on delete set null,
  sparepart_name text not null,
  quantity integer not null check (quantity > 0),
  unit_cost bigint not null check (unit_cost >= 0),
  total_cost bigint generated always as ((quantity::bigint * unit_cost)) stored,
  created_at timestamptz not null default now()
);

alter table public.service_sparepart_usages enable row level security;

drop policy if exists "Authenticated read service sparepart usages" on public.service_sparepart_usages;
drop policy if exists "Authenticated insert service sparepart usages" on public.service_sparepart_usages;
drop policy if exists "Authenticated update service sparepart usages" on public.service_sparepart_usages;
drop policy if exists "Authenticated delete service sparepart usages" on public.service_sparepart_usages;

create policy "Authenticated read service sparepart usages"
  on public.service_sparepart_usages for select
  to authenticated
  using (true);

create policy "Authenticated insert service sparepart usages"
  on public.service_sparepart_usages for insert
  to authenticated
  with check (true);

create policy "Authenticated update service sparepart usages"
  on public.service_sparepart_usages for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated delete service sparepart usages"
  on public.service_sparepart_usages for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.service_sparepart_usages to authenticated;

create or replace function public.recalculate_service_total_cost(
  p_service_record_id uuid
)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_work_cost bigint;
  v_parts_total bigint;
begin
  select coalesce(work_cost, estimated_cost, 0)
    into v_work_cost
  from public.service_records
  where id = p_service_record_id
  for update;

  if not found then
    raise exception 'Service record % not found', p_service_record_id;
  end if;

  select coalesce(sum(total_cost), 0)
    into v_parts_total
  from public.service_sparepart_usages
  where service_record_id = p_service_record_id;

  update public.service_records
    set estimated_cost = v_work_cost + v_parts_total
  where id = p_service_record_id;
end;
$$;

grant execute on function public.recalculate_service_total_cost(uuid) to authenticated;

create or replace function public.record_service_sparepart_usage(
  p_service_record_id uuid,
  p_sparepart_id uuid,
  p_quantity integer,
  p_unit_cost bigint default null
)
returns public.service_sparepart_usages
language plpgsql
set search_path to 'public'
as $$
declare
  v_sparepart public.spareparts%rowtype;
  v_unit_cost bigint;
  v_usage public.service_sparepart_usages%rowtype;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Jumlah sparepart minimal 1';
  end if;

  select * into v_sparepart
  from public.spareparts
  where id = p_sparepart_id
  for update;

  if not found then
    raise exception 'Sparepart % tidak ditemukan', p_sparepart_id;
  end if;

  if v_sparepart.stock < p_quantity then
    raise exception 'Stok % tidak cukup. Sisa % pcs', v_sparepart.name, v_sparepart.stock;
  end if;

  v_unit_cost := coalesce(p_unit_cost, v_sparepart.buy_price, 0);
  if v_unit_cost < 0 then
    raise exception 'Modal sparepart tidak boleh negatif';
  end if;

  update public.spareparts
    set stock = stock - p_quantity,
        updated_at = now()
  where id = p_sparepart_id;

  insert into public.service_sparepart_usages (
    service_record_id,
    sparepart_id,
    sparepart_name,
    quantity,
    unit_cost
  ) values (
    p_service_record_id,
    p_sparepart_id,
    v_sparepart.name,
    p_quantity,
    v_unit_cost
  )
  returning * into v_usage;

  perform public.recalculate_service_total_cost(p_service_record_id);

  return v_usage;
end;
$$;

grant execute on function public.record_service_sparepart_usage(uuid, uuid, integer, bigint) to authenticated;

create or replace function public.update_service_cost_fields(
  p_service_record_id uuid,
  p_work_cost bigint,
  p_wage_amount bigint default 0
)
returns void
language plpgsql
set search_path to 'public'
as $$
begin
  if p_work_cost is null or p_work_cost < 0 then
    raise exception 'Biaya pengerjaan tidak boleh negatif';
  end if;

  if p_wage_amount is null or p_wage_amount < 0 then
    raise exception 'Upah tukang tidak boleh negatif';
  end if;

  update public.service_records
    set work_cost = p_work_cost,
        wage_amount = p_wage_amount
  where id = p_service_record_id;

  if not found then
    raise exception 'Service record % not found', p_service_record_id;
  end if;

  perform public.recalculate_service_total_cost(p_service_record_id);
end;
$$;

grant execute on function public.update_service_cost_fields(uuid, bigint, bigint) to authenticated;

create or replace function public.record_service_with_stock_status(
  p_stock_id uuid,
  p_target_status text default 'SERVIS',
  p_record jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
set search_path to 'public'
as $$
declare
  v_original public.stock_items%rowtype;
  v_source public.stock_items%rowtype;
  v_moved public.stock_items%rowtype;
  v_service_stock_id uuid;
  v_service_id uuid;
  v_estimated_cost bigint;
  v_work_cost bigint;
begin
  if p_target_status <> any(array['READY','SERVIS','KANIBAL','RUSAK','TERJUAL']) then
    raise exception 'Invalid stock status: %', p_target_status;
  end if;

  select * into v_original
  from public.stock_items
  where id = p_stock_id
  for update;

  if not found then
    raise exception 'Stock item % not found', p_stock_id;
  end if;

  if v_original.status = p_target_status then
    v_service_stock_id := v_original.id;
  elsif coalesce(v_original.count, 0) > 1 then
    update public.stock_items
      set count = count - 1,
          updated_at = now()
      where id = p_stock_id
      returning * into v_source;

    insert into public.stock_items (
      model, capacity, condition, color, imei, has_imei, status, count,
      price, cost_price, transaction_id
    ) values (
      v_original.model, v_original.capacity, v_original.condition,
      v_original.color, v_original.imei, v_original.has_imei,
      p_target_status, 1, v_original.price, v_original.cost_price,
      v_original.transaction_id
    ) returning * into v_moved;

    v_service_stock_id := v_moved.id;
  else
    update public.stock_items
      set status = p_target_status,
          updated_at = now()
      where id = p_stock_id
      returning * into v_moved;

    v_service_stock_id := v_moved.id;
  end if;

  v_estimated_cost := coalesce(nullif(p_record->>'estimated_cost', '')::bigint, 0);
  v_work_cost := coalesce(nullif(p_record->>'work_cost', '')::bigint, v_estimated_cost);

  insert into public.service_records (
    customer_name, phone_model, capacity, condition, color, imei,
    battery_health, issue, additional_note, status, estimated_cost, work_cost, dp,
    completed_at, technician, service_type, stk_id, wage_amount, wage_paid,
    picked_up, picked_up_at
  ) values (
    coalesce(p_record->>'customer_name', ''),
    coalesce(p_record->>'phone_model', v_original.model, ''),
    coalesce(p_record->>'capacity', v_original.capacity, ''),
    coalesce(p_record->>'condition', v_original.condition, ''),
    coalesce(p_record->>'color', v_original.color, ''),
    coalesce(p_record->>'imei', v_original.imei, ''),
    nullif(p_record->>'battery_health', '')::int,
    coalesce(p_record->>'issue', ''),
    coalesce(p_record->>'additional_note', ''),
    coalesce(nullif(p_record->>'status', ''), 'ANTRIAN'),
    v_estimated_cost,
    v_work_cost,
    coalesce(nullif(p_record->>'dp', '')::bigint, 0),
    nullif(p_record->>'completed_at', '')::timestamptz,
    coalesce(p_record->>'technician', ''),
    coalesce(nullif(p_record->>'service_type', ''), 'Toko Sendiri'),
    v_service_stock_id::text,
    coalesce(nullif(p_record->>'wage_amount', '')::bigint, 0),
    coalesce(nullif(p_record->>'wage_paid', '')::boolean, false),
    coalesce(nullif(p_record->>'picked_up', '')::boolean, false),
    nullif(p_record->>'picked_up_at', '')::timestamptz
  ) returning id into v_service_id;

  return v_service_id;
end;
$$;

grant execute on function public.record_service_with_stock_status(uuid, text, jsonb) to authenticated;
