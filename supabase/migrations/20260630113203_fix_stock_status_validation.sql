create or replace function public.move_stock_unit_status(
  p_stock_id uuid,
  p_target_status text
)
returns setof public.stock_items
language plpgsql
set search_path to 'public'
as $$
declare
  v_original public.stock_items%rowtype;
  v_source public.stock_items%rowtype;
  v_moved public.stock_items%rowtype;
begin
  if not (p_target_status = any(array['READY','SERVIS','KANIBAL','RUSAK','TERJUAL'])) then
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
    return next v_original;
    return;
  end if;

  if coalesce(v_original.count, 0) > 1 then
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

    return next v_source;
    return next v_moved;
    return;
  end if;

  update public.stock_items
    set status = p_target_status,
        updated_at = now()
    where id = p_stock_id
    returning * into v_moved;

  return next v_moved;
end;
$$;

grant execute on function public.move_stock_unit_status(uuid, text) to authenticated;

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
  if not (p_target_status = any(array['READY','SERVIS','KANIBAL','RUSAK','TERJUAL'])) then
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
