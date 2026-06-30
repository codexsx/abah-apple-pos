import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  deriveStockLevelStatus,
  clampStock,
  type StockLevelStatus,
} from './inventoryCore';

// ---------------------------------------------------------------------------
// Shared config & generators
// ---------------------------------------------------------------------------

const RUNS = { numRuns: 100 } as const;

/** Independent oracle for the status classification (mirrors the spec rules). */
function oracleStatus(stock: number, minStock: number): StockLevelStatus {
  if (stock <= 0) return 'HABIS';
  if (stock <= minStock) return 'MENIPIS';
  return 'AMAN';
}

/** Any number input, including ints, doubles, and NaN. */
const anyNumberArb: fc.Arbitrary<number> = fc.oneof(
  fc.integer(),
  fc.double({ noNaN: false }),
  fc.constant(NaN),
);

// ---------------------------------------------------------------------------
// Property 1 — deriveStockLevelStatus matches an independent oracle and
// exactly one branch holds.
// ---------------------------------------------------------------------------

describe('inventoryCore.deriveStockLevelStatus', () => {
  it('returns exactly one status that matches the oracle', () => {
    // Feature: inventory-backend, Property 1
    fc.assert(
      fc.property(
        fc.integer({ min: -10, max: 100 }),
        fc.integer({ min: -10, max: 100 }),
        (stock, minStock) => {
          const status = deriveStockLevelStatus(stock, minStock);

          const isHabis = stock <= 0;
          const isMenipis = stock > 0 && stock <= minStock;
          const isAman = stock > minStock && stock > 0;

          // Exactly one branch holds.
          const trueCount = [isHabis, isMenipis, isAman].filter(Boolean).length;
          expect(trueCount).toBe(1);

          // The returned status matches the holding branch...
          if (isHabis) expect(status).toBe('HABIS');
          else if (isMenipis) expect(status).toBe('MENIPIS');
          else expect(status).toBe('AMAN');

          // ...and matches the independent oracle.
          expect(status).toBe(oracleStatus(stock, minStock));
        },
      ),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2 — clampStock is non-negative and integer for any number input.
// ---------------------------------------------------------------------------

describe('inventoryCore.clampStock', () => {
  it('never returns negative and always returns an integer', () => {
    // Feature: inventory-backend, Property 2
    fc.assert(
      fc.property(anyNumberArb, (x) => {
        const result = clampStock(x);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(result)).toBe(true);
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3 — total functions: never throw for any input (including NaN).
// ---------------------------------------------------------------------------

describe('inventoryCore totality', () => {
  it('never throws for any number inputs', () => {
    // Feature: inventory-backend, Property 3
    fc.assert(
      fc.property(anyNumberArb, anyNumberArb, (stock, minStock) => {
        expect(() => deriveStockLevelStatus(stock, minStock)).not.toThrow();
        expect(() => clampStock(stock)).not.toThrow();
      }),
      RUNS,
    );
  });
});
