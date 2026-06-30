import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { render } from '@testing-library/react';
import { Receipt } from './Receipt';
import type { ReceiptData } from '@/services/receipt';

// Shared generators -------------------------------------------------------

/** Integer IDR money in the inclusive domain 0 … 999,999,999,999 (Req 2.6). */
const money = fc.integer({ min: 0, max: 999_999_999_999 });

const ALNUM_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('');

/**
 * Non-empty alphanumeric string generator. Using alphanumeric strings of
 * minLength >= 1 keeps text-presence assertions reliable (avoids empty /
 * whitespace-only values that would be impossible to locate in the output).
 */
function alnum(minLength = 1, maxLength = 8): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...ALNUM_CHARS), { minLength, maxLength })
    .map((chars) => chars.join(''));
}

/**
 * Prefixed alphanumeric value generator. The distinctive prefix makes
 * presence/absence assertions for a specific field unambiguous (the value
 * cannot accidentally collide with other rendered text).
 */
function prefixed(prefix: string): fc.Arbitrary<string> {
  return alnum(1, 6).map((s) => prefix + s);
}

/**
 * Re-create the component's id-ID currency formatter so the test computes the
 * exact monetary strings the component renders (2 decimal places, "," decimal
 * separator). Asserting on this avoids coupling to a hand-written format.
 */
const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const formatMoney = (amount: number): string => idrFormatter.format(amount);

/** Re-create the component's id-ID date/time-to-minute formatter. */
const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const formatTimestamp = (iso: string): string =>
  dateTimeFormatter.format(new Date(iso));

const unitArb = fc.record({
  imei: prefixed('IMEI'),
  model: prefixed('MODEL'),
  capacity: prefixed('CAP'),
  condition: prefixed('COND'),
  color: prefixed('CLR'),
  sellingPrice: money,
});

const itemArb = fc.record({
  name: prefixed('ITEM'),
  price: money,
});

const bonusArb = fc.record({
  name: prefixed('BONUS'),
});

const totalsArb = fc.record({
  subtotal: money,
  discount: money,
  transactionTotal: money,
  paymentTotal: money,
  changeDue: money,
});

const paymentArb = fc.record({ cash: money, transfer: money });

/**
 * A valid ISO timestamp within a sane calendar range. Built from a millisecond
 * instant so the resulting Date is always valid (never "Invalid Date").
 */
const isoTimestampArb = fc
  .integer({
    min: Date.UTC(2000, 0, 1),
    max: Date.UTC(2100, 0, 1),
  })
  .map((ms) => new Date(ms).toISOString());

/**
 * ReceiptData generator for Property 7. At least one unit so the "every unit"
 * assertions are exercised; collections kept small for fast runs.
 */
const transactionIdArb = fc.option(fc.string({ minLength: 10, maxLength: 36 }), { nil: undefined });

const receiptDataArb: fc.Arbitrary<ReceiptData> = fc.record({
  transactionId: transactionIdArb,
  units: fc.array(unitArb, { minLength: 1, maxLength: 5 }),
  items: fc.array(itemArb, { maxLength: 5 }),
  bonuses: fc.array(bonusArb, { maxLength: 5 }),
  warranty: fc.option(prefixed('WRT'), { nil: null }),
  customerName: fc.option(prefixed('NAME'), { nil: null }),
  customerPhone: fc.option(prefixed('PHONE'), { nil: null }),
  totals: totalsArb,
  payment: paymentArb,
  finalizedAt: isoTimestampArb,
});

// -------------------------------------------------------------------------

describe('Receipt — property tests', () => {
  // Feature: pos-finalization, Property 7: Receipt contains all required fields, money to two decimals
  it('Property 7: renders every required field and formats all money to exactly two decimals', () => {
    fc.assert(
      fc.property(receiptDataArb, (data) => {
        const { container, unmount } = render(<Receipt data={data} />);
        try {
          const text = container.textContent ?? '';

          // Collect every monetary amount displayed on the receipt.
          const moneyValues: number[] = [
            ...data.units.map((u) => u.sellingPrice),
            ...data.items.map((i) => i.price),
            data.totals.transactionTotal,
            data.payment.cash,
            data.payment.transfer,
            data.totals.changeDue,
          ];

          // Every monetary amount is present and formatted with exactly two
          // decimal places using the id-ID "," decimal separator (Req 4.2, 4.3,
          // 4.5).
          for (const amount of moneyValues) {
            const formatted = formatMoney(amount);
            expect(/,\d{2}$/.test(formatted)).toBe(true);
            expect(text).toContain(formatted);
          }

          // Every unit shows model, capacity, condition, color, IMEI (Req 4.2).
          for (const unit of data.units) {
            expect(text).toContain(unit.model);
            expect(text).toContain(unit.capacity);
            expect(text).toContain(unit.condition);
            expect(text).toContain(unit.color);
            expect(text).toContain(unit.imei);
          }

          // Every added item lists its name (price covered above) (Req 4.5).
          for (const item of data.items) {
            expect(text).toContain(item.name);
          }

          // Every added bonus lists its name (Req 4.6).
          for (const bonus of data.bonuses) {
            expect(text).toContain(bonus.name);
          }

          // Selected warranty is shown when set (Req 4.7).
          if (data.warranty) {
            expect(text).toContain(data.warranty);
          }

          // Finalization date + time-to-the-minute is included (Req 4.8).
          expect(text).toContain(formatTimestamp(data.finalizedAt));

          // Transaction ID short form is shown when provided.
          if (data.transactionId) {
            expect(text).toContain(data.transactionId.slice(0, 8).toUpperCase());
          }
        } finally {
          unmount();
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: pos-finalization, Property 8: Receipt shows customer fields only when provided
  it('Property 8: customer name and phone appear exactly when provided, omitted when neither is present', () => {
    fc.assert(
      fc.property(receiptDataArb, (data) => {
        const { container, unmount } = render(<Receipt data={data} />);
        try {
          const text = container.textContent ?? '';

          const nameProvided = Boolean(data.customerName);
          const phoneProvided = Boolean(data.customerPhone);

          // The "Nama:" / "Telepon:" labels mark the presence of each field.
          const nameLabelShown = text.includes('Nama:');
          const phoneLabelShown = text.includes('Telepon:');

          // Name field appears exactly when a name is provided (Req 4.4).
          expect(nameLabelShown).toBe(nameProvided);
          if (nameProvided) {
            expect(text).toContain(data.customerName as string);
          }

          // Phone field appears exactly when a phone is provided (Req 4.4).
          expect(phoneLabelShown).toBe(phoneProvided);
          if (phoneProvided) {
            expect(text).toContain(data.customerPhone as string);
          }

          // Both fields are omitted when neither is provided (Req 4.4).
          if (!nameProvided && !phoneProvided) {
            expect(nameLabelShown).toBe(false);
            expect(phoneLabelShown).toBe(false);
          }
        } finally {
          unmount();
        }
      }),
      { numRuns: 100 },
    );
  });
});
