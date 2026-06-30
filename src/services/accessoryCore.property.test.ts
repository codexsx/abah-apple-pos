import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  ACCESSORY_CATEGORIES,
  deriveAccessoryStatus,
  validateAccessoryInput,
  validateTakeQuantity,
  type AccessoryInputCore,
} from './accessoryCore';

// ---------------------------------------------------------------------------
// Shared config & generators
// ---------------------------------------------------------------------------

const RUNS = { numRuns: 100 } as const;

const stockArb: fc.Arbitrary<number> = fc.integer({ min: -5, max: 100 });
const minStockArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 50 });

/** Independent oracle for the low-stock badge. */
const statusOracle = (stock: number, minStock: number): string => {
  if (stock <= 0) return 'HABIS';
  if (stock <= minStock) return 'MENIPIS';
  return 'AMAN';
};

// ---------------------------------------------------------------------------
// Property 1: status derivation
// ---------------------------------------------------------------------------

describe('Property 1: deriveAccessoryStatus matches an independent oracle', () => {
  // Feature: complete-backends, Property 1
  // Validates: Requirements 1.1
  it("returns 'HABIS' iff stock<=0; 'MENIPIS' iff 0<stock<=minStock; 'AMAN' iff stock>minStock", () => {
    fc.assert(
      fc.property(stockArb, minStockArb, (stock, minStock) => {
        const result = deriveAccessoryStatus(stock, minStock);

        // Matches the independent oracle.
        expect(result).toBe(statusOracle(stock, minStock));

        // Explicit biconditional checks.
        expect(result === 'HABIS').toBe(stock <= 0);
        expect(result === 'MENIPIS').toBe(stock > 0 && stock <= minStock);
        expect(result === 'AMAN').toBe(stock > minStock);
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 1: input validation (branch-targeting generators)
// ---------------------------------------------------------------------------

const validNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);

const categoryArb: fc.Arbitrary<string> = fc.constantFrom(
  ...ACCESSORY_CATEGORIES,
);

const nonNegIntArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 1_000_000 });

const validInputArb: fc.Arbitrary<AccessoryInputCore> = fc.record({
  name: validNameArb,
  category: categoryArb,
  stock: nonNegIntArb,
  minStock: nonNegIntArb,
  price: nonNegIntArb,
});

describe('Property 1: validateAccessoryInput targets each branch', () => {
  // Feature: complete-backends, Property 1
  // Validates: Requirements 1.1
  it('accepts a fully valid input', () => {
    fc.assert(
      fc.property(validInputArb, (input) => {
        expect(validateAccessoryInput(input)).toEqual({ ok: true });
      }),
      RUNS,
    );
  });

  // Feature: complete-backends, Property 1
  // Validates: Requirements 1.1
  it('rejects an empty/whitespace name with a message', () => {
    const blankNameArb = fc.stringMatching(/^[ \t\n\r]*$/);
    fc.assert(
      fc.property(
        validInputArb,
        blankNameArb,
        (base, blankName) => {
          const input = { ...base, name: blankName };
          const result = validateAccessoryInput(input);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(typeof result.message).toBe('string');
            expect(result.message.length).toBeGreaterThan(0);
          }
        },
      ),
      RUNS,
    );
  });

  // Feature: complete-backends, Property 1
  // Validates: Requirements 1.1
  it('rejects an invalid category', () => {
    const invalidCategoryArb = fc
      .string()
      .filter((c) => !(ACCESSORY_CATEGORIES as readonly string[]).includes(c));
    fc.assert(
      fc.property(validInputArb, invalidCategoryArb, (base, category) => {
        const result = validateAccessoryInput({ ...base, category });
        expect(result.ok).toBe(false);
      }),
      RUNS,
    );
  });

  // Feature: complete-backends, Property 1
  // Validates: Requirements 1.1
  it('rejects a negative stock', () => {
    const negStockArb = fc.integer({ min: -1000, max: -1 });
    fc.assert(
      fc.property(validInputArb, negStockArb, (base, stock) => {
        const result = validateAccessoryInput({ ...base, stock });
        expect(result.ok).toBe(false);
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 1: take-quantity validation
// ---------------------------------------------------------------------------

const availableArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 100 });
const qtyArb: fc.Arbitrary<number> = fc.integer({ min: -5, max: 120 });

describe('Property 1: validateTakeQuantity matches an oracle', () => {
  // Feature: complete-backends, Property 1
  // Validates: Requirements 1.1
  it('ok iff (qty integer >=1 AND qty<=available); otherwise not ok', () => {
    fc.assert(
      fc.property(availableArb, qtyArb, (available, qty) => {
        const result = validateTakeQuantity(available, qty);
        const oracleOk = Number.isInteger(qty) && qty >= 1 && qty <= available;
        expect(result.ok).toBe(oracleOk);
        if (!result.ok) {
          expect(typeof result.message).toBe('string');
          expect(result.message.length).toBeGreaterThan(0);
        }
      }),
      RUNS,
    );
  });
});
