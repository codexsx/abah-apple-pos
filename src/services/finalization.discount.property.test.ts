import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  computeSubtotal,
  computeTransactionTotal,
  computePaymentTotal,
  computeChangeDue,
  computeTotals,
  validateSale,
  toSaleDetail,
  serializeSaleDetail,
  deserializeSaleDetail,
  type AssembledSale,
} from './finalization';

// ---------------------------------------------------------------------------
// Shared config & generators
// ---------------------------------------------------------------------------

const RUNS = { numRuns: 100 } as const;

/** A finalized unit with a non-negative integer selling price. */
const unitArb = fc.record({
  imei: fc.string(),
  model: fc.string(),
  capacity: fc.string(),
  condition: fc.string(),
  color: fc.string(),
  sellingPrice: fc.integer({ min: 0, max: 10_000_000 }),
});

/** A finalized add-on item. */
const itemArb = fc.record({
  name: fc.string(),
  price: fc.integer({ min: 0, max: 1_000_000 }),
});

/** A finalized bonus. */
const bonusArb = fc.record({
  name: fc.string(),
});

/**
 * An AssembledSale whose discount is either unset (undefined) or a
 * non-negative integer, so both the unset and set cases are exercised.
 */
const saleArb: fc.Arbitrary<AssembledSale> = fc.record({
  units: fc.array(unitArb, { maxLength: 4 }),
  manualSalePrice: fc.integer({ min: 0, max: 10_000_000 }),
  imeiActivationPrice: fc.integer({ min: 0, max: 10_000_000 }),
  items: fc.array(itemArb, { maxLength: 4 }),
  bonuses: fc.array(bonusArb, { maxLength: 4 }),
  warranty: fc.option(fc.string(), { nil: null }),
  customerName: fc.option(fc.string(), { nil: null }),
  customerPhone: fc.option(fc.string(), { nil: null }),
  payment: fc.record({
    cash: fc.integer({ min: 0, max: 50_000_000 }),
    transfer: fc.integer({ min: 0, max: 50_000_000 }),
  }),
  discount: fc.oneof(
    fc.constant(undefined),
    fc.integer({ min: 0, max: 60_000_000 }),
  ),
});

// ---------------------------------------------------------------------------
// Property 1 (task: sales-discount Phase 5)
// ---------------------------------------------------------------------------

describe('Property 1: Net total is the clamped discounted subtotal', () => {
  // Feature: sales-discount, Property 1
  // Validates: Requirements 1.2, 1.3, 1.4
  it('computeTransactionTotal equals max(0, subtotal - discount); equals subtotal when no discount', () => {
    fc.assert(
      fc.property(saleArb, (sale) => {
        const subtotal = computeSubtotal(sale);
        const discount = sale.discount ?? 0;

        expect(computeTransactionTotal(sale)).toBe(
          Math.max(0, subtotal - discount),
        );

        if (discount === 0) {
          expect(computeTransactionTotal(sale)).toBe(subtotal);
        }
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2 (task: sales-discount Phase 5)
// ---------------------------------------------------------------------------

/** A unit guaranteed to have a strictly positive selling price (no INVALID_PRICE). */
const positivePriceUnitArb = fc.record({
  imei: fc.string(),
  model: fc.string(),
  capacity: fc.string(),
  condition: fc.string(),
  color: fc.string(),
  sellingPrice: fc.integer({ min: 1, max: 5_000_000 }),
});

/**
 * A sale focused on the discount rule:
 *  - at least one unit, every selling price > 0 (NO_UNITS / INVALID_PRICE cannot fire)
 *  - payment cash is huge so INSUFFICIENT_PAYMENT can never preempt
 *  - discount covers negative, 0, in-range, exactly-subtotal, above-subtotal, and non-integer.
 */
const discountFocusedSaleArb: fc.Arbitrary<AssembledSale> = fc.record({
  units: fc.array(positivePriceUnitArb, { minLength: 1, maxLength: 3 }),
  manualSalePrice: fc.integer({ min: 0, max: 5_000_000 }),
  imeiActivationPrice: fc.integer({ min: 0, max: 5_000_000 }),
  items: fc.array(
    fc.record({ name: fc.string(), price: fc.integer({ min: 0, max: 1_000_000 }) }),
    { maxLength: 3 },
  ),
  bonuses: fc.constant([] as AssembledSale['bonuses']),
  warranty: fc.constant(null),
  customerName: fc.constant(null),
  customerPhone: fc.constant(null),
  // cash >= any reachable subtotal so payment never blocks the discount rule.
  payment: fc.constant({ cash: 999_999_999_999, transfer: 0 }),
  discount: fc.oneof(
    fc.constant(0),
    fc.integer({ min: -5, max: 5 }),
    fc.integer({ min: 0, max: 20_000_000 }),
    fc.double({ min: 0.5, max: 3, noNaN: true }).filter((n) => !Number.isInteger(n)),
  ),
});

describe('Property 2: Discount validation bounds', () => {
  // Feature: sales-discount, Property 2
  // Validates: Requirements 2.1, 2.2
  it('validateSale returns INVALID_DISCOUNT iff discount is not an integer in 0..subtotal (subtotal accepted)', () => {
    fc.assert(
      fc.property(discountFocusedSaleArb, (sale) => {
        const subtotal = computeSubtotal(sale);
        const d = sale.discount ?? 0;
        const discountValid =
          Number.isInteger(d) && d >= 0 && d <= subtotal;

        const result = validateSale(sale);

        if (discountValid) {
          expect(result.ok).toBe(true);
        } else {
          expect(result).toEqual({
            ok: false,
            code: 'INVALID_DISCOUNT',
            message: 'Diskon harus berupa angka 0 sampai subtotal',
          });
        }
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3 (task: sales-discount Phase 5)
// ---------------------------------------------------------------------------

/**
 * Independent reference oracle mirroring validateSale's fixed rule order:
 * NO_UNITS -> INVALID_PRICE -> INVALID_DISCOUNT -> INSUFFICIENT_PAYMENT.
 * Payment sufficiency is judged against the NET total (computeTransactionTotal).
 * Returns the first unmet rule's code, or null when the sale is valid.
 */
function expectedValidation(
  sale: AssembledSale,
): 'NO_UNITS' | 'INVALID_PRICE' | 'INVALID_DISCOUNT' | 'INSUFFICIENT_PAYMENT' | null {
  if (sale.units.length === 0) return 'NO_UNITS';
  if (sale.units.some((u) => (u.sellingPrice ?? 0) <= 0)) return 'INVALID_PRICE';
  const subtotal = computeSubtotal(sale);
  const d = sale.discount ?? 0;
  if (!(Number.isInteger(d) && d >= 0 && d <= subtotal)) return 'INVALID_DISCOUNT';
  if (computePaymentTotal(sale) < computeTransactionTotal(sale)) return 'INSUFFICIENT_PAYMENT';
  return null; // ok
}

describe('Property 3: Validation rule ordering', () => {
  // Feature: sales-discount, Property 3
  // Validates: Requirements 2.3, 2.4, 2.5
  it('validateSale returns the first unmet rule in fixed order; payment judged against the net total', () => {
    fc.assert(
      fc.property(saleArb, (sale) => {
        const expected = expectedValidation(sale);
        const result = validateSale(sale);

        if (expected === null) {
          expect(result.ok).toBe(true);
        } else {
          expect(result.ok).toBe(false);
          expect((result as { ok: false; code: string }).code).toBe(expected);
        }
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4 (task: sales-discount Phase 5)
// ---------------------------------------------------------------------------

describe('Property 4: Change due uses the net total', () => {
  // Feature: sales-discount, Property 4
  // Validates: Requirements 1.5
  it('computeChangeDue is judged against the net transactionTotal, and computeTotals wires it consistently', () => {
    fc.assert(
      fc.property(saleArb, (sale) => {
        const transactionTotal = computeTransactionTotal(sale); // NET total
        const paymentTotal = computePaymentTotal(sale);
        const expectedChangeDue = Math.max(0, paymentTotal - transactionTotal);

        expect(computeChangeDue(transactionTotal, paymentTotal)).toBe(
          expectedChangeDue,
        );

        const totals = computeTotals(sale);
        expect(totals.changeDue).toBe(expectedChangeDue);
        expect(totals.transactionTotal).toBe(transactionTotal);
        expect(totals.subtotal).toBe(computeSubtotal(sale));
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5 (task: sales-discount Phase 5)
// ---------------------------------------------------------------------------

describe('Property 5: Sale detail round-trips the discount', () => {
  // Feature: sales-discount, Property 5
  // Validates: Requirements 3.1, 3.2
  it('serialize/deserialize preserves the discount, and a missing discount field parses to 0', () => {
    fc.assert(
      fc.property(saleArb, (sale) => {
        // Assertion 1: round-trip preserves the discount (unset => 0).
        expect(
          deserializeSaleDetail(serializeSaleDetail(toSaleDetail(sale))).discount,
        ).toBe(sale.discount ?? 0);

        // Assertion 2: a serialized record with NO discount field parses to 0.
        const obj = JSON.parse(serializeSaleDetail(toSaleDetail(sale)));
        delete obj.discount;
        expect(deserializeSaleDetail(JSON.stringify(obj)).discount).toBe(0);
      }),
      RUNS,
    );
  });
});
