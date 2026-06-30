import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';

/* ------------------------------------------------------------------ */
/*  Service mocks (mirror AgenDetail.test.tsx)                         */
/*                                                                     */
/*  getAgentById / getAgentTransactions / createAgentTransaction are    */
/*  mocked so the component renders deterministically without touching  */
/*  Supabase. getAgentBalanceBreakdown + formatAgentPhone are kept REAL  */
/*  (via importActual) so the deposit/breakdown display reflects the     */
/*  mocked transactions end-to-end through the pure depositCore.         */
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

vi.mock('@/services/postings', () => ({
  recordAgentPaymentWithPosting: vi.fn().mockResolvedValue('new-atx-id'),
}));

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
/*  Fixtures                                                           */
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

function makeTx(type: AgentTransaction['type'], amount: number): AgentTransaction {
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

const CASH_ACCOUNT: AccountWithBalance = {
  id: 'cash-1',
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
  id: 'bank-1',
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

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/agen/test-id']}>
      <Routes>
        <Route path="/agen/:id" element={<AgenDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/*  Phase 4 — deposit / breakdown behavior                             */
/* ------------------------------------------------------------------ */

describe('AgenDetail — deposit / breakdown behavior (Phase 4)', () => {
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

  it('shows "Saldo Deposit" with the deposit credit when the agent is overpaid', async () => {
    // Koreksi 50000 (debt) + Stor/Bayar 80000 (paid) => depositCredit 30000.
    mockGetAgentTransactions.mockResolvedValue([
      makeTx('Koreksi', 50000),
      makeTx('Stor/Bayar', 80000),
    ]);

    renderDetail();

    const label = await screen.findByText('Saldo Deposit');
    // Scope the value assertion to the balance card so it does not collide with
    // the same amounts rendered in the transaction history rows.
    const card = label.closest('div.rounded-2xl') as HTMLElement;
    expect(within(card).getByText(/Rp\s*30\.000/)).toBeInTheDocument();
    expect(screen.queryByText('Sisa Hutang')).not.toBeInTheDocument();
    expect(screen.queryByText('LUNAS')).not.toBeInTheDocument();
  });

  it('shows the "Kelebihan jadi deposit" notice for an overpayment and submits the FULL amount', async () => {
    const user = userEvent.setup();
    // Koreksi 100000, no payments => outstandingDebt 100000.
    mockGetAgentTransactions.mockResolvedValue([makeTx('Koreksi', 100000)]);

    renderDetail();

    // Wait for the page to finish loading before interacting.
    await screen.findByText('Stor / Bayar');

    // Open the Stor/Bayar action form.
    await user.click(screen.getByRole('button', { name: /Stor \/ Bayar/i }));

    // Enter an amount ABOVE the debt (150000 > 100000 => surplus 50000).
    const amountInput = await screen.findByPlaceholderText('0');
    await user.type(amountInput, '150000');

    // The breakdown info box surfaces the surplus-as-deposit notice.
    const notice = await screen.findByText(/Kelebihan jadi deposit/i);
    expect(notice).toBeInTheDocument();
    expect(within(notice).getByText(/Rp\s*50\.000/)).toBeInTheDocument();

    // Default method is Cash → select the Cash account (filterType Cash).
    const cashOption = await screen.findByRole('radio', { name: /Kas Toko/i });
    await user.click(cashOption);

    // Submit the form — posts the FULL amount, not just the owed portion.
    await user.click(screen.getByRole('button', { name: /Simpan Stor\/Bayar/i }));

    expect(mockRecordAgentPaymentWithPosting).toHaveBeenCalledTimes(1);
    expect(mockRecordAgentPaymentWithPosting).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: FAKE_AGENT.id,
        amount: 150000,
        method: 'Cash',
        accountId: CASH_ACCOUNT.id,
      }),
    );
  });
});
