create or replace function public.record_purchase_with_postings(
  p_type text,
  p_description text,
  p_detail text,
  p_amount bigint,
  p_postings jsonb default '[]'::jsonb,
  p_items jsonb default '[]'::jsonb,
  p_agent_debt jsonb default null::jsonb
)
returns uuid
language plpgsql
set search_path = public
as $function$
declare
  v_tx_id uuid;
  v_ref text;
  v_post jsonb;
  v_item jsonb;
  v_imei text;
  v_cost bigint;
  v_sell bigint;
  v_agent_debt_amount bigint;
begin
  insert into public.transactions (type, description, detail, amount)
  values (p_type, coalesce(p_description, ''), coalesce(p_detail, ''), p_amount)
  returning id into v_tx_id;

  v_ref := p_type || ':' || v_tx_id::text;

  for v_post in select * from jsonb_array_elements(coalesce(p_postings, '[]'::jsonb))
  loop
    insert into public.account_ledger (account_id, direction, amount, source_reference, note)
    values ((v_post->>'account_id')::uuid, v_post->>'direction', (v_post->>'amount')::bigint, v_ref, coalesce(v_post->>'note', ''));
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_imei := nullif(v_item->>'imei', '');
    v_cost := coalesce((v_item->>'cost_price')::bigint, (v_item->>'price')::bigint, 0);
    v_sell := coalesce((v_item->>'price')::bigint, (v_item->>'cost_price')::bigint, 0);
    insert into public.stock_items (
      model, capacity, condition, color, imei, has_imei, status, count,
      price, cost_price, transaction_id, defect_description
    )
    values (
      coalesce(v_item->>'model', ''),
      coalesce(v_item->>'capacity', ''),
      coalesce(v_item->>'condition', ''),
      coalesce(v_item->>'color', ''),
      v_imei,
      v_imei is not null,
      'READY',
      coalesce((v_item->>'count')::int, 1),
      v_sell,
      v_cost,
      v_tx_id,
      coalesce(v_item->>'defect_description', '')
    );
  end loop;

  v_agent_debt_amount := coalesce(nullif(p_agent_debt->>'amount', '')::bigint, 0);
  if p_agent_debt is not null and v_agent_debt_amount > 0 then
    insert into public.agent_transactions (agent_id, type, amount, method, note)
    values (
      (p_agent_debt->>'agent_id')::uuid,
      'Koreksi',
      v_agent_debt_amount,
      coalesce(nullif(p_agent_debt->>'method', ''), 'Hutang'),
      coalesce(p_agent_debt->>'note', '')
    );
  end if;

  return v_tx_id;
end;
$function$;

grant execute on function public.record_purchase_with_postings(text, text, text, bigint, jsonb, jsonb, jsonb) to authenticated;
