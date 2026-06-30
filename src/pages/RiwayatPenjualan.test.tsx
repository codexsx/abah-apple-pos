import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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

vi.mock('@/services/services', () => ({
  recordServiceWithStockStatus: vi.fn(),
}));

vi.mock('@/services/technicians', () => ({
  getTechnicians: vi.fn(),
}));

import { getTransactionsWithStockDetailsByType } from '@/services/transactions';
import { recordServiceWithStockStatus } from '@/services/services';
import { getTechnicians } from '@/services/technicians';
import RiwayatPenjualan from './RiwayatPenjualan';

const mockedGetByType = vi.mocked(getTransactionsWithStockDetailsByType);
const mockedRecordServiceWithStockStatus = vi.mocked(recordServiceWithStockStatus);
const mockedGetTechnicians = vi.mocked(getTechnicians);

// Use a fixed recent timestamp so the default "7 Hari" filter keeps it visible.
const RECENT_DATE = new Date().toISOString();

function makeTransaction(
  overrides: Partial<TransactionWithStockDetails> = {}
): TransactionWithStockDetails {
  return {
    id: 'TRX-001',
    type: 'Penjualan',
    description: 'iPhone 13 Pro',
    detail: '256GB - Graphite',
    amount: 12_500_000,
    created_at: RECENT_DATE,
    stock_items: [],
    ...overrides,
  };
}

describe('RiwayatPenjualan — integration', () => {
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

  it('fetches Penjualan transactions on mount and renders them after loading', async () => {
    const txns: TransactionWithStockDetails[] = [
      makeTransaction({
        id: 'TRX-001',
        description: 'iPhone 13 Pro',
        amount: 12_500_000,
      }),
      makeTransaction({
        id: 'TRX-002',
        description: 'Samsung S23',
        amount: 9_750_000,
        created_at: RECENT_DATE,
      }),
    ];
    mockedGetByType.mockResolvedValueOnce(txns);

    render(<RiwayatPenjualan />);

    // Called with the correct transaction type on mount.
    expect(mockedGetByType).toHaveBeenCalledTimes(1);
    expect(mockedGetByType).toHaveBeenCalledWith('Penjualan');

    // Descriptions render after the async load resolves.
    expect(await screen.findByText('iPhone 13 Pro')).toBeInTheDocument();
    expect(screen.getByText('Samsung S23')).toBeInTheDocument();

    // Amounts render formatted as Rupiah.
    expect(screen.getByText('Rp 12.500.000')).toBeInTheDocument();
    expect(screen.getByText('Rp 9.750.000')).toBeInTheDocument();
  });

  it('renders linked stock unit details inside a transaction row', async () => {
    const txns: TransactionWithStockDetails[] = [
      makeTransaction({
        id: 'TRX-003',
        description: 'Penjualan iPhone 14 Pro',
        amount: 15_000_000,
        stock_items: [
          {
            id: 'STK-001',
            model: 'iPhone 14 Pro',
            capacity: '256GB',
            condition: 'Second iBox',
            color: 'Deep Purple',
            imei: '352461789012341',
            has_imei: true,
            status: 'TERJUAL',
            count: 1,
            price: 15_000_000,
            cost_price: 12_000_000,
            created_at: RECENT_DATE,
            updated_at: RECENT_DATE,
          },
        ],
      }),
    ];
    mockedGetByType.mockResolvedValueOnce(txns);

    render(<RiwayatPenjualan />);

    const row = await screen.findByText('iPhone 14 Pro 256GB');
    const detail = row.closest('[class*="bg-slate-50"]') as HTMLElement;
    expect(detail).not.toBeNull();
    expect(within(detail).getByText('352461789012341')).toBeInTheDocument();
    expect(within(detail).getByText('Rp 15.000.000')).toBeInTheDocument();
  });

  it('formats serialized sale detail instead of rendering raw JSON', async () => {
    mockedGetByType.mockResolvedValueOnce([
      makeTransaction({
        id: 'TRX-JSON',
        description: 'Penjualan 1 unit untuk Adam test beli 2',
        detail: JSON.stringify({
          units: [
            {
              imei: '353535353535353',
              sellingPrice: 3_500_000,
              model: 'iPhone 8 Plus',
              capacity: '64GB',
              condition: 'Second Inter Unlock',
              color: 'Space Gray',
            },
          ],
          manualSalePrice: 0,
          imeiActivationPrice: 170_000,
          items: [],
          bonuses: [],
          warranty: '30 Hari',
          payment: { cash: 0, transfer: 3_670_000 },
          customer: { name: 'Adam test beli 2', phone: '08575469987288' },
          discount: 0,
        }),
      }),
    ]);

    render(<RiwayatPenjualan />);

    expect(
      await screen.findByText(
        /iPhone 8 Plus 64GB Second Inter Unlock Space Gray/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Customer: Adam test beli 2/i)).toBeInTheDocument();
    expect(screen.queryByText(/"units"/i)).not.toBeInTheDocument();
  });

  it('records a customer warranty claim from a sold stock unit and sends it to service', async () => {
    mockedGetByType.mockResolvedValue([
      makeTransaction({
        id: '44448314-a33b-4c51-b3ae-81b159339dfe',
        description: 'Penjualan 1 unit untuk Adam test beli 2',
        detail: JSON.stringify({
          units: [
            {
              imei: '353535353535353',
              sellingPrice: 3_500_000,
              model: 'iPhone 8 Plus',
              capacity: '64GB',
              condition: 'Second Inter Unlock',
              color: 'Space Gray',
              batteryHealth: 86,
            },
          ],
          manualSalePrice: 0,
          imeiActivationPrice: 170_000,
          items: [],
          bonuses: [],
          warranty: '30 Hari',
          payment: { cash: 0, transfer: 3_670_000 },
          customer: { name: 'Adam test beli 2', phone: '08575469987288' },
          discount: 0,
        }),
        stock_items: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            model: 'iPhone 8 Plus',
            capacity: '64GB',
            condition: 'Second Inter Unlock',
            color: 'Space Gray',
            imei: '353535353535353',
            has_imei: true,
            status: 'TERJUAL',
            count: 1,
            price: 3_500_000,
            cost_price: 2_900_000,
            created_at: RECENT_DATE,
            updated_at: RECENT_DATE,
          },
        ],
      }),
    ]);

    render(<RiwayatPenjualan />);

    fireEvent.click(
      await screen.findByRole('button', { name: /Klaim Garansi iPhone 8 Plus/i }),
    );
    fireEvent.change(screen.getByLabelText(/Keluhan Klaim/i), {
      target: { value: 'Speaker mati setelah dipakai' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Rendi/i }));
    fireEvent.click(screen.getByRole('button', { name: /Simpan Klaim/i }));

    await waitFor(() =>
      expect(mockedRecordServiceWithStockStatus).toHaveBeenCalledTimes(1),
    );
    expect(mockedRecordServiceWithStockStatus).toHaveBeenCalledWith({
      stockId: '11111111-1111-4111-8111-111111111111',
      targetStatus: 'SERVIS',
      record: expect.objectContaining({
        customer_name: 'Adam test beli 2',
        phone_model: 'iPhone 8 Plus',
        capacity: '64GB',
        condition: 'Second Inter Unlock',
        color: 'Space Gray',
        imei: '353535353535353',
        battery_health: 86,
        issue: 'Speaker mati setelah dipakai',
        technician: 'Rendi',
        service_type: 'Klaim Garansi',
        status: 'ANTRIAN',
      }),
    });
    expect(
      mockedRecordServiceWithStockStatus.mock.calls[0][0].record.additional_note,
    ).toContain('Tindak lanjut: Servis');
    expect(
      mockedRecordServiceWithStockStatus.mock.calls[0][0].record.additional_note,
    ).toContain('Garansi: 30 Hari');
  });

  it('renders the empty-state message when no transactions are returned', async () => {
    mockedGetByType.mockResolvedValueOnce([]);

    render(<RiwayatPenjualan />);

    expect(
      await screen.findByText('Belum ada transaksi penjualan')
    ).toBeInTheDocument();
  });

  it('renders the error state with a retry button when the fetch rejects', async () => {
    mockedGetByType.mockRejectedValueOnce(new Error('Network down'));

    render(<RiwayatPenjualan />);

    // Error heading and retry control appear.
    expect(await screen.findByText('Gagal memuat transaksi')).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: /Coba Lagi/i });
    expect(retryButton).toBeInTheDocument();

    // Retrying calls the service again; second call succeeds and renders data.
    mockedGetByType.mockResolvedValueOnce([
      makeTransaction({ id: 'TRX-003', description: 'Xiaomi 13', amount: 5_000_000 }),
    ]);
    fireEvent.click(retryButton);

    await waitFor(() => expect(mockedGetByType).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Xiaomi 13')).toBeInTheDocument();
  });
});
