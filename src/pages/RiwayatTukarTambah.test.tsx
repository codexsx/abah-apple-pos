import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { TransactionWithStockDetails } from '@/services/transactions';

// Mock the transactions service so we control getTransactionsWithStockDetailsByType.
vi.mock('@/services/transactions', async () => {
  const actual = await vi.importActual<typeof import('@/services/transactions')>(
    '@/services/transactions',
  );
  return {
    ...actual,
    getTransactionsWithStockDetailsByType: vi.fn(),
  };
});

import { getTransactionsWithStockDetailsByType } from '@/services/transactions';
import RiwayatTukarTambah from './RiwayatTukarTambah';

const mockedGetByType = vi.mocked(getTransactionsWithStockDetailsByType);

// Use a fixed recent timestamp so the default "7 Hari" filter keeps it visible.
const RECENT_DATE = new Date().toISOString();

function makeTransaction(
  overrides: Partial<TransactionWithStockDetails> = {}
): TransactionWithStockDetails {
  return {
    id: 'TT-001',
    type: 'Tukar Tambah',
    description: 'iPhone 12 → iPhone 14',
    detail: '128GB - Midnight',
    amount: 4_500_000,
    created_at: RECENT_DATE,
    stock_items: [],
    ...overrides,
  };
}

describe('RiwayatTukarTambah — integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches Tukar Tambah transactions on mount and renders them after loading', async () => {
    const txns: TransactionWithStockDetails[] = [
      makeTransaction({
        id: 'TT-001',
        description: 'iPhone 12 → iPhone 14',
        amount: 4_500_000,
      }),
      makeTransaction({
        id: 'TT-002',
        description: 'Samsung A52 → S23',
        amount: 6_250_000,
        created_at: RECENT_DATE,
      }),
    ];
    mockedGetByType.mockResolvedValueOnce(txns);

    render(<RiwayatTukarTambah />);

    // Called with the correct transaction type on mount.
    expect(mockedGetByType).toHaveBeenCalledTimes(1);
    expect(mockedGetByType).toHaveBeenCalledWith('Tukar Tambah');

    // Descriptions render after the async load resolves.
    expect(await screen.findByText('iPhone 12 → iPhone 14')).toBeInTheDocument();
    expect(screen.getByText('Samsung A52 → S23')).toBeInTheDocument();

    // Amounts render formatted as Rupiah.
    expect(screen.getByText('Rp 4.500.000')).toBeInTheDocument();
    expect(screen.getByText('Rp 6.250.000')).toBeInTheDocument();
  });

  it('renders linked stock unit details inside a tukar tambah row', async () => {
    const txns: TransactionWithStockDetails[] = [
      makeTransaction({
        id: 'TT-003',
        description: 'TT iPhone 11 → iPhone 13',
        amount: 2_000_000,
        stock_items: [
          {
            id: 'STK-003',
            model: 'iPhone 13',
            capacity: '128GB',
            condition: 'Second iBox',
            color: 'Midnight',
            imei: null,
            has_imei: false,
            status: 'READY',
            count: 1,
            price: 9_000_000,
            cost_price: 7_000_000,
            created_at: RECENT_DATE,
            updated_at: RECENT_DATE,
          },
        ],
      }),
    ];
    mockedGetByType.mockResolvedValueOnce(txns);

    render(<RiwayatTukarTambah />);

    expect(await screen.findByText('iPhone 13 128GB')).toBeInTheDocument();
    expect(screen.getByText('Rp 9.000.000')).toBeInTheDocument();
  });

  it('renders the empty-state message when no transactions are returned', async () => {
    mockedGetByType.mockResolvedValueOnce([]);

    render(<RiwayatTukarTambah />);

    expect(
      await screen.findByText('Belum ada transaksi tukar tambah')
    ).toBeInTheDocument();
  });

  it('renders the error state with a retry button when the fetch rejects', async () => {
    mockedGetByType.mockRejectedValueOnce(new Error('Network down'));

    render(<RiwayatTukarTambah />);

    // Error heading and retry control appear.
    expect(await screen.findByText('Gagal memuat transaksi')).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: /Coba Lagi/i });
    expect(retryButton).toBeInTheDocument();

    // Retrying calls the service again; second call succeeds and renders data.
    mockedGetByType.mockResolvedValueOnce([
      makeTransaction({ id: 'TT-003', description: 'Oppo Reno → Pixel 8', amount: 3_000_000 }),
    ]);
    fireEvent.click(retryButton);

    await waitFor(() => expect(mockedGetByType).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Oppo Reno → Pixel 8')).toBeInTheDocument();
  });
});
