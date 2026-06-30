// Feature: complete-backends
// Pure, dependency-free domain core. No React, no Supabase imports.
//
// This is the property-tested core for the sparepart domain: it holds the
// stock status enum, the stock-status derivation rule, the input model, and the
// first-unmet-rule input validation. Validation returns the established
// `ValidationResult` shape with Indonesian messages and mirrors the style of
// stockCore.ts. Money is represented as integer IDR.

// ---------- Domain types ----------

/** Derived stock status of a sparepart. */
export type SparepartStatus = 'OK' | 'STOK RENDAH' | 'HABIS';

/**
 * The pure-core input model for a sparepart. `compatibleType` is free-form and
 * not validated. Prices are integer IDR.
 */
export interface SparepartInputCore {
  name: string;
  compatibleType: string;
  stock: number; // integer >= 0
  minStock: number; // integer >= 0
  buyPrice: number; // integer IDR >= 0
  sellPrice: number; // integer IDR >= 0
}

/** The established validation result shape with an Indonesian message. */
export type ValidationResult = { ok: true } | { ok: false; message: string };

// ---------- Helpers / predicates ----------

/**
 * Total, null-safe numeric coercion. Any non-number or NaN value collapses to
 * 0 so downstream rules never observe an invalid number. Never throws.
 */
function coerceNumber(n: number): number {
  return typeof n === 'number' && !Number.isNaN(n) ? n : 0;
}

// ---------- Status derivation ----------

/**
 * Derive the stock status from a current stock level and a minimum threshold.
 * Non-number/NaN inputs are coerced to 0. The rules, in order:
 *  - 'HABIS'       when stock <= 0
 *  - 'STOK RENDAH' when 0 < stock <= minStock
 *  - 'OK'          otherwise
 * Total and never throws.
 */
export function deriveSparepartStatus(
  stock: number,
  minStock: number,
): SparepartStatus {
  const s = coerceNumber(stock);
  const min = coerceNumber(minStock);

  if (s <= 0) {
    return 'HABIS';
  }
  if (s <= min) {
    return 'STOK RENDAH';
  }
  return 'OK';
}

// ---------- Validation ----------

/**
 * Validate sparepart input in ascending criterion order; return the FIRST
 * unmet rule. `compatibleType` is optional and never validated. The rules:
 *  1) name required (non-empty after trim) -> 'Nama sparepart wajib diisi'
 *  2) stock integer >= 0                    -> 'Stok tidak boleh negatif'
 *  3) minStock integer >= 0                 -> 'Stok minimum tidak boleh negatif'
 *  4) buyPrice integer >= 0                 -> 'Harga beli tidak boleh negatif'
 *  5) sellPrice integer >= 0                -> 'Harga jual tidak boleh negatif'
 * Total, null-safe, and never throws.
 */
export function validateSparepartInput(
  input: SparepartInputCore,
): ValidationResult {
  const trimmedName = input?.name?.trim() ?? '';
  if (trimmedName.length === 0) {
    return { ok: false, message: 'Nama sparepart wajib diisi' };
  }

  if (!(Number.isInteger(input?.stock) && input.stock >= 0)) {
    return { ok: false, message: 'Stok tidak boleh negatif' };
  }

  if (!(Number.isInteger(input?.minStock) && input.minStock >= 0)) {
    return { ok: false, message: 'Stok minimum tidak boleh negatif' };
  }

  if (!(Number.isInteger(input?.buyPrice) && input.buyPrice >= 0)) {
    return { ok: false, message: 'Harga beli tidak boleh negatif' };
  }

  if (!(Number.isInteger(input?.sellPrice) && input.sellPrice >= 0)) {
    return { ok: false, message: 'Harga jual tidak boleh negatif' };
  }

  return { ok: true };
}
