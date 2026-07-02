alter table public.transactions
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id),
  add column if not exists deleted_reason text,
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references public.profiles(id),
  add column if not exists edit_reason text;

create index if not exists transactions_deleted_at_idx
  on public.transactions(deleted_at);

create table if not exists public.transaction_change_requests (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  action text not null check (action in ('edit', 'delete')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  proposed_description text,
  proposed_detail text,
  proposed_amount bigint,
  snapshot jsonb not null default '{}'::jsonb,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists transaction_change_requests_status_created_idx
  on public.transaction_change_requests(status, created_at desc);

create index if not exists transaction_change_requests_transaction_idx
  on public.transaction_change_requests(transaction_id);

create unique index if not exists transaction_change_requests_one_pending_idx
  on public.transaction_change_requests(transaction_id, action)
  where status = 'pending';

alter table public.transaction_change_requests enable row level security;

drop policy if exists "Users read own transaction change requests" on public.transaction_change_requests;
create policy "Users read own transaction change requests"
  on public.transaction_change_requests
  for select
  to authenticated
  using (requested_by = auth.uid());

drop policy if exists "Managers read transaction change requests" on public.transaction_change_requests;
create policy "Managers read transaction change requests"
  on public.transaction_change_requests
  for select
  to authenticated
  using (private.has_permission('manage_users'));

drop policy if exists "Users insert own pending transaction change requests" on public.transaction_change_requests;
create policy "Users insert own pending transaction change requests"
  on public.transaction_change_requests
  for insert
  to authenticated
  with check (
    requested_by = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

grant select, insert on public.transaction_change_requests to authenticated;

drop policy if exists "Feature update transactions" on public.transactions;
drop policy if exists "Feature delete transactions" on public.transactions;
drop policy if exists "Managers update transactions after approval" on public.transactions;
drop policy if exists "No direct transaction deletes" on public.transactions;

create policy "No direct transaction deletes"
  on public.transactions
  for delete
  to authenticated
  using (false);

create or replace function private.reverse_transaction_ledger(
  p_transaction_type text,
  p_transaction_id uuid,
  p_reason text,
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_original_ref text := p_transaction_type || ':' || p_transaction_id::text;
begin
  for v_row in
    select account_id, direction, amount
    from public.account_ledger
    where source_reference = v_original_ref
      and amount > 0
  loop
    insert into public.account_ledger (account_id, direction, amount, source_reference, note)
    values (
      v_row.account_id,
      case when v_row.direction = 'money_in' then 'money_out' else 'money_in' end,
      v_row.amount,
      'VOID:' || p_request_id::text,
      'Void transaksi ' || p_transaction_type || ': ' || left(p_reason, 200)
    );
  end loop;
end;
$$;

revoke all on function private.reverse_transaction_ledger(text, uuid, text, uuid)
  from public, anon, authenticated;

create or replace function private.apply_transaction_amount_edit(
  p_transaction_type text,
  p_transaction_id uuid,
  p_old_amount bigint,
  p_new_amount bigint,
  p_reason text,
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original_ref text := p_transaction_type || ':' || p_transaction_id::text;
  v_count integer;
  v_row record;
  v_delta bigint;
begin
  v_delta := coalesce(p_new_amount, 0) - coalesce(p_old_amount, 0);
  if v_delta = 0 then
    return;
  end if;

  select count(*) into v_count
  from public.account_ledger
  where source_reference = v_original_ref
    and amount > 0;

  if v_count = 0 then
    return;
  end if;

  if v_count > 1 then
    raise exception 'Nominal transaksi dengan lebih dari satu akun tidak bisa diedit otomatis. Gunakan koreksi kas atau buat request hapus.';
  end if;

  select account_id, direction into v_row
  from public.account_ledger
  where source_reference = v_original_ref
    and amount > 0
  limit 1;

  insert into public.account_ledger (account_id, direction, amount, source_reference, note)
  values (
    v_row.account_id,
    case
      when v_delta > 0 then v_row.direction
      when v_row.direction = 'money_in' then 'money_out'
      else 'money_in'
    end,
    abs(v_delta),
    'EDIT:' || p_request_id::text,
    'Koreksi nominal transaksi ' || p_transaction_type || ': ' || left(p_reason, 200)
  );
end;
$$;

revoke all on function private.apply_transaction_amount_edit(text, uuid, bigint, bigint, text, uuid)
  from public, anon, authenticated;

create or replace function private.has_purchase_agent_debt(p_detail text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detail jsonb;
  v_debt bigint := 0;
begin
  begin
    v_detail := coalesce(nullif(p_detail, ''), '{}')::jsonb;
  exception when others then
    return false;
  end;

  v_debt := coalesce(nullif(v_detail #>> '{payment,debt}', '')::bigint, 0);
  return v_debt > 0;
end;
$$;

revoke all on function private.has_purchase_agent_debt(text)
  from public, anon, authenticated;

create or replace function private.apply_transaction_delete_request(
  p_request public.transaction_change_requests
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.transactions%rowtype;
begin
  select * into v_tx
  from public.transactions
  where id = p_request.transaction_id
  for update;

  if not found then
    raise exception 'Transaksi tidak ditemukan.';
  end if;

  if v_tx.deleted_at is not null then
    raise exception 'Transaksi ini sudah dihapus/void.';
  end if;

  if v_tx.type = 'Penjualan' then
    update public.stock_items
    set status = 'READY',
        transaction_id = null,
        updated_at = now()
    where transaction_id = v_tx.id
      and status = 'TERJUAL';
  elsif v_tx.type = 'Pembelian' then
    if private.has_purchase_agent_debt(v_tx.detail) then
      raise exception 'Pembelian hutang agen belum bisa dihapus otomatis. Buat koreksi hutang agen dulu.';
    end if;

    if exists (
      select 1
      from public.stock_items
      where transaction_id = v_tx.id
        and status = 'TERJUAL'
    ) then
      raise exception 'Pembelian tidak bisa dihapus karena ada unit dari pembelian ini yang sudah terjual.';
    end if;

    delete from public.stock_items
    where transaction_id = v_tx.id;
  elsif v_tx.type not in ('Pengeluaran', 'Pemasukan Lain') then
    raise exception 'Tipe transaksi % belum bisa dihapus otomatis karena punya efek stok/servis kompleks. Gunakan koreksi manual.', v_tx.type;
  end if;

  perform private.reverse_transaction_ledger(v_tx.type, v_tx.id, p_request.reason, p_request.id);

  update public.transactions
  set deleted_at = now(),
      deleted_by = auth.uid(),
      deleted_reason = p_request.reason
  where id = v_tx.id;
end;
$$;

revoke all on function private.apply_transaction_delete_request(public.transaction_change_requests)
  from public, anon, authenticated;

create or replace function private.apply_transaction_edit_request(
  p_request public.transaction_change_requests
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.transactions%rowtype;
  v_new_description text;
  v_new_detail text;
  v_new_amount bigint;
begin
  select * into v_tx
  from public.transactions
  where id = p_request.transaction_id
  for update;

  if not found then
    raise exception 'Transaksi tidak ditemukan.';
  end if;

  if v_tx.deleted_at is not null then
    raise exception 'Transaksi sudah dihapus/void dan tidak bisa diedit.';
  end if;

  v_new_description := coalesce(p_request.proposed_description, v_tx.description);
  v_new_detail := coalesce(p_request.proposed_detail, v_tx.detail);
  v_new_amount := coalesce(p_request.proposed_amount, v_tx.amount);

  if v_new_amount < 0 then
    raise exception 'Nominal transaksi tidak boleh negatif.';
  end if;

  perform private.apply_transaction_amount_edit(
    v_tx.type,
    v_tx.id,
    v_tx.amount,
    v_new_amount,
    p_request.reason,
    p_request.id
  );

  update public.transactions
  set description = v_new_description,
      detail = v_new_detail,
      amount = v_new_amount,
      edited_at = now(),
      edited_by = auth.uid(),
      edit_reason = p_request.reason
  where id = v_tx.id;
end;
$$;

revoke all on function private.apply_transaction_edit_request(public.transaction_change_requests)
  from public, anon, authenticated;

create or replace function private.review_transaction_change_request(
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
  v_request public.transaction_change_requests%rowtype;
begin
  if not private.has_permission('manage_users') then
    raise exception 'Approval transaksi hanya bisa dilakukan boss/manajer.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Keputusan approval tidak valid.';
  end if;

  select * into v_request
  from public.transaction_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request approval tidak ditemukan.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Request approval ini sudah diproses.';
  end if;

  if p_decision = 'approved' then
    if v_request.action = 'delete' then
      perform private.apply_transaction_delete_request(v_request);
    elsif v_request.action = 'edit' then
      perform private.apply_transaction_edit_request(v_request);
    else
      raise exception 'Aksi approval tidak valid.';
    end if;
  end if;

  update public.transaction_change_requests
  set status = p_decision,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = coalesce(p_review_note, '')
  where id = v_request.id;
end;
$$;

revoke all on function private.review_transaction_change_request(uuid, text, text)
  from public, anon, authenticated;
grant execute on function private.review_transaction_change_request(uuid, text, text)
  to authenticated;

create or replace function public.review_transaction_change_request(
  p_request_id uuid,
  p_decision text,
  p_review_note text default ''
)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform private.review_transaction_change_request(p_request_id, p_decision, p_review_note);
end;
$$;

revoke all on function public.review_transaction_change_request(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_transaction_change_request(uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';
