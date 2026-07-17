import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServiceRecord, ServiceSparepartUsage } from './services';

const mocks = vi.hoisted(() => {
  const from = vi.fn();
  const insert = vi.fn();
  const insertSelect = vi.fn();
  const select = vi.fn();
  const order = vi.fn();
  const eq = vi.fn();
  const single = vi.fn();
  const rpc = vi.fn();
  return { from, insert, insertSelect, select, order, eq, single, rpc };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

import {
  buildServiceChangeCurrentValue,
  getPendingServiceChangeRecordIds,
  getServiceChangeRequests,
  reviewServiceChangeRequest,
  submitServiceChangeRequest,
} from './serviceApprovals';

function makeRecord(overrides: Partial<ServiceRecord> = {}): ServiceRecord {
  return {
    id: 'srv-1',
    customer_name: 'Budi',
    phone_model: 'iPhone 11',
    capacity: '64GB',
    condition: 'Second Inter',
    color: 'Space Black',
    imei: '352345678901234',
    battery_health: 85,
    issue: 'LCD pecah',
    additional_note: '',
    status: 'PROSES',
    estimated_cost: 500_000,
    work_cost: 310_000,
    dp: 0,
    created_at: '2026-07-17T00:00:00Z',
    completed_at: null,
    technician: 'Rendi',
    service_type: 'Customer',
    stk_id: '',
    wage_amount: 310_000,
    wage_paid: false,
    picked_up: false,
    picked_up_at: null,
    ...overrides,
  };
}

const usage: ServiceSparepartUsage = {
  id: 'usage-1',
  service_record_id: 'srv-1',
  sparepart_id: null,
  sparepart_name: 'Spare Part Manual',
  quantity: 1,
  unit_cost: 190_000,
  total_cost: 190_000,
  created_at: '2026-07-17T00:00:00Z',
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());

  mocks.from.mockReturnValue({
    insert: mocks.insert,
    select: mocks.select,
  });
  mocks.insert.mockReturnValue({ select: mocks.insertSelect });
  mocks.insertSelect.mockReturnValue({ single: mocks.single });
  mocks.single.mockResolvedValue({ data: { id: 'req-1' }, error: null });
  mocks.select.mockReturnValue({ order: mocks.order, eq: mocks.eq });
  mocks.order.mockResolvedValue({ data: [], error: null });
  mocks.eq.mockResolvedValue({ data: [], error: null });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});

describe('serviceApprovals service', () => {
  it('submits a normalized request with record+usage snapshot', async () => {
    const result = await submitServiceChangeRequest({
      record: makeRecord(),
      usages: [usage],
      reason: '  Salah hitung modal part  ',
      requestedBy: 'staff-1',
      proposed: {
        fields: { wage_amount: 350_000 },
        usagesUpsert: [{ id: 'usage-1', quantity: 2, unit_cost: 100_000 }],
      },
    });

    expect(result.id).toBe('req-1');
    expect(mocks.from).toHaveBeenCalledWith('service_change_requests');
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        service_record_id: 'srv-1',
        requested_by: 'staff-1',
        reason: 'Salah hitung modal part',
        proposed: {
          fields: { wage_amount: 350_000 },
          usages_upsert: [{ id: 'usage-1', quantity: 2, unit_cost: 100_000 }],
          usages_delete: [],
        },
      }),
    );

    const inserted = mocks.insert.mock.calls[0][0];
    expect(inserted.snapshot).toMatchObject({
      id: 'srv-1',
      customer_name: 'Budi',
      wage_amount: 310_000,
      usages: [{ id: 'usage-1', quantity: 1, unit_cost: 190_000 }],
    });
  });

  it('rejects a request without an effective change before touching the DB', async () => {
    await expect(
      submitServiceChangeRequest({
        record: makeRecord(),
        usages: [usage],
        reason: 'coba',
        requestedBy: 'staff-1',
        proposed: { fields: { customer_name: 'Budi' } },
      }),
    ).rejects.toThrow('Tidak ada perubahan');

    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects a blank reason', async () => {
    await expect(
      submitServiceChangeRequest({
        record: makeRecord(),
        usages: [usage],
        reason: '   ',
        requestedBy: 'staff-1',
        proposed: { fields: { customer_name: 'Budi Baru' } },
      }),
    ).rejects.toThrow('Alasan');
  });

  it('fetches requests with joins', async () => {
    mocks.order.mockResolvedValue({ data: [{ id: 'req-1' }], error: null });

    const result = await getServiceChangeRequests();

    expect(mocks.from).toHaveBeenCalledWith('service_change_requests');
    expect(mocks.select).toHaveBeenCalledWith(
      expect.stringContaining('service_record:service_records'),
    );
    expect(result).toEqual([{ id: 'req-1' }]);
  });

  it('returns pending record ids as a Set', async () => {
    mocks.eq.mockResolvedValue({
      data: [{ service_record_id: 'srv-1' }, { service_record_id: 'srv-2' }],
      error: null,
    });

    const result = await getPendingServiceChangeRecordIds();

    expect(mocks.eq).toHaveBeenCalledWith('status', 'pending');
    expect(result).toEqual(new Set(['srv-1', 'srv-2']));
  });

  it('reviews a request through the RPC', async () => {
    await reviewServiceChangeRequest({
      requestId: 'req-1',
      decision: 'approved',
      reviewNote: 'ok',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('review_service_change_request', {
      p_request_id: 'req-1',
      p_decision: 'approved',
      p_review_note: 'ok',
    });
  });

  it('throws when the review RPC fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('boom') });

    await expect(
      reviewServiceChangeRequest({ requestId: 'req-1', decision: 'rejected' }),
    ).rejects.toThrow('boom');
  });

  it('buildServiceChangeCurrentValue maps record fields and filters usages by record', () => {
    const current = buildServiceChangeCurrentValue(makeRecord(), [
      usage,
      { ...usage, id: 'usage-lain', service_record_id: 'srv-lain' },
    ]);

    expect(current.fields.customer_name).toBe('Budi');
    expect(current.fields.wage_amount).toBe(310_000);
    expect(current.usages).toHaveLength(1);
    expect(current.usages[0].id).toBe('usage-1');
  });
});
