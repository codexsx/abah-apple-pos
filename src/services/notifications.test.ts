// Feature: user-management (Phase 9) — task 5.5
// Wiring tests for the finance notifications service. These verify that
// getNotifications() correctly gathers the live snapshot from the data
// services and delegates to the REAL notificationsCore derivation, and that
// getNotificationsWithCount() reports the actionable (non-info) count.
//
// The data service modules are mocked; notificationsCore is NOT mocked so the
// real, property-tested derivation runs against the wired snapshot.

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getNotifications, getNotificationsWithCount } from './notifications';
import {
  getStockItems,
  getAccessoryStock,
  type StockItem,
  type AccessoryItem,
} from '@/services/stock';
import { getAccounts, type AccountWithBalance } from '@/services/accounts';
import {
  getAgents,
  getAgentTransactions,
  getAgentBalanceBreakdown,
  type Agent,
} from '@/services/agents';
import { getTransactions, type Transaction } from '@/services/transactions';

vi.mock('@/services/stock');
vi.mock('@/services/accounts');
vi.mock('@/services/agents');
vi.mock('@/services/transactions');

const mockGetStockItems = vi.mocked(getStockItems);
const mockGetAccessoryStock = vi.mocked(getAccessoryStock);
const mockGetAccounts = vi.mocked(getAccounts);
const mockGetAgents = vi.mocked(getAgents);
const mockGetAgentTransactions = vi.mocked(getAgentTransactions);
const mockGetAgentBalanceBreakdown = vi.mocked(getAgentBalanceBreakdown);
const mockGetTransactions = vi.mocked(getTransactions);

// ---------- Fixture builders ----------

function makeStockItem(overrides: Partial<StockItem> = {}): StockItem {
  return {
    id: 'stock-1',
    model: 'iPhone 12',
    capacity: '128GB',
    condition: 'Baru',
    color: 'Hitam',
    imei: null,
    has_imei: false,
    status: 'READY',
    count: 0,
    price: 1000000,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  } as StockItem;
}

function makeAccount(overrides: Partial<AccountWithBalance> = {}): AccountWithBalance {
  return {
    id: 'acc-1',
    name: 'Kas Utama',
    type: 'Cash',
    opening_balance: 0,
    note: '',
    is_archived: false,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    current_balance: -50000,
    is_overdraft: true,
    ...overrides,
  } as AccountWithBalance;
}

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    code: 'AG01',
    name: 'Budi',
    phone: '',
    note: '',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    type: 'Penjualan',
    description: 'Jual HP',
    detail: '',
    amount: 1000000,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getNotifications — wiring happy path', () => {
  it('derives stock_out, overdraft, agent_receivable, and activity alerts', async () => {
    mockGetStockItems.mockResolvedValue([
      makeStockItem({ model: 'iPhone 12', count: 0, status: 'READY' }),
    ]);
    mockGetAccessoryStock.mockResolvedValue([] as AccessoryItem[]);
    mockGetAccounts.mockResolvedValue([
      makeAccount({ name: 'Kas Utama', current_balance: -50000 }),
    ]);
    mockGetAgents.mockResolvedValue([makeAgent({ name: 'Budi' })]);
    mockGetAgentTransactions.mockResolvedValue([]);
    mockGetAgentBalanceBreakdown.mockReturnValue({
      outstandingDebt: 500000,
      depositCredit: 0,
      net: 500000,
    });
    mockGetTransactions.mockResolvedValue([
      makeTransaction({ created_at: new Date().toISOString() }),
    ]);

    const items = await getNotifications();

    const stockOut = items.find((i) => i.kind === 'stock_out');
    expect(stockOut).toBeDefined();
    expect(stockOut?.severity).toBe('critical');

    const overdraft = items.find((i) => i.kind === 'overdraft');
    expect(overdraft).toBeDefined();
    expect(overdraft?.severity).toBe('critical');

    const receivable = items.find((i) => i.kind === 'agent_receivable');
    expect(receivable).toBeDefined();
    expect(receivable?.severity).toBe('warning');

    const activity = items.find((i) => i.kind === 'activity');
    expect(activity).toBeDefined();
    expect(activity?.severity).toBe('info');

    // getAgentBalanceBreakdown is sync and fed the resolved agent txs.
    expect(mockGetAgentTransactions).toHaveBeenCalledWith('agent-1');
    expect(mockGetAgentBalanceBreakdown).toHaveBeenCalledWith([]);

    // actionableCount = non-info items (stock_out, overdraft, agent_receivable).
    const nonInfo = items.filter((i) => i.severity !== 'info').length;
    const { actionableCount } = await getNotificationsWithCount();
    expect(actionableCount).toBe(nonInfo);
    expect(actionableCount).toBe(3);
  });
});

describe('getNotifications — empty path', () => {
  it('returns an empty list when every service resolves empty', async () => {
    mockGetStockItems.mockResolvedValue([]);
    mockGetAccessoryStock.mockResolvedValue([]);
    mockGetAccounts.mockResolvedValue([]);
    mockGetAgents.mockResolvedValue([]);
    mockGetAgentTransactions.mockResolvedValue([]);
    mockGetAgentBalanceBreakdown.mockReturnValue({
      outstandingDebt: 0,
      depositCredit: 0,
      net: 0,
    });
    mockGetTransactions.mockResolvedValue([]);

    await expect(getNotifications()).resolves.toEqual([]);
  });
});

describe('getNotifications — rethrow', () => {
  it('propagates an underlying fetch error (no catch)', async () => {
    mockGetStockItems.mockRejectedValue(new Error('stock fetch failed'));
    mockGetAccessoryStock.mockResolvedValue([]);
    mockGetAccounts.mockResolvedValue([]);
    mockGetAgents.mockResolvedValue([]);
    mockGetAgentTransactions.mockResolvedValue([]);
    mockGetAgentBalanceBreakdown.mockReturnValue({
      outstandingDebt: 0,
      depositCredit: 0,
      net: 0,
    });
    mockGetTransactions.mockResolvedValue([]);

    await expect(getNotifications()).rejects.toThrow('stock fetch failed');
  });
});
