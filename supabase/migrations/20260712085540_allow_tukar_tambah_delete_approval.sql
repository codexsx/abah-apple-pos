comment on index public.stock_items_active_imei_unique is
  'Allows sold historical stock rows to keep their IMEI while enforcing one active stock row per IMEI.';

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
  v_purchase_detail jsonb;
  v_purchase_agent_id uuid;
  v_purchase_agent_id_text text;
  v_purchase_agent_debt_amount bigint := 0;
  v_tukar_detail jsonb;
  v_tukar_outgoing_id uuid;
  v_tukar_outgoing_id_text text;
  v_tukar_rows_changed integer := 0;
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
    if exists (
      select 1
      from public.stock_items
      where transaction_id = v_tx.id
        and status = 'TERJUAL'
    ) then
      raise exception 'Pembelian tidak bisa dihapus karena ada unit dari pembelian ini yang sudah terjual.';
    end if;

    begin
      v_purchase_detail := coalesce(nullif(v_tx.detail, ''), '{}')::jsonb;
      v_purchase_agent_debt_amount := coalesce(nullif(v_purchase_detail #>> '{payment,debt}', '')::bigint, 0);
    exception when others then
      raise exception 'Detail pembelian tidak valid, hutang agen tidak bisa dibalik otomatis.';
    end;

    if v_purchase_agent_debt_amount > 0 then
      v_purchase_agent_id_text := nullif(v_purchase_detail #>> '{supplier,agentId}', '');

      if v_purchase_agent_id_text is null then
        raise exception 'Pembelian hutang agen tidak bisa dihapus karena data agen kosong.';
      end if;

      begin
        v_purchase_agent_id := v_purchase_agent_id_text::uuid;
      exception when others then
        raise exception 'Pembelian hutang agen tidak bisa dihapus karena data agen tidak valid.';
      end;

      insert into public.agent_transactions (agent_id, type, amount, method, note)
      values (
        v_purchase_agent_id,
        'Stor/Bayar',
        v_purchase_agent_debt_amount,
        'Hutang',
        trim(concat(
          'Void hutang pembelian: ',
          coalesce(v_tx.description, 'Transaksi pembelian'),
          case
            when nullif(p_request.reason, '') is null then ''
            else concat(' - ', left(p_request.reason, 160))
          end
        ))
      );
    end if;

    delete from public.stock_items
    where transaction_id = v_tx.id;
  elsif v_tx.type = 'Tukar Tambah' then
    begin
      v_tukar_detail := coalesce(nullif(v_tx.detail, ''), '{}')::jsonb;
      v_tukar_outgoing_id_text := nullif(v_tukar_detail #>> '{hpKeluar,id}', '');
    exception when others then
      raise exception 'Detail tukar tambah tidak valid, stok tidak bisa dibalik otomatis.';
    end;

    if v_tukar_outgoing_id_text is not null then
      begin
        v_tukar_outgoing_id := v_tukar_outgoing_id_text::uuid;
      exception when others then
        raise exception 'Detail HP keluar tukar tambah tidak valid, stok tidak bisa dibalik otomatis.';
      end;
    end if;

    if exists (
      select 1
      from public.stock_items
      where transaction_id = v_tx.id
        and id <> coalesce(v_tukar_outgoing_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and status = 'TERJUAL'
    ) then
      raise exception 'Tukar tambah tidak bisa dihapus karena HP masuk dari transaksi ini sudah terjual.';
    end if;

    delete from public.stock_items
    where transaction_id = v_tx.id
      and id <> coalesce(v_tukar_outgoing_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and status <> 'TERJUAL';

    get diagnostics v_tukar_rows_changed = row_count;

    if v_tukar_rows_changed = 0 then
      raise exception 'HP masuk dari tukar tambah tidak ditemukan atau sudah berpindah status.';
    end if;

    update public.stock_items
    set status = 'READY',
        transaction_id = null,
        updated_at = now()
    where transaction_id = v_tx.id
      and status = 'TERJUAL'
      and (v_tukar_outgoing_id is null or id = v_tukar_outgoing_id);

    get diagnostics v_tukar_rows_changed = row_count;

    if v_tukar_rows_changed = 0 then
      if v_tukar_outgoing_id is null then
        raise exception 'HP keluar tukar tambah tidak ditemukan untuk dibalik ke stok.';
      end if;

      update public.stock_items
      set count = count + 1,
          updated_at = now()
      where id = v_tukar_outgoing_id
        and status <> 'TERJUAL';

      get diagnostics v_tukar_rows_changed = row_count;

      if v_tukar_rows_changed = 0 then
        raise exception 'HP keluar tukar tambah tidak tersedia untuk dibalik ke stok.';
      end if;
    end if;
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

notify pgrst, 'reload schema';
