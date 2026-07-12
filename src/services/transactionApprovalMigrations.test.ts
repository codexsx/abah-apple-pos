import { describe, expect, it } from 'vitest';
import migrationSql from '../../supabase/migrations/20260702115144_transaction_approval_agent_debt_delete.sql?raw';
import tukarTambahDeleteSql from '../../supabase/migrations/20260712085540_allow_tukar_tambah_delete_approval.sql?raw';
import buybackSql from '../../supabase/migrations/20260712112128_buyback_flow.sql?raw';

describe('transaction approval migrations', () => {
  it('rolls back agent debt when deleting an unpaid purchase approval', () => {
    expect(migrationSql).toContain('insert into public.agent_transactions');
    expect(migrationSql).toContain("'Stor/Bayar'");
    expect(migrationSql).toContain('v_purchase_agent_debt_amount');
    expect(migrationSql).toContain("status = 'TERJUAL'");
    expect(migrationSql).toContain('delete from public.stock_items');
  });

  it('supports approved delete rollback for tukar tambah transactions', () => {
    expect(tukarTambahDeleteSql).toContain("elsif v_tx.type = 'Tukar Tambah' then");
    expect(tukarTambahDeleteSql).toContain("v_tukar_detail #>> '{hpKeluar,id}'");
    expect(tukarTambahDeleteSql).toContain('HP masuk dari tukar tambah tidak ditemukan');
    expect(tukarTambahDeleteSql).toContain("set status = 'READY'");
    expect(tukarTambahDeleteSql).toContain('set count = count + 1');
  });

  it('supports approved delete rollback for buyback transactions', () => {
    expect(buybackSql).toContain("when 'Buyback' then private.has_permission('pembelian')");
    expect(buybackSql).toContain('record_buyback_with_postings');
    expect(buybackSql).toContain("elsif v_tx.type = 'Buyback' then");
    expect(buybackSql).toContain('unit hasil buyback sudah terjual lagi');
    expect(buybackSql).toContain('delete from public.stock_items');
  });
});
