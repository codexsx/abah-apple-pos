import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  deriveAgentPaymentBreakdown,
  deriveAgentBalanceBreakdown,
  validateAccountTransfer,
  buildTransferPostings,
  type TransferSelection,
} from './depositCore';
import { MAX_IDR } from '@/services/accountsCore';

// ---------------------------------------------------------------------------
// Shared config & generators
// ---------------------------------------------------------------------------

const RUNS = { numRuns: 100 } as const;

/** A valid amount: integer 1 … MAX_IDR. */
const amountArb = fc.integer({ min: 1, max: MAX_IDR });

/** Any non-negative outstanding debt: integer 0 … MAX_IDR. */
const outstandingDebtArb = fc.integer({ min: 0, max: MAX_IDR });

// ---------------------------------------------------------------------------
// Property 1 (Phase 4, agent-supplier-deposit)
// ---------------------------------------------------------------------------

describe('Property 1: Payment breakdown conserves and splits the amount', () => {
  // Feature: agent-supplier-deposit, Property 1
  // Validates: Requirements 1.1, 1.2, 1.3, 1.4
  it('splits a valid amount into owed = min(debt, amount) and surplus = amount - owed', () => {
    fc.assert(
      fc.property(outstandingDebtArb, amountArb, (outstandingDebt, amount) => {
        const result = deriveAgentPaymentBreakdown(outstandingDebt, amount);

        expect(result.ok).toBe(true);
        // Narrow the discriminated union before reading the breakdown.
        if (result.ok !== true) return;

        const { owed, surplus } = result.breakdown;

        expect(owed).toBe(Math.min(outstandingDebt, amount));
        expect(surplus).toBe(amount - owed);
        expect(owed + surplus).toBe(amount);
        expect(owed).toBeGreaterThanOrEqual(0);
        expect(surplus).toBeGreaterThanOrEqual(0);
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2 (Phase 4, agent-supplier-deposit)
// ---------------------------------------------------------------------------

/** An invalid amount: <= 0, > MAX_IDR, or a non-integer. */
const invalidAmountArb = fc.oneof(
  fc.integer({ max: 0 }) /* <=0 */,
  fc.integer({ min: MAX_IDR + 1, max: Number.MAX_SAFE_INTEGER }) /* > MAX */,
  fc.double({ min: 0.1, max: 100 }).filter((n) => !Number.isInteger(n)) /* non-integer */,
);

describe('Property 2: Out-of-range payment amounts are rejected', () => {
  // Feature: agent-supplier-deposit, Property 2
  // Validates: Requirements 1.5
  it('rejects any amount that is not an integer in 1..MAX_IDR, regardless of outstandingDebt', () => {
    fc.assert(
      fc.property(outstandingDebtArb, invalidAmountArb, (outstandingDebt, amount) => {
        const result = deriveAgentPaymentBreakdown(outstandingDebt, amount);

        expect(result.ok).toBe(false);
        // Narrow the discriminated union before reading the error code.
        if (result.ok !== false) return;

        expect(result.code).toBe('AMOUNT_OUT_OF_RANGE');
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3 (Phase 4, agent-supplier-deposit)
// ---------------------------------------------------------------------------

describe('Property 3: Balance breakdown is mutually exclusive and signed', () => {
  // Feature: agent-supplier-deposit, Property 3
  // Validates: Requirements 2.1, 2.2
  it('decomposes debt/paid into mutually exclusive debt vs credit with signed net', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_IDR }),
        fc.integer({ min: 0, max: MAX_IDR }),
        (debt, paid) => {
          const { outstandingDebt, depositCredit, net } = deriveAgentBalanceBreakdown(debt, paid);

          expect(outstandingDebt).toBe(Math.max(0, debt - paid));
          expect(depositCredit).toBe(Math.max(0, paid - debt));
          expect(net).toBe(debt - paid);
          expect(!(outstandingDebt > 0 && depositCredit > 0)).toBe(true);
        },
      ),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4 (Phase 4, agent-supplier-deposit)
// ---------------------------------------------------------------------------

/** Independent reference oracle mirroring the fixed first-unmet-rule order. */
function expected(sel: TransferSelection): string | null {
  const amountOk =
    Number.isInteger(sel.amount) && sel.amount >= 1 && sel.amount <= MAX_IDR;
  if (!amountOk) return 'AMOUNT_OUT_OF_RANGE';
  if (!sel.fromAccountId) return 'SOURCE_REQUIRED';
  if (!sel.toAccountId) return 'DESTINATION_REQUIRED';
  if (sel.fromAccountId === sel.toAccountId) return 'SAME_ACCOUNT';
  return null; // ok
}

describe('Property 4: Transfer validation first-unmet-rule ordering', () => {
  // Feature: agent-supplier-deposit, Property 4
  // Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
  it('returns the first failing code in fixed order, or ok only when all rules pass', () => {
    const transferAmountArb = fc.oneof(
      fc.integer({ min: 1, max: MAX_IDR }),
      fc.integer({ max: 0 }),
      fc.double({ min: 0.1, max: 5 }).filter((n) => !Number.isInteger(n)),
    );
    const accountArb = fc.oneof(fc.constant(null), fc.constantFrom('a', 'b', 'c'));

    fc.assert(
      fc.property(transferAmountArb, accountArb, accountArb, (amount, fromAccountId, toAccountId) => {
        const sel: TransferSelection = { amount, fromAccountId, toAccountId };
        const result = validateAccountTransfer(sel);
        const exp = expected(sel);

        if (exp === null) {
          expect(result.ok).toBe(true);
        } else {
          expect(result.ok).toBe(false);
          if (result.ok !== false) return;
          expect(result.code).toBe(exp);
        }
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5 (Phase 4, agent-supplier-deposit)
// ---------------------------------------------------------------------------

describe('Property 5: Transfer postings are a balanced money_out/money_in pair', () => {
  // Feature: agent-supplier-deposit, Property 5
  // Validates: Requirements 5.1, 5.2, 5.3
  it('builds exactly one money_out (source) and one money_in (destination), each for the full amount', () => {
    const accountPairArb = fc
      .tuple(fc.constantFrom('a', 'b', 'c', 'd'), fc.constantFrom('a', 'b', 'c', 'd'))
      .filter(([a, b]) => a !== b);

    fc.assert(
      fc.property(amountArb, accountPairArb, (amount, [fromAccountId, toAccountId]) => {
        const postings = buildTransferPostings({ amount, fromAccountId, toAccountId });

        expect(postings.length).toBe(2);

        const out = postings.filter((p) => p.direction === 'money_out');
        const into = postings.filter((p) => p.direction === 'money_in');

        // Exactly one of each direction.
        expect(out.length).toBe(1);
        expect(into.length).toBe(1);

        // money_out goes against the source for the full amount.
        expect(out[0].account_id).toBe(fromAccountId);
        expect(out[0].amount).toBe(amount);

        // money_in goes to the destination for the full amount.
        expect(into[0].account_id).toBe(toAccountId);
        expect(into[0].amount).toBe(amount);

        // The two postings reference different accounts.
        expect(out[0].account_id).not.toBe(into[0].account_id);
      }),
      RUNS,
    );
  });
});
