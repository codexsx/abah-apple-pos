import { describe, expect, it } from 'vitest';
import migrationSql from '../../supabase/migrations/20260702115144_transaction_approval_agent_debt_delete.sql?raw';

describe('transaction approval migrations', () => {
  it('rolls back agent debt when deleting an unpaid purchase approval', () => {
    expect(migrationSql).toContain('insert into public.agent_transactions');
    expect(migrationSql).toContain("'Stor/Bayar'");
    expect(migrationSql).toContain('v_purchase_agent_debt_amount');
    expect(migrationSql).toContain("status = 'TERJUAL'");
    expect(migrationSql).toContain('delete from public.stock_items');
  });
});
