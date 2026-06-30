create or replace function private.active_sales_staff_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(5, count(*)::integer)
  from public.profiles p
  where coalesce(p.is_hidden_owner, false) = false
    and p.role <> 'MANAJER'
    and (
      p.role = 'KASIR'
      or coalesce((p.permissions->>'penjualan')::boolean, false)
    );
$$;

revoke all on function private.active_sales_staff_count() from public, anon, authenticated;
