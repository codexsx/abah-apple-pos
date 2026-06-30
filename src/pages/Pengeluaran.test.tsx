// Feature: transaction-account-integration
// Page test for the Pengeluaran expense tab (task 8.2).
// Validates: Requirements 6.2, 6.7
//
// The expense tab persists via recordTransactionWithPostings as a money_out
// flow, showing a Cash/Bank AccountPicker for each non-zero portion. These
// tests drive a valid expense end-to-end and confirm that an unselected
// account surfaces the validation message without calling the service.
// The inter-account "Transfer Uang" tab is out of Phase 2 scope.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  name: 'BCA Operasional',
  type: 'Bank',
  current_balance: 12000000,
});

// ---------- Mocks ----------

// Mock the accounts service so the page never reaches Supabase; the picker is
// fed a Cash + a Bank account.
const getAccountPickerDataMock = vi.fn();
vi.mock('@/services/accounts', () => ({
  getAccountPickerData: () => getAccountPickerDataMock(),
}));

// Mock the postings service to observe the atomic persistence call.
const recordTransactionWithPostingsMock = vi.fn();
vi.mock('@/services/postings', () => ({
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

/** Open the kategori CustomSelect and pick an option by its visible label. */
async function selectKategori(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('button', { name: /Pilih kategori/ }));
  await user.click(await screen.findByText(label));
}

/** The first Rp-prefixed numeric input is "BAYAR CASH", the second is transfer. */
function cashInput(): HTMLInputElement {
  return screen.getAllByPlaceholderText('0')[0] as HTMLInputElement;
}

function transferInput(): HTMLInputElement {
  return screen.getAllByPlaceholderText('0')[1] as HTMLInputElement;
}

describe('Pengeluaran — expense tab persistence (Requirements 6.2, 6.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAccountPickerDataMock.mockResolvedValue([cashAccount, bankAccount]);
    recordTransactionWithPostingsMock.mockResolvedValue('tx-1');
  });

  it('records a valid cash expense as a money_out posting to the selected cash account', async () => {
    const user = userEvent.setup();
    renderPage();

    // Wait for the picker data to load so the Cash account becomes selectable.
    await waitFor(() => expect(getAccountPickerDataMock).toHaveBeenCalled());

    // Choose a kategori via the CustomSelect.
    await selectKategori(user, 'Operasional Toko');

    // Enter a cash amount; this reveals the "Akun Sumber Dana" cash picker.
    await user.type(cashInput(), '50000');

    // Select the Cash account in the picker.
    const cashOption = await screen.findByRole('radio', { name: /Kas Toko/ });
    await user.click(cashOption);

    // Save.
    await user.click(screen.getByRole('button', { name: /Simpan Pengeluaran/ }));

    // The service is called exactly once with a Pengeluaran money_out posting
    // to the selected cash account for the entered amount.
    await waitFor(() =>
      expect(recordTransactionWithPostingsMock).toHaveBeenCalledTimes(1),
    );
    expect(recordTransactionWithPostingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Pengeluaran',
        amount: 50000,
        postings: expect.arrayContaining([
          expect.objectContaining({
            account_id: 'cash-1',
            direction: 'money_out',
            amount: 50000,
          }),
        ]),
      }),
    );
  });

  it('shows the bank account picker and records transfer expenses to the selected bank account', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(getAccountPickerDataMock).toHaveBeenCalled());
    expect(await screen.findByText('Akun Bank')).toBeTruthy();

    await selectKategori(user, 'Operasional Toko');
    await user.type(transferInput(), '75000');

    const bankOption = await screen.findByRole('radio', { name: /BCA Operasional/ });
    await user.click(bankOption);

    await user.click(screen.getByRole('button', { name: /Simpan Pengeluaran/ }));

    await waitFor(() =>
      expect(recordTransactionWithPostingsMock).toHaveBeenCalledTimes(1),
    );
    expect(recordTransactionWithPostingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Pengeluaran',
        amount: 75000,
        postings: expect.arrayContaining([
          expect.objectContaining({
            account_id: 'bank-1',
            direction: 'money_out',
            amount: 75000,
          }),
        ]),
      }),
    );
  });

  it('shows the validation message and does not persist when no account is selected', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(getAccountPickerDataMock).toHaveBeenCalled());

    // Valid kategori + cash amount, but deliberately no account selected.
    await selectKategori(user, 'Operasional Toko');
    await user.type(cashInput(), '50000');

    await user.click(screen.getByRole('button', { name: /Simpan Pengeluaran/ }));

    // The cash-account-required message is surfaced...
    expect(
      await screen.findByText('Pilih akun kas untuk porsi cash'),
    ).toBeTruthy();

    // ...and nothing was persisted.
    expect(recordTransactionWithPostingsMock).not.toHaveBeenCalled();
  });
});
