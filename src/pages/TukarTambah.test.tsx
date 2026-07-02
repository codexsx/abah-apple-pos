// Feature: transaction-account-integration (Phase 2) + Phase 11 stock wiring
// Page test for the Tukar Tambah finalization flow now that persistence goes
// through the atomic tukar-tambah posting path that ALSO moves stock.
//
// These tests drive the real TukarTambah page through the UI (consumer detail,
// HP Masuk specs incl. 15-digit IMEI, HP Keluar stock selection, garansi,
// payment, and account picker) and mock only the boundaries:
//   - `recordTukarTambahWithPostings` (persistence) so we can assert the exact
//     payload, including the sold HP Keluar id and the HP Masuk trade-in item,
//   - `getStockItems` (live READY stock) so the HP Keluar list has a unit, and
//   - `getAccountPickerData` (account loading) so the AccountPicker has a
//     selectable Cash account.
//
// The behavior under test is the Selisih-driven money direction (Req 7.3, 7.4,
// 7.8) and the resulting persistence call (Req 6.5, 6.6):
//   - positive Selisih (price > appraisal) → money_in, amount = |Selisih|
//   - negative Selisih (appraisal > price) → money_out, amount = |Selisih|
//   - zero Selisih (price === appraisal)   → transaction recorded, no postings
// plus the Phase 11 stock effects: the chosen HP Keluar row id is passed as
// `sellStockId` and the HP Masuk specs become the `newItem` trade-in.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import TukarTambah from './TukarTambah';
import { recordTukarTambahWithPostings } from '@/services/postings';
import { getStockItems, type StockItem } from '@/services/stock';
import { getAccountPickerData, type AccountWithBalance } from '@/services/accounts';

// ---------------------------------------------------------------------------
// Mock the persistence layer. TukarTambah imports `recordTukarTambahWithPostings`
// from this module; we replace it with a controllable vi.fn().
// ---------------------------------------------------------------------------
vi.mock('@/services/postings', () => ({
  recordTukarTambahWithPostings: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock live stock loading. TukarTambah calls `getStockItems()` on mount and
// keeps only READY rows for the HP Keluar list.
// ---------------------------------------------------------------------------
vi.mock('@/services/stock', () => ({
  getStockItems: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock account loading. TukarTambah calls `getAccountPickerData()` on mount and
// feeds the result to the AccountPicker. We expose one active Cash account and
// one active Bank account (matching the real `AccountWithBalance` shape).
// ---------------------------------------------------------------------------
vi.mock('@/services/accounts', () => ({
  getAccountPickerData: vi.fn(),
}));

const mockRecord = vi.mocked(recordTukarTambahWithPostings);
const mockGetStock = vi.mocked(getStockItems);
const mockGetAccounts = vi.mocked(getAccountPickerData);

const CASH_ACCOUNT: AccountWithBalance = {
  id: 'cash-1',
  name: 'Kas Toko',
  type: 'Cash',
  opening_balance: 1_000_000,
  note: '',
  is_archived: false,
  created_at: new Date('2024-01-01T00:00:00.000Z').toISOString(),
  updated_at: new Date('2024-01-01T00:00:00.000Z').toISOString(),
  current_balance: 1_000_000,
  is_overdraft: false,
};

const BANK_ACCOUNT: AccountWithBalance = {
  id: 'bank-1',
  name: 'BCA',
  type: 'Bank',
  opening_balance: 5_000_000,
  note: '',
  is_archived: false,
  created_at: new Date('2024-01-01T00:00:00.000Z').toISOString(),
  updated_at: new Date('2024-01-01T00:00:00.000Z').toISOString(),
  current_balance: 5_000_000,
  is_overdraft: false,
};

// HP Keluar fixture: a single READY stock unit the page should list & sell.
const HP_KELUAR: StockItem = {
  id: 'stk-1',
  model: 'iPhone XR',
  capacity: '128GB',
  condition: 'Second iBox',
  color: 'Coral',
  imei: '352345678901234',
  has_imei: true,
  status: 'READY',
  count: 1,
  price: 3_500_000,
  cost_price: 3_000_000,
  created_at: new Date('2024-01-01T00:00:00.000Z').toISOString(),
  updated_at: new Date('2024-01-01T00:00:00.000Z').toISOString(),
};

const HP_KELUAR_LABEL = `${HP_KELUAR.model} ${HP_KELUAR.capacity}`; // 'iPhone XR 128GB'

// ---------------------------------------------------------------------------
// Render + interaction helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter>
      <TukarTambah />
    </MemoryRouter>,
  );
}

function getSaveButton(): HTMLButtonElement {
  return screen.getByRole('button', {
    name: /Simpan Tukar Tambah|Menyimpan/,
  }) as HTMLButtonElement;
}

/** Set a <select> identified by its FormSelect label text. */
function setSelectByLabel(labelText: string, value: string) {
  const label = screen.getByText((content, element) => {
    if (element?.tagName.toLowerCase() !== 'label') return false;
    return content.replace(/\s+\*$/, '') === labelText;
  });
  const select = label.parentElement!.querySelector('select');
  expect(select).not.toBeNull();
  fireEvent.change(select!, { target: { value } });
}

/** Set a PriceInput identified by its label text (digits only). */
function setPriceByLabel(labelText: string, digits: string) {
  const label = screen.getByText(labelText);
  const input = label.parentElement!.querySelector('input');
  expect(input).not.toBeNull();
  fireEvent.change(input!, { target: { value: digits } });
}

/** Select an HP Keluar unit from the (async-loaded) stock list by its label. */
async function selectHpKeluar(modelCapacity: string) {
  const p = await screen.findByText(modelCapacity);
  const row = p.closest('.cursor-pointer');
  expect(row).not.toBeNull();
  const pilih = within(row as HTMLElement).getByRole('button', { name: 'Pilih' });
  fireEvent.click(pilih);
}

/**
 * Fill the required HP Masuk specs + consumer detail + garansi for a valid form.
 * `appraisal` drives the Selisih sign relative to the HP Keluar price.
 */
async function fillCommonFields(appraisal: number) {
  fireEvent.change(screen.getByPlaceholderText('Pak Bambang'), {
    target: { value: 'Bu Sari' },
  });
  // Tipe must be set before Warna (changing tipe resets warna).
  setSelectByLabel('Tipe HP', 'iPhone 11');
  setSelectByLabel('Kapasitas', '128GB');
  setSelectByLabel('Kondisi', 'Second iBox');
  setSelectByLabel('Warna', 'Black');
  fireEvent.change(screen.getByPlaceholderText('123456789012345'), {
    target: { value: '123456789012345' },
  });
  setPriceByLabel('Appraisal Toko', String(appraisal));
  await selectHpKeluar(HP_KELUAR_LABEL);
  setSelectByLabel('Garansi', '30 Hari');
}

/** Pick the (only) Cash account in the rendered cash-portion AccountPicker. */
async function selectCashAccount() {
  const group = await screen.findByRole('radiogroup');
  const radio = within(group).getByRole('radio');
  fireEvent.click(radio);
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  mockGetStock.mockReset();
  mockGetStock.mockResolvedValue([HP_KELUAR]);

  mockGetAccounts.mockReset();
  mockGetAccounts.mockResolvedValue([CASH_ACCOUNT, BANK_ACCOUNT]);

  mockRecord.mockReset();
  mockRecord.mockResolvedValue('tt-1');
});

// ===========================================================================
// Positive Selisih → money_in (Req 6.5, 7.3) + stock wiring (Phase 11)
// ===========================================================================
describe('HP Keluar search', () => {
  it('filters ready stock by IMEI', async () => {
    const matchingByImei: StockItem = {
      ...HP_KELUAR,
      id: 'stk-imei-match',
      model: 'iPhone 14 Pro',
      capacity: '128GB',
      condition: 'Second Inter Unlock Minus',
      color: 'Silver',
      imei: '356011269135262',
      price: 8_000_000,
      cost_price: 6_000_000,
    };
    const nonMatching: StockItem = {
      ...HP_KELUAR,
      id: 'stk-imei-other',
      model: 'iPhone 11',
      capacity: '128GB',
      condition: 'Second Inter Unlock Minus',
      color: 'Black',
      imei: '359481985375087',
      price: 3_300_000,
      cost_price: 2_600_000,
    };

    mockGetStock.mockResolvedValueOnce([nonMatching, matchingByImei]);

    renderPage();

    expect(await screen.findByText('iPhone 14 Pro 128GB')).toBeInTheDocument();
    expect(screen.getByText('iPhone 11 128GB')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Cari tipe/i), {
      target: { value: '356011269135262' },
    });

    expect(await screen.findByText('iPhone 14 Pro 128GB')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('iPhone 11 128GB')).not.toBeInTheDocument();
    });
  });
});

describe('positive Selisih (HP keluar price > appraisal)', () => {
  it('records a money_in posting with amount = |Selisih| and moves stock', async () => {
    renderPage();

    // appraisal 3_000_000, price 3_500_000 → Selisih = +500_000 (customer pays).
    await fillCommonFields(3_000_000);
    const absSelisih = HP_KELUAR.price - 3_000_000; // 500_000

    // Pay the full |Selisih| via cash; the Cash picker appears once cash > 0.
    setPriceByLabel('Cash', String(absSelisih));
    await selectCashAccount();

    await waitFor(() => expect(getSaveButton()).toBeEnabled());
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));

    const call = mockRecord.mock.calls[0][0];
    expect(call.type).toBe('Tukar Tambah');
    expect(call.amount).toBe(absSelisih);
    expect(call.postings).toEqual([
      { account_id: CASH_ACCOUNT.id, direction: 'money_in', amount: absSelisih },
    ]);
    // Phase 11: the chosen HP Keluar row is sold, the HP Masuk becomes a trade-in.
    expect(call.sellStockId).toBe(HP_KELUAR.id);
    expect(call.newItem).toMatchObject({
      model: 'iPhone 11',
      capacity: '128GB',
      condition: 'Second iBox',
      color: 'Black',
      imei: '123456789012345',
      price: 3_000_000,
      count: 1,
    });
  });
});

// ===========================================================================
// Negative Selisih → money_out (Req 6.5, 7.4)
// ===========================================================================
describe('negative Selisih (appraisal > HP keluar price)', () => {
  it('records a money_out posting with amount equal to |Selisih|', async () => {
    renderPage();

    // appraisal 5_000_000, price 3_500_000 → Selisih = -1_500_000 (shop pays).
    await fillCommonFields(5_000_000);
    const absSelisih = 5_000_000 - HP_KELUAR.price; // 1_500_000

    setPriceByLabel('Cash', String(absSelisih));
    await selectCashAccount();

    await waitFor(() => expect(getSaveButton()).toBeEnabled());
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));

    const call = mockRecord.mock.calls[0][0];
    expect(call.type).toBe('Tukar Tambah');
    expect(call.amount).toBe(absSelisih);
    expect(call.postings).toEqual([
      { account_id: CASH_ACCOUNT.id, direction: 'money_out', amount: absSelisih },
    ]);
    expect(call.sellStockId).toBe(HP_KELUAR.id);
  });
});

// ===========================================================================
// Zero Selisih → no postings, no account required (Req 6.6, 7.8)
// ===========================================================================
describe('zero Selisih (HP keluar price === appraisal)', () => {
  it('records the transaction with empty postings and requires no account', async () => {
    renderPage();

    // appraisal === price → Selisih = 0. No payment and no account picker.
    await fillCommonFields(HP_KELUAR.price);

    // No cash/transfer entered and no AccountPicker rendered.
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();

    await waitFor(() => expect(getSaveButton()).toBeEnabled());
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));

    const call = mockRecord.mock.calls[0][0];
    expect(call.type).toBe('Tukar Tambah');
    expect(call.amount).toBe(0);
    expect(call.postings).toEqual([]);
    // Stock still moves even when no money changes hands.
    expect(call.sellStockId).toBe(HP_KELUAR.id);
  });
});
