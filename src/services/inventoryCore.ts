// Feature: inventory-backend
// Pure, dependency-free domain module. No React, no Supabase imports.
//
// This is the property-tested core for inventory stock handling: it derives a
// human-facing stock-level status and clamps stock adjustments so they never go
// negative. It powers the accessory_stock listing and the spareparts status
// badge. All functions are total and null-safe: a null/NaN/non-number input is
// coerced to 0, nothing is mutated, and nothing ever throws.

// ---------- Domain types ----------

/** Stock-level status shown for accessory_stock + spareparts (AMAN/MENIPIS/HABIS). */
export type StockLevelStatus = 'AMAN' | 'MENIPIS' | 'HABIS';

// ---------- Helpers ----------

/** Coerce a possibly-absent/invalid numeric input to a safe number, treating
 *  null/undefined/NaN/non-number as 0 (mirrors financeCore.toAmount). */
function toNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return value;
}

// ---------- Stock-level status ----------

/**
 * Classify a stock count against its `minStock` threshold for the
 * accessory_stock + spareparts status badge. Non-number/NaN inputs are coerced
 * to 0; the function never throws and never mutates.
 *
 * Rules (evaluated in order):
 * - `stock <= 0`            → `'HABIS'`
 * - `stock <= minStock`     → `'MENIPIS'`
 * - otherwise               → `'AMAN'`
 *
 * Note: when `minStock <= 0`, any positive stock is always `'AMAN'`, because a
 * positive stock is both `> 0` and `> minStock`.
 */
export function deriveStockLevelStatus(
  stock: number,
  minStock: number,
): StockLevelStatus {
  const s = toNumber(stock);
  const m = toNumber(minStock);
  if (s <= 0) return 'HABIS';
  if (s <= m) return 'MENIPIS';
  return 'AMAN';
}

// ---------- Stock clamping ----------

/**
 * Clamp a proposed next stock value to a non-negative integer when adjusting
 * stock, so it never goes below 0 (`Math.max(0, Math.floor(coerced))`).
 * Non-number/NaN inputs are coerced to 0; the function never throws.
 */
export function clampStock(next: number): number {
  return Math.max(0, Math.floor(toNumber(next)));
}
