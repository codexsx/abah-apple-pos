alter table public.transactions
  add column if not exists staff_id uuid references public.profiles(id);

create index if not exists transactions_staff_id_idx
  on public.transactions(staff_id);

create index if not exists transactions_staff_type_created_idx
  on public.transactions(staff_id, type, created_at);

create or replace function private.sale_unit_count(p_detail text)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_detail jsonb;
  v_units integer;
begin
  v_detail := coalesce(nullif(p_detail, ''), '{}')::jsonb;
  if jsonb_typeof(v_detail->'units') = 'array' then
    v_units := jsonb_array_length(v_detail->'units');
    if v_units > 0 then
      return v_units;
    end if;
  end if;
  return 1;
exception
  when others then
    return 1;
end;
$$;

revoke all on function private.sale_unit_count(text) from public, anon, authenticated;

create or replace function private.active_sales_staff_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(1, count(*)::integer)
  from public.profiles p
  where coalesce(p.is_hidden_owner, false) = false
    and p.role <> 'MANAJER'
    and (
      p.role = 'KASIR'
      or coalesce((p.permissions->>'penjualan')::boolean, false)
    );
$$;

revoke all on function private.active_sales_staff_count() from public, anon, authenticated;

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
  v_count int;
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
    select count into v_count from public.stock_items where id = v_id for update;
    if v_count is null then
      raise exception 'Stock item % not found', v_id;
    end if;
    if v_count > 1 then
      update public.stock_items set count = count - 1, updated_at = now() where id = v_id;
    else
      update public.stock_items set status = 'TERJUAL', transaction_id = v_tx_id, updated_at = now() where id = v_id;
    end if;
  end loop;

  if v_acc_cost > 0 and array_length(p_stock_ids, 1) >= 1 then
    update public.stock_items set cost_price = cost_price + v_acc_cost, updated_at = now()
    where id = p_stock_ids[1];
  end if;

  return v_tx_id;
end;
$$;

grant execute on function public.record_sale_with_postings(text, text, text, bigint, jsonb, uuid[], jsonb) to authenticated;

create or replace function public.get_own_staff_performance()
returns table (
  staff_id uuid,
  staff_name text,
  role text,
  avatar_url text,
  previous_month_units bigint,
  current_month_units bigint,
  lifetime_units bigint,
  active_sales_staff integer
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', now()) as current_month_start,
      date_trunc('month', now()) - interval '1 month' as previous_month_start,
      private.active_sales_staff_count() as sales_staff_count
  )
  select
    p.id as staff_id,
    p.name as staff_name,
    p.role,
    p.avatar_url,
    coalesce(sum(private.sale_unit_count(t.detail)) filter (
      where t.created_at >= bounds.previous_month_start
        and t.created_at < bounds.current_month_start
    ), 0)::bigint as previous_month_units,
    coalesce(sum(private.sale_unit_count(t.detail)) filter (
      where t.created_at >= bounds.current_month_start
    ), 0)::bigint as current_month_units,
    coalesce(sum(private.sale_unit_count(t.detail)), 0)::bigint as lifetime_units,
    bounds.sales_staff_count as active_sales_staff
  from public.profiles p
  cross join bounds
  left join public.transactions t
    on t.staff_id = p.id
   and t.type = 'Penjualan'
  where p.id = auth.uid()
  group by p.id, p.name, p.role, p.avatar_url, bounds.sales_staff_count;
$$;

revoke all on function public.get_own_staff_performance() from public, anon, authenticated;
grant execute on function public.get_own_staff_performance() to authenticated;

create or replace function public.get_staff_performance_leaderboard()
returns table (
  staff_id uuid,
  staff_name text,
  role text,
  avatar_url text,
  previous_month_units bigint,
  current_month_units bigint,
  lifetime_units bigint,
  active_sales_staff integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.has_permission('manage_users') then
    raise exception 'Akses staff performance hanya untuk boss/manajer.'
      using errcode = '42501';
  end if;

  return query
  with bounds as (
    select
      date_trunc('month', now()) as current_month_start,
      date_trunc('month', now()) - interval '1 month' as previous_month_start,
      private.active_sales_staff_count() as sales_staff_count
  )
  select
    p.id as staff_id,
    p.name as staff_name,
    p.role,
    p.avatar_url,
    coalesce(sum(private.sale_unit_count(t.detail)) filter (
      where t.created_at >= bounds.previous_month_start
        and t.created_at < bounds.current_month_start
    ), 0)::bigint as previous_month_units,
    coalesce(sum(private.sale_unit_count(t.detail)) filter (
      where t.created_at >= bounds.current_month_start
    ), 0)::bigint as current_month_units,
    coalesce(sum(private.sale_unit_count(t.detail)), 0)::bigint as lifetime_units,
    bounds.sales_staff_count as active_sales_staff
  from public.profiles p
  cross join bounds
  left join public.transactions t
    on t.staff_id = p.id
   and t.type = 'Penjualan'
  where coalesce(p.is_hidden_owner, false) = false
    and (
      p.role = 'KASIR'
      or (
        p.role <> 'MANAJER'
        and coalesce((p.permissions->>'penjualan')::boolean, false)
      )
    )
  group by p.id, p.name, p.role, p.avatar_url, bounds.sales_staff_count
  order by
    coalesce(sum(private.sale_unit_count(t.detail)) filter (
      where t.created_at >= bounds.previous_month_start
        and t.created_at < bounds.current_month_start
    ), 0) desc,
    coalesce(sum(private.sale_unit_count(t.detail)) filter (
      where t.created_at >= bounds.current_month_start
    ), 0) desc,
    p.name asc;
end;
$$;

revoke all on function public.get_staff_performance_leaderboard() from public, anon, authenticated;
grant execute on function public.get_staff_performance_leaderboard() to authenticated;
