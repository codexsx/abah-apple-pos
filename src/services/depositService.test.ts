// Feature: DR HTM POS Phase 4 — service additions
// Unit tests for recordAccountTransfer (RPC wrapper) and getAgentBalanceBreakdown
// (pure debt/paid summation delegating to depositCore).

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { recordAccountTransfer } from './postings';
import { getAgentBalanceBreakdown, type AgentTransaction } from './agents';

// Mock supabase once for the whole file. recordAccountTransfer needs rpc();
// agents.ts imports @/lib/supabase at module top, so this keeps that import
// resolvable even though getAgentBalanceBreakdown never touches the client.
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

import { supabase } from '@/lib/supabase';

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  rpcMock.mockReset();
});

// Helper to build a minimal valid AgentTransaction fixture.
function makeTx(
  type: AgentTransaction['type'],
  amount: number,
  id = `tx-${Math.random().toString(36).slice(2)}`,
): AgentTransaction {
  return {
    id,
    agent_id: 'agent-1',
    type,
    amount,
    method: 'Cash',
    note: '',
    created_at: '2024-01-01T00:00:00.000Z',
  };
}

// ---------- A. recordAccountTransfer ----------

describe('recordAccountTransfer', () => {
  it('calls the RPC with the correct argument shape and returns the source reference', async () => {
    rpcMock.mockResolvedValue({ data: 'Transfer Saldo:abc', error: null });

    const result = await recordAccountTransfer({
      amount: 500000,
      fromAccountId: 'acc-cash',
      toAccountId: 'acc-bank',
      note: 'setor',
    });

    expect(result).toBe('Transfer Saldo:abc');
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('record_account_transfer', {
      p_amount: 500000,
      p_from_account_id: 'acc-cash',
      p_to_account_id: 'acc-bank',
      p_note: 'setor',
    });
  });

  it('defaults p_note to an empty string when note is omitted', async () => {
    rpcMock.mockResolvedValue({ data: 'Transfer Saldo:xyz', error: null });

    await recordAccountTransfer({
      amount: 500000,
      fromAccountId: 'acc-cash',
      toAccountId: 'acc-bank',
    });

    expect(rpcMock).toHaveBeenCalledWith('record_account_transfer', {
      p_amount: 500000,
      p_from_account_id: 'acc-cash',
      p_to_account_id: 'acc-bank',
      p_note: '',
    });
  });

  it('rethrows the error returned by the RPC (atomic failure — nothing persisted)', async () => {
    const rpcError = new Error('transfer failed');
    rpcMock.mockResolvedValue({ data: null, error: rpcError });

    await expect(
      recordAccountTransfer({
        amount: 500000,
        fromAccountId: 'acc-cash',
        toAccountId: 'acc-bank',
        note: 'setor',
      }),
    ).rejects.toBe(rpcError);
  });
});

// ---------- B. getAgentBalanceBreakdown ----------

describe('getAgentBalanceBreakdown', () => {
  it('reports positive outstandingDebt and zero depositCredit when debt exceeds paid', () => {
    const txs: AgentTransaction[] = [
      makeTx('Koreksi', 100000),
      makeTx('Stor/Bayar', 30000),
    ];

    const result = getAgentBalanceBreakdown(txs);

    expect(result.outstandingDebt).toBe(70000);
    expect(result.depositCredit).toBe(0);
    expect(result.net).toBe(70000);
  });

  it('reports positive depositCredit and zero outstandingDebt on overpayment', () => {
    const txs: AgentTransaction[] = [
      makeTx('Koreksi', 50000),
      makeTx('Stor/Bayar', 80000),
    ];

    const result = getAgentBalanceBreakdown(txs);

    expect(result.depositCredit).toBe(30000);
    expect(result.outstandingDebt).toBe(0);
    expect(result.net).toBe(-30000);
  });

  it('counts Penyesuaian as debt (any type other than Stor/Bayar increases debt)', () => {
    const txs: AgentTransaction[] = [
      makeTx('Penyesuaian', 40000),
      makeTx('Stor/Bayar', 10000),
    ];

    const result = getAgentBalanceBreakdown(txs);

    expect(result.outstandingDebt).toBe(30000);
    expect(result.depositCredit).toBe(0);
    expect(result.net).toBe(30000);
  });
});
