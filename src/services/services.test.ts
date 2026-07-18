import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  getTechnicians,
  createTechnician,
  updateTechnician,
  deactivateTechnician,
  recordServiceWithStockStatus,
  getServiceSparepartUsages,
  recordServiceSparepartUsage,
  recordManualServiceSparepartCost,
  updateServiceCostFields,
} from './services';

vi.mock('@/lib/supabase', () => {
  const chain = {
    from: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
    rpc: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  return { supabase: chain };
});

import { supabase } from '@/lib/supabase';

const chain = supabase as unknown as {
  from: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  chain.from.mockClear().mockReturnValue(chain);
  chain.select.mockClear().mockReturnValue(chain);
  chain.insert.mockClear().mockReturnValue(chain);
  chain.update.mockClear().mockReturnValue(chain);
  chain.eq.mockClear().mockReturnValue(chain);
  chain.order.mockClear().mockReturnValue(chain);
  chain.single.mockReset();
  chain.rpc.mockReset();
});

describe('technicians service', () => {
  it('loads active technicians ordered by name', async () => {
    const rows = [{ id: 'tech-1', name: 'Rendi', is_active: true }];
    chain.order.mockResolvedValue({ data: rows, error: null });

    const result = await getTechnicians();

    expect(chain.from).toHaveBeenCalledWith('technicians');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('is_active', true);
    expect(chain.order).toHaveBeenCalledWith('name', { ascending: true });
    expect(result).toBe(rows);
  });

  it('creates, updates, and deactivates technician names', async () => {
    const created = { id: 'tech-new', name: 'Adit', is_active: true };
    const updated = { id: 'tech-new', name: 'Adit Service', is_active: true };
    const deactivated = { id: 'tech-new', name: 'Adit Service', is_active: false };
    chain.single
      .mockResolvedValueOnce({ data: created, error: null })
      .mockResolvedValueOnce({ data: updated, error: null })
      .mockResolvedValueOnce({ data: deactivated, error: null });

    await expect(createTechnician({ name: 'Adit' })).resolves.toBe(created);
    expect(chain.insert).toHaveBeenCalledWith({ name: 'Adit', is_active: true });

    await expect(updateTechnician('tech-new', { name: 'Adit Service' })).resolves.toBe(updated);
    expect(chain.update).toHaveBeenCalledWith({ name: 'Adit Service' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'tech-new');

    await expect(deactivateTechnician('tech-new')).resolves.toBe(deactivated);
    expect(chain.update).toHaveBeenLastCalledWith({ is_active: false });
  });
});

describe('recordServiceWithStockStatus', () => {
  it('passes the service record and target stock status to the atomic RPC', async () => {
    chain.rpc.mockResolvedValue({ data: 'srv-1', error: null });

    const result = await recordServiceWithStockStatus({
      stockId: 'stock-1',
      targetStatus: 'SERVIS',
      record: {
        customer_name: 'Klaim Pembelian',
        phone_model: 'iPhone 11',
        capacity: '128GB',
        condition: 'Second Inter',
        color: 'Random',
        imei: '',
        battery_health: null,
        issue: 'LCD bergaris',
        additional_note: '',
        status: 'ANTRIAN',
        estimated_cost: 0,
        dp: 0,
        completed_at: null,
        technician: 'Rendi',
        service_type: 'Klaim Garansi',
        stk_id: '',
        wage_amount: 0,
        wage_paid: false,
        picked_up: false,
        picked_up_at: null,
      },
    });

    expect(result).toBe('srv-1');
    expect(chain.rpc).toHaveBeenCalledWith('record_service_with_stock_status', {
      p_stock_id: 'stock-1',
      p_target_status: 'SERVIS',
      p_record: expect.objectContaining({
        customer_name: 'Klaim Pembelian',
        phone_model: 'iPhone 11',
        technician: 'Rendi',
        service_type: 'Klaim Garansi',
      }),
    });
  });
});

describe('service sparepart usage', () => {
  it('loads sparepart usages ordered by created_at', async () => {
    const rows = [
      {
        id: 'usage-1',
        service_record_id: 'srv-1',
        sparepart_id: 'sp-1',
        sparepart_name: 'Battery iPhone 11',
        quantity: 2,
        unit_cost: 120000,
        total_cost: 240000,
      },
    ];
    chain.order.mockResolvedValue({ data: rows, error: null });

    const result = await getServiceSparepartUsages();

    expect(chain.from).toHaveBeenCalledWith('service_sparepart_usages');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(result).toBe(rows);
  });

  it('records sparepart usage through the atomic RPC', async () => {
    const row = {
      id: 'usage-1',
      service_record_id: 'srv-1',
      sparepart_id: 'sp-1',
      sparepart_name: 'Battery iPhone 11',
      quantity: 2,
      unit_cost: 120000,
      total_cost: 240000,
    };
    chain.rpc.mockResolvedValue({ data: row, error: null });

    const result = await recordServiceSparepartUsage({
      serviceRecordId: 'srv-1',
      sparepartId: 'sp-1',
      quantity: 2,
      unitCost: 120000,
    });

    expect(result).toBe(row);
    expect(chain.rpc).toHaveBeenCalledWith('record_service_sparepart_usage', {
      p_service_record_id: 'srv-1',
      p_sparepart_id: 'sp-1',
      p_quantity: 2,
      p_unit_cost: 120000,
    });
  });

  it('records a manual sparepart estimate and recalculates service total', async () => {
    const row = {
      id: 'usage-manual-1',
      service_record_id: 'srv-1',
      sparepart_id: null,
      sparepart_name: 'Spare Part Manual',
      quantity: 1,
      unit_cost: 150000,
      total_cost: 150000,
    };
    chain.single.mockResolvedValue({ data: row, error: null });
    chain.rpc.mockResolvedValue({ data: null, error: null });

    const result = await recordManualServiceSparepartCost({
      serviceRecordId: 'srv-1',
      totalCost: 150000,
    });

    expect(result).toBe(row);
    expect(chain.from).toHaveBeenCalledWith('service_sparepart_usages');
    expect(chain.insert).toHaveBeenCalledWith({
      service_record_id: 'srv-1',
      sparepart_id: null,
      sparepart_name: 'Spare Part Manual',
      quantity: 1,
      unit_cost: 150000,
    });
    expect(chain.rpc).toHaveBeenCalledWith('recalculate_service_total_cost', {
      p_service_record_id: 'srv-1',
    });
  });

  it('skips manual sparepart persistence when cost is empty', async () => {
    const result = await recordManualServiceSparepartCost({
      serviceRecordId: 'srv-1',
      totalCost: 0,
    });

    expect(result).toBeNull();
    expect(chain.insert).not.toHaveBeenCalled();
    expect(chain.rpc).not.toHaveBeenCalled();
  });

  it('updates editable service cost fields through the recalculation RPC', async () => {
    chain.rpc.mockResolvedValue({ data: null, error: null });

    await updateServiceCostFields({
      serviceRecordId: 'srv-1',
      workCost: 350000,
      wageAmount: 50000,
    });

    expect(chain.rpc).toHaveBeenCalledWith('update_service_cost_fields', {
      p_service_record_id: 'srv-1',
      p_work_cost: 350000,
      p_wage_amount: 50000,
    });
  });
});
