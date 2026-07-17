// Feature: transaction-account-integration (Phase 2) — task 6.2
// Unit / integration / component tests for the Sales (Penjualan) finalization
// flow now that persistence goes through the atomic posting path.
//
// These tests drive the real Penjualan page through realistic interactions
// (selecting a unit via Browse Stok, entering payment, picking a Cash account)
// and mock only the boundaries:
//   - `recordTransactionWithPostings` (persistence) so we control
//     success / failure / timeout deterministically, and
//   - `getAccountPickerData` (account loading) so the AccountPicker has a
//     selectable Cash account.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  act,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import Penjualan from './Penjualan';
import { recordSaleWithPostings } from '@/services/postings';
import { getStockItems, type StockItem } from '@/services/stock';
import { getAccessories } from '@/services/accessories';
import { getAccountPickerData, type AccountWithBalance } from '@/services/accounts';
import {
  computeTransactionTotal,
  serializeSaleDetail,
  toSaleDetail,
  buildDescription,
  type AssembledSale,
} from '@/services/finalization';

// ---------------------------------------------------------------------------
// Mock the persistence layer. Penjualan now imports `recordSaleWithPostings`
// from this module (it flips sold units to TERJUAL atomically); we replace it
// with a controllable vi.fn() that resolves to a fake transaction id.
// ---------------------------------------------------------------------------
vi.mock('@/services/postings', () => ({
  recordSaleWithPostings: vi.fn(),
  recordTransactionWithPostings: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock stock loading. Penjualan calls `getStockItems()` on mount and keeps the
// READY rows to build its browse/IMEI groups. We expose a single READY unit.
// ---------------------------------------------------------------------------
vi.mock('@/services/stock', () => ({
  getStockItems: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock accessory loading. Penjualan calls `getAccessories()` on mount to back
// the item/bonus pickers with real DB rows. We default it to an empty list so
// these sale scenarios (no bonus accessories) stay deterministic and offline.
// ---------------------------------------------------------------------------
vi.mock('@/services/accessories', () => ({
  getAccessories: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock account loading. Penjualan calls `getAccountPickerData()` on mount and
// feeds the result to the AccountPicker. We expose a single active Cash account
// so the cash-only sale can select it. The `AccountWithBalance` type re-export
// stays real (it's type-only).
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
// Stock fixture: ONE READY unit matching the original mock fixtures used by
// these tests (iPhone 14 Pro, 128GB, Second iBox, Deep Purple, price 12.5M).
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

const BULK_STOCK_ITEM: StockItem = {
  id: 'stk-bulk',
  model: 'iPhone 11',
  capacity: '128GB',
  condition: 'Second Inter Unlock',
  color: 'Random',
  imei: null,
  has_imei: false,
  status: 'READY',
  count: 10,
  price: 4_200_000,
  cost_price: 3_000_000,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Stock fixture: satu unit iPad READY — unit tunggal berseri; Serial Number
// (uppercase) disimpan di field `imei`, kategori 'IPAD'.
// ---------------------------------------------------------------------------
const IPAD_STOCK_ITEM: StockItem = {
  id: 'stk-ipad-1',
  model: 'iPad Pro 11',
  capacity: '256GB',
  condition: 'Second iBox',
  color: 'Space Gray',
  imei: 'DMR9X2ABCD',
  has_imei: true,
  device_category: 'IPAD',
  status: 'READY',
  count: 1,
  price: 8_500_000,
  cost_price: 7_000_000,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const CHARGER_ACCESSORY = {
  id: 'acc-charger',
  name: 'Charger Original',
  category: 'charger' as const,
  stock: 4,
  status: 'AMAN' as const,
  min_stock: 1,
  price: 75_000,
};

const BOX_IPHONE_11_ACCESSORY = {
  id: 'acc-box-iphone-11',
  name: 'Box iPhone 11',
  category: 'kotak' as const,
  stock: 100,
  status: 'AMAN' as const,
  min_stock: 5,
  price: 200_000,
};

const BOX_IPHONE_14_ACCESSORY = {
  id: 'acc-box-iphone-14',
  name: 'Box iPhone 14 Pro',
  category: 'kotak' as const,
  stock: 686,
  status: 'AMAN' as const,
  min_stock: 5,
  price: 250_000,
};

// ---------------------------------------------------------------------------
// Fixtures derived from the READY stock row above.
// ---------------------------------------------------------------------------
const UNIT = {
  imei: '352345678901234',
  model: 'iPhone 14 Pro',
  capacity: '128GB',
  condition: 'Second iBox',
  color: 'Deep Purple',
  sellingPrice: 12_500_000,
} as const;

/** The AssembledSale the UI produces after `assembleValidSale()` runs. */
const expectedSale: AssembledSale = {
  units: [{ ...UNIT }],
  manualSalePrice: 0,
  imeiActivationPrice: 0,
  items: [],
  bonuses: [],
  warranty: null,
  customerName: null,
  customerPhone: null,
  payment: { cash: UNIT.sellingPrice, transfer: 0 },
};

// ---------------------------------------------------------------------------
// Render + interaction helpers
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

async function selectBulkUnit() {
  const headerParagraph = await screen.findByText(
    (_content, el) =>
      el?.tagName === 'P' &&
      !!el.textContent &&
      el.textContent.includes('iPhone 11') &&
      el.textContent.includes('128GB'),
  );
  fireEvent.click(headerParagraph.closest('button')!);

  const pilihButton = await screen.findByRole('button', { name: /\+ Pilih/ });
  fireEvent.click(pilihButton);
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
// Finalize gate (Req 1.4)
// ===========================================================================
describe('finalize gate (Req 1.4)', () => {
  it('disables "Simpan Penjualan" for an invalid sale and enables it once a valid sale is assembled', async () => {
    renderPage();

    // No units selected on initial render => sale invalid => button disabled.
    expect(getFinalizeButton()).toBeDisabled();

    // Assemble a valid sale: select a unit (price > 0), pay the full total, and
    // pick the Cash account.
    await assembleValidSale();

    await waitFor(() => expect(getFinalizeButton()).toBeEnabled());
  });

  it('keeps the button disabled when payment is insufficient', async () => {
    renderPage();
    await selectFirstUnit();
    // Pay less than the transaction total -> still invalid.
    setMoneyByLabel('Bayar Cash', '1000');

    await waitFor(() => expect(getFinalizeButton()).toBeDisabled());
  });
});

// ===========================================================================
// Persistence wiring (Req 3.2, 4.1, 4.2)
// ===========================================================================
describe('persistence wiring (Req 3.2, 4.1, 4.2)', () => {
  it('calls recordTransactionWithPostings once with the Penjualan type, amount, detail, description, and a money_in posting to the cash account, then shows the confirmation', async () => {
    renderPage();
    await assembleValidSale();

    await waitFor(() => expect(getFinalizeButton()).toBeEnabled());
    fireEvent.click(getFinalizeButton());

    // Persistence is invoked exactly once with values produced by the pure builders.
    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));

    const expectedAmount = computeTransactionTotal(expectedSale);
    const expectedDetail = serializeSaleDetail(toSaleDetail(expectedSale));
    const expectedDescription = buildDescription(null, 1);

    expect(expectedAmount).toBe(UNIT.sellingPrice);
    expect(mockRecord).toHaveBeenCalledWith({
      type: 'Penjualan',
      description: expectedDescription,
      detail: expectedDetail,
      amount: expectedAmount,
      postings: [
        {
          account_id: CASH_ACCOUNT.id,
          direction: 'money_in',
          amount: UNIT.sellingPrice,
        },
      ],
      stockIds: ['stk-1'],
      accessories: [],
    });

    // The single posting is income → money_in to the selected cash account.
    const call = mockRecord.mock.calls[0][0];
    expect(call.postings).toHaveLength(1);
    expect(call.postings[0]).toMatchObject({
      account_id: CASH_ACCOUNT.id,
      direction: 'money_in',
      amount: UNIT.sellingPrice,
    });

    // Confirmation (ConfirmationView + Receipt) appears on success.
    expect(await screen.findByText('Penjualan Berhasil')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('surfaces the validation message and persists nothing when no cash account is selected', async () => {
    renderPage();
    // Valid sale EXCEPT the account selection: select a unit and pay full cash,
    // but do NOT pick the Cash account.
    await selectFirstUnit();
    setMoneyByLabel('Bayar Cash', String(UNIT.sellingPrice));

    await waitFor(() => expect(getFinalizeButton()).toBeEnabled());
    fireEvent.click(getFinalizeButton());

    // The mapped CASH_ACCOUNT_REQUIRED message is surfaced.
    expect(
      await screen.findByText('Pilih akun kas untuk porsi cash'),
    ).toBeInTheDocument();

    // Nothing persisted and no confirmation shown.
    expect(mockRecord).not.toHaveBeenCalled();
    expect(screen.queryByText('Penjualan Berhasil')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('forwards selected bonus accessories with unit cost so COGS is recognized on sale', async () => {
    // A real bonus-category accessory row available in stock.
    mockGetAccessories.mockResolvedValue([
      {
        id: 'acc-1',
        name: 'Tempered Glass',
        category: 'tempered_glass',
        stock: 10,
        status: 'AMAN',
        min_stock: 2,
        price: 25_000,
      },
    ]);

    renderPage();
    await assembleValidSale();

    // Open the bonus picker and select the accessory (carries its real DB id).
    fireEvent.click(screen.getByRole('button', { name: /Tambah Bonus/ }));
    const accButton = await screen.findByRole('button', { name: /Tempered Glass/ });
    fireEvent.click(accButton);
    fireEvent.click(screen.getByRole('button', { name: 'Tutup' }));

    await waitFor(() => expect(getFinalizeButton()).toBeEnabled());
    fireEvent.click(getFinalizeButton());

    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        accessories: [{ id: 'acc-1', qty: 1, unit_cost: 25_000 }],
      }),
    );
  });

  it('lets non-IMEI grouped stock be completed with IMEI, color, and battery health at sale time', async () => {
    mockGetStock.mockResolvedValue([BULK_STOCK_ITEM]);

    renderPage();
    await selectBulkUnit();

    fireEvent.change(screen.getByLabelText(/IMEI Unit/i), {
      target: { value: '351111111111111' },
    });
    fireEvent.change(screen.getByLabelText(/Warna Aktual/i), {
      target: { value: 'Black' },
    });
    fireEvent.change(screen.getByLabelText(/Battery Health/i), {
      target: { value: '87' },
    });

    setMoneyByLabel('Bayar Cash', String(BULK_STOCK_ITEM.price));
    await selectCashAccount();

    await waitFor(() => expect(getFinalizeButton()).toBeEnabled());
    fireEvent.click(getFinalizeButton());

    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
    const call = mockRecord.mock.calls[0][0];
    const detail = JSON.parse(call.detail);

    expect(call.stockIds).toEqual(['stk-bulk']);
    expect(detail.units[0]).toMatchObject({
      imei: '351111111111111',
      model: 'iPhone 11',
      capacity: '128GB',
      condition: 'Second Inter Unlock',
      color: 'Black',
      batteryHealth: 87,
      sellingPrice: BULK_STOCK_ITEM.price,
    });
  });

  it('forwards checked free box/accessory status with cost for sale COGS', async () => {
    mockGetAccessories.mockResolvedValue([CHARGER_ACCESSORY]);

    renderPage();
    await assembleValidSale();

    fireEvent.click(screen.getByRole('checkbox', { name: /Charger/i }));

    await waitFor(() => expect(getFinalizeButton()).toBeEnabled());
    fireEvent.click(getFinalizeButton());

    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
    const call = mockRecord.mock.calls[0][0];
    const detail = JSON.parse(call.detail);

    expect(call.accessories).toEqual([
      { id: CHARGER_ACCESSORY.id, qty: 1, unit_cost: CHARGER_ACCESSORY.price },
    ]);
    expect(detail.bonuses).toEqual([
      expect.objectContaining({
        name: CHARGER_ACCESSORY.name,
        costPrice: CHARGER_ACCESSORY.price,
      }),
    ]);
  });

  it('shows model-matched box stock from live accessory data instead of stale hardcoded counts', async () => {
    mockGetStock.mockResolvedValue([BULK_STOCK_ITEM]);
    mockGetAccessories.mockResolvedValue([
      BOX_IPHONE_14_ACCESSORY,
      BOX_IPHONE_11_ACCESSORY,
    ]);

    renderPage();
    await selectBulkUnit();

    expect(await screen.findByText('Box iPhone 11')).toBeInTheDocument();
    expect(screen.getByText('100 in stock')).toBeInTheDocument();
    expect(screen.queryByText('686 in stock')).not.toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: /Box iPhone 11/i }),
    ).toBeEnabled();
  });

  it('forwards the checked model-matched box as the sale accessory cost', async () => {
    mockGetStock.mockResolvedValue([BULK_STOCK_ITEM]);
    mockGetAccessories.mockResolvedValue([
      BOX_IPHONE_14_ACCESSORY,
      BOX_IPHONE_11_ACCESSORY,
    ]);

    renderPage();
    await selectBulkUnit();

    fireEvent.click(await screen.findByRole('checkbox', { name: /Box iPhone 11/i }));

    setMoneyByLabel('Bayar Cash', String(BULK_STOCK_ITEM.price));
    await selectCashAccount();

    await waitFor(() => expect(getFinalizeButton()).toBeEnabled());
    fireEvent.click(getFinalizeButton());

    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
    const call = mockRecord.mock.calls[0][0];
    const detail = JSON.parse(call.detail);

    expect(call.accessories).toEqual([
      {
        id: BOX_IPHONE_11_ACCESSORY.id,
        qty: 1,
        unit_cost: BOX_IPHONE_11_ACCESSORY.price,
      },
    ]);
    expect(detail.bonuses).toEqual([
      expect.objectContaining({
        name: BOX_IPHONE_11_ACCESSORY.name,
        costPrice: BOX_IPHONE_11_ACCESSORY.price,
      }),
    ]);
  });
});

// ===========================================================================
// Pencarian IMEI / SN: unit iPad (SN tersimpan di field imei)
//
// CATATAN URUTAN: describe ini sengaja ditaruh SEBELUM describe
// "persistence failure & timeout" yang memakai vi.useFakeTimers(). Memasang
// fake timer saat animasi framer-motion masih berjalan akan "membekukan"
// frame loop framer-motion secara permanen (frame yang pending di fake timer
// hilang saat useRealTimers), sehingga AnimatePresence mode="wait" tidak
// pernah menyelesaikan exit animation — pergantian tab yang dibutuhkan test
// ini tidak akan pernah termount. Test lain tidak terdampak karena elemen
// mereka termount tanpa menunggu animasi selesai.
// ===========================================================================
describe('pencarian IMEI / SN (iPad)', () => {
  it('menemukan unit iPad lewat SN huruf kecil, menambahkannya ke unit terpilih, dan meneruskan deviceCategory ke detail transaksi', async () => {
    mockGetStock.mockResolvedValue([IPAD_STOCK_ITEM]);

    renderPage();

    // Pindah ke tab pencarian (default-nya "Browse Stok"), lalu ketik SN
    // dalam huruf kecil — pencocokan SN (8–14 karakter) bersifat
    // case-insensitive terhadap SN uppercase di stok. Tab baru termount
    // setelah exit animation tab lama selesai (AnimatePresence mode="wait"),
    // jadi beri timeout lebih longgar dari default 1s.
    fireEvent.click(screen.getByRole('button', { name: 'Cari IMEI / SN' }));
    const searchInput = await screen.findByPlaceholderText(
      'Contoh: 352461789012345',
      undefined,
      { timeout: 5000 },
    );
    fireEvent.change(searchInput, {
      target: { value: 'dmr9x2abcd' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cari' }));

    // Hasil ditemukan dan diberi label identitas "SN:".
    expect(await screen.findByText('iPad Pro 11')).toBeInTheDocument();
    expect(screen.getByText('SN: DMR9X2ABCD')).toBeInTheDocument();

    // Unit iPad bisa dipilih persis seperti unit iPhone.
    fireEvent.click(screen.getByRole('button', { name: '+ Tambah' }));
    expect(screen.getAllByText('1 unit dipilih').length).toBeGreaterThan(0);
    expect(screen.getAllByText('DMR9X2ABCD').length).toBeGreaterThan(0);

    // Finalisasi: detail JSON membawa deviceCategory 'IPAD' dan imei = SN.
    setMoneyByLabel('Bayar Cash', String(IPAD_STOCK_ITEM.price));
    await selectCashAccount();

    await waitFor(() => expect(getFinalizeButton()).toBeEnabled());
    fireEvent.click(getFinalizeButton());

    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
    const call = mockRecord.mock.calls[0][0];
    const detail = JSON.parse(call.detail);

    expect(call.stockIds).toEqual(['stk-ipad-1']);
    expect(detail.units[0]).toMatchObject({
      imei: 'DMR9X2ABCD',
      deviceCategory: 'IPAD',
      model: 'iPad Pro 11',
      sellingPrice: IPAD_STOCK_ITEM.price,
    });
  });
});

// ===========================================================================
// Persistence failure & timeout (Req 3.8)
// ===========================================================================
describe('persistence failure & timeout (Req 3.8)', () => {
  it('(a) shows an error, retains entered data, and does not show the confirmation when persistence rejects', async () => {
    mockRecord.mockRejectedValue(new Error('db down'));

    renderPage();
    await assembleValidSale();

    await waitFor(() => expect(getFinalizeButton()).toBeEnabled());
    fireEvent.click(getFinalizeButton());

    // Error message surfaced.
    expect(
      await screen.findByText(/Penjualan tidak dapat disimpan/i),
    ).toBeInTheDocument();

    // Confirmation NOT shown.
    expect(screen.queryByText('Penjualan Berhasil')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Entered data retained (the selected unit is still part of the sale).
    expect(screen.getAllByText('1 unit dipilih').length).toBeGreaterThan(0);
  });

  it('(b) treats a persistence call that never resolves within 10s as a failure', async () => {
    renderPage();
    await assembleValidSale();

    const button = await waitFor(() => {
      const b = getFinalizeButton();
      expect(b).toBeEnabled();
      return b;
    });

    // recordTransactionWithPostings never settles -> only the 10s timeout can
    // resolve the race.
    mockRecord.mockReturnValue(new Promise<never>(() => {}));

    vi.useFakeTimers();
    fireEvent.click(button);

    // Advance past the 10s timeout and flush the rejection's microtasks inside act.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_001);
    });
    vi.useRealTimers();

    // Same failure handling as a rejection.
    expect(screen.getByText(/Penjualan tidak dapat disimpan/i)).toBeInTheDocument();
    expect(screen.queryByText('Penjualan Berhasil')).not.toBeInTheDocument();
    expect(screen.getAllByText('1 unit dipilih').length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Confirmation/receipt render (Req 4.1)
// ===========================================================================
describe('confirmation/receipt render', () => {
  it('renders the ConfirmationView with the Receipt after a successful finalize', async () => {
    renderPage();
    await assembleValidSale();

    await waitFor(() => expect(getFinalizeButton()).toBeEnabled());
    fireEvent.click(getFinalizeButton());

    const dialog = await screen.findByRole('dialog');

    // Receipt content is rendered inside the confirmation.
    expect(within(dialog).getByText('STRUK PENJUALAN')).toBeInTheDocument();
    expect(within(dialog).getByText(UNIT.model)).toBeInTheDocument();
    expect(within(dialog).getByText('Total Transaksi')).toBeInTheDocument();
    expect(
      within(dialog).getByText(new RegExp(`IMEI:\\s*${UNIT.imei}`)),
    ).toBeInTheDocument();
  });
});

// ===========================================================================
// Print action (Req 4.9, 4.10)
// ===========================================================================
describe('print action', () => {
  let originalPrint: typeof window.print;

  beforeEach(() => {
    originalPrint = window.print;
  });

  afterEach(() => {
    window.print = originalPrint;
  });

  async function finalizeToConfirmation() {
    renderPage();
    await assembleValidSale();
    await waitFor(() => expect(getFinalizeButton()).toBeEnabled());
    fireEvent.click(getFinalizeButton());
    return screen.findByRole('dialog');
  }

  it('calls window.print when the Cetak action is triggered', async () => {
    const printSpy = vi.fn();
    window.print = printSpy;

    const dialog = await finalizeToConfirmation();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cetak' }));

    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('shows a print error and retains the confirmation when window.print throws', async () => {
    const printSpy = vi.fn(() => {
      throw new Error('print blocked');
    });
    window.print = printSpy;

    const dialog = await finalizeToConfirmation();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cetak' }));

    // Error message surfaced inside the still-open confirmation.
    expect(
      await within(dialog).findByText('Tidak dapat membuka dialog cetak'),
    ).toBeInTheDocument();
    expect(screen.getByText('Penjualan Berhasil')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

// ===========================================================================
// Post-confirmation reset (happy path of Req 5.1, 5.2, 5.4)
// ===========================================================================
describe('post-confirmation reset', () => {
  it('clears the confirmation and resets the form to its initial state when "Selesai" is clicked', async () => {
    renderPage();
    await assembleValidSale();

    await waitFor(() => expect(getFinalizeButton()).toBeEnabled());
    fireEvent.click(getFinalizeButton());

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Selesai' }));

    // Confirmation gone.
    await waitFor(() =>
      expect(screen.queryByText('Penjualan Berhasil')).not.toBeInTheDocument(),
    );

    // Form back to initial state: the bottom-bar total returns to Rp 0 and the
    // finalize gate closes again (empty sale is invalid). Note: the selected-unit
    // chips/cards live inside framer-motion <AnimatePresence> exit animations,
    // which keep nodes mounted in jsdom, so we assert on the always-mounted
    // bottom bar instead.
    await waitFor(() =>
      expect(screen.getAllByText('Rp 0').length).toBeGreaterThan(0),
    );
    expect(getFinalizeButton()).toBeDisabled();
  });
});
