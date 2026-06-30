-- Harden public deployment security before publishing.
-- Keep authorization data in public.profiles, but enforce it at the database
-- boundary so route guards are not the only protection.

create schema if not exists private;
grant usage on schema private to authenticated;

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

create or replace function private.can_transaction_type(p_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_type
    when 'Penjualan' then private.has_permission('penjualan')
    when 'Pembelian' then private.has_permission('pembelian')
    when 'Pembelian Pelengkap' then private.has_permission('pembelian')
    when 'Servis' then private.has_permission('servis')
    when 'Pengeluaran' then private.has_permission('pengeluaran')
    when 'Pemasukan Lain' then private.has_permission('pengeluaran')
    when 'Upah Servis' then private.has_permission('pengeluaran')
    when 'Tukar Tambah' then private.has_permission('tukar_tambah')
    else private.has_permission('finance')
  end;
$$;

revoke all on function private.can_transaction_type(text) from public, anon, authenticated;
grant execute on function private.can_transaction_type(text) to authenticated;

create or replace function private.can_record_ledger()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.has_permission('finance')
    or private.has_permission('penjualan')
    or private.has_permission('pembelian')
    or private.has_permission('servis')
    or private.has_permission('pengeluaran')
    or private.has_permission('tukar_tambah')
    or private.has_permission('agen');
$$;

revoke all on function private.can_record_ledger() from public, anon, authenticated;
grant execute on function private.can_record_ledger() to authenticated;

-- Move the RLS auto-enable event trigger function out of the exposed public
-- schema. It remains usable only as an event trigger.
create or replace function private.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table','partitioned table')
  loop
    if cmd.schema_name is not null
      and cmd.schema_name in ('public')
      and cmd.schema_name not in ('pg_catalog','information_schema')
      and cmd.schema_name not like 'pg_toast%'
      and cmd.schema_name not like 'pg_temp%'
    then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: skip % (schema: %)', cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$$;

revoke all on function private.rls_auto_enable() from public, anon, authenticated;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  execute function private.rls_auto_enable();

drop function if exists public.rls_auto_enable();

-- Drop old permissive policies on business tables.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'accessory_stock',
        'account_ledger',
        'accounts',
        'agent_transactions',
        'agents',
        'company_settings',
        'daily_closings',
        'service_records',
        'service_sparepart_usages',
        'spareparts',
        'stock_items',
        'technicians',
        'transactions'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end;
$$;

-- Profiles: users may read their own row; managers may read all. Normal users
-- may only update avatar fields via column grants, not role/permissions.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own avatar fields"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke update on public.profiles from anon, authenticated;
grant update (avatar_url, updated_at) on public.profiles to authenticated;

-- Company profile: everyone signed in can read brand data, only managers can edit.
create policy "Authenticated read company settings"
  on public.company_settings
  for select
  to authenticated
  using (true);

create policy "Managers insert company settings"
  on public.company_settings
  for insert
  to authenticated
  with check (private.has_permission('manage_users'));

create policy "Managers update company settings"
  on public.company_settings
  for update
  to authenticated
  using (private.has_permission('manage_users'))
  with check (private.has_permission('manage_users'));

-- Finance tables.
create policy "Authenticated read account options"
  on public.accounts
  for select
  to authenticated
  using (true);

create policy "Finance insert accounts"
  on public.accounts
  for insert
  to authenticated
  with check (private.has_permission('finance'));

create policy "Finance update accounts"
  on public.accounts
  for update
  to authenticated
  using (private.has_permission('finance'))
  with check (private.has_permission('finance'));

create policy "Finance delete accounts"
  on public.accounts
  for delete
  to authenticated
  using (private.has_permission('finance'));

create policy "Finance read account ledger"
  on public.account_ledger
  for select
  to authenticated
  using (private.has_permission('finance'));

create policy "Operational insert account ledger"
  on public.account_ledger
  for insert
  to authenticated
  with check (private.can_record_ledger());

create policy "Finance update account ledger"
  on public.account_ledger
  for update
  to authenticated
  using (private.has_permission('finance'))
  with check (private.has_permission('finance'));

create policy "Finance delete account ledger"
  on public.account_ledger
  for delete
  to authenticated
  using (private.has_permission('finance'));

create or replace view public.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.opening_balance::numeric
    + coalesce(sum(case when l.direction = 'money_in' then l.amount else 0 end), 0::numeric)
    - coalesce(sum(case when l.direction = 'money_out' then l.amount else 0 end), 0::numeric)
    as current_balance
from public.accounts a
left join public.account_ledger l on l.account_id = a.id
where private.has_permission('finance')
group by a.id, a.opening_balance;

revoke all on public.account_balances from anon, authenticated;
grant select on public.account_balances to authenticated;

-- Transaction history is gated by transaction type.
create policy "Feature read transactions"
  on public.transactions
  for select
  to authenticated
  using (private.can_transaction_type(type));

create policy "Feature insert transactions"
  on public.transactions
  for insert
  to authenticated
  with check (private.can_transaction_type(type));

create policy "Feature update transactions"
  on public.transactions
  for update
  to authenticated
  using (private.can_transaction_type(type))
  with check (private.can_transaction_type(type));

create policy "Feature delete transactions"
  on public.transactions
  for delete
  to authenticated
  using (private.can_transaction_type(type));

-- Stock and inventory.
create policy "Stock read stock items"
  on public.stock_items
  for select
  to authenticated
  using (private.has_permission('stok'));

create policy "Stock insert stock items"
  on public.stock_items
  for insert
  to authenticated
  with check (private.has_permission('stok'));

create policy "Stock update stock items"
  on public.stock_items
  for update
  to authenticated
  using (private.has_permission('stok'))
  with check (private.has_permission('stok'));

create policy "Stock delete stock items"
  on public.stock_items
  for delete
  to authenticated
  using (private.has_permission('stok'));

create policy "Stock read accessory stock"
  on public.accessory_stock
  for select
  to authenticated
  using (private.has_permission('stok'));

create policy "Stock insert accessory stock"
  on public.accessory_stock
  for insert
  to authenticated
  with check (private.has_permission('stok'));

create policy "Stock update accessory stock"
  on public.accessory_stock
  for update
  to authenticated
  using (private.has_permission('stok'))
  with check (private.has_permission('stok'));

create policy "Stock delete accessory stock"
  on public.accessory_stock
  for delete
  to authenticated
  using (private.has_permission('stok'));

create policy "Stock read spareparts"
  on public.spareparts
  for select
  to authenticated
  using (private.has_permission('stok'));

create policy "Stock insert spareparts"
  on public.spareparts
  for insert
  to authenticated
  with check (private.has_permission('stok'));

create policy "Stock update spareparts"
  on public.spareparts
  for update
  to authenticated
  using (private.has_permission('stok'))
  with check (private.has_permission('stok'));

create policy "Stock delete spareparts"
  on public.spareparts
  for delete
  to authenticated
  using (private.has_permission('stok'));

-- Service.
create policy "Service read records"
  on public.service_records
  for select
  to authenticated
  using (private.has_permission('servis'));

create policy "Service insert records"
  on public.service_records
  for insert
  to authenticated
  with check (private.has_permission('servis'));

create policy "Service update records"
  on public.service_records
  for update
  to authenticated
  using (private.has_permission('servis'))
  with check (private.has_permission('servis'));

create policy "Service delete records"
  on public.service_records
  for delete
  to authenticated
  using (private.has_permission('servis'));

create policy "Service read sparepart usages"
  on public.service_sparepart_usages
  for select
  to authenticated
  using (private.has_permission('servis'));

create policy "Service insert sparepart usages"
  on public.service_sparepart_usages
  for insert
  to authenticated
  with check (private.has_permission('servis'));

create policy "Service update sparepart usages"
  on public.service_sparepart_usages
  for update
  to authenticated
  using (private.has_permission('servis'))
  with check (private.has_permission('servis'));

create policy "Service delete sparepart usages"
  on public.service_sparepart_usages
  for delete
  to authenticated
  using (private.has_permission('servis'));

create policy "Service read technicians"
  on public.technicians
  for select
  to authenticated
  using (private.has_permission('servis'));

create policy "Service insert technicians"
  on public.technicians
  for insert
  to authenticated
  with check (private.has_permission('servis'));

create policy "Service update technicians"
  on public.technicians
  for update
  to authenticated
  using (private.has_permission('servis'))
  with check (private.has_permission('servis'));

create policy "Service delete technicians"
  on public.technicians
  for delete
  to authenticated
  using (private.has_permission('servis'));

-- Agen.
create policy "Agen read agents"
  on public.agents
  for select
  to authenticated
  using (private.has_permission('agen'));

create policy "Agen insert agents"
  on public.agents
  for insert
  to authenticated
  with check (private.has_permission('agen'));

create policy "Agen update agents"
  on public.agents
  for update
  to authenticated
  using (private.has_permission('agen'))
  with check (private.has_permission('agen'));

create policy "Agen delete agents"
  on public.agents
  for delete
  to authenticated
  using (private.has_permission('agen'));

create policy "Agen read transactions"
  on public.agent_transactions
  for select
  to authenticated
  using (private.has_permission('agen'));

create policy "Agen insert transactions"
  on public.agent_transactions
  for insert
  to authenticated
  with check (private.has_permission('agen'));

create policy "Agen update transactions"
  on public.agent_transactions
  for update
  to authenticated
  using (private.has_permission('agen'))
  with check (private.has_permission('agen'));

create policy "Agen delete transactions"
  on public.agent_transactions
  for delete
  to authenticated
  using (private.has_permission('agen'));

-- Daily closing is finance-only.
create policy "Finance read daily closings"
  on public.daily_closings
  for select
  to authenticated
  using (private.has_permission('finance'));

create policy "Finance insert daily closings"
  on public.daily_closings
  for insert
  to authenticated
  with check (private.has_permission('finance'));

create policy "Finance update daily closings"
  on public.daily_closings
  for update
  to authenticated
  using (private.has_permission('finance'))
  with check (private.has_permission('finance'));

create policy "Finance delete daily closings"
  on public.daily_closings
  for delete
  to authenticated
  using (private.has_permission('finance'));

-- Storage: avatars remain owner-only; company assets are manager-only writes.
drop policy if exists "Authenticated delete company assets" on storage.objects;
drop policy if exists "Authenticated insert company assets" on storage.objects;
drop policy if exists "Authenticated update company assets" on storage.objects;

create policy "Managers insert company assets"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'company-assets'
    and private.has_permission('manage_users')
  );

create policy "Managers update company assets"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'company-assets'
    and private.has_permission('manage_users')
  )
  with check (
    bucket_id = 'company-assets'
    and private.has_permission('manage_users')
  );

create policy "Managers delete company assets"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'company-assets'
    and private.has_permission('manage_users')
  );
