import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  REVENUE_TYPES,
  COST_TYPES,
  EXPENSE_TYPES,
  SOLD_STATUS,
  computeRevenue,
  computeSalesRevenue,
  computeImeiActivationRevenue,
  computeCOGS,
  computeCOGSFromSoldItems,
  computeExpenses,
  computeNetProfit,
  computeInventoryValue,
  computeTotalAsset,
  filterByPeriod,
  type FinanceTxLike,
  type FinanceStockLike,
  type TotalAssetInput,
} from './financeCore';

// ---------------------------------------------------------------------------
// Shared config & generators
// ---------------------------------------------------------------------------

const RUNS = { numRuns: 100 } as const;

/** A transaction type mixing all 6 known types plus an arbitrary string. */
const typeArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    'Penjualan',
    'Servis',
    'Pemasukan Lain',
    'Pembelian',
    'Pengeluaran',
    'Tukar Tambah',
  ),
  fc.string(),
);

/** An amount that includes nulls; integer IDR otherwise. */
const amountArb: fc.Arbitrary<number | null> = fc.oneof(
  fc.integer({ min: 0, max: 100_000_000 }),
  fc.constant(null),
);

/** A valid ISO string (created_at is irrelevant to this property). */
const createdAtArb: fc.Arbitrary<string> = fc
  .date({
    min: new Date(0),
    max: new Date(Date.UTC(2100, 0, 1)),
    noInvalidDate: true,
  })
  .map((d) => d.toISOString());

const txArb: fc.Arbitrary<FinanceTxLike> = fc.record({
  type: typeArb,
  amount: amountArb,
  created_at: createdAtArb,
});

/** Independent oracle: coerce a possibly-null/NaN amount to a safe amount. */
const toAmt = (a: number | null): number =>
  a == null || Number.isNaN(a) ? 0 : a;

// ---------------------------------------------------------------------------
// Property 1 (task: finance-menu Property 1)
// ---------------------------------------------------------------------------

describe('Property 1: Type classification sums only matching types', () => {
  // Feature: finance-menu, Property 1
  // Validates: Requirements 1.1, 1.2, 1.3, 1.4
  it('sums only amounts of matching types; other types and null amounts contribute 0', () => {
    fc.assert(
      fc.property(fc.array(txArb), (txs) => {
        const expectedRevenue = txs
          .filter((tx) => REVENUE_TYPES.includes(tx.type as never) || tx.type === 'Tukar Tambah')
          .reduce((sum, tx) => sum + toAmt(tx.amount), 0);
        const expectedCOGS = txs
          .filter((tx) => COST_TYPES.includes(tx.type as never))
          .reduce((sum, tx) => sum + toAmt(tx.amount), 0);
        const expectedExpenses = txs
          .filter((tx) => EXPENSE_TYPES.includes(tx.type as never))
          .reduce((sum, tx) => sum + toAmt(tx.amount), 0);

        expect(computeRevenue(txs)).toBe(expectedRevenue);
        expect(computeCOGS(txs)).toBe(expectedCOGS);
        expect(computeExpenses(txs)).toBe(expectedExpenses);
      }),
      RUNS,
    );
  });

  it('separates IMEI activation from HP sales while keeping total revenue all-in', () => {
    const txs: FinanceTxLike[] = [
      {
        type: 'Penjualan',
        amount: 3_670_000,
        created_at: '2026-07-07T12:00:00.000Z',
        detail: JSON.stringify({
          units: [
            {
              imei: '353535353535353',
              sellingPrice: 3_500_000,
              model: 'iPhone 8 Plus',
              capacity: '64GB',
              condition: 'Second Inter Unlock',
              color: 'Space Gray',
            },
          ],
          manualSalePrice: 0,
          imeiActivationPrice: 170_000,
          items: [],
          bonuses: [],
          warranty: '30 Hari',
          payment: { cash: 0, transfer: 3_670_000 },
          customer: { name: 'Adam', phone: null },
          discount: 0,
        }),
      },
      {
        type: 'Tukar Tambah',
        amount: 2_870_000,
        created_at: '2026-07-07T12:00:00.000Z',
        detail: JSON.stringify({
          hpKeluar: { model: 'iPhone 14', capacity: '256GB', price: 5_700_000 },
          hpMasuk: { tipe: 'iPhone 11 Pro Max', kapasitas: '512GB', appraisal: 3_000_000 },
          aktivasiImei: 170_000,
          selisih: 2_870_000,
        }),
      },
    ];

    expect(computeSalesRevenue(txs)).toBe(9_200_000);
    expect(computeImeiActivationRevenue(txs)).toBe(340_000);
    expect(computeRevenue(txs)).toBe(9_540_000);
  });
});

// ---------------------------------------------------------------------------
// Property 2 (task: finance-menu Property 2)
// ---------------------------------------------------------------------------

describe('Property 2: Net profit identity', () => {
  // Feature: finance-menu, Property 2
  // Validates: Requirements 2.1, 2.2, 2.3
  it('net profit equals revenue − cogs − expenses (unclamped, may be negative)', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), fc.integer(), (r, c, e) => {
        expect(computeNetProfit(r, c, e)).toBe(r - c - e);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: finance-menu, Property 2
  // Validates: Requirements 2.1, 2.2, 2.3
  it('derived profit for an empty transaction list is 0', () => {
    expect(
      computeNetProfit(computeRevenue([]), computeCOGS([]), computeExpenses([])),
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Property 3 (task: finance-menu Property 3)
// ---------------------------------------------------------------------------

/** A minimal record carrying only the field `filterByPeriod` constrains on. */
interface PeriodItem {
  type: string;
  amount: number;
  created_at: string;
}

/** A valid ISO timestamp generator (noInvalidDate REQUIRED under fast-check v4). */
const isoArb: fc.Arbitrary<string> = fc
  .date({
    min: new Date(0),
    max: new Date(Date.UTC(2100, 0, 1)),
    noInvalidDate: true,
  })
  .map((d) => d.toISOString());

/** An item whose only relevant field is `created_at`. */
const periodItemArb: fc.Arbitrary<PeriodItem> = isoArb.map((created_at) => ({
  type: 'Penjualan',
  amount: 0,
  created_at,
}));

/** A bound that is either a valid ISO timestamp or null (unbounded). */
const boundArb: fc.Arbitrary<string | null> = fc.oneof(
  isoArb,
  fc.constant<null>(null),
);

/**
 * Independent oracle mirroring filterByPeriod's inclusive-bounds logic.
 * A non-null but unparseable bound is treated as unbounded; an item with an
 * unparseable timestamp is kept only when neither bound is active.
 */
const oracleKeeps = (
  created_at: string,
  from: string | null,
  to: string | null,
): boolean => {
  const fromMs = from == null ? NaN : Date.parse(from);
  const toMs = to == null ? NaN : Date.parse(to);
  const hasFrom = from != null && !Number.isNaN(fromMs);
  const hasTo = to != null && !Number.isNaN(toMs);

  const t = Date.parse(created_at);
  if (Number.isNaN(t)) return !hasFrom && !hasTo;
  if (hasFrom && t < fromMs) return false;
  if (hasTo && t > toMs) return false;
  return true;
};

describe('Property 3: Period filter inclusivity and unbounded ends', () => {
  // Feature: finance-menu, Property 3
  // Validates: Requirements 3.1, 3.2, 3.3
  it('keeps all items and never mutates input when both bounds are null', () => {
    fc.assert(
      fc.property(fc.array(periodItemArb), (items) => {
        const snapshot = items.map((i) => ({ ...i }));
        const result = filterByPeriod(items, null, null);

        // All items kept (result equals input, element-wise & same length).
        expect(result).toEqual(items);
        // A new array is returned (not the same reference).
        expect(result).not.toBe(items);
        // Input is not mutated.
        expect(items).toEqual(snapshot);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: finance-menu, Property 3
  // Validates: Requirements 3.1, 3.2, 3.3
  it('returned items satisfy both active bounds; excluded items violate at least one', () => {
    fc.assert(
      fc.property(
        fc.array(periodItemArb),
        boundArb,
        boundArb,
        (items, from, to) => {
          const snapshot = items.map((i) => ({ ...i }));
          const result = filterByPeriod(items, from, to);

          const fromMs = from == null ? NaN : Date.parse(from);
          const toMs = to == null ? NaN : Date.parse(to);
          const hasFrom = from != null && !Number.isNaN(fromMs);
          const hasTo = to != null && !Number.isNaN(toMs);

          // Every returned item satisfies every active bound.
          for (const item of result) {
            const t = Date.parse(item.created_at);
            expect(hasFrom ? t >= fromMs : true).toBe(true);
            expect(hasTo ? t <= toMs : true).toBe(true);
          }

          // Result matches the independent oracle exactly.
          const expected = items.filter((i) =>
            oracleKeeps(i.created_at, from, to),
          );
          expect(result).toEqual(expected);

          // Every excluded item violates at least one active bound (or, if both
          // bounds are inactive, no item is ever excluded).
          const excluded = items.filter(
            (i) => !oracleKeeps(i.created_at, from, to),
          );
          for (const item of excluded) {
            const t = Date.parse(item.created_at);
            const violatesFrom = hasFrom && t < fromMs;
            const violatesTo = hasTo && t > toMs;
            expect(violatesFrom || violatesTo).toBe(true);
          }

          // Never mutates input.
          expect(items).toEqual(snapshot);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: finance-menu, Property 3
  // Validates: Requirements 3.1, 3.2, 3.3
  it('includes items whose timestamp exactly equals the from or to bound', () => {
    fc.assert(
      fc.property(isoArb, isoArb, (a, b) => {
        // Order the two timestamps so [lo, hi] is a valid range.
        const [lo, hi] = Date.parse(a) <= Date.parse(b) ? [a, b] : [b, a];

        const atFrom: PeriodItem = { type: 'Penjualan', amount: 0, created_at: lo };
        const atTo: PeriodItem = { type: 'Penjualan', amount: 0, created_at: hi };

        // Item equal to the lower bound is included.
        expect(filterByPeriod([atFrom], lo, hi)).toEqual([atFrom]);
        // Item equal to the upper bound is included.
        expect(filterByPeriod([atTo], lo, hi)).toEqual([atTo]);
        // Both endpoints together are included.
        expect(filterByPeriod([atFrom, atTo], lo, hi)).toEqual([atFrom, atTo]);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4 (task: finance-menu Property 4)
// ---------------------------------------------------------------------------

/** A stock item mixing known statuses plus an arbitrary string; non-negative integer price/count/cost_price. */
const stockItemArb: fc.Arbitrary<FinanceStockLike> = fc.record({
  price: fc.integer({ min: 0, max: 100_000_000 }),
  cost_price: fc.integer({ min: 0, max: 100_000_000 }),
  count: fc.integer({ min: 0, max: 1000 }),
  status: fc.oneof(
    fc.constantFrom('READY', 'TERJUAL', 'SOLD', 'RESERVED', 'DAMAGED'),
    fc.string(),
  ),
});

describe('Property 4: Inventory value counts only READY units', () => {
  // Feature: finance-menu, Property 4
  // Validates: Requirements 4.1, 4.4
  it('equals an oracle summing price*count over READY-only items; non-READY items are irrelevant', () => {
    fc.assert(
      fc.property(fc.array(stockItemArb), (items) => {
        // Independent oracle: filter READY only, sum price * count.
        const oracle = items
          .filter((i) => i.status === 'READY')
          .reduce((sum, i) => sum + i.price * i.count, 0);

        const result = computeInventoryValue(items);

        // 1. Matches the independent oracle.
        expect(result).toBe(oracle);

        // 2. Removing all non-READY items does not change the result.
        const readyOnly = items.filter((i) => i.status === 'READY');
        expect(computeInventoryValue(readyOnly)).toBe(result);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: finance-menu, Property 4
  // Validates: Requirements 4.1, 4.4
  it('yields 0 for a list containing zero READY items', () => {
    const nonReadyArb: fc.Arbitrary<FinanceStockLike> = fc.record({
      price: fc.integer({ min: 0, max: 100_000_000 }),
      cost_price: fc.integer({ min: 0, max: 100_000_000 }),
      count: fc.integer({ min: 0, max: 1000 }),
      status: fc.oneof(
        fc.constantFrom('SOLD', 'RESERVED', 'DAMAGED'),
        fc.string().filter((s) => s !== 'READY'),
      ),
    });

    fc.assert(
      fc.property(fc.array(nonReadyArb), (items) => {
        expect(computeInventoryValue(items)).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4b (task: finance-menu Property 4b)
// ---------------------------------------------------------------------------

describe('Property 4b: COGS comes from sold units only', () => {
  // Feature: finance-menu, Property 4b
  // Validates: Requirement 1.2b
  it('equals an oracle summing cost_price*count over TERJUAL-only items; non-TERJUAL items are irrelevant', () => {
    fc.assert(
      fc.property(fc.array(stockItemArb), (items) => {
        const oracle = items
          .filter((i) => i.status === SOLD_STATUS)
          .reduce((sum, i) => sum + i.cost_price * i.count, 0);

        const result = computeCOGSFromSoldItems(items);

        expect(result).toBe(oracle);

        const soldOnly = items.filter((i) => i.status === SOLD_STATUS);
        expect(computeCOGSFromSoldItems(soldOnly)).toBe(result);
      }),
      { numRuns: 100 },
    );
  });

  it('yields 0 when no TERJUAL units exist', () => {
    const nonSoldArb: fc.Arbitrary<FinanceStockLike> = fc.record({
      price: fc.integer({ min: 0, max: 100_000_000 }),
      cost_price: fc.integer({ min: 0, max: 100_000_000 }),
      count: fc.integer({ min: 0, max: 1000 }),
      status: fc.oneof(
        fc.constantFrom('READY', 'SOLD', 'RESERVED', 'DAMAGED'),
        fc.string().filter((s) => s !== SOLD_STATUS),
      ),
    });

    fc.assert(
      fc.property(fc.array(nonSoldArb), (items) => {
        expect(computeCOGSFromSoldItems(items)).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5 (task: finance-menu Property 5)
// ---------------------------------------------------------------------------

/** Non-negative integer IDR component for the Total Asset formula. */
const assetComponentArb: fc.Arbitrary<number> = fc.integer({
  min: 0,
  max: 1_000_000_000,
});

describe('Property 5: Total asset formula', () => {
  // Feature: finance-menu, Property 5
  // Validates: Requirements 4.2, 4.3
  it('equals cash + inventory + receivable − depositLiability (unclamped)', () => {
    fc.assert(
      fc.property(
        assetComponentArb,
        assetComponentArb,
        assetComponentArb,
        assetComponentArb,
        (cashBankTotal, inventoryValue, agentReceivable, agentDepositLiability) => {
          const input: TotalAssetInput = {
            cashBankTotal,
            inventoryValue,
            agentReceivable,
            agentDepositLiability,
          };

          // 1. Matches the independent inline formula.
          expect(computeTotalAsset(input)).toBe(
            cashBankTotal +
              inventoryValue +
              agentReceivable -
              agentDepositLiability,
          );

          // 3. The function is NOT clamped: when the liability exceeds the sum
          //    of the positive components, the result is strictly negative.
          const positives = cashBankTotal + inventoryValue + agentReceivable;
          const negativeInput: TotalAssetInput = {
            cashBankTotal,
            inventoryValue,
            agentReceivable,
            agentDepositLiability: positives + 1,
          };
          expect(computeTotalAsset(negativeInput)).toBe(-1);
          expect(computeTotalAsset(negativeInput)).toBeLessThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: finance-menu, Property 5
  // Validates: Requirements 4.2, 4.3
  it('yields 0 when all components are 0', () => {
    expect(
      computeTotalAsset({
        cashBankTotal: 0,
        inventoryValue: 0,
        agentReceivable: 0,
        agentDepositLiability: 0,
      }),
    ).toBe(0);
  });
});
