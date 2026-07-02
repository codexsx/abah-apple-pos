import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  getTransactionChangeRequests,
  reviewTransactionChangeRequest,
  type TransactionChangeRequest,
} from '@/services/transactionApprovals';
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

const mockGetRequests = vi.mocked(getTransactionChangeRequests);
const mockReviewRequest = vi.mocked(reviewTransactionChangeRequest);

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

beforeEach(() => {
  mockGetRequests.mockReset();
  mockReviewRequest.mockReset();
});

describe('TransactionApprovals', () => {
  it('renders full transaction unit details including IMEI in approval cards', async () => {
    mockGetRequests.mockResolvedValueOnce([makeRequest()]);

    render(<TransactionApprovals />);

    expect(await screen.findAllByText('IMEI: 359481985375087')).toHaveLength(2);
    expect(screen.getAllByText('BH: 86%')).toHaveLength(2);
    expect(screen.getAllByText('Minus: Kaca Kamera Pecah')).toHaveLength(2);
  });
});
