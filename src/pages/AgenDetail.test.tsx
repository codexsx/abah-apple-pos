import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';

import { resolveActionParam } from './AgenDetail';

/* ------------------------------------------------------------------ */
/*  Service mock                                                       */
/*                                                                     */
/*  getAgentById / getAgentTransactions are mocked so the component    */
/*  renders deterministically without touching Supabase. getAgentBalance*/
/*  is kept as the REAL implementation (via importActual) so the        */
/*  sign-based label logic is exercised end-to-end.                     */
/* ------------------------------------------------------------------ */

vi.mock('@/services/agents', async (importActual) => {
  const actual = await importActual<typeof import('@/services/agents')>();
  return {
    ...actual,
    getAgentById: vi.fn(),
    getAgentTransactions: vi.fn(),
    createAgentTransaction: vi.fn(),
  };
});

/*
 * Posting service mock. Stor/Bayar routes through the atomic RPC wrapper
 * recordAgentPaymentWithPosting; it resolves to the new agent_transaction id.
 */
vi.mock('@/services/postings', () => ({
  recordAgentPaymentWithPosting: vi.fn().mockResolvedValue('new-atx-id'),
}));

/*
 * Accounts service mock. Only getAccountPickerData is consumed by AgenDetail
 * (via the AccountPicker for Stor/Bayar). It resolves to one Cash and one Bank
 * account so the picker can render selectable options of each type.
 */
vi.mock('@/services/accounts', () => ({
  getAccountPickerData: vi.fn(),
}));

// Imported after vi.mock so these reference the mocked functions.
import {
  getAgentById,
  getAgentTransactions,
  createAgentTransaction,
  type Agent,
  type AgentTransaction,
} from '@/services/agents';
import { recordAgentPaymentWithPosting } from '@/services/postings';
import { getAccountPickerData, type AccountWithBalance } from '@/services/accounts';
import AgenDetail from './AgenDetail';

const mockGetAgentById = vi.mocked(getAgentById);
const mockGetAgentTransactions = vi.mocked(getAgentTransactions);
const mockCreateAgentTransaction = vi.mocked(createAgentTransaction);
const mockRecordAgentPaymentWithPosting = vi.mocked(recordAgentPaymentWithPosting);
const mockGetAccountPickerData = vi.mocked(getAccountPickerData);

/* ------------------------------------------------------------------ */
/*  Task 1.2 — Property 1: Valid URL params resolve to canonical types */
/* ------------------------------------------------------------------ */

const VALID_PARAMS = [
  'stor',
  'koreksi',
  'penyesuaian',
  'Stor/Bayar',
  'Koreksi',
  'Penyesuaian',
] as const;

const CANONICAL_TYPES = ['Stor/Bayar', 'Koreksi', 'Penyesuaian'] as const;

describe('resolveActionParam — Property 1: valid URL param resolution', () => {
  // Feature: phase0-critical-bugfixes, Property 1: Valid URL params always resolve to canonical types
  // Validates: Requirements 1.1, 1.2, 1.3
  it('resolves every valid URL param to one of the canonical transaction types', () => {
    fc.assert(
      fc.property(fc.constantFrom(...VALID_PARAMS), (param) => {
        const result = resolveActionParam(param);
        expect(CANONICAL_TYPES).toContain(result as (typeof CANONICAL_TYPES)[number]);
      }),
      { numRuns: 100 },
    );
  });

  it('maps each lowercase shortcut to its exact canonical type', () => {
    expect(resolveActionParam('stor')).toBe('Stor/Bayar');
    expect(resolveActionParam('koreksi')).toBe('Koreksi');
    expect(resolveActionParam('penyesuaian')).toBe('Koreksi');
    // Stor/Bayar and Koreksi resolve to themselves; Penyesuaian is aliased to Koreksi.
    expect(resolveActionParam('Stor/Bayar')).toBe('Stor/Bayar');
    expect(resolveActionParam('Koreksi')).toBe('Koreksi');
    expect(resolveActionParam('Penyesuaian')).toBe('Koreksi');
  });
});

/* ------------------------------------------------------------------ */
/*  Task 1.3 — Property 2: Unknown URL params resolve to null          */
/* ------------------------------------------------------------------ */

describe('resolveActionParam — Property 2: unknown URL param resolution', () => {
  // Feature: phase0-critical-bugfixes, Property 2: Invalid URL params always resolve to null
  // Validates: Requirements 1.4
  it('resolves any string outside the valid param set to null', () => {
    const validSet = new Set<string>(VALID_PARAMS);
    fc.assert(
      fc.property(
        fc.string().filter((s) => !validSet.has(s)),
        (param) => {
          expect(resolveActionParam(param)).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('resolves null/empty input to null', () => {
    expect(resolveActionParam(null)).toBeNull();
    expect(resolveActionParam('')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Task 3.2 — Unit tests: balance label logic                         */
/*  Validates: Requirements 2.2, 2.3, 2.4                              */
/* ------------------------------------------------------------------ */

const FAKE_AGENT: Agent = {
  id: 'test-id',
  code: 'AG01',
  name: 'Agen Uji',
  phone: '081234567890',
  note: 'catatan',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

function makeTx(
  type: AgentTransaction['type'],
  amount: number,
): AgentTransaction {
  return {
    id: `${type}-${amount}`,
    agent_id: FAKE_AGENT.id,
    type,
    amount,
    method: 'Cash',
    note: '',
    created_at: '2024-01-01T00:00:00.000Z',
  };
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/agen/test-id']}>
      <Routes>
        <Route path="/agen/:id" element={<AgenDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AgenDetail — balance label logic', () => {
  beforeEach(() => {
    mockGetAgentById.mockReset();
    mockGetAgentTransactions.mockReset();
    mockGetAgentById.mockResolvedValue(FAKE_AGENT);
  });

  it('shows "Sisa Hutang" when the balance is positive (Req 2.2)', async () => {
    // Koreksi adds debt; no Stor/Bayar => balance = 50000 > 0.
    mockGetAgentTransactions.mockResolvedValue([makeTx('Koreksi', 50000)]);

    renderDetail();

    const label = await screen.findByText('Sisa Hutang');
    // Scope the value assertion to the balance card so it does not collide with
    // the same amount rendered in the transaction history row.
    const card = label.closest('div.rounded-2xl') as HTMLElement;
    expect(within(card).getByText('Rp 50.000')).toBeInTheDocument();
    expect(screen.queryByText('LUNAS')).not.toBeInTheDocument();
    expect(screen.queryByText('Saldo Deposit')).not.toBeInTheDocument();
  });

  it('shows "LUNAS" when the balance is exactly zero (Req 2.3)', async () => {
    // No transactions => balance = 0.
    mockGetAgentTransactions.mockResolvedValue([]);

    renderDetail();

    expect(await screen.findByText('LUNAS')).toBeInTheDocument();
    expect(screen.queryByText('Sisa Hutang')).not.toBeInTheDocument();
    expect(screen.queryByText('Saldo Deposit')).not.toBeInTheDocument();
  });

  it('shows "Saldo Deposit" with the absolute value when the balance is negative (Req 2.4)', async () => {
    // Stor/Bayar exceeds debt => overpayment => deposit credit = 25000.
    mockGetAgentTransactions.mockResolvedValue([makeTx('Stor/Bayar', 25000)]);

    renderDetail();

    const label = await screen.findByText('Saldo Deposit');
    // Absolute value of the negative balance is displayed, scoped to the
    // balance card to avoid collision with the transaction history row.
    const card = label.closest('div.rounded-2xl') as HTMLElement;
    expect(within(card).getByText('Rp 25.000')).toBeInTheDocument();
    expect(screen.queryByText('Sisa Hutang')).not.toBeInTheDocument();
    expect(screen.queryByText('LUNAS')).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Task 12.2 — Stor/Bayar posting + Koreksi/Penyesuaian no-posting     */
/*  Validates: Requirements 9.1, 9.2, 9.4, 9.5                          */
/* ------------------------------------------------------------------ */

const CASH_ACCOUNT: AccountWithBalance = {
  id: 'acc-cash',
  name: 'Kas Toko',
  type: 'Cash',
  opening_balance: 0,
  note: '',
  is_archived: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  current_balance: 100000,
  is_overdraft: false,
};

const BANK_ACCOUNT: AccountWithBalance = {
  id: 'acc-bank',
  name: 'Bank BCA',
  type: 'Bank',
  opening_balance: 0,
  note: '',
  is_archived: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  current_balance: 500000,
  is_overdraft: false,
};

describe('AgenDetail — action submission (posting vs no-posting)', () => {
  beforeEach(() => {
    mockGetAgentById.mockReset();
    mockGetAgentTransactions.mockReset();
    mockCreateAgentTransaction.mockReset();
    mockRecordAgentPaymentWithPosting.mockReset();
    mockGetAccountPickerData.mockReset();

    mockGetAgentById.mockResolvedValue(FAKE_AGENT);
    mockGetAgentTransactions.mockResolvedValue([]);
    mockCreateAgentTransaction.mockResolvedValue(makeTx('Koreksi', 1));
    mockRecordAgentPaymentWithPosting.mockResolvedValue('new-atx-id');
    mockGetAccountPickerData.mockResolvedValue([CASH_ACCOUNT, BANK_ACCOUNT]);
  });

  it('Stor/Bayar with a selected account calls recordAgentPaymentWithPosting once (Req 9.1, 9.2)', async () => {
    const user = userEvent.setup();
    renderDetail();

    // Wait for the page to finish loading before interacting.
    await screen.findByText('Stor / Bayar');

    // Open the Stor/Bayar action form.
    await user.click(screen.getByRole('button', { name: /Stor \/ Bayar/i }));

    // Enter an amount.
    const amountInput = await screen.findByPlaceholderText('0');
    await user.type(amountInput, '75000');

    // Default method is Cash → the Cash account picker is shown. Select the
    // Cash account (radio option labeled by its name).
    const cashOption = await screen.findByRole('radio', { name: /Kas Toko/i });
    await user.click(cashOption);

    // Submit the form.
    await user.click(screen.getByRole('button', { name: /Simpan Stor\/Bayar/i }));

    expect(mockRecordAgentPaymentWithPosting).toHaveBeenCalledTimes(1);
    expect(mockRecordAgentPaymentWithPosting).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: FAKE_AGENT.id,
        amount: 75000,
        method: 'Cash',
        accountId: CASH_ACCOUNT.id,
      }),
    );
    expect(mockCreateAgentTransaction).not.toHaveBeenCalled();
  });

  it('Stor/Bayar without a selected account is rejected and persists nothing (Req 9.5)', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('Stor / Bayar');

    await user.click(screen.getByRole('button', { name: /Stor \/ Bayar/i }));

    const amountInput = await screen.findByPlaceholderText('0');
    await user.type(amountInput, '50000');

    // Do NOT select an account, submit directly.
    await user.click(screen.getByRole('button', { name: /Simpan Stor\/Bayar/i }));

    // A validation message is shown and nothing is persisted.
    expect(
      await screen.findByText('Pilih akun kas untuk pembayaran ini'),
    ).toBeInTheDocument();
    expect(mockRecordAgentPaymentWithPosting).not.toHaveBeenCalled();
    expect(mockCreateAgentTransaction).not.toHaveBeenCalled();
  });

  it('Koreksi calls createAgentTransaction with no posting (Req 9.4)', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByRole('button', { name: /Koreksi \/ Penyesuaian/i });

    // Open the Koreksi action form.
    await user.click(screen.getByRole('button', { name: /Koreksi \/ Penyesuaian/i }));

    const amountInput = await screen.findByPlaceholderText('0');
    await user.type(amountInput, '30000');

    const noteInput = screen.getByPlaceholderText('Catatan transaksi...');
    await user.type(noteInput, 'penyesuaian stok');

    await user.click(screen.getByRole('button', { name: /Simpan Koreksi/i }));

    expect(mockCreateAgentTransaction).toHaveBeenCalledTimes(1);
    expect(mockCreateAgentTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: FAKE_AGENT.id,
        type: 'Koreksi',
        amount: 30000,
        note: 'penyesuaian stok',
      }),
    );
    // Koreksi must never route through the posting RPC.
    expect(mockRecordAgentPaymentWithPosting).not.toHaveBeenCalled();
  });
});
