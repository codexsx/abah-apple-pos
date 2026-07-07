import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

const getTransactionsMock = vi.fn();
const getTransactionsWithStockDetailsByTypeMock = vi.fn();
const getAccountsMock = vi.fn();
const getStockItemsMock = vi.fn();
const getDailyClosingsMock = vi.fn();
const createDailyClosingMock = vi.fn();
const recordTransactionWithPostingsMock = vi.fn();

vi.mock('@/services/transactions', () => ({
  getTransactions: (...args: unknown[]) => getTransactionsMock(...args),
  getTransactionsWithStockDetailsByType: (...args: unknown[]) =>
    getTransactionsWithStockDetailsByTypeMock(...args),
  getTransactionsWithStockDetailsByTypes: (...args: unknown[]) =>
    getTransactionsWithStockDetailsByTypeMock(...args),
  getRecognizedSalesAmount: (tx: { amount: number | null }) => tx.amount ?? 0,
  getRecognizedSalesUnitCount: () => 1,
}));

vi.mock('@/services/accounts', () => ({
  getAccounts: (...args: unknown[]) => getAccountsMock(...args),
}));

vi.mock('@/services/stock', () => ({
  getStockItems: (...args: unknown[]) => getStockItemsMock(...args),
}));

vi.mock('@/services/dailyClosings', () => ({
  getDailyClosings: (...args: unknown[]) => getDailyClosingsMock(...args),
  createDailyClosing: (...args: unknown[]) => createDailyClosingMock(...args),
}));

vi.mock('@/services/postings', () => ({
  recordTransactionWithPostings: (...args: unknown[]) =>
    recordTransactionWithPostingsMock(...args),
}));

import TutupHarian from './TutupHarian';

type AccountFixture = {
  id: string;
  name: string;
  type: 'Cash' | 'Bank';
  opening_balance: number;
  note: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  current_balance: number;
  is_overdraft: boolean;
};

function makeAccount(overrides: Partial<AccountFixture> = {}): AccountFixture {
  return {
    id: 'cash-1',
    name: 'Kas Toko',
    type: 'Cash',
    opening_balance: 1_000_000,
    note: '',
    is_archived: false,
    created_at: '2026-06-30T00:00:00.000Z',
    updated_at: '2026-06-30T00:00:00.000Z',
    current_balance: 1_000_000,
    is_overdraft: false,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TutupHarian />
    </MemoryRouter>,
  );
}

async function openAdjustmentForm() {
  await screen.findByRole('heading', { name: 'Tutup Harian' });
  await screen.findByText('Penyesuaian Closing');
}

describe('TutupHarian closing adjustments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTransactionsMock.mockResolvedValue([]);
    getTransactionsWithStockDetailsByTypeMock.mockResolvedValue([]);
    getStockItemsMock.mockResolvedValue([]);
    getDailyClosingsMock.mockResolvedValue([]);
    createDailyClosingMock.mockResolvedValue({
      id: 'close-1',
      closing_date: '2026-07-01',
      summary: {},
      note: '',
      created_at: '2026-07-01T16:00:00.000Z',
    });
    recordTransactionWithPostingsMock.mockResolvedValue('tx-adjust-1');
  });

  it('records a closing minus as Pengeluaran with a money_out posting', async () => {
    getAccountsMock
      .mockResolvedValueOnce([
        makeAccount({ id: 'cash-1', name: 'Kas Toko', type: 'Cash', current_balance: 1_000_000 }),
        makeAccount({ id: 'bank-1', name: 'BCA', type: 'Bank', current_balance: 5_000_000 }),
      ])
      .mockResolvedValueOnce([
        makeAccount({ id: 'cash-1', name: 'Kas Toko', type: 'Cash', current_balance: 1_000_000 }),
        makeAccount({ id: 'bank-1', name: 'BCA', type: 'Bank', current_balance: 4_980_000 }),
      ]);

    const user = userEvent.setup();
    renderPage();
    await openAdjustmentForm();

    await user.selectOptions(screen.getByLabelText('Akun Penyesuaian'), 'bank-1');
    await user.click(screen.getByRole('button', { name: /Selisih Minus/i }));
    await user.type(screen.getByLabelText('Nominal Selisih'), '20000');
    await user.type(screen.getByLabelText('Alasan Penyesuaian'), 'Biaya admin bank');
    await user.click(screen.getByRole('button', { name: /Catat Penyesuaian/i }));

    await waitFor(() => expect(recordTransactionWithPostingsMock).toHaveBeenCalledTimes(1));
    const call = recordTransactionWithPostingsMock.mock.calls[0][0];
    expect(call).toMatchObject({
      type: 'Pengeluaran',
      description: 'Penyesuaian Closing - Biaya admin bank',
      amount: 20_000,
      postings: [{ account_id: 'bank-1', direction: 'money_out', amount: 20_000 }],
    });
    const detail = JSON.parse(call.detail);
    expect(detail).toMatchObject({
      kind: 'pengeluaran',
      category: 'Penyesuaian Closing',
      note: 'Biaya admin bank',
      accountId: 'bank-1',
      accountName: 'BCA',
      adjustment: 'minus',
    });
    expect(detail.closingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await screen.findByText('Penyesuaian minus berhasil dicatat.')).toBeInTheDocument();
  });

  it('records a closing plus as Pemasukan Lain with a money_in posting', async () => {
    getAccountsMock
      .mockResolvedValueOnce([
        makeAccount({ id: 'cash-1', name: 'Kas Toko', type: 'Cash', current_balance: 1_000_000 }),
      ])
      .mockResolvedValueOnce([
        makeAccount({ id: 'cash-1', name: 'Kas Toko', type: 'Cash', current_balance: 1_050_000 }),
      ]);

    const user = userEvent.setup();
    renderPage();
    await openAdjustmentForm();

    await user.selectOptions(screen.getByLabelText('Akun Penyesuaian'), 'cash-1');
    const form = screen.getByRole('region', { name: /Penyesuaian Closing/i });
    expect(within(form).getByRole('button', { name: /Selisih Plus/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.type(screen.getByLabelText('Nominal Selisih'), '50000');
    await user.type(screen.getByLabelText('Alasan Penyesuaian'), 'Kas fisik lebih');
    await user.click(screen.getByRole('button', { name: /Catat Penyesuaian/i }));

    await waitFor(() => expect(recordTransactionWithPostingsMock).toHaveBeenCalledTimes(1));
    const call = recordTransactionWithPostingsMock.mock.calls[0][0];
    expect(call).toMatchObject({
      type: 'Pemasukan Lain',
      description: 'Penyesuaian Closing - Kas fisik lebih',
      amount: 50_000,
      postings: [{ account_id: 'cash-1', direction: 'money_in', amount: 50_000 }],
    });
    const detail = JSON.parse(call.detail);
    expect(detail).toMatchObject({
      kind: 'pemasukan_lain',
      source: 'Penyesuaian Closing',
      note: 'Kas fisik lebih',
      accountId: 'cash-1',
      accountName: 'Kas Toko',
      adjustment: 'plus',
    });
    expect(await screen.findByText('Penyesuaian plus berhasil dicatat.')).toBeInTheDocument();
  });
});
