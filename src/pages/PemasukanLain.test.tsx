// Feature: transaction-account-integration (Phase 2) — task 9.2
// Component tests for the Pemasukan Lain (other income) finalization flow now
// that persistence goes through the atomic posting path.
//
// Validates: Requirements 6.3, 6.7
//
// These tests drive the real PemasukanLain page through realistic interactions
// (picking a jenis, entering a cash amount, selecting a Cash account) and mock
// only the boundaries:
//   - `recordTransactionWithPostings` (persistence) so we can assert on the
//     exact payload without touching Supabase, and
//   - `getAccountPickerData` (account loading) so the AccountPicker has a
//     selectable Cash account.
// The pure posting core (`@/services/paymentPosting`) is exercised for real.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import PemasukanLain from './PemasukanLain';
import { recordTransactionWithPostings } from '@/services/postings';
import { getAccountPickerData, type AccountWithBalance } from '@/services/accounts';

// ---------------------------------------------------------------------------
// Mock the persistence layer. PemasukanLain imports
// `recordTransactionWithPostings` from this module; replace it with a
// controllable vi.fn() that resolves to a fake transaction id.
// ---------------------------------------------------------------------------
vi.mock('@/services/postings', () => ({
  recordTransactionWithPostings: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock account loading. PemasukanLain calls `getAccountPickerData()` on mount
// and feeds the result to the AccountPicker(s). Expose one active Cash account
// and one active Bank account. The `AccountWithBalance` type re-export stays
// real (type-only, erased at compile time).
// ---------------------------------------------------------------------------
vi.mock('@/services/accounts', () => ({
  getAccountPickerData: vi.fn(),
}));

const mockRecord = vi.mocked(recordTransactionWithPostings);
const mockGetAccounts = vi.mocked(getAccountPickerData);

// ---------------------------------------------------------------------------
// Account fixtures matching the real AccountWithBalance shape.
// ---------------------------------------------------------------------------
function makeAccount(overrides: Partial<AccountWithBalance> = {}): AccountWithBalance {
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

const CASH_ACCOUNT = makeAccount({
  id: 'cash-1',
  name: 'Kas Toko',
  type: 'Cash',
  current_balance: 1_000_000,
});

const BANK_ACCOUNT = makeAccount({
  id: 'bank-1',
  name: 'BCA',
  type: 'Bank',
  current_balance: 5_000_000,
});

// ---------------------------------------------------------------------------
// Render + interaction helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter>
      <PemasukanLain />
    </MemoryRouter>,
  );
}

function getSaveButton(): HTMLButtonElement {
  return screen.getByRole('button', {
    name: /Simpan Pemasukan|Menyimpan/,
  }) as HTMLButtonElement;
}

/** Open the jenis CustomSelect and pick the option with the given label. */
function selectJenis(label: string) {
  fireEvent.click(screen.getByRole('button', { name: /Pilih jenis pemasukan/ }));
  fireEvent.click(screen.getByRole('button', { name: label }));
}

/** Set a money input identified by its visible (uppercase) label text. */
function setMoneyByLabel(labelText: string, digits: string) {
  const label = screen.getByText(labelText);
  const input = label.parentElement!.querySelector('input');
  expect(input).not.toBeNull();
  fireEvent.change(input!, { target: { value: digits } });
}

/** Select the Cash account in the cash-portion AccountPicker (rendered once the cash portion is non-zero). */
async function selectCashAccount() {
  const group = await screen.findByRole('radiogroup', {
    name: 'Akun tujuan (porsi cash)',
  });
  fireEvent.click(within(group).getByRole('radio', { name: /Kas Toko/ }));
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  mockGetAccounts.mockReset();
  mockGetAccounts.mockResolvedValue([CASH_ACCOUNT, BANK_ACCOUNT]);

  mockRecord.mockReset();
  mockRecord.mockResolvedValue('tx-pemasukan-1');
});

// ===========================================================================
// Valid submit (Req 6.3, 6.7)
// ===========================================================================
describe('valid submit (Req 6.3, 6.7)', () => {
  it('persists a Pemasukan Lain income transaction with a money_in posting to the selected cash account', async () => {
    renderPage();

    // Wait for the on-mount account load to resolve.
    await waitFor(() => expect(mockGetAccounts).toHaveBeenCalled());

    // Fill jenis, enter a cash amount, then pick the Cash account.
    selectJenis('Tambahan Modal');
    setMoneyByLabel('MASUK CASH', '500000');
    await selectCashAccount();

    fireEvent.click(getSaveButton());

    // Persistence invoked exactly once.
    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));

    const call = mockRecord.mock.calls[0][0];
    expect(call.type).toBe('Pemasukan Lain');
    expect(call.amount).toBe(500_000);

    // Income → a single money_in posting to the selected cash account.
    expect(call.postings).toHaveLength(1);
    expect(call.postings[0]).toMatchObject({
      account_id: CASH_ACCOUNT.id,
      direction: 'money_in',
      amount: 500_000,
    });

    // Success confirmation appears.
    expect(await screen.findByText('Pemasukan tersimpan')).toBeInTheDocument();
  });
});

// ===========================================================================
// Invalid selection (Req 6.7 — finalization validation gate)
// ===========================================================================
describe('invalid selection (Req 6.7)', () => {
  it('surfaces a validation message and persists nothing when no cash account is selected', async () => {
    renderPage();

    await waitFor(() => expect(mockGetAccounts).toHaveBeenCalled());

    // Valid EXCEPT the account selection: jenis chosen and a cash amount entered,
    // but the Cash account is left unselected.
    selectJenis('Tambahan Modal');
    setMoneyByLabel('MASUK CASH', '500000');

    fireEvent.click(getSaveButton());

    // The CASH_ACCOUNT_REQUIRED validation message is surfaced.
    expect(
      await screen.findByText('Pilih akun kas untuk porsi cash'),
    ).toBeInTheDocument();

    // Nothing persisted and no confirmation shown.
    expect(mockRecord).not.toHaveBeenCalled();
    expect(screen.queryByText('Pemasukan tersimpan')).not.toBeInTheDocument();
  });
});
