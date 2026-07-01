// Feature: transaction-account-integration
// Page tests for Pembelian persistence wiring (task 7.2).
// Validates: Requirements 6.1, 6.7
//
// These exercise the real pure core (paymentPosting / accountsCore) and only
// mock the IO boundaries: the RPC service wrapper (recordPurchaseWithPostings),
// the live stock loader (getStockItems), and the account-picker data loader
// (getAccountPickerData). accountsCore is NOT mocked, so the real
// validation/posting logic runs.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { type AccountWithBalance } from '@/services/accounts';
import { type Agent } from '@/services/agents';

// ---------- Mocks ----------

const recordPurchaseWithPostings = vi.fn();
const recordAccessoryPurchaseWithPostings = vi.fn();
vi.mock('@/services/postings', () => ({
  recordPurchaseWithPostings: (...args: unknown[]) =>
    recordPurchaseWithPostings(...args),
  recordAccessoryPurchaseWithPostings: (...args: unknown[]) =>
    recordAccessoryPurchaseWithPostings(...args),
}));

// The page loads live stock on mount to build the "IMEI sudah ada di stok"
// set; resolve an empty list so entered IMEIs are considered new.
vi.mock('@/services/stock', () => ({
  getStockItems: vi.fn(),
}));

import { getStockItems } from '@/services/stock';

vi.mock('@/services/accounts', () => ({
  getAccountPickerData: vi.fn().mockResolvedValue([
    {
      id: 'cash-1',
      name: 'Kas Toko',
      type: 'Cash',
      opening_balance: 0,
      note: '',
      is_archived: false,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      current_balance: 1_000_000,
      is_overdraft: false,
    } satisfies AccountWithBalance,
    {
      id: 'bank-1',
      name: 'BCA Operasional',
      type: 'Bank',
      opening_balance: 0,
      note: '',
      is_archived: false,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      current_balance: 5_000_000,
      is_overdraft: false,
    } satisfies AccountWithBalance,
  ]),
}));

vi.mock('@/services/agents', () => ({
  getAgents: vi.fn(),
}));

import { getAgents } from '@/services/agents';
import Pembelian from './Pembelian';

// A fresh 15-digit IMEI that is NOT present in the (empty) mock stock.
const FRESH_IMEI = '999999999999999';
const UNIT_PRICE = '5000000';
const SELL_PRICE = '6500000';
const AGENT_SUPPLIER: Agent = {
  id: 'agent-1',
  code: 'AGN-001',
  name: 'Agen Pontianak',
  phone: '081234567890',
  note: 'supplier utama',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <Pembelian />
    </MemoryRouter>,
  );
}

/**
 * Open a CustomSelect (by its exact trigger label) and click an option.
 * fireEvent.click is used because CustomSelect is defined inline inside the
 * page and remounts on each render, which breaks userEvent's multi-step click.
 */
function pickFromDropdown(triggerName: string, optionName: string) {
  // Exact-string name avoids matching the disabled Warna trigger placeholder
  // ("Pilih tipe HP dulu..."), which would otherwise collide with "Pilih tipe HP".
  const buttonTrigger = screen.queryByRole('button', { name: triggerName });
  if (buttonTrigger) {
    fireEvent.click(buttonTrigger);
    fireEvent.click(screen.getByRole('button', { name: optionName }));
    return;
  }

  const option = screen.getByRole('option', { name: optionName });
  const select = option.closest('select');
  if (!select) throw new Error(`No select found for option "${optionName}"`);
  fireEvent.change(select, { target: { value: optionName } });
}

/**
 * Fill the whole Pembelian form so that, except for account selection, the form
 * is valid: supplier, batch specs, one unit (valid fresh IMEI + price), and a
 * cash payment covering the total.
 */
function fillValidFormWithCashPayment() {
  // Supplier name.
  fireEvent.change(screen.getByPlaceholderText('Pak Tono'), {
    target: { value: 'Pak Tono' },
  });

  // Batch specs via the custom dropdowns.
  pickFromDropdown('Pilih tipe HP', 'iPhone 13');
  pickFromDropdown('Pilih kapasitas', '128GB');
  pickFromDropdown('Pilih kondisi', 'Second iBox');
  pickFromDropdown('Pilih warna', 'Midnight');

  // Unit IMEI + prices.
  fireEvent.change(screen.getByPlaceholderText('352461789012345'), {
    target: { value: FRESH_IMEI },
  });

  // Money inputs: [0] = Harga Modal (unit cost), [1] = Harga Jual (unit sell),
  // [2] = Bayar Cash, [3] = Bayar Transfer.
  const moneyInputs = screen.getAllByPlaceholderText('Rp 0');
  fireEvent.change(moneyInputs[0], { target: { value: UNIT_PRICE } });
  fireEvent.change(moneyInputs[1], { target: { value: SELL_PRICE } });
  // Payment covers the total cost (harga modal), not the selling price.
  fireEvent.change(moneyInputs[2], { target: { value: UNIT_PRICE } });
}

describe('Pembelian — persistence wiring (Req 6.1, 6.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStockItems).mockResolvedValue([]);
    vi.mocked(getAgents).mockResolvedValue([AGENT_SUPPLIER]);
    recordPurchaseWithPostings.mockResolvedValue('tx-123');
    recordAccessoryPurchaseWithPostings.mockResolvedValue('tx-accessory');
  });

  it('records purchased pelengkap from the Pembelian menu as inventory money_out and restocks accessory stock', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Tambah Pelengkap/i }));

    fireEvent.change(screen.getByLabelText(/Nama Pelengkap/i), {
      target: { value: 'Box iPhone 11' },
    });
    fireEvent.change(screen.getByLabelText(/Kategori Pelengkap/i), {
      target: { value: 'kotak' },
    });
    fireEvent.change(screen.getByLabelText(/Jumlah Beli/i), {
      target: { value: '100' },
    });
    fireEvent.change(screen.getByLabelText(/Modal per Pcs/i), {
      target: { value: '200000' },
    });
    fireEvent.change(screen.getByLabelText(/Stok Minimum/i), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByLabelText(/Bayar Cash Pelengkap/i), {
      target: { value: '20000000' },
    });

    const cashOption = await screen.findByRole('radio', { name: /Kas Toko/ });
    fireEvent.click(cashOption);

    fireEvent.click(screen.getByRole('button', { name: /Simpan Pelengkap/i }));

    await waitFor(() =>
      expect(recordAccessoryPurchaseWithPostings).toHaveBeenCalledTimes(1),
    );
    expect(recordPurchaseWithPostings).not.toHaveBeenCalled();

    const arg = recordAccessoryPurchaseWithPostings.mock.calls[0][0];
    expect(arg.type).toBe('Pembelian Pelengkap');
    expect(arg.amount).toBe(20_000_000);
    expect(arg.description).toBe('Pembelian Pelengkap - 100 pcs Box iPhone 11');
    expect(arg.postings).toEqual([
      expect.objectContaining({
        account_id: 'cash-1',
        direction: 'money_out',
        amount: 20_000_000,
      }),
    ]);
    expect(arg.accessories).toEqual([
      {
        name: 'Box iPhone 11',
        category: 'kotak',
        qty: 100,
        unit_cost: 200_000,
        min_stock: 10,
      },
    ]);
    expect(JSON.parse(arg.detail)).toEqual(
      expect.objectContaining({
        kind: 'accessory_purchase',
        total: 20_000_000,
        payment: { cash: 20_000_000, transfer: 0 },
      }),
    );
  });

  it('valid submit records a Pembelian transaction with a money_out posting and the bought unit (Req 6.1)', async () => {
    renderPage();

    fillValidFormWithCashPayment();

    // The cash portion is non-zero, so the Cash AccountPicker appears; select it.
    const cashOption = await screen.findByRole('radio', { name: /Kas Toko/ });
    fireEvent.click(cashOption);

    // Save is now enabled.
    const saveButton = screen.getByRole('button', { name: /Simpan Pembelian/ });
    await waitFor(() => expect(saveButton).not.toBeDisabled());
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(recordPurchaseWithPostings).toHaveBeenCalledTimes(1),
    );

    const arg = recordPurchaseWithPostings.mock.calls[0][0];
    expect(arg.type).toBe('Pembelian');
    // The transaction amount and money_out posting are based on the total
    // harga modal (cost), never the selling price.
    expect(arg.amount).toBe(Number(UNIT_PRICE));
    // Exactly one money_out posting against the selected Cash account.
    expect(arg.postings).toEqual([
      expect.objectContaining({
        account_id: 'cash-1',
        direction: 'money_out',
        amount: Number(UNIT_PRICE),
      }),
    ]);
    // The entered unit is inserted into stock atomically with the expense,
    // carrying both the harga modal (cost_price) and the harga jual (price).
    expect(arg.items).toEqual([
      expect.objectContaining({
        model: 'iPhone 13',
        capacity: '128GB',
        condition: 'Second iBox',
        color: 'Midnight',
        imei: FRESH_IMEI,
        cost_price: Number(UNIT_PRICE),
        price: Number(SELL_PRICE),
      }),
    ]);
  });

  it('requires and persists a defect description for minus full-data stock', async () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Pak Tono'), {
      target: { value: 'Pak Tono' },
    });

    pickFromDropdown('Pilih tipe HP', 'iPhone 13');
    pickFromDropdown('Pilih kapasitas', '128GB');
    pickFromDropdown('Pilih kondisi', 'Second Inter Unlock Minus');
    pickFromDropdown('Pilih warna', 'Midnight');

    fireEvent.change(screen.getByPlaceholderText('352461789012345'), {
      target: { value: FRESH_IMEI },
    });

    const moneyInputs = screen.getAllByPlaceholderText('Rp 0');
    fireEvent.change(moneyInputs[0], { target: { value: UNIT_PRICE } });
    fireEvent.change(moneyInputs[1], { target: { value: SELL_PRICE } });
    fireEvent.change(moneyInputs[2], { target: { value: UNIT_PRICE } });

    const cashOption = await screen.findByRole('radio', { name: /Kas Toko/ });
    fireEvent.click(cashOption);

    fireEvent.click(screen.getByRole('button', { name: /Simpan Pembelian/ }));

    expect(
      (await screen.findAllByText(/Isi keterangan minus tiap unit/i)).length,
    ).toBeGreaterThan(0);
    expect(recordPurchaseWithPostings).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Keterangan Minus/i), {
      target: { value: 'LCD ganti, Face ID off' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Simpan Pembelian/ }));

    await waitFor(() =>
      expect(recordPurchaseWithPostings).toHaveBeenCalledTimes(1),
    );

    const arg = recordPurchaseWithPostings.mock.calls[0][0];
    expect(arg.items).toEqual([
      expect.objectContaining({
        condition: 'Second Inter Unlock Minus',
        defect_description: 'LCD ganti, Face ID off',
      }),
    ]);
    expect(JSON.parse(arg.detail).units).toEqual([
      expect.objectContaining({
        defectDescription: 'LCD ganti, Face ID off',
      }),
    ]);
  });

  it('blocks submission and persists nothing when a non-zero cash portion has no account selected (Req 4.1, 6.7)', async () => {
    renderPage();

    // Fill everything valid, including a non-zero cash payment, but do NOT
    // select the cash account.
    fillValidFormWithCashPayment();

    // The cash picker is shown (cash portion > 0) but left unselected.
    expect(await screen.findByRole('radio', { name: /Kas Toko/ })).toBeTruthy();

    // The save button is always clickable now (so the user never faces a
    // silently-disabled button), but clicking with a missing required account
    // surfaces a clear hint and persists nothing (Req 4.1).
    const saveButton = screen.getByRole('button', { name: /Simpan Pembelian/ });
    fireEvent.click(saveButton);

    expect(
      (await screen.findAllByText(/Pilih akun kas untuk porsi cash/i)).length,
    ).toBeGreaterThan(0);
    expect(recordPurchaseWithPostings).not.toHaveBeenCalled();
  });

  it('uses registered agent dropdown for Agen supplier and records the selected agent identity', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /^agen$/i }));

    const agentSelect = await screen.findByLabelText(/Nama Agen/i);
    fireEvent.change(agentSelect, { target: { value: AGENT_SUPPLIER.id } });

    pickFromDropdown('Pilih tipe HP', 'iPhone 13');
    pickFromDropdown('Pilih kapasitas', '128GB');
    pickFromDropdown('Pilih kondisi', 'Second iBox');
    pickFromDropdown('Pilih warna', 'Midnight');

    fireEvent.change(screen.getByPlaceholderText('352461789012345'), {
      target: { value: FRESH_IMEI },
    });

    const moneyInputs = screen.getAllByPlaceholderText('Rp 0');
    fireEvent.change(moneyInputs[0], { target: { value: UNIT_PRICE } });
    fireEvent.change(moneyInputs[1], { target: { value: SELL_PRICE } });
    fireEvent.change(moneyInputs[2], { target: { value: UNIT_PRICE } });

    const cashOption = await screen.findByRole('radio', { name: /Kas Toko/ });
    fireEvent.click(cashOption);

    const saveButton = screen.getByRole('button', { name: /Simpan Pembelian/ });
    await waitFor(() => expect(saveButton).not.toBeDisabled());
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(recordPurchaseWithPostings).toHaveBeenCalledTimes(1),
    );

    const arg = recordPurchaseWithPostings.mock.calls[0][0];
    const detail = JSON.parse(arg.detail);
    expect(detail.supplier).toEqual({
      type: 'agen',
      name: AGENT_SUPPLIER.name,
      agentId: AGENT_SUPPLIER.id,
      code: AGENT_SUPPLIER.code,
    });
    expect(arg.description).toContain(AGENT_SUPPLIER.name);
  });

  it('records remaining unpaid purchase amount as agent debt when Hutang ke Agen is selected', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /^agen$/i }));

    const agentSelect = await screen.findByLabelText(/Nama Agen/i);
    fireEvent.change(agentSelect, { target: { value: AGENT_SUPPLIER.id } });

    pickFromDropdown('Pilih tipe HP', 'iPhone 13');
    pickFromDropdown('Pilih kapasitas', '128GB');
    pickFromDropdown('Pilih kondisi', 'Second iBox');
    pickFromDropdown('Pilih warna', 'Midnight');

    fireEvent.change(screen.getByPlaceholderText('352461789012345'), {
      target: { value: FRESH_IMEI },
    });

    const moneyInputs = screen.getAllByPlaceholderText('Rp 0');
    fireEvent.change(moneyInputs[0], { target: { value: UNIT_PRICE } });
    fireEvent.change(moneyInputs[1], { target: { value: SELL_PRICE } });

    fireEvent.click(screen.getByRole('checkbox', { name: /Hutang ke Agen/i }));

    const saveButton = screen.getByRole('button', { name: /Simpan Pembelian/ });
    await waitFor(() => expect(saveButton).not.toBeDisabled());
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(recordPurchaseWithPostings).toHaveBeenCalledTimes(1),
    );

    const arg = recordPurchaseWithPostings.mock.calls[0][0];
    expect(arg.postings).toEqual([]);
    expect(arg.agentDebt).toEqual({
      agentId: AGENT_SUPPLIER.id,
      amount: Number(UNIT_PRICE),
      method: 'Hutang',
      note: expect.stringContaining('Pembelian'),
    });
  });

  it('records agen quantity-only stock with averaged unit cost and no IMEI', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /^agen$/i }));
    fireEvent.change(await screen.findByLabelText(/Nama Agen/i), {
      target: { value: AGENT_SUPPLIER.id },
    });
    fireEvent.click(screen.getByRole('button', { name: /Jumlah Stok/i }));

    pickFromDropdown('Pilih tipe HP', 'iPhone 11');
    pickFromDropdown('Pilih kapasitas', '128GB');
    pickFromDropdown('Pilih kondisi', 'Second iBox');

    fireEvent.change(screen.getByLabelText(/Jumlah Stok/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/Total Modal/i), { target: { value: '20000000' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Hutang ke Agen/i }));

    fireEvent.click(screen.getByRole('button', { name: /Simpan Pembelian/ }));

    await waitFor(() =>
      expect(recordPurchaseWithPostings).toHaveBeenCalledTimes(1),
    );

    const arg = recordPurchaseWithPostings.mock.calls[0][0];
    expect(arg.amount).toBe(20000000);
    expect(arg.items).toEqual([
      expect.objectContaining({
        model: 'iPhone 11',
        capacity: '128GB',
        condition: 'Second iBox',
        color: 'Random',
        imei: null,
        count: 10,
        cost_price: 2000000,
        price: 2000000,
      }),
    ]);
    expect(arg.agentDebt).toEqual(expect.objectContaining({
      agentId: AGENT_SUPPLIER.id,
      amount: 20000000,
    }));
  });

  it('records agen color-grouped stock without requiring IMEI', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /^agen$/i }));
    fireEvent.change(await screen.findByLabelText(/Nama Agen/i), {
      target: { value: AGENT_SUPPLIER.id },
    });
    fireEvent.click(screen.getByRole('button', { name: /Warna \+ Modal Tanpa IMEI/i }));

    pickFromDropdown('Pilih tipe HP', 'iPhone 13');
    pickFromDropdown('Pilih kapasitas', '128GB');
    pickFromDropdown('Pilih kondisi', 'Second iBox');

    fireEvent.change(screen.getByLabelText(/Warna Stok/i), { target: { value: 'Midnight' } });
    fireEvent.change(screen.getByLabelText(/Jumlah Unit/i), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/Modal per Unit/i), { target: { value: '4500000' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Hutang ke Agen/i }));

    fireEvent.click(screen.getByRole('button', { name: /Simpan Pembelian/ }));

    await waitFor(() =>
      expect(recordPurchaseWithPostings).toHaveBeenCalledTimes(1),
    );

    const arg = recordPurchaseWithPostings.mock.calls[0][0];
    expect(arg.amount).toBe(13500000);
    expect(arg.items).toEqual([
      expect.objectContaining({
        model: 'iPhone 13',
        capacity: '128GB',
        condition: 'Second iBox',
        color: 'Midnight',
        imei: null,
        count: 3,
        cost_price: 4500000,
        price: 4500000,
      }),
    ]);
  });
});
