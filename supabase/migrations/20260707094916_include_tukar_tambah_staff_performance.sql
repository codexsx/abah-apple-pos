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
   and t.type in ('Penjualan', 'Tukar Tambah')
   and t.deleted_at is null
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
   and t.type in ('Penjualan', 'Tukar Tambah')
   and t.deleted_at is null
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
