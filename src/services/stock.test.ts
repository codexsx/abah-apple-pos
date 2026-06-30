// Feature: dr-htm-pos (Phase 3 — stock service)
// Unit tests for updateStockStatus / createStockItem.
// Validates: Requirements 7.1, 7.3, 7.4

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { updateStockStatus, createStockItem, moveStockUnitStatus } from './stock';

// Mock the supabase client as a chainable query builder. Every chain method
// (from/update/insert/eq/select) returns the same chain object, and the
// terminal .single() resolves to { data, error }.
vi.mock('@/lib/supabase', () => {
  const chain = {
    from: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
    rpc: vi.fn(),
  };
  // Each builder method returns the chain so calls can be fluently chained.
  chain.from.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return { supabase: chain };
});

// Import the mocked client to drive return values / inspect calls.
import { supabase } from '@/lib/supabase';

const chain = supabase as unknown as {
  from: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  // Reset call history but keep the chain wiring intact.
  chain.from.mockClear().mockReturnValue(chain);
  chain.update.mockClear().mockReturnValue(chain);
  chain.insert.mockClear().mockReturnValue(chain);
  chain.eq.mockClear().mockReturnValue(chain);
  chain.select.mockClear().mockReturnValue(chain);
  chain.single.mockReset();
  chain.rpc.mockReset();
});

describe('updateStockStatus', () => {
  it('updates the status on stock_items by id and returns the resolved data (Req 7.3, 7.4)', async () => {
    const updated = { id: 'unit-1', model: 'iPhone X', status: 'SERVIS' };
    chain.single.mockResolvedValue({ data: updated, error: null });

    const result = await updateStockStatus('unit-1', 'SERVIS');

    expect(chain.from).toHaveBeenCalledWith('stock_items');
    expect(chain.update).toHaveBeenCalledWith({ status: 'SERVIS' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'unit-1');
    expect(result).toBe(updated);
  });

  it('rethrows the error returned by Supabase (Req 7.4)', async () => {
    const theError = new Error('update failed');
    chain.single.mockResolvedValue({ data: null, error: theError });

    await expect(updateStockStatus('unit-1', 'SERVIS')).rejects.toBe(theError);
  });
});

describe('moveStockUnitStatus', () => {
  it('calls the atomic split/status RPC for one stock unit and returns affected rows', async () => {
    const rows = [
      { id: 'bulk-1', model: 'iPhone 11', count: 9, status: 'READY' },
      { id: 'service-1', model: 'iPhone 11', count: 1, status: 'SERVIS' },
    ];
    chain.rpc.mockResolvedValue({ data: rows, error: null });

    const result = await moveStockUnitStatus('bulk-1', 'SERVIS');

    expect(chain.rpc).toHaveBeenCalledWith('move_stock_unit_status', {
      p_stock_id: 'bulk-1',
      p_target_status: 'SERVIS',
    });
    expect(result).toBe(rows);
  });
});

describe('createStockItem', () => {
  it('inserts a no-IMEI unit and returns the resolved data (Req 7.1)', async () => {
    const item = {
      model: 'iPhone X',
      has_imei: false,
      imei: null,
      status: 'RUSAK' as const,
      count: 1,
      price: 1000000,
    };
    const created = { id: 'unit-new', ...item };
    chain.single.mockResolvedValue({ data: created, error: null });

    const result = await createStockItem(item);

    expect(chain.from).toHaveBeenCalledWith('stock_items');
    expect(chain.insert).toHaveBeenCalledTimes(1);
    const insertedArg = chain.insert.mock.calls[0][0];
    expect(insertedArg).toMatchObject({ has_imei: false, imei: null });
    expect(result).toBe(created);
  });
});
