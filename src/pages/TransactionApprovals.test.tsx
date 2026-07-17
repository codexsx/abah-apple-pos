import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  getTransactionChangeRequests,
  reviewTransactionChangeRequest,
  type TransactionChangeRequest,
} from '@/services/transactionApprovals';
import {
  getServiceChangeRequests,
  reviewServiceChangeRequest,
  type ServiceChangeRequest,
} from '@/services/serviceApprovals';
import TransactionApprovals from './TransactionApprovals';

vi.mock('@/services/transactionApprovals', async () => {
  const actual = await vi.importActual<typeof import('@/services/transactionApprovals')>(
    '@/services/transactionApprovals',
  );
  return {
    ...actual,
    getTransactionChangeRequests: vi.fn(),
    reviewTransactionChangeRequest: vi.fn(),
  };
});

vi.mock('@/services/serviceApprovals', async () => {
  const actual = await vi.importActual<typeof import('@/services/serviceApprovals')>(
    '@/services/serviceApprovals',
  );
  return {
    ...actual,
    getServiceChangeRequests: vi.fn(),
    reviewServiceChangeRequest: vi.fn(),
  };
});

const mockGetRequests = vi.mocked(getTransactionChangeRequests);
const mockReviewRequest = vi.mocked(reviewTransactionChangeRequest);
const mockGetServiceRequests = vi.mocked(getServiceChangeRequests);
const mockReviewServiceRequest = vi.mocked(reviewServiceChangeRequest);

function makeRequest(overrides: Partial<TransactionChangeRequest> = {}): TransactionChangeRequest {
  const detail = JSON.stringify({
    supplier: { name: 'OPAN' },
    specs: {
      model: 'iPhone 12 Pro Max',
      capacity: '128GB',
      condition: 'Second Inter Unlock Minus',
      color: 'Silver',
      quantity: 1,
    },
    units: [
      {
        imei: '359481985375087',
        batteryHealth: 86,
        defectDescription: 'Kaca Kamera Pecah',
        costPrice: 5_000_000,
        sellingPrice: 6_000_000,
      },
    ],
    payment: { debt: 5_000_000 },
  });

  return {
    id: 'request-1',
    transaction_id: 'transaction-1',
    action: 'edit',
    status: 'pending',
    requested_by: 'staff-1',
    reviewed_by: null,
    reason: 'Salah input tipe',
    proposed_description: 'OPAN - 1 unit iPhone 13 Promax',
    proposed_detail: detail,
    proposed_amount: 5_000_000,
    snapshot: {
      id: 'transaction-1',
      type: 'Pembelian',
      description: 'OPAN - 1 unit iPhone 12 Pro Max',
      detail,
      amount: 5_000_000,
      created_at: '2026-07-02T12:00:00.000Z',
      staff_id: null,
    },
    review_note: '',
    created_at: '2026-07-02T12:00:00.000Z',
    reviewed_at: null,
    transaction: {
      id: 'transaction-1',
      type: 'Pembelian',
      description: 'OPAN - 1 unit iPhone 12 Pro Max',
      detail,
      amount: 5_000_000,
      created_at: '2026-07-02T12:00:00.000Z',
      staff_id: null,
    },
    requester: {
      id: 'staff-1',
      name: 'Radiva',
      role: 'kasir',
      initials: 'RA',
    },
    reviewer: null,
    ...overrides,
  };
}

function makeServiceRequest(
  overrides: Partial<ServiceChangeRequest> = {},
): ServiceChangeRequest {
  return {
    id: 'svc-request-1',
    service_record_id: 'svc-1',
    status: 'pending',
    requested_by: 'staff-1',
    reviewed_by: null,
    reason: 'Salah hitung upah',
    // Di DB kolom `proposed` tersimpan snake_case (usages_upsert/usages_delete)
    // dan getServiceChangeRequests mengembalikan kolom mentah itu.
    proposed: {
      fields: { wage_amount: 350_000 },
      usages_upsert: [],
      usages_delete: [],
    } as unknown as ServiceChangeRequest['proposed'],
    snapshot: {
      id: 'svc-1',
      customer_name: 'Budi',
      phone_model: 'iPhone 11',
      capacity: '64GB',
      condition: 'Second',
      color: 'Hitam',
      imei: '352345678901234',
      battery_health: 89,
      issue: 'LCD pecah',
      additional_note: '',
      status: 'PROSES',
      service_type: 'Customer',
      technician: 'Andi',
      wage_amount: 310_000,
      usages: [],
    },
    review_note: '',
    created_at: '2026-07-02T12:00:00.000Z',
    reviewed_at: null,
    service_record: {
      id: 'svc-1',
      customer_name: 'Budi',
      phone_model: 'iPhone 11',
      capacity: '64GB',
      status: 'PROSES',
      service_type: 'Customer',
      technician: 'Andi',
    },
    requester: {
      id: 'staff-1',
      name: 'Radiva',
      role: 'kasir',
      initials: 'RA',
    },
    reviewer: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetRequests.mockReset();
  mockReviewRequest.mockReset();
  mockGetServiceRequests.mockReset();
  mockReviewServiceRequest.mockReset();
  mockGetRequests.mockResolvedValue([]);
  mockGetServiceRequests.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TransactionApprovals', () => {
  it('renders full transaction unit details including IMEI in approval cards', async () => {
    mockGetRequests.mockResolvedValueOnce([makeRequest()]);

    render(<TransactionApprovals />);

    expect(await screen.findAllByText('IMEI: 359481985375087')).toHaveLength(2);
    expect(screen.getAllByText('BH: 86%')).toHaveLength(2);
    expect(screen.getAllByText('Minus: Kaca Kamera Pecah')).toHaveLength(2);
  });

  it('menampilkan request servis pending dengan alasan dan baris diff', async () => {
    mockGetServiceRequests.mockResolvedValueOnce([makeServiceRequest()]);

    render(<TransactionApprovals />);

    expect(await screen.findByText('Upah: Rp 310.000 → Rp 350.000')).toBeInTheDocument();
    expect(screen.getByText(/Salah hitung upah/)).toBeInTheDocument();
    expect(screen.getByText('Approval Servis')).toBeInTheDocument();
    expect(screen.getByText(/iPhone 11/)).toBeInTheDocument();
  });

  it('klik Setujui pada kartu servis memanggil reviewServiceChangeRequest', async () => {
    mockGetServiceRequests.mockResolvedValue([makeServiceRequest()]);

    render(<TransactionApprovals />);

    fireEvent.click(await screen.findByRole('button', { name: 'Setujui' }));

    await waitFor(() =>
      expect(mockReviewServiceRequest).toHaveBeenCalledWith({
        requestId: 'svc-request-1',
        decision: 'approved',
        reviewNote: '',
      }),
    );
  });

  it('Setujui Semua di section servis me-review setiap request servis pending', async () => {
    mockGetServiceRequests.mockResolvedValue([
      makeServiceRequest(),
      makeServiceRequest({ id: 'svc-request-2', service_record_id: 'svc-2' }),
      makeServiceRequest({
        id: 'svc-request-3',
        service_record_id: 'svc-3',
        status: 'approved',
        reviewed_at: '2026-07-03T09:00:00.000Z',
        reviewer: { id: 'mgr-1', name: 'Manager', role: 'manajer', initials: 'MA' },
      }),
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<TransactionApprovals />);

    fireEvent.click(await screen.findByRole('button', { name: /Setujui Semua \(2\)/ }));

    await waitFor(() => expect(mockReviewServiceRequest).toHaveBeenCalledTimes(2));
    expect(mockReviewServiceRequest).toHaveBeenCalledWith({
      requestId: 'svc-request-1',
      decision: 'approved',
      reviewNote: '',
    });
    expect(mockReviewServiceRequest).toHaveBeenCalledWith({
      requestId: 'svc-request-2',
      decision: 'approved',
      reviewNote: '',
    });
    expect(await screen.findByText(/Berhasil: 2 disetujui/)).toBeInTheDocument();
  });

  it('Setujui Semua di section transaksi me-review setiap request transaksi pending', async () => {
    mockGetRequests.mockResolvedValue([
      makeRequest(),
      makeRequest({ id: 'request-2', transaction_id: 'transaction-2' }),
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<TransactionApprovals />);

    fireEvent.click(await screen.findByRole('button', { name: /Setujui Semua \(2\)/ }));

    await waitFor(() => expect(mockReviewRequest).toHaveBeenCalledTimes(2));
    expect(mockReviewRequest).toHaveBeenCalledWith({
      requestId: 'request-1',
      decision: 'approved',
      reviewNote: '',
    });
    expect(mockReviewRequest).toHaveBeenCalledWith({
      requestId: 'request-2',
      decision: 'approved',
      reviewNote: '',
    });
  });
});
