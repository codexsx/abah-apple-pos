import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from './transactions';

const mocks = vi.hoisted(() => {
  const from = vi.fn();
  const insert = vi.fn();
  const select = vi.fn();
  const order = vi.fn();
  const rpc = vi.fn();
  return { from, insert, select, order, rpc };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

import {
  getTransactionChangeRequests,
  reviewTransactionChangeRequest,
  submitTransactionChangeRequest,
} from './transactionApprovals';

const transaction: Transaction = {
  id: 'tx-1',
  type: 'Pengeluaran',
  description: 'Operasional toko',
  detail: 'Biaya admin',
  amount: 25_000,
  created_at: '2026-07-02T10:00:00+07:00',
  staff_id: 'staff-1',
};

beforeEach(() => {
  mocks.from.mockReset();
  mocks.insert.mockReset();
  mocks.select.mockReset();
  mocks.order.mockReset();
  mocks.rpc.mockReset();

  mocks.from.mockReturnValue({
    insert: mocks.insert,
    select: mocks.select,
  });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.select.mockReturnValue({ order: mocks.order });
  mocks.order.mockResolvedValue({ data: [], error: null });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});

describe('transactionApprovals service', () => {
  it('submits a delete request with a transaction snapshot', async () => {
    await submitTransactionChangeRequest({
      transaction,
      action: 'delete',
      reason: '  Salah input transaksi  ',
      requestedBy: 'staff-1',
    });

    expect(mocks.from).toHaveBeenCalledWith('transaction_change_requests');
    expect(mocks.insert).toHaveBeenCalledWith({
      transaction_id: 'tx-1',
      action: 'delete',
      requested_by: 'staff-1',
      reason: 'Salah input transaksi',
      proposed_description: null,
      proposed_detail: null,
      proposed_amount: null,
      snapshot: {
        id: 'tx-1',
        type: 'Pengeluaran',
        description: 'Operasional toko',
        detail: 'Biaya admin',
        amount: 25_000,
        created_at: '2026-07-02T10:00:00+07:00',
        staff_id: 'staff-1',
      },
    });
  });

  it('rejects invalid edit requests before hitting Supabase', async () => {
    await expect(
      submitTransactionChangeRequest({
        transaction,
        action: 'edit',
        reason: '   ',
        requestedBy: 'staff-1',
        proposed: { description: 'Operasional toko' },
      }),
    ).rejects.toThrow('Alasan wajib diisi.');

    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('loads approval requests newest first', async () => {
    await getTransactionChangeRequests();

    expect(mocks.from).toHaveBeenCalledWith('transaction_change_requests');
    expect(mocks.select).toHaveBeenCalled();
    expect(mocks.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('reviews a request through the approval RPC', async () => {
    await reviewTransactionChangeRequest({
      requestId: 'req-1',
      decision: 'approved',
      reviewNote: 'OK',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('review_transaction_change_request', {
      p_request_id: 'req-1',
      p_decision: 'approved',
      p_review_note: 'OK',
    });
  });

  it('surfaces the approval RPC error message', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Pembelian tidak bisa dihapus karena ada unit dari pembelian ini yang sudah terjual.',
      },
    });

    await expect(
      reviewTransactionChangeRequest({
        requestId: 'req-1',
        decision: 'approved',
      }),
    ).rejects.toThrow('Pembelian tidak bisa dihapus karena ada unit dari pembelian ini yang sudah terjual.');
  });
});
