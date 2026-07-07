// Feature: finance-menu
// Unit test for the finance summary service (task 3.3).
//
// The four underlying data services are mocked; the real `buildFinanceSummary`
// core performs the roll-up math so we verify the wiring + period filtering +
// error propagation end-to-end against the pure core.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/services/transactions');
vi.mock('@/services/accounts');
vi.mock('@/services/stock');
vi.mock('@/services/agents');

import { getFinanceSummary } from './finance';
import { getTransactions, type Transaction } from '@/services/transactions';
import { getAccounts, type AccountWithBalance } from '@/services/accounts';
import { getStockItems, type StockItem } from '@/services/stock';
import {
  getAgents,
  getAgentTransactions,
  getAgentBalanceBreakdown,
  type Agent,
  type AgentTransaction,
} from '@/services/agents';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: partial.id ?? crypto.randomUUID(),
    type: partial.type ?? 'Penjualan',
    description: partial.description ?? '',
    detail: partial.detail ?? '',
    amount: partial.amount ?? 0,
    created_at: partial.created_at ?? '2026-06-15T00:00:00.000Z',
  };
}

function account(partial: Partial<AccountWithBalance>): AccountWithBalance {
  return {
    id: partial.id ?? crypto.randomUUID(),
    name: partial.name ?? 'Akun',
    type: partial.type ?? 'Cash',
    opening_balance: partial.opening_balance ?? 0,
    note: partial.note ?? '',
    is_archived: partial.is_archived ?? false,
    created_at: partial.created_at ?? '2026-01-01T00:00:00.000Z',
    updated_at: partial.updated_at ?? '2026-01-01T00:00:00.000Z',
    current_balance: partial.current_balance ?? 0,
    is_overdraft: partial.is_overdraft ?? false,
  };
}

function stock(partial: Partial<StockItem>): StockItem {
  return {
    id: partial.id ?? crypto.randomUUID(),
    model: partial.model ?? 'Model',
    capacity: partial.capacity ?? '',
    condition: partial.condition ?? '',
    color: partial.color ?? '',
    imei: partial.imei ?? null,
    has_imei: partial.has_imei ?? false,
    status: partial.status ?? 'READY',
    count: partial.count ?? 1,
    price: partial.price ?? 0,
    cost_price: partial.cost_price ?? 0,
    created_at: partial.created_at ?? '2026-01-01T00:00:00.000Z',
    updated_at: partial.updated_at ?? '2026-01-01T00:00:00.000Z',
  };
}

function agent(id: string): Agent {
  return {
    id,
    code: id,
    name: 'Agen ' + id,
    phone: '',
    note: '',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getFinanceSummary', () => {
  it('wires sub-totals correctly across all underlying services', async () => {
    vi.mocked(getTransactions).mockResolvedValue([
      tx({ type: 'Penjualan', amount: 1_000_000 }),
      tx({ type: 'Servis', amount: 200_000 }),
      tx({ type: 'Pemasukan Lain', amount: 50_000 }),
      tx({ type: 'Pembelian', amount: 600_000 }),
      tx({ type: 'Pengeluaran', amount: 150_000 }),
      tx({
        type: 'Tukar Tambah',
        amount: 500_000,
        detail: JSON.stringify({
          hpKeluar: { model: 'iPhone 14', capacity: '128GB', price: 4_500_000 },
          hpMasuk: { tipe: 'iPhone 11', kapasitas: '128GB', appraisal: 4_000_000 },
          selisih: 500_000,
        }),
      }),
    ]);

    vi.mocked(getAccounts).mockResolvedValue([
      account({ current_balance: 3_000_000 }),
      account({ current_balance: 2_000_000 }),
    ]);

    vi.mocked(getStockItems).mockResolvedValue([
      stock({ status: 'READY', price: 1_500_000, count: 2 }), // 3_000_000 inventory
      stock({ status: 'READY', price: 500_000, count: 1 }), // 500_000 inventory
      stock({ status: 'TERJUAL', price: 2_000_000, cost_price: 1_500_000, count: 2 }), // 3_000_000 COGS
    ]);

    vi.mocked(getAgents).mockResolvedValue([agent('A1'), agent('A2')]);

    // Per-agent transactions are passed through to the breakdown mock.
    vi.mocked(getAgentTransactions).mockResolvedValue([] as AgentTransaction[]);

    // Agent A's breakdown then agent B's breakdown.
    vi.mocked(getAgentBalanceBreakdown)
      .mockReturnValueOnce({ outstandingDebt: 800_000, depositCredit: 0, net: 800_000 })
      .mockReturnValueOnce({ outstandingDebt: 0, depositCredit: 300_000, net: -300_000 });

    const summary = await getFinanceSummary();

    // Revenue = Penjualan + Servis + Pemasukan Lain + HP keluar Tukar Tambah
    expect(summary.revenue).toBe(5_750_000);
    // COGS now comes from sold units' cost_price, not Pembelian transactions.
    expect(summary.cogs).toBe(3_000_000);
    expect(summary.expenses).toBe(150_000);
    // Net profit = 5_750_000 - 3_000_000 - 150_000
    expect(summary.netProfit).toBe(2_600_000);

    expect(summary.cashBankTotal).toBe(5_000_000);
    expect(summary.inventoryValue).toBe(3_500_000); // READY only
    expect(summary.agentReceivable).toBe(800_000);
    expect(summary.agentDepositLiability).toBe(300_000);

    // Total asset = cash + inventory + receivable - deposit liability
    expect(summary.totalAsset).toBe(5_000_000 + 3_500_000 + 800_000 - 300_000);
  });

  it('keeps Pembelian Pelengkap out of expenses and recognizes its cost only through sold-stock COGS', async () => {
    vi.mocked(getTransactions).mockResolvedValue([
      tx({ type: 'Penjualan', amount: 4_200_000 }),
      tx({ type: 'Pembelian Pelengkap', amount: 20_000_000 }),
    ]);

    vi.mocked(getAccounts).mockResolvedValue([]);
    vi.mocked(getStockItems).mockResolvedValue([
      stock({ status: 'TERJUAL', price: 4_200_000, cost_price: 3_200_000, count: 1 }),
    ]);
    vi.mocked(getAgents).mockResolvedValue([]);
    vi.mocked(getAgentTransactions).mockResolvedValue([] as AgentTransaction[]);

    const summary = await getFinanceSummary();

    expect(summary.revenue).toBe(4_200_000);
    expect(summary.cogs).toBe(3_200_000);
    expect(summary.expenses).toBe(0);
    expect(summary.netProfit).toBe(1_000_000);
  });

  it('only counts transactions within the requested period', async () => {
    vi.mocked(getTransactions).mockResolvedValue([
      tx({ type: 'Penjualan', amount: 1_000_000, created_at: '2026-06-10T00:00:00.000Z' }), // in range
      tx({ type: 'Penjualan', amount: 4_000_000, created_at: '2026-05-01T00:00:00.000Z' }), // out (before)
      tx({ type: 'Pembelian', amount: 300_000, created_at: '2026-06-20T00:00:00.000Z' }), // in range
      tx({ type: 'Pengeluaran', amount: 9_000_000, created_at: '2026-07-05T00:00:00.000Z' }), // out (after)
    ]);
    vi.mocked(getAccounts).mockResolvedValue([]);
    vi.mocked(getStockItems).mockResolvedValue([]);
    vi.mocked(getAgents).mockResolvedValue([]);
    vi.mocked(getAgentTransactions).mockResolvedValue([] as AgentTransaction[]);

    const summary = await getFinanceSummary({
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-30T23:59:59.999Z',
    });

    expect(summary.revenue).toBe(1_000_000); // only the in-range Penjualan
    expect(summary.cogs).toBe(0); // no sold stock items in fixture
    expect(summary.expenses).toBe(0); // July expense excluded
    expect(summary.netProfit).toBe(1_000_000);
  });

  it('can omit agent receivable/deposit fetches for roles that may not see agent money', async () => {
    vi.mocked(getTransactions).mockResolvedValue([tx({ type: 'Penjualan', amount: 1_000_000 })]);
    vi.mocked(getAccounts).mockResolvedValue([account({ current_balance: 2_000_000 })]);
    vi.mocked(getStockItems).mockResolvedValue([stock({ status: 'READY', price: 3_000_000, count: 1 })]);
    vi.mocked(getAgents).mockResolvedValue([agent('A1')]);
    vi.mocked(getAgentTransactions).mockRejectedValue(new Error('forbidden'));

    const summary = await getFinanceSummary(undefined, { includeAgentMoney: false });

    expect(getAgents).not.toHaveBeenCalled();
    expect(getAgentTransactions).not.toHaveBeenCalled();
    expect(summary.agentReceivable).toBe(0);
    expect(summary.agentDepositLiability).toBe(0);
    expect(summary.totalAsset).toBe(5_000_000);
  });

  it('rethrows when an underlying fetch fails', async () => {
    vi.mocked(getTransactions).mockRejectedValue(new Error('network down'));
    vi.mocked(getAccounts).mockResolvedValue([]);
    vi.mocked(getStockItems).mockResolvedValue([]);
    vi.mocked(getAgents).mockResolvedValue([]);
    vi.mocked(getAgentTransactions).mockResolvedValue([] as AgentTransaction[]);

    await expect(getFinanceSummary()).rejects.toThrow('network down');
  });
});
