import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  deriveSparepartStatus,
  validateSparepartInput,
  type SparepartInputCore,
} from './sparepartCore';

// ---------------------------------------------------------------------------
// Shared config & generators
// ---------------------------------------------------------------------------

const RUNS = { numRuns: 100 } as const;

const stockArb: fc.Arbitrary<number> = fc.integer({ min: -5, max: 100 });
const minStockArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 50 });

/** Independent oracle for the sparepart stock status. */
const statusOracle = (stock: number, minStock: number): string => {
  if (stock <= 0) return 'HABIS';
  if (stock <= minStock) return 'STOK RENDAH';
  return 'OK';
};

// ---------------------------------------------------------------------------
// Property 2: status derivation
// ---------------------------------------------------------------------------

describe('Property 2: deriveSparepartStatus matches an independent oracle', () => {
  // Feature: complete-backends, Property 2
  // Validates: Requirements 1.3
  it("returns 'HABIS' iff stock<=0; 'STOK RENDAH' iff 0<stock<=minStock; 'OK' otherwise", () => {
    fc.assert(
      fc.property(stockArb, minStockArb, (stock, minStock) => {
        const result = deriveSparepartStatus(stock, minStock);

        // Matches the independent oracle.
        expect(result).toBe(statusOracle(stock, minStock));

        // Explicit biconditional checks.
        expect(result === 'HABIS').toBe(stock <= 0);
        expect(result === 'STOK RENDAH').toBe(stock > 0 && stock <= minStock);
        expect(result === 'OK').toBe(stock > minStock);
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: input validation (branch-targeting generators)
// ---------------------------------------------------------------------------

const validNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);

const nonNegIntArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 1_000_000 });

const validInputArb: fc.Arbitrary<SparepartInputCore> = fc.record({
  name: validNameArb,
  compatibleType: fc.string(),
  stock: nonNegIntArb,
  minStock: nonNegIntArb,
  buyPrice: nonNegIntArb,
  sellPrice: nonNegIntArb,
});

const negIntArb: fc.Arbitrary<number> = fc.integer({ min: -1000, max: -1 });

describe('Property 2: validateSparepartInput targets each branch', () => {
  // Feature: complete-backends, Property 2
  // Validates: Requirements 1.3
  it('accepts a fully valid input', () => {
    fc.assert(
      fc.property(validInputArb, (input) => {
        expect(validateSparepartInput(input)).toEqual({ ok: true });
      }),
      RUNS,
    );
  });

  // Feature: complete-backends, Property 2
  // Validates: Requirements 1.3
  it('rejects an empty/whitespace name', () => {
    const blankNameArb = fc.stringMatching(/^[ \t\n\r]*$/);
    fc.assert(
      fc.property(validInputArb, blankNameArb, (base, name) => {
        const result = validateSparepartInput({ ...base, name });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message.length).toBeGreaterThan(0);
        }
      }),
      RUNS,
    );
  });

  // Feature: complete-backends, Property 2
  // Validates: Requirements 1.3
  it('rejects a negative stock', () => {
    fc.assert(
      fc.property(validInputArb, negIntArb, (base, stock) => {
        expect(validateSparepartInput({ ...base, stock }).ok).toBe(false);
      }),
      RUNS,
    );
  });

  // Feature: complete-backends, Property 2
  // Validates: Requirements 1.3
  it('rejects a negative minStock', () => {
    fc.assert(
      fc.property(validInputArb, negIntArb, (base, minStock) => {
        expect(validateSparepartInput({ ...base, minStock }).ok).toBe(false);
      }),
      RUNS,
    );
  });

  // Feature: complete-backends, Property 2
  // Validates: Requirements 1.3
  it('rejects a negative buyPrice', () => {
    fc.assert(
      fc.property(validInputArb, negIntArb, (base, buyPrice) => {
        expect(validateSparepartInput({ ...base, buyPrice }).ok).toBe(false);
      }),
      RUNS,
    );
  });

  // Feature: complete-backends, Property 2
  // Validates: Requirements 1.3
  it('rejects a negative sellPrice', () => {
    fc.assert(
      fc.property(validInputArb, negIntArb, (base, sellPrice) => {
        expect(validateSparepartInput({ ...base, sellPrice }).ok).toBe(false);
      }),
      RUNS,
    );
  });
});
