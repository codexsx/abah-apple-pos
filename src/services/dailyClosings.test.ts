// Feature: complete-backends
// Unit tests for the daily closings service layer.
//
// Mocks '@/lib/supabase' with a small chainable, thenable query builder and a
// per-table FIFO response queue. getClosingByDate uses .single() and treats the
// PostgREST "no rows" code (PGRST116) as a null result rather than an error.

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
  getDailyClosings,
  getClosingByDate,
  createDailyClosing,
  type DailyClosing,
} from '@/services/dailyClosings';

function makeClosing(overrides: Partial<DailyClosing> = {}): DailyClosing {
  return {
    id: 'dc-1',
    closing_date: '2026-06-27',
    summary: {},
    note: '',
    created_at: '2026-06-27T18:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  resetMock();
});

describe('getDailyClosings', () => {
  it('returns rows ordered by closing_date', async () => {
    const rows = [
      makeClosing({ id: 'a', closing_date: '2026-06-27' }),
      makeClosing({ id: 'b', closing_date: '2026-06-26' }),
    ];
    queueResult('daily_closings', { data: rows });

    const result = await getDailyClosings();

    expect(result).toEqual(rows);
    expect(calls[0].table).toBe('daily_closings');
  });

  it('returns [] when data is null', async () => {
    queueResult('daily_closings', { data: null });
    await expect(getDailyClosings()).resolves.toEqual([]);
  });

  it('rejects when the query returns an error', async () => {
    queueResult('daily_closings', { data: null, error: { message: 'boom' } });
    await expect(getDailyClosings()).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('getClosingByDate', () => {
  it('returns null when the error code is PGRST116 (no rows)', async () => {
    queueResult('daily_closings', {
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    });

    await expect(getClosingByDate('2026-06-27')).resolves.toBeNull();
  });

  it('returns the closing when one exists', async () => {
    const closing = makeClosing();
    queueResult('daily_closings', { data: closing });

    await expect(getClosingByDate('2026-06-27')).resolves.toEqual(closing);
  });

  it('rejects on a non-PGRST116 error', async () => {
    queueResult('daily_closings', {
      data: null,
      error: { code: '500', message: 'boom' },
    });

    await expect(getClosingByDate('2026-06-27')).rejects.toMatchObject({
      message: 'boom',
    });
  });
});

describe('createDailyClosing', () => {
  it('inserts the input and returns the created row', async () => {
    const created = makeClosing({ id: 'new' });
    queueResult('daily_closings', { data: created });

    const result = await createDailyClosing({
      closing_date: '2026-06-27',
      summary: {},
    });

    expect(result).toEqual(created);
    const insertCall = calls.find((c) => c.insert !== undefined);
    expect(insertCall).toBeDefined();
    expect(insertCall!.insert).toMatchObject({ closing_date: '2026-06-27' });
  });
});
