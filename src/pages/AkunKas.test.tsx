// Feature: financial-accounts
// Component tests for the "Akun & Kas" management page (AkunKas.tsx).
//
// The service module is mocked so the page's data-loading behavior is fully
// controllable, while the pure core (accountsCore) is used for real so display
// helpers like isOverdraft behave exactly as in production. The page navigates
// via react-router's useNavigate, so renders are wrapped in <MemoryRouter>.
//
// Covers: renders accounts with name/type/balance (Req 9.1), empty state with
// Tambah Akun (Req 9.3), overdraft warning (Req 8.3), archived label only on
// archived accounts (Req 9.7), ledger view via getLedgerEntries with entries
// and empty state (Req 9.4/9.5), and per-account actions present (Req 9.6).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

// ---- Mock the service layer ----------------------------------------------
// Every async function becomes a controllable vi.fn(). AccountHasHistoryError
// is provided as a real class so `err instanceof AccountHasHistoryError`
// checks in the page behave correctly.
const getAccountsMock = vi.fn();
const getLedgerEntriesMock = vi.fn();
const createAccountMock = vi.fn();
const updateAccountMock = vi.fn();
const archiveAccountMock = vi.fn();
const reactivateAccountMock = vi.fn();
const deleteAccountMock = vi.fn();
const recordManualAdjustmentMock = vi.fn();

vi.mock('@/services/accounts', () => {
  class AccountHasHistoryError extends Error {
    constructor(message = 'Akun yang memiliki riwayat tidak dapat dihapus.') {
      super(message);
      this.name = 'AccountHasHistoryError';
    }
  }
  return {
    getAccounts: (...args: unknown[]) => getAccountsMock(...args),
    getLedgerEntries: (...args: unknown[]) => getLedgerEntriesMock(...args),
    createAccount: (...args: unknown[]) => createAccountMock(...args),
    updateAccount: (...args: unknown[]) => updateAccountMock(...args),
    archiveAccount: (...args: unknown[]) => archiveAccountMock(...args),
    reactivateAccount: (...args: unknown[]) => reactivateAccountMock(...args),
    deleteAccount: (...args: unknown[]) => deleteAccountMock(...args),
    recordManualAdjustment: (...args: unknown[]) => recordManualAdjustmentMock(...args),
    AccountHasHistoryError,
  };
});

// Import after the mock is registered. accountsCore is intentionally NOT
// mocked — isOverdraft / validateAccountInput run for real.
import AkunKas from './AkunKas';

// ---- Fixtures --------------------------------------------------------------

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
    id: 'acc-1',
    name: 'Kas Toko',
    type: 'Cash',
    opening_balance: 1_000_000,
    note: '',
    is_archived: false,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    current_balance: 1_000_000,
    is_overdraft: false,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<{
  id: string;
  account_id: string;
  direction: 'money_in' | 'money_out';
  amount: number;
  source_reference: string;
  note: string;
  created_at: string;
}> = {}) {
  return {
    id: 'led-1',
    account_id: 'acc-1',
    direction: 'money_in' as const,
    amount: 50_000,
    source_reference: 'manual_adjustment',
    note: 'setoran awal',
    created_at: '2024-02-01T10:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AkunKas />
    </MemoryRouter>,
  );
}

/** Wait for and return the expandable account card toggle button by name. */
function accountToggle(name: string | RegExp) {
  return screen.findByRole('button', { name });
}

describe('AkunKas page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Sensible defaults; individual tests override as needed.
    getAccountsMock.mockResolvedValue([]);
    getLedgerEntriesMock.mockResolvedValue([]);
  });

  it('renders accounts with name, type, and balance after load (Req 9.1)', async () => {
    getAccountsMock.mockResolvedValue([
      makeAccount({ id: 'a1', name: 'BCA', type: 'Bank', current_balance: 2_500_000 }),
      makeAccount({ id: 'a2', name: 'Kas Toko', type: 'Cash', current_balance: 750_000 }),
    ]);

    renderPage();

    // Names render once data resolves.
    expect(await screen.findByRole('heading', { name: 'BCA' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Kas Toko' })).toBeInTheDocument();

    // Type badges and formatted balances are present.
    expect(screen.getByText('Bank')).toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('Rp 2.500.000')).toBeInTheDocument();
    expect(screen.getByText('Rp 750.000')).toBeInTheDocument();
  });

  it('shows an empty state with a Tambah Akun action when there are no accounts (Req 9.3)', async () => {
    getAccountsMock.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('Belum ada akun')).toBeInTheDocument();
    // The empty state still offers a way to add an account. (Header also has
    // one, so there is at least one such action available.)
    const addActions = screen.getAllByRole('button', { name: /Tambah Akun/ });
    expect(addActions.length).toBeGreaterThanOrEqual(1);
  });

  it('shows an overdraft warning for an account with a negative balance (Req 8.3)', async () => {
    getAccountsMock.mockResolvedValue([
      makeAccount({ id: 'a1', name: 'Kas Minus', current_balance: -25_000, is_overdraft: true }),
    ]);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Kas Minus' })).toBeInTheDocument();
    expect(screen.getByText('Overdraft')).toBeInTheDocument();
    // Negative balance is rendered with a leading minus.
    expect(screen.getByText('-Rp 25.000')).toBeInTheDocument();
  });

  it('shows the "Diarsipkan" label only on archived accounts (Req 9.7)', async () => {
    getAccountsMock.mockResolvedValue([
      makeAccount({ id: 'a1', name: 'Akun Aktif', is_archived: false }),
      makeAccount({ id: 'a2', name: 'Akun Arsip', is_archived: true }),
    ]);

    renderPage();

    await screen.findByRole('heading', { name: 'Akun Aktif' });

    // Exactly one archived label, and it belongs to the archived card.
    const labels = screen.getAllByText('Diarsipkan');
    expect(labels).toHaveLength(1);

    const activeCard = await accountToggle(/Akun Aktif/);
    expect(within(activeCard).queryByText('Diarsipkan')).toBeNull();
  });

  it('loads and displays ledger entries when an account is expanded (Req 9.4)', async () => {
    getAccountsMock.mockResolvedValue([
      makeAccount({ id: 'a1', name: 'Kas Toko', current_balance: 1_000_000 }),
    ]);
    getLedgerEntriesMock.mockResolvedValue([
      makeEntry({ id: 'l1', direction: 'money_in', amount: 200_000, source_reference: 'manual_adjustment', note: 'topup' }),
      makeEntry({ id: 'l2', direction: 'money_out', amount: 50_000, source_reference: 'manual_adjustment', note: 'beli bensin' }),
    ]);

    const user = userEvent.setup();
    renderPage();

    await user.click(await accountToggle(/Kas Toko/));

    // The page requests entries for that account (default limit 50).
    await waitFor(() => expect(getLedgerEntriesMock).toHaveBeenCalledWith('a1', 50));

    // Entry fields render: direction labels, notes, and source references.
    expect(await screen.findByText('topup')).toBeInTheDocument();
    expect(screen.getByText('beli bensin')).toBeInTheDocument();
    expect(screen.getByText('Masuk')).toBeInTheDocument();
    expect(screen.getByText('Keluar')).toBeInTheDocument();
  });

  it('shows the ledger empty state when an expanded account has no entries (Req 9.5)', async () => {
    getAccountsMock.mockResolvedValue([
      makeAccount({ id: 'a1', name: 'Kas Kosong', current_balance: 0 }),
    ]);
    getLedgerEntriesMock.mockResolvedValue([]);

    const user = userEvent.setup();
    renderPage();

    await user.click(await accountToggle(/Kas Kosong/));

    await waitFor(() => expect(getLedgerEntriesMock).toHaveBeenCalledWith('a1', 50));
    expect(await screen.findByText('Belum ada transaksi di akun ini')).toBeInTheDocument();
  });

  it('exposes edit / archive / delete / adjustment actions for an active account (Req 9.6)', async () => {
    getAccountsMock.mockResolvedValue([
      makeAccount({ id: 'a1', name: 'Kas Toko', is_archived: false }),
    ]);

    const user = userEvent.setup();
    renderPage();

    await user.click(await accountToggle(/Kas Toko/));

    expect(await screen.findByRole('button', { name: /Penyesuaian/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Arsipkan/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hapus/ })).toBeInTheDocument();
  });

  it('shows the "Aktifkan" action instead of "Arsipkan" for an archived account (Req 9.6)', async () => {
    getAccountsMock.mockResolvedValue([
      makeAccount({ id: 'a1', name: 'Akun Arsip', is_archived: true }),
    ]);

    const user = userEvent.setup();
    renderPage();

    await user.click(await accountToggle(/Akun Arsip/));

    expect(await screen.findByRole('button', { name: /Aktifkan/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Arsipkan$/ })).toBeNull();
  });
});
