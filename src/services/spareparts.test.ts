// Feature: complete-backends
// Unit tests for the spareparts inventory service layer.
//
// Mocks '@/lib/supabase' with a small chainable, thenable query builder and a
// per-table FIFO response queue. Each chain method returns the same builder;
// awaiting the builder (or calling .single()) resolves to a configured
// { data, error }. insert()/update() payloads are captured for assertions.

import { describe, it, expect, beforeEach, vi } from 'vitest';

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

function queueResult(table: string, result: QueryResult): void {
  const existing = tableResponses.get(table) ?? [];
  existing.push(result);
  tableResponses.set(table, existing);
}

function resetMock(): void {
  tableResponses.clear();
  calls.length = 0;
}

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
};

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return supabaseMock;
  },
}));

import {
  getSpareparts,
  createSparepart,
  updateSparepart,
  type Sparepart,
} from '@/services/spareparts';

function makeSparepart(overrides: Partial<Sparepart> = {}): Sparepart {
  return {
    id: 'sp-1',
    name: 'LCD iPhone 11',
    compatible_type: 'iPhone 11',
    stock: 3,
    min_stock: 2,
    buy_price: 200000,
    sell_price: 350000,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  resetMock();
});

describe('getSpareparts', () => {
  it('returns rows', async () => {
    const rows = [makeSparepart({ id: 'a' }), makeSparepart({ id: 'b' })];
    queueResult('spareparts', { data: rows });

    const result = await getSpareparts();

    expect(result).toEqual(rows);
    expect(calls[0].table).toBe('spareparts');
  });

  it('returns [] when data is null', async () => {
    queueResult('spareparts', { data: null });
    await expect(getSpareparts()).resolves.toEqual([]);
  });

  it('rejects when the query returns an error', async () => {
    queueResult('spareparts', { data: null, error: { message: 'boom' } });
    await expect(getSpareparts()).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('createSparepart', () => {
  it('inserts the input and returns the created row', async () => {
    const created = makeSparepart({ id: 'new' });
    queueResult('spareparts', { data: created });

    const result = await createSparepart({
      name: created.name,
      compatible_type: created.compatible_type,
      stock: 3,
      min_stock: 2,
      buy_price: 200000,
      sell_price: 350000,
    });

    expect(result).toEqual(created);
    const insertCall = calls.find((c) => c.insert !== undefined);
    expect(insertCall).toBeDefined();
    expect(insertCall!.insert).toMatchObject({ name: created.name, stock: 3 });
  });
});

describe('updateSparepart', () => {
  it('calls update with the patch plus a fresh updated_at', async () => {
    const updated = makeSparepart({ stock: 5 });
    queueResult('spareparts', { data: updated });

    const result = await updateSparepart('sp-1', { stock: 5 });

    expect(result).toEqual(updated);
    const updateCall = calls.find((c) => c.update !== undefined);
    expect(updateCall).toBeDefined();
    const payload = updateCall!.update as Record<string, unknown>;
    expect(payload.stock).toBe(5);
    expect(payload).toHaveProperty('updated_at');
    expect(typeof payload.updated_at).toBe('string');
  });

  it('rejects when the update returns an error', async () => {
    queueResult('spareparts', { data: null, error: { message: 'boom' } });
    await expect(
      updateSparepart('sp-1', { stock: 5 }),
    ).rejects.toMatchObject({ message: 'boom' });
  });
});
