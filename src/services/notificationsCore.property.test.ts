import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  deriveNotifications,
  countActionable,
  type NotificationInput,
  type NotificationStockLike,
  type NotificationAccessoryLike,
  type NotificationAccountLike,
  type NotificationAgentLike,
} from './notificationsCore';

// ---------------------------------------------------------------------------
// Shared config & generators
// ---------------------------------------------------------------------------

const RUNS = { numRuns: 100 } as const;

/** Case-insensitive status token, mirroring the core's toStatusToken. */
const statusToken = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toUpperCase() : '';

/** HP stock item: counts may dip below 0; status mixes known tokens + arbitrary. */
const stockArb: fc.Arbitrary<NotificationStockLike> = fc.record({
  model: fc.string(),
  count: fc.integer({ min: -5, max: 50 }),
  status: fc.oneof(
    fc.constantFrom('READY', 'HABIS', 'MENIPIS', 'TERJUAL', ''),
    fc.string(),
  ),
});

/** Accessory item. */
const accessoryArb: fc.Arbitrary<NotificationAccessoryLike> = fc.record({
  name: fc.string(),
  stock: fc.integer({ min: -5, max: 50 }),
  status: fc.constantFrom('AMAN', 'HABIS', 'MENIPIS', ''),
});

/** Cash/bank account: balance may be negative (overdraft). */
const accountArb: fc.Arbitrary<NotificationAccountLike> = fc.record({
  name: fc.string(),
  current_balance: fc.integer({ min: -1_000_000, max: 1_000_000 }),
});

/** Agent with possibly-negative outstanding debt. */
const agentArb: fc.Arbitrary<NotificationAgentLike> = fc.record({
  name: fc.string(),
  outstandingDebt: fc.integer({ min: -100, max: 100 }),
});

/** lastTxAt: null or a valid ISO timestamp. */
const lastTxAtArb: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant<null>(null),
  fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
);

/** A full NotificationInput snapshot. */
const inputArb: fc.Arbitrary<NotificationInput> = fc.record({
  stock: fc.array(stockArb),
  accessories: fc.array(accessoryArb),
  accounts: fc.array(accountArb),
  agents: fc.array(agentArb),
  recentTxCount: fc.integer({ min: 0, max: 20 }),
  lastTxAt: lastTxAtArb,
});

// ---------------------------------------------------------------------------
// Independent inline oracle (mirrors the core's rules exactly)
// ---------------------------------------------------------------------------

/** A stock/accessory item is "out" when count/stock <= 0 OR status === 'HABIS'. */
const isOut = (quantity: number, status: string): boolean =>
  quantity <= 0 || statusToken(status) === 'HABIS';

/**
 * "Low" only when NOT out AND status === 'MENIPIS' — mirrors the core's
 * else-if: out-of-stock is treated FIRST, so an item that is both out and
 * MENIPIS counts only as out, never as low.
 */
const isLow = (quantity: number, status: string): boolean =>
  !isOut(quantity, status) && statusToken(status) === 'MENIPIS';

interface OracleCounts {
  stockOut: number;
  stockLow: number;
  overdraft: number;
}

const oracle = (input: NotificationInput): OracleCounts => {
  const stockOut =
    input.stock.filter((s) => isOut(s.count, s.status)).length +
    input.accessories.filter((a) => isOut(a.stock, a.status)).length;

  const stockLow =
    input.stock.filter((s) => isLow(s.count, s.status)).length +
    input.accessories.filter((a) => isLow(a.stock, a.status)).length;

  const overdraft = input.accounts.filter((a) => a.current_balance < 0).length;

  return { stockOut, stockLow, overdraft };
};

// ---------------------------------------------------------------------------
// Property 4 (task: user-management Property 4)
// ---------------------------------------------------------------------------

describe('Property 4: Stock and overdraft alerts are derived exactly', () => {
  // Feature: user-management, Property 4
  // Validates: Requirements 7.1, 7.2, 7.5
  it('derives stock_out, stock_low and overdraft alert counts exactly per the oracle', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const expected = oracle(input);
        const items = deriveNotifications(input);

        const stockOutCount = items.filter((i) => i.kind === 'stock_out').length;
        const stockLowCount = items.filter((i) => i.kind === 'stock_low').length;
        const overdraftCount = items.filter((i) => i.kind === 'overdraft').length;

        // 1. stock_out (critical) count matches the oracle.
        expect(stockOutCount).toBe(expected.stockOut);
        // 2. stock_low (warning) count matches the oracle.
        expect(stockLowCount).toBe(expected.stockLow);
        // 3. overdraft (critical) count matches the oracle.
        expect(overdraftCount).toBe(expected.overdraft);
      }),
      RUNS,
    );
  });

  // Feature: user-management, Property 4
  // Validates: Requirements 7.1, 7.2, 7.5
  it('assigns the correct severity and a non-empty route to every stock/overdraft alert', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const items = deriveNotifications(input);

        for (const item of items) {
          if (item.kind === 'stock_out') {
            // 4a. stock_out alerts are critical with a non-empty route.
            expect(item.severity).toBe('critical');
            expect(item.route.length).toBeGreaterThan(0);
          } else if (item.kind === 'stock_low') {
            // 4b. stock_low alerts are warnings with a non-empty route.
            expect(item.severity).toBe('warning');
            expect(item.route.length).toBeGreaterThan(0);
          } else if (item.kind === 'overdraft') {
            // 4c. overdraft alerts are critical with a non-empty route.
            expect(item.severity).toBe('critical');
            expect(item.route.length).toBeGreaterThan(0);
          }
        }
      }),
      RUNS,
    );
  });

  // Feature: user-management, Property 4
  // Validates: Requirements 7.1, 7.2, 7.5
  it('never throws on empty input (yields []) and never throws when arrays are passed', () => {
    // Empty input yields no notifications.
    expect(
      deriveNotifications({
        stock: [],
        accessories: [],
        accounts: [],
        agents: [],
        recentTxCount: 0,
        lastTxAt: null,
      }),
    ).toEqual([]);

    // Never throws for arbitrary populated arrays.
    fc.assert(
      fc.property(inputArb, (input) => {
        expect(() => deriveNotifications(input)).not.toThrow();
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5 (task: user-management Property 5)
// ---------------------------------------------------------------------------

describe('Property 5: Agent receivable and activity alerts, and the actionable count', () => {
  // Feature: user-management, Property 5
  // Validates: Requirements 7.3, 7.4, 7.6
  it('derives exactly one agent_receivable (warning) alert per agent with outstandingDebt > 0', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const items = deriveNotifications(input);
        const expectedAgents = input.agents.filter(
          (a) => a.outstandingDebt > 0,
        ).length;

        const receivable = items.filter((i) => i.kind === 'agent_receivable');

        // 1. count matches agents with positive outstanding debt (none for <= 0).
        expect(receivable.length).toBe(expectedAgents);
        for (const item of receivable) {
          expect(item.severity).toBe('warning');
          expect(item.route.length).toBeGreaterThan(0);
        }
      }),
      RUNS,
    );
  });

  // Feature: user-management, Property 5
  // Validates: Requirements 7.3, 7.4, 7.6
  it('emits exactly one info activity alert iff recentTxCount > 0', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const items = deriveNotifications(input);
        const activity = items.filter((i) => i.kind === 'activity');

        // 2. activity alert exists exactly when recentTxCount > 0.
        if (input.recentTxCount > 0) {
          expect(activity.length).toBe(1);
          expect(activity[0].severity).toBe('info');
        } else {
          expect(activity.length).toBe(0);
        }

        // Every activity alert (if any) is info.
        for (const item of activity) {
          expect(item.severity).toBe('info');
        }
      }),
      RUNS,
    );
  });

  // Feature: user-management, Property 5
  // Validates: Requirements 7.3, 7.4, 7.6
  it('gives every returned item a non-empty route', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const items = deriveNotifications(input);

        // 3. every item carries a non-empty route.
        for (const item of items) {
          expect(item.route.length).toBeGreaterThan(0);
        }
      }),
      RUNS,
    );
  });

  // Feature: user-management, Property 5
  // Validates: Requirements 7.3, 7.4, 7.6
  it('counts actionable items as exactly those whose severity !== info', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const items = deriveNotifications(input);
        const expected = items.filter((i) => i.severity !== 'info').length;

        // 4. countActionable matches the independently-computed non-info count.
        expect(countActionable(items)).toBe(expected);
      }),
      RUNS,
    );
  });

  // Feature: user-management, Property 5
  // Validates: Requirements 7.3, 7.4, 7.6
  it('is null-safe: countActionable of [], null and undefined all return 0 and never throw', () => {
    // 5. null-safety: no throw, always 0.
    expect(() => countActionable([])).not.toThrow();
    expect(countActionable([])).toBe(0);
    expect(() => countActionable(null as any)).not.toThrow();
    expect(countActionable(null as any)).toBe(0);
    expect(() => countActionable(undefined as any)).not.toThrow();
    expect(countActionable(undefined as any)).toBe(0);
  });
});
