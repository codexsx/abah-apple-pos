import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  computeTransactionTotal,
  computePaymentTotal,
  computeChangeDue,
  validateSale,
  buildDescription,
  serializeSaleDetail,
  deserializeSaleDetail,
  type AssembledSale,
  type SaleDetail,
} from './finalization';

// Shared generators -------------------------------------------------------

/** Integer IDR money in the inclusive domain 0 … 999,999,999,999 (Req 2.6). */
const money = fc.integer({ min: 0, max: 999_999_999_999 });

const unitArb = fc.record({
  imei: fc.string(),
  model: fc.string(),
  capacity: fc.string(),
  condition: fc.string(),
  color: fc.string(),
  sellingPrice: money,
});

const itemArb = fc.record({
  name: fc.string(),
  price: money,
});

const bonusArb = fc.record({
  name: fc.string(),
});

/** A general AssembledSale generator covering empty/non-empty collections. */
const assembledSaleArb: fc.Arbitrary<AssembledSale> = fc.record({
  units: fc.array(unitArb, { maxLength: 6 }),
  manualSalePrice: money,
  imeiActivationPrice: money,
  items: fc.array(itemArb, { maxLength: 6 }),
  bonuses: fc.array(bonusArb, { maxLength: 6 }),
  warranty: fc.option(fc.string(), { nil: null }),
  customerName: fc.option(fc.string(), { nil: null }),
  customerPhone: fc.option(fc.string(), { nil: null }),
  payment: fc.record({ cash: money, transfer: money }),
});

const saleDetailArb: fc.Arbitrary<SaleDetail> = fc.record({
  units: fc.array(
    fc.record({
      imei: fc.string(),
      sellingPrice: money,
      model: fc.string(),
      capacity: fc.string(),
      condition: fc.string(),
      color: fc.string(),
    }),
    { maxLength: 6 },
  ),
  manualSalePrice: money,
  imeiActivationPrice: money,
  items: fc.array(itemArb, { maxLength: 6 }),
  bonuses: fc.array(bonusArb, { maxLength: 6 }),
  warranty: fc.option(fc.string(), { nil: null }),
  payment: fc.record({ cash: money, transfer: money }),
  customer: fc.record({
    name: fc.option(fc.string(), { nil: null }),
    phone: fc.option(fc.string(), { nil: null }),
  }),
  discount: money,
});

// -------------------------------------------------------------------------

describe('finalization core — property tests', () => {
  // Feature: pos-finalization, Property 3: Totals computation is the sum of its parts
  it('Property 3: transaction total is the sum of all parts; payment total is cash + transfer', () => {
    fc.assert(
      fc.property(assembledSaleArb, (sale) => {
        const expectedTransaction =
          sale.units.reduce((s, u) => s + u.sellingPrice, 0) +
          sale.manualSalePrice +
          sale.imeiActivationPrice +
          sale.items.reduce((s, i) => s + i.price, 0);
        const expectedPayment = sale.payment.cash + sale.payment.transfer;

        expect(computeTransactionTotal(sale)).toBe(expectedTransaction);
        expect(computePaymentTotal(sale)).toBe(expectedPayment);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: pos-finalization, Property 4: Change due is the non-negative payment surplus
  it('Property 4: change due equals max(0, paymentTotal - transactionTotal)', () => {
    fc.assert(
      fc.property(money, money, (transactionTotal, paymentTotal) => {
        const expected = Math.max(0, paymentTotal - transactionTotal);
        const actual = computeChangeDue(transactionTotal, paymentTotal);

        expect(actual).toBe(expected);
        expect(actual).toBeGreaterThanOrEqual(0);
        if (paymentTotal > transactionTotal) {
          expect(actual).toBe(paymentTotal - transactionTotal);
        } else {
          expect(actual).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: pos-finalization, Property 1: Validation rejects in ascending criterion order
  it('Property 1: validateSale reports the lowest-numbered unmet rule (NO_UNITS < INVALID_PRICE < INSUFFICIENT_PAYMENT)', () => {
    fc.assert(
      fc.property(assembledSaleArb, (sale) => {
        const result = validateSale(sale);

        const hasNoUnits = sale.units.length === 0;
        const hasInvalidPrice = sale.units.some((u) => u.sellingPrice <= 0);
        const transactionTotal = computeTransactionTotal(sale);
        const paymentTotal = computePaymentTotal(sale);
        const insufficient = paymentTotal < transactionTotal;

        if (hasNoUnits) {
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.code).toBe('NO_UNITS');
            expect(result.message).toBe('Pilih minimal satu unit');
          }
        } else if (hasInvalidPrice) {
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.code).toBe('INVALID_PRICE');
            expect(result.message.length).toBeGreaterThan(0);
          }
        } else if (insufficient) {
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.code).toBe('INSUFFICIENT_PAYMENT');
            // Message states the shortfall = transactionTotal - paymentTotal.
            expect(result.message).toContain(
              String(transactionTotal - paymentTotal),
            );
          }
        } else {
          expect(result.ok).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: pos-finalization, Property 2: Validation never mutates the sale
  it('Property 2: validateSale leaves the input deep-equal to its pre-call snapshot', () => {
    fc.assert(
      fc.property(assembledSaleArb, (sale) => {
        const snapshot = structuredClone(sale);
        validateSale(sale);
        expect(sale).toEqual(snapshot);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: pos-finalization, Property 5: Description reflects customer name presence
  it('Property 5: buildDescription includes truncated name + unit count when named, omits name otherwise', () => {
    fc.assert(
      fc.property(
        // Mix of arbitrary strings and long strings (>100 chars) to exercise truncation.
        fc.oneof(
          fc.option(fc.string(), { nil: null }),
          fc.string({ minLength: 101, maxLength: 250 }),
        ),
        fc.integer({ min: 0, max: 100 }),
        (name, unitCount) => {
          const result = buildDescription(name, unitCount);
          const trimmed = (name ?? '').trim();

          expect(result).toContain(String(unitCount));

          if (trimmed.length > 0) {
            const truncated = trimmed.slice(0, 100);
            expect(truncated.length).toBeLessThanOrEqual(100);
            expect(result).toContain(truncated);
          } else {
            // No name provided: connector "untuk" (used only when named) is absent.
            expect(result).not.toContain('untuk');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: pos-finalization, Property 6: Sale detail serialization round-trip
  it('Property 6: deserializeSaleDetail(serializeSaleDetail(detail)) deep-equals the original', () => {
    fc.assert(
      fc.property(saleDetailArb, (detail) => {
        const roundTripped = deserializeSaleDetail(serializeSaleDetail(detail));
        expect(roundTripped).toEqual(detail);
      }),
      { numRuns: 100 },
    );
  });
});
