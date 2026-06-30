// Feature: sales-discount (Phase 5) — DR HTM POS Penjualan discount flow
// Component tests for the discount behavior on the Sales (Penjualan) page.
//
// These reuse the proven setup from Penjualan.test.tsx verbatim: the same
// vi.mock of `@/services/postings` (recordTransactionWithPostings) and
// `@/services/accounts` (getAccountPickerData), the same MemoryRouter render,
// and the same assembly helpers (selectFirstUnit, setMoneyByLabel,
// selectCashAccount, assembleValidSale). Only the boundaries are mocked.
//
// Discount facts under test:
//   - Input label "Diskon / Potongan Harga" (Rupiah text input in Pembayaran).
//   - Finalize persists amount === NET total (subtotal − discount).
//   - An out-of-range discount (> subtotal) yields INVALID_DISCOUNT, so the
//     finalize gate (disabled={!validation.ok}) keeps the button disabled and
//     nothing is persisted.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import Penjualan from './Penjualan';
import { recordSaleWithPostings } from '@/services/postings';
import { getStockItems, type StockItem } from '@/services/stock';
import { getAccessories } from '@/services/accessories';
import { getAccountPickerData, type AccountWithBalance } from '@/services/accounts';

// ---------------------------------------------------------------------------
// Mock the persistence layer (same as Penjualan.test.tsx).
// ---------------------------------------------------------------------------
vi.mock('@/services/postings', () => ({
  recordSaleWithPostings: vi.fn(),
  recordTransactionWithPostings: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock stock loading (same as Penjualan.test.tsx).
// ---------------------------------------------------------------------------
vi.mock('@/services/stock', () => ({
  getStockItems: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock accessory loading (empty list — no bonus accessories in these tests).
// ---------------------------------------------------------------------------
vi.mock('@/services/accessories', () => ({
  getAccessories: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock account loading (same as Penjualan.test.tsx).
// ---------------------------------------------------------------------------
vi.mock('@/services/accounts', () => ({
  getAccountPickerData: vi.fn(),
}));

const mockRecord = vi.mocked(recordSaleWithPostings);
const mockGetStock = vi.mocked(getStockItems);
const mockGetAccounts = vi.mocked(getAccountPickerData);
const mockGetAccessories = vi.mocked(getAccessories);

// ---------------------------------------------------------------------------
// Account fixture: one active Cash account named "Kas".
// ---------------------------------------------------------------------------
const CASH_ACCOUNT: AccountWithBalance = {
  id: 'cash-1',
  name: 'Kas',
  type: 'Cash',
  opening_balance: 999_999_999,
  note: '',
  is_archived: false,
  created_at: new Date('2024-01-01T00:00:00.000Z').toISOString(),
  updated_at: new Date('2024-01-01T00:00:00.000Z').toISOString(),
  current_balance: 999_999_999,
  is_overdraft: false,
};

// ---------------------------------------------------------------------------
// Stock fixture: ONE READY unit (iPhone 14 Pro, 128GB, Second iBox, Deep
// Purple, price 12.5M). With a single unit and no other charges, the gross
// subtotal equals the unit price.
// ---------------------------------------------------------------------------
const STOCK_ITEM: StockItem = {
  id: 'stk-1',
  model: 'iPhone 14 Pro',
  capacity: '128GB',
  condition: 'Second iBox',
  color: 'Deep Purple',
  imei: '352345678901234',
  has_imei: true,
  status: 'READY',
  count: 1,
  price: 12_500_000,
  cost_price: 10_000_000,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const UNIT = {
  imei: '352345678901234',
  model: 'iPhone 14 Pro',
  capacity: '128GB',
  condition: 'Second iBox',
  color: 'Deep Purple',
  sellingPrice: 12_500_000,
} as const;

// Gross subtotal for the assembled sale (one unit, no extras).
const SUBTOTAL = UNIT.sellingPrice; // 12_500_000

// ---------------------------------------------------------------------------
// Render + interaction helpers (mirrored from Penjualan.test.tsx)
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter>
      <Penjualan />
    </MemoryRouter>,
  );
}

function getFinalizeButton(): HTMLButtonElement {
  return screen.getByRole('button', {
    name: /Simpan Penjualan|Menyimpan/,
  }) as HTMLButtonElement;
}

/** Expand the iPhone 14 Pro · 128GB stock group and select its first unit.
 *  Stock loads asynchronously, so wait for the group header to appear first. */
async function selectFirstUnit() {
  const headerParagraph = await screen.findByText(
    (_content, el) =>
      el?.tagName === 'P' &&
      !!el.textContent &&
      el.textContent.includes('iPhone 14 Pro') &&
      el.textContent.includes('128GB') &&
      !el.textContent.includes('Max'),
  );
  fireEvent.click(headerParagraph.closest('button')!);

  const pilihButtons = await screen.findAllByRole('button', { name: /\+ Pilih/ });
  fireEvent.click(pilihButtons[0]);
}

/** Set a money input identified by its visible label text. */
function setMoneyByLabel(labelText: string, digits: string) {
  const label = screen.getByText(labelText);
  const input = label.parentElement!.querySelector('input');
  expect(input).not.toBeNull();
  fireEvent.change(input!, { target: { value: digits } });
}

/**
 * Select the Cash account ("Kas") in the cash-portion AccountPicker. The picker
 * only renders once the cash portion is non-zero, so this must run after the
 * cash amount has been entered.
 */
async function selectCashAccount() {
  const group = await screen.findByRole('radiogroup', {
    name: 'Akun Kas (porsi cash)',
  });
  const radio = within(group).getByRole('radio');
  fireEvent.click(radio);
}

/**
 * Assemble a complete, valid cash-only sale: one unit selected (price 12.5M
 * from stock), cash payment covering the full transaction total, and the Cash
 * account selected in the picker. Because transfer = 0, only the Cash picker
 * appears.
 */
async function assembleValidSale() {
  await selectFirstUnit();
  setMoneyByLabel('Bayar Cash', String(UNIT.sellingPrice));
  await selectCashAccount();
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  mockGetStock.mockReset();
  mockGetStock.mockResolvedValue([STOCK_ITEM]);

  mockGetAccounts.mockReset();
  mockGetAccounts.mockResolvedValue([CASH_ACCOUNT]);

  mockGetAccessories.mockReset();
  mockGetAccessories.mockResolvedValue([]);

  mockRecord.mockReset();
  mockRecord.mockResolvedValue('tx-1');
});

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// Valid discount → net amount persisted
// ===========================================================================
describe('sales discount — valid discount persists the net amount', () => {
  it('finalizes with amount === subtotal − discount when the discount is within range', async () => {
    const DISCOUNT = 500_000;
    const NET = SUBTOTAL - DISCOUNT; // 12_000_000

    renderPage();
    // Assemble a valid sale first. Cash (12.5M) already covers the net (12M),
    // so the payment remains sufficient after the discount is applied.
    await assembleValidSale();

    // Enter a discount LESS than the subtotal.
    setMoneyByLabel('Diskon / Potongan Harga', String(DISCOUNT));

    // The totals breakdown reflects the discount and the net total.
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText('Diskon')).toBeInTheDocument();

    // Sale stays valid (payment 12.5M >= net 12M) → finalize is enabled.
    await waitFor(() => expect(getFinalizeButton()).toBeEnabled());
    fireEvent.click(getFinalizeButton());

    // Persistence is invoked once with the NET total as the amount.
    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'Penjualan', amount: NET }),
    );
  });
});

// ===========================================================================
// Out-of-range discount blocks finalize
// ===========================================================================
describe('sales discount — out-of-range discount blocks finalize', () => {
  it('disables "Simpan Penjualan" and persists nothing when the discount exceeds the subtotal', async () => {
    const OVER_DISCOUNT = SUBTOTAL + 500_000; // 13_000_000 > subtotal

    renderPage();
    await assembleValidSale();

    // Sanity: the sale is valid/finalizable before the bad discount.
    await waitFor(() => expect(getFinalizeButton()).toBeEnabled());

    // Enter a discount GREATER than the subtotal => INVALID_DISCOUNT.
    setMoneyByLabel('Diskon / Potongan Harga', String(OVER_DISCOUNT));

    // The breakdown still shows the Subtotal / Diskon lines.
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText('Diskon')).toBeInTheDocument();

    // The finalize gate closes (disabled={!validation.ok}) and nothing persists.
    await waitFor(() => expect(getFinalizeButton()).toBeDisabled());
    expect(mockRecord).not.toHaveBeenCalled();
  });
});
