// Feature: financial-accounts
// Unit/integration tests for the accounts/ledger service layer.
//
// The service talks to Supabase exclusively through the shared `supabase`
// client, using chained query-builder calls. We mock '@/lib/supabase' with a
// small, flexible builder: every builder method returns `this`, the builder is
// thenable (awaitable) and resolves to a configurable { data, error, count },
// and each table is given its own queue of responses so a single test can
// drive multiple sequential queries against different tables.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------
//
// `tableResponses` maps a table name to a FIFO queue of results. Each call to
// `supabase.from(table)` shifts the next queued result for that table and binds
// it to the builder that the chained call eventually awaits. `lastInsert` /
// `lastUpdate` capture the payloads passed to insert()/update() so tests can
// assert on what the service actually sent.

interface QueryResult {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
  count?: number | null;
}

interface CallRecord {
  table: string;
  insert?: unknown;
  update?: unknown;
}

const tableResponses = new Map<string, QueryResult[]>();
const calls: CallRecord[] = [];

/** Queue a result to be returned for the next query against `table`. */
function queueResult(table: string, result: QueryResult): void {
  const existing = tableResponses.get(table) ?? [];
  existing.push(result);
  tableResponses.set(table, existing);
}

function resetMock(): void {
  tableResponses.clear();
  calls.length = 0;
}

/**
 * Build a chainable, thenable query builder bound to a single result. Every
 * chain method returns the same builder; awaiting the builder (or calling
 * `.single()` / terminal methods) resolves to the bound result.
 */
function makeBuilder(result: QueryResult, record: CallRecord) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
    count: result.count ?? null,
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
  builder.neq = chain();
  builder.order = chain();
  builder.limit = chain();
  builder.insert = chain((payload) => {
    record.insert = payload;
  });
  builder.update = chain((payload) => {
    record.update = payload;
  });
  builder.delete = chain();
  // `.single()` is terminal: resolve directly to the bound result.
  builder.single = () => Promise.resolve(resolved);
  builder.maybeSingle = () => Promise.resolve(resolved);
  // Thenable: awaiting the builder resolves to the bound result. This covers
  // chains that never call .single() (e.g. .select(), .delete().eq()).
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

// Imported after vi.mock so the service binds to the mocked client.
import * as accounts from '@/services/accounts';
import {
  createAccount,
  getAccounts,
  getLedgerEntries,
  getAccountPickerData,
  updateAccount,
  deleteAccount,
  createLedgerEntry,
  recordManualAdjustment,
  ValidationError,
  DuplicateNameError,
  AccountNotFoundError,
  AccountHasHistoryError,
  type Account,
} from '@/services/accounts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    name: 'Kas Utama',
    type: 'Cash',
    opening_balance: 0,
    note: '',
    is_archived: false,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  resetMock();
});

// ---------------------------------------------------------------------------
// getAccounts
// ---------------------------------------------------------------------------

describe('getAccounts', () => {
  it('merges account_balances and sorts by name ascending (case-insensitive)', async () => {
    queueResult('accounts', {
      data: [
        makeAccount({ id: 'b', name: 'bca', opening_balance: 100 }),
        makeAccount({ id: 'a', name: 'Alfa', opening_balance: 50 }),
        makeAccount({ id: 'c', name: 'Cash Toko', opening_balance: 0 }),
      ],
    });
    queueResult('account_balances', {
      data: [
        { account_id: 'b', current_balance: 250 },
        { account_id: 'a', current_balance: -10 },
      ],
    });

    const result = await getAccounts();

    expect(result.map((a) => a.name)).toEqual(['Alfa', 'bca', 'Cash Toko']);
    // Balance taken from the view when present, opening_balance otherwise.
    expect(result.find((a) => a.id === 'b')!.current_balance).toBe(250);
    expect(result.find((a) => a.id === 'c')!.current_balance).toBe(0);
  });

  it('sets is_overdraft from a negative derived balance', async () => {
    queueResult('accounts', {
      data: [makeAccount({ id: 'a', name: 'Alfa' })],
    });
    queueResult('account_balances', {
      data: [{ account_id: 'a', current_balance: -5 }],
    });

    const [acc] = await getAccounts();
    expect(acc.current_balance).toBe(-5);
    expect(acc.is_overdraft).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getLedgerEntries
// ---------------------------------------------------------------------------

describe('getLedgerEntries', () => {
  it('orders by created_at desc and applies the default limit of 50', async () => {
    const orderSpy = vi.fn();
    const limitSpy = vi.fn();

    // Custom builder to capture order/limit args for this single query.
    tableResponses.set('account_ledger', [{ data: [] }]);
    const realFrom = supabaseMock.from;
    const fromSpy = vi
      .spyOn(supabaseMock, 'from')
      .mockImplementation((table: string) => {
        const builder = realFrom.call(supabaseMock, table) as Record<
          string,
          unknown
        >;
        const origOrder = builder.order as (...a: unknown[]) => unknown;
        const origLimit = builder.limit as (...a: unknown[]) => unknown;
        builder.order = (...args: unknown[]) => {
          orderSpy(...args);
          return origOrder(...args);
        };
        builder.limit = (...args: unknown[]) => {
          limitSpy(...args);
          return origLimit(...args);
        };
        return builder;
      });

    await getLedgerEntries('acc-1');

    expect(orderSpy).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(limitSpy).toHaveBeenCalledWith(50);

    fromSpy.mockRestore();
  });

  it('passes an explicit limit through', async () => {
    const limitSpy = vi.fn();
    tableResponses.set('account_ledger', [{ data: [] }]);
    const realFrom = supabaseMock.from;
    const fromSpy = vi
      .spyOn(supabaseMock, 'from')
      .mockImplementation((table: string) => {
        const builder = realFrom.call(supabaseMock, table) as Record<
          string,
          unknown
        >;
        const origLimit = builder.limit as (...a: unknown[]) => unknown;
        builder.limit = (...args: unknown[]) => {
          limitSpy(...args);
          return origLimit(...args);
        };
        return builder;
      });

    await getLedgerEntries('acc-1', 10);
    expect(limitSpy).toHaveBeenCalledWith(10);

    fromSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getAccountPickerData
// ---------------------------------------------------------------------------

describe('getAccountPickerData', () => {
  it('filters is_archived = false and returns active accounts with balances', async () => {
    const eqSpy = vi.fn();
    tableResponses.set('accounts', [
      { data: [makeAccount({ id: 'a', name: 'Alfa' })] },
    ]);
    tableResponses.set('account_balances', [
      { data: [{ account_id: 'a', current_balance: 99 }] },
    ]);

    const realFrom = supabaseMock.from;
    const fromSpy = vi
      .spyOn(supabaseMock, 'from')
      .mockImplementation((table: string) => {
        const builder = realFrom.call(supabaseMock, table) as Record<
          string,
          unknown
        >;
        if (table === 'accounts') {
          const origEq = builder.eq as (...a: unknown[]) => unknown;
          builder.eq = (...args: unknown[]) => {
            eqSpy(...args);
            return origEq(...args);
          };
        }
        return builder;
      });

    const result = await getAccountPickerData();

    expect(eqSpy).toHaveBeenCalledWith('is_archived', false);
    expect(result).toHaveLength(1);
    expect(result[0].current_balance).toBe(99);

    fromSpy.mockRestore();
  });

  it('returns [] when there are no active accounts (no balances query)', async () => {
    queueResult('accounts', { data: [] });
    const result = await getAccountPickerData();
    expect(result).toEqual([]);
    // Only the accounts table should have been queried.
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('accounts');
  });

  it('does not expose opening balances through picker data when balance rows are hidden by RLS', async () => {
    tableResponses.set('accounts', [
      { data: [makeAccount({ id: 'a', name: 'Kas Rahasia', opening_balance: 5_000_000 })] },
    ]);
    tableResponses.set('account_balances', [
      { data: [] },
    ]);

    const result = await getAccountPickerData();

    expect(result).toHaveLength(1);
    expect(result[0].current_balance).toBe(0);
    expect(result[0].is_overdraft).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createAccount
// ---------------------------------------------------------------------------

describe('createAccount', () => {
  it('defaults opening_balance to 0 and inserts is_archived = false', async () => {
    queueResult('accounts', { data: [] }); // uniqueness pre-check: no names
    queueResult('accounts', {
      data: makeAccount({ id: 'new', name: 'Kas Baru' }),
    });

    await createAccount({ name: 'Kas Baru', type: 'Cash' });

    const insertCall = calls.find((c) => c.insert !== undefined);
    expect(insertCall).toBeDefined();
    expect(insertCall!.insert).toMatchObject({
      name: 'Kas Baru',
      type: 'Cash',
      opening_balance: 0,
      is_archived: false,
    });
  });

  it('throws ValidationError on invalid input (empty name)', async () => {
    await expect(
      createAccount({ name: '   ', type: 'Cash' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws DuplicateNameError on case-insensitive name collision (pre-check)', async () => {
    queueResult('accounts', { data: [{ name: 'kas utama' }] });

    await expect(
      createAccount({ name: '  KAS UTAMA  ', type: 'Cash' }),
    ).rejects.toBeInstanceOf(DuplicateNameError);
  });

  it("throws DuplicateNameError when the DB returns unique-violation code '23505'", async () => {
    queueResult('accounts', { data: [] }); // pre-check passes
    queueResult('accounts', {
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });

    await expect(
      createAccount({ name: 'Kas Baru', type: 'Cash' }),
    ).rejects.toBeInstanceOf(DuplicateNameError);
  });
});

// ---------------------------------------------------------------------------
// updateAccount
// ---------------------------------------------------------------------------

describe('updateAccount', () => {
  it('sends only name/note and never opening_balance', async () => {
    queueResult('accounts', { data: [{ id: 'acc-1', name: 'Kas Utama' }] }); // uniqueness
    queueResult('accounts', {
      data: makeAccount({ id: 'acc-1', name: 'Kas Edit', note: 'updated' }),
    });

    await updateAccount('acc-1', { name: 'Kas Edit', note: 'updated' });

    const updateCall = calls.find((c) => c.update !== undefined);
    expect(updateCall).toBeDefined();
    const payload = updateCall!.update as Record<string, unknown>;
    expect(payload).toEqual({ name: 'Kas Edit', note: 'updated' });
    expect(payload).not.toHaveProperty('opening_balance');
    expect(payload).not.toHaveProperty('type');
  });

  it('note-only update does not include name', async () => {
    queueResult('accounts', {
      data: makeAccount({ id: 'acc-1', note: 'just a note' }),
    });

    await updateAccount('acc-1', { note: 'just a note' });

    const updateCall = calls.find((c) => c.update !== undefined);
    expect(updateCall!.update).toEqual({ note: 'just a note' });
  });
});

// ---------------------------------------------------------------------------
// deleteAccount
// ---------------------------------------------------------------------------

describe('deleteAccount', () => {
  it('throws AccountHasHistoryError when the ledger count is > 0', async () => {
    queueResult('account_ledger', { count: 3 });

    await expect(deleteAccount('acc-1')).rejects.toBeInstanceOf(
      AccountHasHistoryError,
    );
    // Delete must not have been attempted.
    expect(calls.find((c) => c.table === 'accounts')).toBeUndefined();
  });

  it('deletes when the ledger count is 0', async () => {
    queueResult('account_ledger', { count: 0 });
    queueResult('accounts', { error: null });

    await expect(deleteAccount('acc-1')).resolves.toBeUndefined();
    expect(calls.some((c) => c.table === 'accounts')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createLedgerEntry
// ---------------------------------------------------------------------------

describe('createLedgerEntry', () => {
  it('throws AccountNotFoundError when the account does not exist', async () => {
    // getAccountById -> accounts.single() returns PGRST116 => null.
    queueResult('accounts', {
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    });

    await expect(
      createLedgerEntry({
        account_id: 'missing',
        direction: 'money_in',
        amount: 1000,
        source_reference: 'sale:1',
      }),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
  });

  it('throws ValidationError on an invalid amount', async () => {
    await expect(
      createLedgerEntry({
        account_id: 'acc-1',
        direction: 'money_in',
        amount: 0,
        source_reference: 'sale:1',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError on an invalid direction', async () => {
    await expect(
      createLedgerEntry({
        account_id: 'acc-1',
        // @ts-expect-error intentionally invalid direction
        direction: 'sideways',
        amount: 1000,
        source_reference: 'sale:1',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('inserts a valid entry when the account exists', async () => {
    // getAccountById: account lookup + balance lookup.
    queueResult('accounts', { data: makeAccount({ id: 'acc-1' }) });
    queueResult('account_balances', {
      data: { account_id: 'acc-1', current_balance: 0 },
    });
    queueResult('account_ledger', {
      data: {
        id: 'led-1',
        account_id: 'acc-1',
        direction: 'money_in',
        amount: 1000,
        source_reference: 'sale:1',
        note: '',
        created_at: '2024-01-02T00:00:00.000Z',
      },
    });

    const entry = await createLedgerEntry({
      account_id: 'acc-1',
      direction: 'money_in',
      amount: 1000,
      source_reference: 'sale:1',
    });

    expect(entry.id).toBe('led-1');
    const insertCall = calls.find((c) => c.insert !== undefined);
    expect(insertCall!.insert).toMatchObject({
      account_id: 'acc-1',
      direction: 'money_in',
      amount: 1000,
      source_reference: 'sale:1',
    });
  });
});

// ---------------------------------------------------------------------------
// recordManualAdjustment
// ---------------------------------------------------------------------------

describe('recordManualAdjustment', () => {
  it('throws ValidationError when the note is empty', async () => {
    await expect(
      recordManualAdjustment({
        account_id: 'acc-1',
        direction: 'money_in',
        amount: 1000,
        note: '   ',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("inserts a ledger entry with source_reference = 'manual_adjustment'", async () => {
    queueResult('accounts', { data: makeAccount({ id: 'acc-1' }) });
    queueResult('account_balances', {
      data: { account_id: 'acc-1', current_balance: 0 },
    });
    queueResult('account_ledger', {
      data: {
        id: 'led-adj',
        account_id: 'acc-1',
        direction: 'money_out',
        amount: 500,
        source_reference: 'manual_adjustment',
        note: 'koreksi kas',
        created_at: '2024-01-03T00:00:00.000Z',
      },
    });

    await recordManualAdjustment({
      account_id: 'acc-1',
      direction: 'money_out',
      amount: 500,
      note: 'koreksi kas',
    });

    const insertCall = calls.find((c) => c.insert !== undefined);
    expect(insertCall!.insert).toMatchObject({
      source_reference: 'manual_adjustment',
      note: 'koreksi kas',
    });
  });
});

// ---------------------------------------------------------------------------
// Append-only ledger guarantee
// ---------------------------------------------------------------------------

describe('append-only ledger', () => {
  it('does not export updateLedgerEntry or deleteLedgerEntry', () => {
    expect(
      (accounts as Record<string, unknown>).updateLedgerEntry,
    ).toBeUndefined();
    expect(
      (accounts as Record<string, unknown>).deleteLedgerEntry,
    ).toBeUndefined();
  });
});
