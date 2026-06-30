import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { TransactionWithStockDetails } from '@/services/transactions';

// Mock the transactions service so getTransactionsWithStockDetailsByType is a controllable spy.
vi.mock('@/services/transactions', async () => {
  const actual = await vi.importActual<typeof import('@/services/transactions')>(
    '@/services/transactions',
  );
  return {
    ...actual,
    getTransactionsWithStockDetailsByType: vi.fn(),
  };
});

vi.mock('@/services/services', () => ({
  recordServiceWithStockStatus: vi.fn(),
}));

vi.mock('@/services/technicians', () => ({
  getTechnicians: vi.fn(),
}));

import { getTransactionsWithStockDetailsByType } from '@/services/transactions';
import { recordServiceWithStockStatus } from '@/services/services';
import { getTechnicians } from '@/services/technicians';
import RiwayatPembelian from './RiwayatPembelian';

const mockedGetByType = vi.mocked(getTransactionsWithStockDetailsByType);
const mockedRecordServiceWithStockStatus = vi.mocked(recordServiceWithStockStatus);
const mockedGetTechnicians = vi.mocked(getTechnicians);

// Use a fixed recent timestamp so the default "7 Hari" filter keeps it visible.
const RECENT_DATE = new Date().toISOString();

/** Render the page inside a router (component uses <Link to="/pembelian">). */
function renderPage() {
  return render(
    <MemoryRouter>
      <RiwayatPembelian />
    </MemoryRouter>
  );
}

/** Build a deterministic fake purchase transaction. */
function makeTx(overrides: Partial<TransactionWithStockDetails> = {}): TransactionWithStockDetails {
  return {
    id: 'TRX-001',
    type: 'Pembelian',
    description: 'iPhone 13 Pro',
    detail: 'Bekas mulus 256GB',
    amount: 12_000_000,
    created_at: RECENT_DATE,
    stock_items: [],
    ...overrides,
  };
}

describe('RiwayatPembelian — integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetTechnicians.mockResolvedValue([
      {
        id: 'tech-rendi',
        name: 'Rendi',
        is_active: true,
        created_at: RECENT_DATE,
        updated_at: RECENT_DATE,
      },
    ]);
    mockedRecordServiceWithStockStatus.mockResolvedValue('srv-claim-1');
  });

  it('fetches purchases on mount and renders them after loading', async () => {
    const txs = [
      makeTx({ id: 'TRX-001', description: 'iPhone 13 Pro', created_at: RECENT_DATE }),
      makeTx({ id: 'TRX-002', description: 'Samsung S22', amount: 8_500_000, created_at: RECENT_DATE }),
    ];
    mockedGetByType.mockResolvedValueOnce(txs);

    renderPage();

    // Called exactly once with the 'Pembelian' type.
    expect(mockedGetByType).toHaveBeenCalledTimes(1);
    expect(mockedGetByType).toHaveBeenCalledWith('Pembelian');

    // After the promise resolves, the transactions render.
    expect(await screen.findByText('iPhone 13 Pro')).toBeTruthy();
    expect(screen.getByText('Samsung S22')).toBeTruthy();

    // Loading indicator is gone.
    expect(screen.queryByText('Memuat transaksi...')).toBeNull();
  });

  it('renders linked stock unit details inside a purchase row', async () => {
    const txs = [
      makeTx({
        id: 'TRX-003',
        description: 'Pembelian iPhone 14 Pro',
        amount: 11_000_000,
        stock_items: [
          {
            id: 'STK-002',
            model: 'iPhone 14 Pro',
            capacity: '128GB',
            condition: 'Second iBox',
            color: 'Space Black',
            imei: '352461789012342',
            has_imei: true,
            status: 'READY',
            count: 1,
            price: 13_000_000,
            cost_price: 11_000_000,
            created_at: RECENT_DATE,
            updated_at: RECENT_DATE,
          },
        ],
      }),
    ];
    mockedGetByType.mockResolvedValueOnce(txs);

    renderPage();

    expect(await screen.findByText('iPhone 14 Pro 128GB')).toBeInTheDocument();
    expect(screen.getByText('352461789012342')).toBeInTheDocument();
  });

  it('records a warranty claim for one purchased stock unit and sends it to service with the selected technician', async () => {
    mockedGetByType.mockResolvedValue([
      makeTx({
        id: 'TRX-BULK',
        description: 'Pembelian 10 unit iPhone 11',
        stock_items: [
          {
            id: 'STK-BULK-11',
            model: 'iPhone 11',
            capacity: '128GB',
            condition: 'Second Inter',
            color: 'Random',
            imei: null,
            has_imei: false,
            status: 'READY',
            count: 10,
            price: 3_500_000,
            cost_price: 3_000_000,
            created_at: RECENT_DATE,
            updated_at: RECENT_DATE,
          },
        ],
      }),
    ]);

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Klaim Garansi iPhone 11/i }));
    fireEvent.change(screen.getByLabelText(/Keluhan Klaim/i), {
      target: { value: 'LCD bergaris setelah pembelian' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Rendi/i }));
    fireEvent.click(screen.getByRole('button', { name: /Simpan Klaim/i }));

    await waitFor(() =>
      expect(mockedRecordServiceWithStockStatus).toHaveBeenCalledTimes(1),
    );
    expect(mockedRecordServiceWithStockStatus).toHaveBeenCalledWith({
      stockId: 'STK-BULK-11',
      targetStatus: 'SERVIS',
      record: expect.objectContaining({
        customer_name: 'Klaim Pembelian',
        phone_model: 'iPhone 11',
        capacity: '128GB',
        condition: 'Second Inter',
        color: 'Random',
        imei: '',
        issue: 'LCD bergaris setelah pembelian',
        technician: 'Rendi',
        service_type: 'Klaim Garansi',
        status: 'ANTRIAN',
      }),
    });
  });

  it('renders the empty state when no purchases are returned', async () => {
    mockedGetByType.mockResolvedValueOnce([]);

    renderPage();

    expect(mockedGetByType).toHaveBeenCalledWith('Pembelian');

    expect(await screen.findByText('Belum ada transaksi pembelian')).toBeTruthy();
  });

  it('renders the error state with a retry button when the fetch rejects, and refetches on retry', async () => {
    // First call rejects → error state.
    mockedGetByType.mockRejectedValueOnce(new Error('Network down'));

    renderPage();

    // Error message + the specific error text are shown.
    expect(await screen.findByText('Gagal memuat transaksi')).toBeTruthy();
    expect(screen.getByText('Network down')).toBeTruthy();

    const retryButton = screen.getByRole('button', { name: /Coba Lagi/i });
    expect(retryButton).toBeTruthy();

    // Second call (on retry) succeeds → list renders.
    mockedGetByType.mockResolvedValueOnce([makeTx({ description: 'Xiaomi 13' })]);

    fireEvent.click(retryButton);

    expect(await screen.findByText('Xiaomi 13')).toBeTruthy();

    // Error state cleared, and the service was called again (mount + retry).
    await waitFor(() => expect(screen.queryByText('Gagal memuat transaksi')).toBeNull());
    expect(mockedGetByType).toHaveBeenCalledTimes(2);
    expect(mockedGetByType).toHaveBeenLastCalledWith('Pembelian');
  });
});
