import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { TransactionWithStockDetails } from '@/services/transactions';

// Mock the transactions service so getTransactionsWithStockDetailsByTypes is a controllable spy.
vi.mock('@/services/transactions', async () => {
  const actual = await vi.importActual<typeof import('@/services/transactions')>(
    '@/services/transactions',
  );
  return {
    ...actual,
    getTransactionsWithStockDetailsByTypes: vi.fn(),
  };
});

import { getTransactionsWithStockDetailsByTypes } from '@/services/transactions';
import RiwayatPengeluaran from './RiwayatPengeluaran';

const mockedGet = vi.mocked(getTransactionsWithStockDetailsByTypes);

// Use a fixed recent timestamp so the default "7 Hari" filter keeps it visible.
const RECENT_DATE = new Date().toISOString();

function makeTx(overrides: Partial<TransactionWithStockDetails> = {}): TransactionWithStockDetails {
  return {
    id: 'TX-001',
    type: 'Pengeluaran',
    description: 'Bayar Listrik',
    detail: 'Tagihan bulan ini',
    amount: 150000,
    created_at: RECENT_DATE,
    stock_items: [],
    ...overrides,
  };
}

describe('RiwayatPengeluaran', () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it('fetches cash movement transactions on mount and renders them after loading', async () => {
    const txs = [
      makeTx({ id: 'TX-001', description: 'Bayar Listrik', amount: 150000 }),
      makeTx({ id: 'TX-002', description: 'Beli ATK', amount: 75000 }),
      makeTx({ id: 'TX-003', type: 'Upah Servis', description: 'Upah Rendi', amount: 200000 }),
      makeTx({ id: 'TX-004', type: 'Pemasukan Lain', description: 'Bonus Transfer', amount: 500000 }),
    ];
    mockedGet.mockResolvedValueOnce(txs);

    render(<RiwayatPengeluaran />);

    // Called with every transaction type that belongs in cash movement history.
    expect(mockedGet).toHaveBeenCalledWith(['Pengeluaran', 'Upah Servis', 'Pemasukan Lain']);

    // Transactions render once loading resolves.
    expect(await screen.findByText('Bayar Listrik')).toBeInTheDocument();
    expect(screen.getByText('Beli ATK')).toBeInTheDocument();
    expect(screen.getByText('Upah Rendi')).toBeInTheDocument();
    expect(screen.getByText('Bonus Transfer')).toBeInTheDocument();
  });

  it('renders the empty-state message when no transactions are returned', async () => {
    mockedGet.mockResolvedValueOnce([]);

    render(<RiwayatPengeluaran />);

    expect(
      await screen.findByText('Belum ada transaksi pengeluaran')
    ).toBeInTheDocument();
  });

  it('renders the error state with a retry button when the fetch rejects', async () => {
    mockedGet.mockRejectedValueOnce(new Error('Network down'));

    render(<RiwayatPengeluaran />);

    expect(await screen.findByText('Gagal memuat transaksi')).toBeInTheDocument();
    expect(screen.getByText('Network down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Coba Lagi/i })).toBeInTheDocument();
  });

  it('re-fetches when the retry button is clicked', async () => {
    // First call fails, second call succeeds.
    mockedGet
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce([makeTx({ id: 'TX-003', description: 'Sewa Toko' })]);

    render(<RiwayatPengeluaran />);

    const retryButton = await screen.findByRole('button', { name: /Coba Lagi/i });
    expect(mockedGet).toHaveBeenCalledTimes(1);

    fireEvent.click(retryButton);

    // Retry triggers a second fetch and renders the new data.
    expect(await screen.findByText('Sewa Toko')).toBeInTheDocument();
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    expect(mockedGet).toHaveBeenLastCalledWith(['Pengeluaran', 'Upah Servis', 'Pemasukan Lain']);
  });
});
