// Feature: transaction-account-integration
// Unit tests for the RPC service wrappers (task 3.2).
// Validates: Requirements 2.8, 3.3, 3.4, 9.6

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  recordTransactionWithPostings,
  recordAgentPaymentWithPosting,
  recordPurchaseWithPostings,
  recordAccessoryPurchaseWithPostings,
} from './postings';
import type { Posting } from '@/services/paymentPosting';

// Mock the supabase client so no real network call is made; we only need rpc().
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: vi.fn() },
}));

// Import the mocked client to drive return values / inspect calls.
import { supabase } from '@/lib/supabase';

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  rpcMock.mockReset();
});

describe('recordTransactionWithPostings', () => {
  it('calls the RPC with the correct argument shape and forces note to empty string', async () => {
    rpcMock.mockResolvedValue({ data: 'tx-123', error: null });

    const postings: Posting[] = [
      { account_id: 'acc-cash', direction: 'money_in', amount: 60000 },
      { account_id: 'acc-bank', direction: 'money_in', amount: 40000 },
    ];

    const result = await recordTransactionWithPostings({
      type: 'Penjualan',
      description: 'Jual HP',
      detail: '{"x":1}',
      amount: 100000,
      postings,
    });

    expect(result).toBe('tx-123');
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('record_transaction_with_postings', {
      p_type: 'Penjualan',
      p_description: 'Jual HP',
      p_detail: '{"x":1}',
      p_amount: 100000,
      p_postings: [
        { account_id: 'acc-cash', direction: 'money_in', amount: 60000, note: '' },
        { account_id: 'acc-bank', direction: 'money_in', amount: 40000, note: '' },
      ],
    });
  });

  it('passes an empty postings array through unchanged and accepts null amount', async () => {
    rpcMock.mockResolvedValue({ data: 'tx-empty', error: null });

    const result = await recordTransactionWithPostings({
      type: 'Tukar Tambah',
      description: 'Tukar tanpa selisih',
      detail: '{}',
      amount: null,
      postings: [],
    });

    expect(result).toBe('tx-empty');
    expect(rpcMock).toHaveBeenCalledWith('record_transaction_with_postings', {
      p_type: 'Tukar Tambah',
      p_description: 'Tukar tanpa selisih',
      p_detail: '{}',
      p_amount: null,
      p_postings: [],
    });
  });

  it('rethrows the error returned by the RPC (atomic failure — nothing persisted)', async () => {
    const rpcError = new Error('record failed');
    rpcMock.mockResolvedValue({ data: null, error: rpcError });

    await expect(
      recordTransactionWithPostings({
        type: 'Penjualan',
        description: 'Jual HP',
        detail: '{}',
        amount: 100000,
        postings: [{ account_id: 'acc-cash', direction: 'money_in', amount: 100000 }],
      }),
    ).rejects.toBe(rpcError);
  });
});

describe('recordAgentPaymentWithPosting', () => {
  it('calls the RPC with the correct agent argument shape and returns data', async () => {
    rpcMock.mockResolvedValue({ data: 'atx-999', error: null });

    const result = await recordAgentPaymentWithPosting({
      agentId: 'agent-1',
      amount: 250000,
      method: 'Transfer',
      note: 'Setoran',
      accountId: 'acc-bank',
    });

    expect(result).toBe('atx-999');
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('record_agent_payment_with_posting', {
      p_agent_id: 'agent-1',
      p_amount: 250000,
      p_method: 'Transfer',
      p_note: 'Setoran',
      p_account_id: 'acc-bank',
    });
  });

  it('rethrows the error returned by the RPC (atomic failure — Req 9.6)', async () => {
    const rpcError = new Error('agent payment failed');
    rpcMock.mockResolvedValue({ data: null, error: rpcError });

    await expect(
      recordAgentPaymentWithPosting({
        agentId: 'agent-1',
        amount: 250000,
        method: 'Cash',
        note: '',
        accountId: 'acc-cash',
      }),
    ).rejects.toBe(rpcError);
  });
});

describe('recordPurchaseWithPostings', () => {
  it('passes optional agent debt to the purchase RPC', async () => {
    rpcMock.mockResolvedValue({ data: 'tx-purchase', error: null });

    const result = await recordPurchaseWithPostings({
      type: 'Pembelian',
      description: 'Agen - 1 unit iPhone 13',
      detail: '{}',
      amount: 5000000,
      postings: [],
      items: [
        {
          model: 'iPhone 13',
          capacity: '128GB',
          condition: 'Second iBox',
          color: 'Midnight',
          imei: '999999999999999',
          defect_description: '',
          price: 6500000,
          cost_price: 5000000,
          count: 1,
        },
      ],
      agentDebt: {
        agentId: 'agent-1',
        amount: 5000000,
        method: 'Hutang',
        note: 'Pembelian 1 unit iPhone 13',
      },
    });

    expect(result).toBe('tx-purchase');
    expect(rpcMock).toHaveBeenCalledWith('record_purchase_with_postings', {
      p_type: 'Pembelian',
      p_description: 'Agen - 1 unit iPhone 13',
      p_detail: '{}',
      p_amount: 5000000,
      p_postings: [],
      p_items: [
        {
          model: 'iPhone 13',
          capacity: '128GB',
          condition: 'Second iBox',
          color: 'Midnight',
          imei: '999999999999999',
          defect_description: '',
          price: 6500000,
          cost_price: 5000000,
          count: 1,
        },
      ],
      p_agent_debt: {
        agent_id: 'agent-1',
        amount: 5000000,
        method: 'Hutang',
        note: 'Pembelian 1 unit iPhone 13',
      },
    });
  });

  it('passes defect descriptions for minus stock items to the purchase RPC', async () => {
    rpcMock.mockResolvedValue({ data: 'tx-purchase', error: null });

    await recordPurchaseWithPostings({
      type: 'Pembelian',
      description: 'Agen - 1 unit iPhone 13',
      detail: '{}',
      amount: 5000000,
      postings: [],
      items: [
        {
          model: 'iPhone 13',
          capacity: '128GB',
          condition: 'Second Inter Unlock Minus',
          color: 'Midnight',
          imei: '999999999999999',
          price: 6500000,
          cost_price: 5000000,
          count: 1,
          defect_description: 'LCD ganti, Face ID off',
        },
      ],
    });

    expect(rpcMock).toHaveBeenCalledWith(
      'record_purchase_with_postings',
      expect.objectContaining({
        p_items: [
          expect.objectContaining({
            condition: 'Second Inter Unlock Minus',
            defect_description: 'LCD ganti, Face ID off',
          }),
        ],
      }),
    );
  });
});

describe('recordAccessoryPurchaseWithPostings', () => {
  it('passes inventory purchase postings and purchased accessories to the accessory purchase RPC', async () => {
    rpcMock.mockResolvedValue({ data: 'tx-accessory', error: null });

    const result = await recordAccessoryPurchaseWithPostings({
      type: 'Pembelian Pelengkap',
      description: 'Pembelian Pelengkap - 100 pcs Box iPhone 11',
      detail: '{"kind":"accessory_purchase"}',
      amount: 20_000_000,
      postings: [
        { account_id: 'acc-bank', direction: 'money_out', amount: 20_000_000 },
      ],
      accessories: [
        {
          name: 'Box iPhone 11',
          category: 'kotak',
          qty: 100,
          unit_cost: 200_000,
          min_stock: 10,
        },
      ],
    });

    expect(result).toBe('tx-accessory');
    expect(rpcMock).toHaveBeenCalledWith('record_accessory_purchase_with_postings', {
      p_type: 'Pembelian Pelengkap',
      p_description: 'Pembelian Pelengkap - 100 pcs Box iPhone 11',
      p_detail: '{"kind":"accessory_purchase"}',
      p_amount: 20_000_000,
      p_postings: [
        { account_id: 'acc-bank', direction: 'money_out', amount: 20_000_000, note: '' },
      ],
      p_accessories: [
        {
          id: null,
          name: 'Box iPhone 11',
          category: 'kotak',
          qty: 100,
          unit_cost: 200_000,
          min_stock: 10,
        },
      ],
    });
  });

  it('rethrows the error returned by the accessory purchase RPC', async () => {
    const rpcError = new Error('accessory purchase failed');
    rpcMock.mockResolvedValue({ data: null, error: rpcError });

    await expect(
      recordAccessoryPurchaseWithPostings({
        type: 'Pembelian Pelengkap',
        description: 'Pembelian Pelengkap',
        detail: '{}',
        amount: 1,
        postings: [],
        accessories: [
          {
            name: 'Charger',
            category: 'charger',
            qty: 1,
            unit_cost: 1,
          },
        ],
      }),
    ).rejects.toBe(rpcError);
  });
});
