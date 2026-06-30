// Feature: agent-supplier-deposit
// Page test for the Pengeluaran "Transfer Uang" (setor tunai) tab (Phase 4).
// Validates: inter-account transfer persistence + same-account rejection.
//
// The transfer tab moves a balance between two active accounts via
// recordAccountTransfer (an atomic money_out source / money_in destination
// move). These tests switch to the transfer tab, drive a valid transfer
// end-to-end, and confirm that selecting the same account on both sides
// surfaces the validation alert without calling the service.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import { type AccountWithBalance } from '@/services/accounts';

// ---------- Fixtures ----------

function makeAccount(
  overrides: Partial<AccountWithBalance> = {},
): AccountWithBalance {
  return {
    id: 'acc-default',
    name: 'Default Account',
    type: 'Cash',
    opening_balance: 0,
    note: '',
    is_archived: false,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    current_balance: 0,
    is_overdraft: false,
    ...overrides,
  };
}

const cashAccount = makeAccount({
  id: 'cash-1',
  name: 'Kas Toko',
  type: 'Cash',
  current_balance: 5000000,
});

const bankAccount = makeAccount({
  id: 'bank-1',
  name: 'BCA',
  type: 'Bank',
  current_balance: 12000000,
});

// ---------- Mocks ----------

// Mock the accounts service so the page never reaches Supabase; the pickers
// (both unfiltered) receive a Cash + a Bank account.
const getAccountPickerDataMock = vi.fn();
vi.mock('@/services/accounts', () => ({
  getAccountPickerData: () => getAccountPickerDataMock(),
}));

// Mock the postings service to observe the atomic transfer call. Both named
// exports the page imports are provided so the import resolves.
const recordAccountTransferMock = vi.fn();
const recordTransactionWithPostingsMock = vi.fn();
vi.mock('@/services/postings', () => ({
  recordAccountTransfer: (input: unknown) => recordAccountTransferMock(input),
  recordTransactionWithPostings: (input: unknown) =>
    recordTransactionWithPostingsMock(input),
}));

import Pengeluaran from './Pengeluaran';

function renderPage() {
  return render(
    <MemoryRouter>
      <Pengeluaran />
    </MemoryRouter>,
  );
}

/**
 * Switch to the transfer tab and wait for it to settle. The pengeluaran tab
 * animates out via AnimatePresence (mode="wait"), so we wait until both
 * radiogroups are present and only the single transfer "JUMLAH *" Rp input
 * remains (the outgoing tab's two Rp inputs have unmounted).
 */
async function openTransferTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Transfer Uang/i }));
  await screen.findByRole('radiogroup', { name: 'Ke Rekening/Kas' });
  await waitFor(() =>
    expect(screen.getAllByPlaceholderText('0')).toHaveLength(1),
  );
}

/** Set the "JUMLAH *" RupiahInput value (the only Rp input on the transfer tab). */
function setJumlah(amount: number) {
  const input = screen.getByPlaceholderText('0') as HTMLInputElement;
  fireEvent.change(input, { target: { value: String(amount) } });
}

describe('Pengeluaran — Transfer Uang tab (setor tunai)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAccountPickerDataMock.mockResolvedValue([cashAccount, bankAccount]);
    recordAccountTransferMock.mockResolvedValue('tx-transfer-1');
  });

  it('records a valid transfer from the source account to the destination account', async () => {
    const user = userEvent.setup();
    renderPage();

    // Wait for the picker data to load so accounts become selectable.
    await waitFor(() => expect(getAccountPickerDataMock).toHaveBeenCalled());

    await openTransferTab(user);

    // Enter the transfer amount.
    setJumlah(500000);

    // Select source = Kas Toko in the "Dari Rekening/Kas" radiogroup.
    const fromGroup = await screen.findByRole('radiogroup', {
      name: 'Dari Rekening/Kas',
    });
    await user.click(within(fromGroup).getByRole('radio', { name: /Kas Toko/ }));

    // Select destination = BCA in the "Ke Rekening/Kas" radiogroup.
    const toGroup = screen.getByRole('radiogroup', { name: 'Ke Rekening/Kas' });
    await user.click(within(toGroup).getByRole('radio', { name: /BCA/ }));

    // Save.
    await user.click(screen.getByRole('button', { name: /Simpan Transfer/i }));

    // The transfer service is called exactly once with the chosen accounts and amount.
    await waitFor(() =>
      expect(recordAccountTransferMock).toHaveBeenCalledTimes(1),
    );
    expect(recordAccountTransferMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 500000,
        fromAccountId: 'cash-1',
        toAccountId: 'bank-1',
      }),
    );
  });

  it('rejects a same-account transfer with a validation alert and does not persist', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(getAccountPickerDataMock).toHaveBeenCalled());

    await openTransferTab(user);

    setJumlah(500000);

    // Select the SAME account (Kas Toko) on both source and destination.
    const fromGroup = await screen.findByRole('radiogroup', {
      name: 'Dari Rekening/Kas',
    });
    await user.click(within(fromGroup).getByRole('radio', { name: /Kas Toko/ }));

    const toGroup = screen.getByRole('radiogroup', { name: 'Ke Rekening/Kas' });
    await user.click(within(toGroup).getByRole('radio', { name: /Kas Toko/ }));

    await user.click(screen.getByRole('button', { name: /Simpan Transfer/i }));

    // The same-account validation message is surfaced in a role="alert"...
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(
      'Rekening sumber dan tujuan harus berbeda',
    );

    // ...and nothing was persisted.
    expect(recordAccountTransferMock).not.toHaveBeenCalled();
  });
});
