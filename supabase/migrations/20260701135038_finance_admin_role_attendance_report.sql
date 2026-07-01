alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('MANAJER', 'KEUANGAN', 'KASIR', 'TEKNISI'));

comment on constraint profiles_role_check on public.profiles
  is 'Allowed application roles. KEUANGAN is finance/admin staff: finance + pengeluaran access without manage_users.';

create or replace function private.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'MANAJER'
        or coalesce(
          case
            when p.permissions ? p_key then (p.permissions ->> p_key)::boolean
            else null
          end,
          case p.role
            when 'KEUANGAN' then p_key in ('finance', 'pengeluaran')
            when 'KASIR' then p_key in (
              'penjualan',
              'pembelian',
              'servis',
              'pengeluaran',
              'tukar_tambah',
              'stok',
              'agen'
            )
            when 'TEKNISI' then p_key in ('servis', 'stok')
            else false
          end
        )
      )
  );
$$;

revoke all on function private.has_permission(text) from public, anon, authenticated;
grant execute on function private.has_permission(text) to authenticated;
