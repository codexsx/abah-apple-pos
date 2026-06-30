// Feature: complete-backends
// Unit tests for the accessories stock service layer.
//
// The service talks to Supabase exclusively through the shared `supabase`
// client, using a chained query builder and `supabase.rpc(...)`. We mock
// '@/lib/supabase' with a small, flexible builder: every chain method returns
// the same builder, the builder is thenable (awaitable) and resolves to a
// configurable { data, error }, and each table is given its own FIFO queue of
// responses. `rpc` is a plain spy whose result is configured per-test.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

interface QueryResult {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}

interface CallRecord {
  table: string;
  insert?: unknown;
  update?: unknown;
}

const tableResponses = new Map<string, QueryResult[]>();
const calls: CallRecord[] = [];
const rpc = vi.fn();

/** Queue a result to be returned for the next query against `table`. */
function queueResult(table: string, result: QueryResult): void {
  const existing = tableResponses.get(table) ?? [];
  existing.push(result);
  tableResponses.set(table, existing);
}

function resetMock(): void {
  tableResponses.clear();
  calls.length = 0;
  rpc.mockReset();
}

/** Build a chainable, thenable query builder bound to a single result. */
function makeBuilder(result: QueryResult, record: CallRecord) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
  };

  const builder: Record<string, unknown> = {};

  const chain = (fn?: (...args: unknown[]) => void) => {
    return (...args: unknown[]) => {
      fn?.(...args);
      return builder;
    };
  };

  builder.select = chain();
  builder.eq = chain();
  builder.order = chain();
  builder.insert = chain((payload) => {
    record.insert = payload;
  });
  builder.update = chain((payload) => {
    record.update = payload;
  });
  builder.delete = chain();
  builder.single = () => Promise.resolve(resolved);
  builder.maybeSingle = () => Promise.resolve(resolved);
  builder.then = (onFulfilled: (value: QueryResult) => unknown) =>
    Promise.resolve(resolved).then(onFulfilled);

  return builder;
}

const supabaseMock = {
  from(table: string) {
    const queue = tableResponses.get(table);
    if (!queue || queue.length === 0) {
      throw new Error(
        `No queued supabase result for table "${table}". ` +
          `Queue a result with queueResult('${table}', ...) in the test.`,
      );
    }
    const result = queue.shift()!;
    const record: CallRecord = { table };
    calls.push(record);
    return makeBuilder(result, record);
  },
  rpc,
};

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return supabaseMock;
  },
}));

// Imported after vi.mock so the service binds to the mocked client.
import {
  getAccessories,
  createAccessory,
  takeAccessory,
  restockAccessory,
  type Accessory,
} from '@/services/accessories';

function makeAccessory(overrides: Partial<Accessory> = {}): Accessory {
  return {
    id: 'acc-1',
    name: 'Charger 65W',
    category: 'charger',
    stock: 10,
    status: 'AMAN',
    min_stock: 5,
    price: 1000,
    ...overrides,
  };
}

beforeEach(() => {
  resetMock();
});

describe('getAccessories', () => {
  it('returns rows ordered by name', async () => {
    const rows = [makeAccessory({ id: 'a' }), makeAccessory({ id: 'b' })];
    queueResult('accessory_stock', { data: rows });

    const result = await getAccessories();

    expect(result).toEqual(rows);
    expect(calls[0].table).toBe('accessory_stock');
  });

  it('returns [] when data is null', async () => {
    queueResult('accessory_stock', { data: null });
    await expect(getAccessories()).resolves.toEqual([]);
  });

  it('rejects when the query returns an error', async () => {
    queueResult('accessory_stock', {
      data: null,
      error: { message: 'boom' },
    });
    await expect(getAccessories()).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('createAccessory', () => {
  it("inserts with computed status 'HABIS' when stock is 0", async () => {
    const created = makeAccessory({ stock: 0, status: 'HABIS' });
    queueResult('accessory_stock', { data: created });

    const result = await createAccessory({
      name: created.name,
      category: 'charger',
      stock: 0,
      min_stock: 5,
      price: 1000,
    });

    expect(result).toEqual(created);
    const insertCall = calls.find((c) => c.insert !== undefined);
    expect(insertCall).toBeDefined();
    expect(insertCall!.insert).toMatchObject({ status: 'HABIS', stock: 0 });
  });
});

describe('takeAccessory', () => {
  it('calls rpc with a negative delta and returns data', async () => {
    const updated = makeAccessory({ stock: 7 });
    rpc.mockResolvedValue({ data: updated, error: null });

    const result = await takeAccessory('acc-1', 3);

    expect(rpc).toHaveBeenCalledWith('adjust_accessory_stock', {
      p_id: 'acc-1',
      p_delta: -3,
    });
    expect(result).toEqual(updated);
  });

  it('rejects when rpc returns an error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rpc boom' } });
    await expect(takeAccessory('acc-1', 3)).rejects.toMatchObject({
      message: 'rpc boom',
    });
  });
});

describe('restockAccessory', () => {
  it('calls rpc with a positive delta', async () => {
    const updated = makeAccessory({ stock: 12 });
    rpc.mockResolvedValue({ data: updated, error: null });

    const result = await restockAccessory('acc-1', 2);

    expect(rpc).toHaveBeenCalledWith('adjust_accessory_stock', {
      p_id: 'acc-1',
      p_delta: 2,
    });
    expect(result).toEqual(updated);
  });
});
