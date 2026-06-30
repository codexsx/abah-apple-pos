import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  deriveDirection,
  deriveTukarTambahDirectionAndAmount,
  buildPostings,
  validatePaymentSelection,
  structuredSourceRef,
  type FlowKind,
  type PaymentSelection,
} from './paymentPosting';
import { MAX_IDR, type AccountType, type Direction } from './accountsCore';

// ---------------------------------------------------------------------------
// Shared config & generators
// ---------------------------------------------------------------------------

const RUNS = { numRuns: 100 } as const;

/** A valid portion: integer 0 … MAX_IDR. */
const portionArb = fc.integer({ min: 0, max: MAX_IDR });

const directionArb = fc.constantFrom<Direction>('money_in', 'money_out');

const flowArb = fc.constantFrom<FlowKind>('income', 'expense');

/**
 * A valid PaymentSelection whose non-zero portions always carry a non-null
 * account id, so buildPostings emits one posting per non-zero portion.
 */
const selectionArb: fc.Arbitrary<PaymentSelection> = fc.record({
  cashPortion: portionArb,
  cashAccountId: fc.uuid(),
  transferPortion: portionArb,
  transferAccountId: fc.uuid(),
});

/**
 * An out-of-range or non-integer value: a negative integer, a value above
 * MAX_IDR, or a non-integer float.
 */
const invalidPortionArb: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: -MAX_IDR, max: -1 }),
  fc.integer({ min: MAX_IDR + 1, max: Number.MAX_SAFE_INTEGER }),
  fc.integer({ min: 0, max: 1_000_000 }).map((n) => n + 0.5),
);

// ---------------------------------------------------------------------------
// Property 1 (task 2.2)
// ---------------------------------------------------------------------------

describe('Property 1: Direction derivation follows flow kind', () => {
  // Feature: transaction-account-integration, Property 1: Direction derivation follows flow kind
  // Validates: Requirements 2.3, 2.4, 7.1, 7.2
  it('returns money_in for income and money_out for expense', () => {
    fc.assert(
      fc.property(flowArb, (flow) => {
        const direction = deriveDirection(flow);
        if (flow === 'income') {
          expect(direction).toBe('money_in');
        } else {
          expect(direction).toBe('money_out');
        }
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2 (task 2.3)
// ---------------------------------------------------------------------------

describe('Property 2: Tukar Tambah direction and amount follow the Selisih sign', () => {
  // Feature: transaction-account-integration, Property 2: Tukar Tambah direction and amount follow the Selisih sign
  // Validates: Requirements 6.5, 6.6, 7.3, 7.4, 7.8
  it('derives direction/amount from the sign of Selisih; null when zero', () => {
    fc.assert(
      fc.property(fc.integer(), (selisih) => {
        const result = deriveTukarTambahDirectionAndAmount(selisih);
        if (selisih > 0) {
          expect(result).toEqual({ direction: 'money_in', amount: Math.abs(selisih) });
        } else if (selisih < 0) {
          expect(result).toEqual({ direction: 'money_out', amount: Math.abs(selisih) });
        } else {
          expect(result).toBeNull();
        }
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3 (task 2.4)
// ---------------------------------------------------------------------------

describe('Property 3: buildPostings emits exactly one posting per non-zero portion to the matching account', () => {
  // Feature: transaction-account-integration, Property 3: buildPostings emits exactly one posting per non-zero portion to the matching account
  // Validates: Requirements 1.3, 1.4, 2.1, 2.2, 2.7, 5.1
  it('emits a cash posting iff cashPortion>=1 and a transfer posting iff transferPortion>=1', () => {
    fc.assert(
      fc.property(directionArb, selectionArb, (direction, selection) => {
        const postings = buildPostings(direction, selection);

        const cash = postings.find((p) => p.account_id === selection.cashAccountId);
        const transfer = postings.find(
          (p) => p.account_id === selection.transferAccountId,
        );

        if (selection.cashPortion >= 1) {
          expect(cash).toBeDefined();
          expect(cash!.account_id).toBe(selection.cashAccountId);
          expect(cash!.amount).toBe(selection.cashPortion);
        } else {
          expect(cash).toBeUndefined();
        }

        if (selection.transferPortion >= 1) {
          expect(transfer).toBeDefined();
          expect(transfer!.account_id).toBe(selection.transferAccountId);
          expect(transfer!.amount).toBe(selection.transferPortion);
        } else {
          expect(transfer).toBeUndefined();
        }

        expect(postings.length).toBeGreaterThanOrEqual(0);
        expect(postings.length).toBeLessThanOrEqual(2);
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4 (task 2.5)
// ---------------------------------------------------------------------------

describe('Property 4: Posted amounts sum to the Settled_Amount', () => {
  // Feature: transaction-account-integration, Property 4: Posted amounts sum to the Settled_Amount
  // Validates: Requirements 2.6, 5.4, 7.9
  it('sums posting amounts to cashPortion + transferPortion', () => {
    fc.assert(
      fc.property(directionArb, selectionArb, (direction, selection) => {
        const postings = buildPostings(direction, selection);
        const total = postings.reduce((acc, p) => acc + p.amount, 0);
        expect(total).toBe(selection.cashPortion + selection.transferPortion);
        for (const p of postings) {
          expect(Number.isInteger(p.amount)).toBe(true);
          expect(p.amount).toBeGreaterThanOrEqual(0);
        }
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5 (task 2.6)
// ---------------------------------------------------------------------------

describe('Property 5: All postings of one transaction share the same direction', () => {
  // Feature: transaction-account-integration, Property 5: All postings of one transaction share the same direction
  // Validates: Requirements 5.2, 7.7
  it('every posting carries the input direction', () => {
    fc.assert(
      fc.property(directionArb, selectionArb, (direction, selection) => {
        const postings = buildPostings(direction, selection);
        for (const p of postings) {
          expect(p.direction).toBe(direction);
        }
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6 (task 2.7)
// ---------------------------------------------------------------------------

describe('Property 6: A non-zero portion without its matching account is rejected', () => {
  // Feature: transaction-account-integration, Property 6: A non-zero portion without its matching account is rejected
  // Validates: Requirements 1.1, 1.2, 4.1, 4.2, 9.1, 9.5
  it('rejects a non-zero cash portion with no cash account (CASH_ACCOUNT_REQUIRED)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_IDR }), (cashPortion) => {
        const result = validatePaymentSelection({
          cashPortion,
          cashAccountType: null,
          transferPortion: 0,
          transferAccountType: null,
          requiresPayment: true,
        });
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe('CASH_ACCOUNT_REQUIRED');
      }),
      RUNS,
    );
  });

  it('rejects a non-zero transfer portion with no bank account (TRANSFER_ACCOUNT_REQUIRED)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_IDR }), (transferPortion) => {
        // cashPortion = 0 so the cash rules are skipped and the transfer rule is the first failure.
        const result = validatePaymentSelection({
          cashPortion: 0,
          cashAccountType: null,
          transferPortion,
          transferAccountType: null,
          requiresPayment: true,
        });
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe('TRANSFER_ACCOUNT_REQUIRED');
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7 (task 2.8)
// ---------------------------------------------------------------------------

describe('Property 7: A non-zero portion mapped to the wrong account type is rejected', () => {
  // Feature: transaction-account-integration, Property 7: A non-zero portion mapped to the wrong account type is rejected
  // Validates: Requirements 4.3, 4.4, 7.5, 7.6
  it('rejects a non-zero cash portion whose account type is not Cash (CASH_ACCOUNT_TYPE)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_IDR }), (cashPortion) => {
        const result = validatePaymentSelection({
          cashPortion,
          cashAccountType: 'Bank' as AccountType,
          transferPortion: 0,
          transferAccountType: null,
          requiresPayment: true,
        });
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe('CASH_ACCOUNT_TYPE');
      }),
      RUNS,
    );
  });

  it('rejects a non-zero transfer portion whose account type is not Bank (TRANSFER_ACCOUNT_TYPE)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_IDR }), (transferPortion) => {
        const result = validatePaymentSelection({
          cashPortion: 0,
          cashAccountType: null,
          transferPortion,
          transferAccountType: 'Cash' as AccountType,
          requiresPayment: true,
        });
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe('TRANSFER_ACCOUNT_TYPE');
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8 (task 2.9)
// ---------------------------------------------------------------------------

describe('Property 8: Out-of-range or non-integer amounts are rejected', () => {
  // Feature: transaction-account-integration, Property 8: Out-of-range or non-integer amounts are rejected
  // Validates: Requirements 2.9, 4.5
  it('rejects a portion that is negative, > MAX_IDR, or non-integer (AMOUNT_OUT_OF_RANGE)', () => {
    fc.assert(
      fc.property(invalidPortionArb, fc.boolean(), (invalid, inCash) => {
        const result = validatePaymentSelection({
          cashPortion: inCash ? invalid : 0,
          cashAccountType: null,
          transferPortion: inCash ? 0 : invalid,
          transferAccountType: null,
          requiresPayment: false,
        });
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe('AMOUNT_OUT_OF_RANGE');
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9 (task 2.10)
// ---------------------------------------------------------------------------

describe('Property 9: A flow that requires payment rejects a zero Settled_Amount', () => {
  // Feature: transaction-account-integration, Property 9: A flow that requires payment rejects a zero Settled_Amount
  // Validates: Requirements 4.6
  it('rejects zero settled amount when payment is required (PAYMENT_REQUIRED)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<AccountType | null>('Cash', 'Bank', null),
        fc.constantFrom<AccountType | null>('Cash', 'Bank', null),
        (cashAccountType, transferAccountType) => {
          const result = validatePaymentSelection({
            cashPortion: 0,
            cashAccountType,
            transferPortion: 0,
            transferAccountType,
            requiresPayment: true,
          });
          expect(result.ok).toBe(false);
          expect(result.ok === false && result.code).toBe('PAYMENT_REQUIRED');
        },
      ),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10 (task 2.11)
// ---------------------------------------------------------------------------

describe('Property 10: Structured source reference format round-trips', () => {
  // Feature: transaction-account-integration, Property 10: Structured source reference format round-trips
  // Validates: Requirements 2.5, 5.3, 9.3
  it('formats as `${type}:${id}` and recovers the id by splitting on the last colon', () => {
    fc.assert(
      fc.property(fc.string(), fc.uuid(), (type, id) => {
        const ref = structuredSourceRef(type, id);
        expect(ref).toBe(`${type}:${id}`);

        // id (a uuid) contains no ':', so the last ':' is the separator.
        const lastColon = ref.lastIndexOf(':');
        const recoveredId = ref.slice(lastColon + 1);
        expect(recoveredId).toBe(id);
      }),
      RUNS,
    );
  });
});
