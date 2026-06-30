// Feature: transaction-account-integration (Phase 2) — task 10.2
// Page test for the Servis (Servis Customer) DP payment flow.
//
// When a DP (down payment) > 0 is entered, the form reveals a Cash/Transfer
// method toggle plus a single method-routed AccountPicker (Cash accounts when
// method is Cash, Bank accounts when Transfer). On save with dp > 0 the whole
// DP routes to ONE portion based on the method and the page persists it via
// `recordTransactionWithPostings` as an Income_Flow (`money_in`) of type
// `Servis`.
//
// These tests drive the real page (default export) through realistic
// interactions and mock only the boundaries:
//   - `recordTransactionWithPostings` (persistence) so we can assert the call,
//   - `getAccountPickerData` (account loading) so the AccountPicker has
//     selectable Cash/Bank accounts.
// The pure `@/services/paymentPosting` domain core is intentionally NOT mocked.
//
// Validates: Requirements 6.4, 6.7

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import Servis from './Servis';
import { recordTransactionWithPostings } from '@/services/postings';
import { getAccountPickerData, type AccountWithBalance } from '@/services/accounts';
import {
  getServiceRecords,
  getServiceSparepartUsages,
  recordServiceSparepartUsage,
} from '@/services/services';
import { getSpareparts } from '@/services/spareparts';

// ---------------------------------------------------------------------------
// Mock the persistence layer. Servis imports `recordTransactionWithPostings`
// from this module; replace it with a controllable vi.fn() resolving to a fake
// transaction id.
// ---------------------------------------------------------------------------
vi.mock('@/services/postings', () => ({
  recordTransactionWithPostings: vi.fn(),
  recordWagePaymentWithPosting: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock account loading. Servis calls `getAccountPickerData()` on mount and
// feeds the result to the AccountPicker. Expose one active Cash and one active
// Bank account. The `AccountWithBalance` re-export is type-only, so it stays
// real after the mock.
// ---------------------------------------------------------------------------
vi.mock('@/services/accounts', () => ({
  getAccountPickerData: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock the service-records layer. ServisCustomerForm now persists the service
// record FIRST (via createServiceRecord) before the DP posting, so this must
// resolve for the payment flow to proceed.
// ---------------------------------------------------------------------------
vi.mock('@/services/services', () => ({
  createServiceRecord: vi.fn().mockResolvedValue({ id: 'srv-1' }),
  recordServiceWithStockStatus: vi.fn().mockResolvedValue('srv-1'),
  getServiceRecords: vi.fn().mockResolvedValue([]),
  getServiceSparepartUsages: vi.fn().mockResolvedValue([]),
  recordServiceSparepartUsage: vi.fn().mockResolvedValue({ id: 'usage-1' }),
  updateServiceCostFields: vi.fn().mockResolvedValue(undefined),
  updateServiceRecord: vi.fn().mockResolvedValue({ id: 'srv-1' }),
}));

vi.mock('@/services/spareparts', () => ({
  getSpareparts: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/services/technicians', () => ({
  getTechnicians: vi.fn().mockResolvedValue([
    {
      id: 'tech-zaidan',
      name: 'Zaidan',
      is_active: true,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    },
  ]),
  createTechnician: vi.fn(),
  updateTechnician: vi.fn(),
}));

const mockRecord = vi.mocked(recordTransactionWithPostings);
const mockGetAccounts = vi.mocked(getAccountPickerData);
const mockGetServiceRecords = vi.mocked(getServiceRecords);
const mockGetServiceSparepartUsages = vi.mocked(getServiceSparepartUsages);
const mockRecordServiceSparepartUsage = vi.mocked(recordServiceSparepartUsage);
const mockGetSpareparts = vi.mocked(getSpareparts);

// ---------------------------------------------------------------------------
// Account fixtures — match the real AccountWithBalance shape.
// ---------------------------------------------------------------------------
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

const ESTIMASI = 500_000;
const DP = 200_000;

// ---------------------------------------------------------------------------
// Render + interaction helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter>
      <Servis />
    </MemoryRouter>,
  );
}

/** Open the "Servis Customer" form from the hub. */
function openCustomerForm() {
  fireEvent.click(screen.getByText('Servis Customer').closest('button')!);
}

/** Find the form field (input/select/textarea) sitting next to a visible label. */
function fieldByLabel(labelText: string): HTMLElement {
  const label = screen.getByText(labelText);
  const el = label.parentElement!.querySelector('input, select, textarea');
  if (!el) throw new Error(`No form field found for label "${labelText}"`);
  return el as HTMLElement;
}

function setByLabel(labelText: string, value: string) {
  fireEvent.change(fieldByLabel(labelText), { target: { value } });
}

/**
 * Fill every required field so `validate()` passes, then enter a DP so the
 * payment block (method toggle + AccountPicker) is revealed.
 */
function fillRequiredServiceForm() {
  setByLabel('NAMA CUSTOMER *', 'Budi Santoso');
  setByLabel('NO. WHATSAPP *', '08123456789');
  setByLabel('TIPE HP *', 'iPhone 15');
  setByLabel('KAPASITAS *', '128GB');
  setByLabel('KONDISI *', 'Second iBox');
  setByLabel('WARNA *', 'Midnight');
  setByLabel('IMEI (10-20 DIGIT) *', '352345678901234');
  setByLabel('KELUHAN *', 'Layar pecah dan tidak bisa di-touch.');

  // Tukang grid: pick "Zaidan".
  fireEvent.click(screen.getByText('Zaidan').closest('button')!);

  // Money fields (RpInput strips non-digits on change).
  setByLabel('ESTIMASI BIAYA *', String(ESTIMASI));
  setByLabel('DP (OPSIONAL)', String(DP));
}

function getSaveButton(): HTMLButtonElement {
  return screen.getByRole('button', {
    name: /Simpan Servis|Menyimpan/,
  }) as HTMLButtonElement;
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  mockGetAccounts.mockReset();
  mockGetAccounts.mockResolvedValue([CASH_ACCOUNT, BANK_ACCOUNT]);

  mockRecord.mockReset();
  mockRecord.mockResolvedValue('srv-tx-1');
  mockGetServiceRecords.mockReset();
  mockGetServiceRecords.mockResolvedValue([]);
  mockGetServiceSparepartUsages.mockReset();
  mockGetServiceSparepartUsages.mockResolvedValue([]);
  mockRecordServiceSparepartUsage.mockReset();
  mockRecordServiceSparepartUsage.mockResolvedValue({
    id: 'usage-1',
    service_record_id: 'srv-monitor-1',
    sparepart_id: 'sp-battery-11',
    sparepart_name: 'Battery iPhone 11',
    quantity: 2,
    unit_cost: 120000,
    total_cost: 240000,
    created_at: '2024-01-01T00:00:00.000Z',
  });
  mockGetSpareparts.mockReset();
  mockGetSpareparts.mockResolvedValue([]);

  // The form alerts + closes on success; silence the jsdom alert.
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

describe('Servis sparepart usage', () => {
  it('records sparepart usage from the monitor and sends it to service costing', async () => {
    mockGetServiceRecords.mockResolvedValue([
      {
        id: 'srv-monitor-1',
        customer_name: 'Budi Santoso',
        phone_model: 'iPhone 11',
        capacity: '128GB',
        condition: 'Second iBox',
        color: 'Black',
        imei: '352345678901234',
        battery_health: null,
        issue: 'Ganti battery',
        additional_note: '',
        status: 'PROSES',
        estimated_cost: 300000,
        work_cost: 300000,
        dp: 0,
        created_at: '2024-01-01T00:00:00.000Z',
        completed_at: null,
        technician: 'Zaidan',
        service_type: 'Customer',
        stk_id: '',
        wage_amount: 50000,
        wage_paid: false,
        picked_up: false,
        picked_up_at: null,
      },
    ]);
    mockGetSpareparts.mockResolvedValue([
      {
        id: 'sp-battery-11',
        name: 'Battery iPhone 11',
        compatible_type: 'iPhone 11',
        stock: 5,
        min_stock: 1,
        buy_price: 120000,
        sell_price: 180000,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      },
    ]);

    renderPage();
    fireEvent.click(screen.getByText('Monitor Servis').closest('button')!);

    fireEvent.click(await screen.findByText(/iPhone 11/));
    fireEvent.click(await screen.findByRole('button', { name: /Tambah Part/i }));
    fireEvent.change(screen.getByLabelText(/Jumlah/i), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Simpan Part/i }));

    await waitFor(() =>
      expect(mockRecordServiceSparepartUsage).toHaveBeenCalledWith({
        serviceRecordId: 'srv-monitor-1',
        sparepartId: 'sp-battery-11',
        quantity: 2,
        unitCost: 120000,
      }),
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// Valid DP submit (Req 6.4, 6.7)
// ===========================================================================
describe('Servis DP payment — valid submit (Req 6.4, 6.7)', () => {
  it('routes the whole DP to the selected Cash account and persists a money_in Servis transaction', async () => {
    renderPage();
    openCustomerForm();
    fillRequiredServiceForm();

    // Method defaults to Cash → the picker lists Cash accounts only.
    const cashRadio = await screen.findByRole('radio', { name: /Kas Toko/ });
    expect(screen.queryByText('BCA')).toBeNull();
    fireEvent.click(cashRadio);

    fireEvent.click(getSaveButton());

    // Persistence invoked exactly once.
    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));

    const arg = mockRecord.mock.calls[0][0];
    expect(arg.type).toBe('Servis');
    expect(arg.amount).toBe(DP);

    // The entire DP routes to ONE money_in posting against the cash account.
    expect(arg.postings).toHaveLength(1);
    expect(arg.postings[0]).toMatchObject({
      account_id: CASH_ACCOUNT.id,
      direction: 'money_in',
      amount: DP,
    });
  });

  it('routes the whole DP to the selected Bank account when the method is Transfer', async () => {
    renderPage();
    openCustomerForm();
    fillRequiredServiceForm();

    // Switch the method to Transfer → the picker now lists Bank accounts only.
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }));

    const bankRadio = await screen.findByRole('radio', { name: /BCA/ });
    expect(screen.queryByText('Kas Toko')).toBeNull();
    fireEvent.click(bankRadio);

    fireEvent.click(getSaveButton());

    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));

    const arg = mockRecord.mock.calls[0][0];
    expect(arg.type).toBe('Servis');
    expect(arg.postings).toHaveLength(1);
    expect(arg.postings[0]).toMatchObject({
      account_id: BANK_ACCOUNT.id,
      direction: 'money_in',
      amount: DP,
    });
  });
});

// ===========================================================================
// Invalid selection (Req 6.4, 6.7)
// ===========================================================================
describe('Servis DP payment — invalid selection (Req 6.4, 6.7)', () => {
  it('surfaces a validation message and persists nothing when no account is selected', async () => {
    renderPage();
    openCustomerForm();
    fillRequiredServiceForm();

    // Wait for the picker to be populated, but do NOT select any account.
    await screen.findByRole('radio', { name: /Kas Toko/ });

    fireEvent.click(getSaveButton());

    // The mapped CASH_ACCOUNT_REQUIRED message is surfaced...
    expect(
      await screen.findByText('Pilih akun kas untuk porsi cash'),
    ).toBeInTheDocument();

    // ...and nothing is persisted.
    expect(mockRecord).not.toHaveBeenCalled();
  });
});
