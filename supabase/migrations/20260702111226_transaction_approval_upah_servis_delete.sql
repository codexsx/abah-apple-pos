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
  elsif v_tx.type not in ('Pengeluaran', 'Pemasukan Lain', 'Upah Servis') then
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
