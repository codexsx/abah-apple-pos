create or replace function public.record_sale_with_postings(
  p_type text,
  p_description text,
  p_detail text,
  p_amount bigint,
  p_postings jsonb default '[]'::jsonb,
  p_stock_ids uuid[] default '{}'::uuid[],
  p_accessories jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_tx_id uuid;
  v_ref text;
  v_post jsonb;
  v_id uuid;
  v_source public.stock_items%rowtype;
  v_detail jsonb := coalesce(nullif(p_detail, ''), '{}')::jsonb;
  v_unit jsonb;
  v_stock_index integer := 0;
  v_detail_imei text;
  v_source_imei text;
  v_unit_imei text;
  v_unit_model text;
  v_unit_capacity text;
  v_unit_condition text;
  v_unit_color text;
  v_unit_battery_health_text text;
  v_unit_battery_health integer;
  v_unit_price bigint;
  v_unit_has_imei boolean;
  v_sold_stock_id uuid;
  v_first_sold_stock_id uuid;
  v_acc jsonb;
  v_acc_id uuid;
  v_acc_qty int;
  v_acc_cost bigint := 0;
  v_new_stock int;
  v_min int;
begin
  insert into public.transactions (type, description, detail, amount, staff_id)
  values (p_type, coalesce(p_description, ''), coalesce(p_detail, ''), p_amount, auth.uid())
  returning id into v_tx_id;

  v_ref := p_type || ':' || v_tx_id::text;

  for v_post in select * from jsonb_array_elements(coalesce(p_postings, '[]'::jsonb))
  loop
    insert into public.account_ledger (account_id, direction, amount, source_reference, note)
    values ((v_post->>'account_id')::uuid, v_post->>'direction', (v_post->>'amount')::bigint, v_ref, coalesce(v_post->>'note', ''));
  end loop;

  for v_acc in select * from jsonb_array_elements(coalesce(p_accessories, '[]'::jsonb))
  loop
    v_acc_id := (v_acc->>'id')::uuid;
    v_acc_qty := coalesce((v_acc->>'qty')::int, 1);
    v_acc_cost := v_acc_cost + v_acc_qty * coalesce((v_acc->>'unit_cost')::bigint, 0);
    select greatest(0, stock - v_acc_qty), min_stock into v_new_stock, v_min
      from public.accessory_stock where id = v_acc_id for update;
    if v_new_stock is not null then
      update public.accessory_stock
        set stock = v_new_stock,
            status = case when v_new_stock <= 0 then 'HABIS' when v_new_stock <= v_min then 'MENIPIS' else 'AMAN' end
      where id = v_acc_id;
    end if;
  end loop;

  foreach v_id in array coalesce(p_stock_ids, '{}'::uuid[])
  loop
    v_stock_index := v_stock_index + 1;

    select * into v_source
    from public.stock_items
    where id = v_id
    for update;

    if not found then
      raise exception 'Stock item % not found', v_id;
    end if;

    v_unit := null;
    if jsonb_typeof(v_detail->'units') = 'array' then
      v_unit := v_detail->'units'->(v_stock_index - 1);
    end if;

    v_detail_imei := nullif(btrim(coalesce(v_unit->>'imei', '')), '');
    v_source_imei := nullif(btrim(coalesce(v_source.imei, '')), '');
    v_unit_imei := coalesce(v_detail_imei, v_source_imei);
    v_unit_model := coalesce(nullif(btrim(v_unit->>'model'), ''), v_source.model);
    v_unit_capacity := coalesce(nullif(btrim(v_unit->>'capacity'), ''), v_source.capacity);
    v_unit_condition := coalesce(nullif(btrim(v_unit->>'condition'), ''), v_source.condition);
    v_unit_color := coalesce(nullif(btrim(v_unit->>'color'), ''), v_source.color);
    v_unit_price := coalesce(nullif(v_unit->>'sellingPrice', '')::bigint, v_source.price);
    v_unit_has_imei := coalesce(v_source.has_imei, false) or v_unit_imei is not null;

    v_unit_battery_health_text := nullif(coalesce(v_unit->>'batteryHealth', v_unit->>'battery_health'), '');
    if v_unit_battery_health_text is null then
      v_unit_battery_health := v_source.battery_health;
    else
      v_unit_battery_health := v_unit_battery_health_text::integer;
    end if;

    if coalesce(v_source.count, 0) > 1 then
      update public.stock_items
      set count = count - 1,
          updated_at = now()
      where id = v_id;

      insert into public.stock_items (
        model, capacity, condition, color, imei, count, price, status,
        has_imei, cost_price, transaction_id, battery_health, carrier,
        defect_description, source_agent_id, import_batch_id, source_row_number,
        import_note
      )
      values (
        v_unit_model, v_unit_capacity, v_unit_condition, v_unit_color, v_unit_imei,
        1, v_unit_price, 'TERJUAL', v_unit_has_imei, v_source.cost_price, v_tx_id,
        v_unit_battery_health, v_source.carrier, v_source.defect_description,
        v_source.source_agent_id, v_source.import_batch_id, v_source.source_row_number,
        v_source.import_note
      )
      returning id into v_sold_stock_id;
    else
      update public.stock_items
      set model = v_unit_model,
          capacity = v_unit_capacity,
          condition = v_unit_condition,
          color = v_unit_color,
          imei = v_unit_imei,
          has_imei = v_unit_has_imei,
          status = 'TERJUAL',
          transaction_id = v_tx_id,
          price = v_unit_price,
          battery_health = v_unit_battery_health,
          updated_at = now()
      where id = v_id
      returning id into v_sold_stock_id;
    end if;

    if v_first_sold_stock_id is null then
      v_first_sold_stock_id := v_sold_stock_id;
    end if;
  end loop;

  if v_acc_cost > 0 and v_first_sold_stock_id is not null then
    update public.stock_items
    set cost_price = cost_price + v_acc_cost,
        updated_at = now()
    where id = v_first_sold_stock_id;
  end if;

  return v_tx_id;
end;
$$;

grant execute on function public.record_sale_with_postings(text, text, text, bigint, jsonb, uuid[], jsonb) to authenticated;
