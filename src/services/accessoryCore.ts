// Feature: complete-backends
// Pure, dependency-free domain core. No React, no Supabase imports.
//
// This is the property-tested core for the accessory (pelengkap) stock feature:
// it derives the low-stock status badge from on-hand vs. minimum stock, and
// validates accessory inputs and stock-take quantities. All figures are integer
// IDR; quantities are integers. Validation returns the established
// `ValidationResult` shape with Indonesian messages and mirrors the style of
// stockCore.ts / financeCore.ts. Every function is total, null-safe, performs no
// mutation, and never throws.

// ---------- Domain types ----------

/** Low-stock badge derived from on-hand vs. minimum stock. */
export type AccessoryStatus = 'AMAN' | 'MENIPIS' | 'HABIS';

/** The canonical, ordered set of valid accessory categories. */
export const ACCESSORY_CATEGORIES = [
  'charger',
  'tempered_glass',
  'case',
  'kotak',
  'paperbag',
] as const;

/** A single accessory category (member of ACCESSORY_CATEGORIES). */
export type AccessoryCategory = typeof ACCESSORY_CATEGORIES[number];

/** The pure-core input model for an accessory item. */
export interface AccessoryInputCore {
  name: string;
  category: string; // validated against ACCESSORY_CATEGORIES
  stock: number; // integer >= 0
  minStock: number; // integer >= 0
  price: number; // integer IDR >= 0
}

/** The established validation result shape with an Indonesian message. */
export type ValidationResult = { ok: true } | { ok: false; message: string };

// ---------- Helpers ----------

/**
 * Coerce a possibly-absent / non-numeric value to a safe number, treating
 * null/undefined/NaN/non-number as 0. Used so status derivation never throws.
 */
function toNumber(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return value;
}

// ---------- Status derivation ----------

/**
 * Derive the low-stock badge from on-hand `stock` vs. `minStock`. Non-number
 * or NaN inputs are coerced to 0 (never throws):
 *  - stock <= 0                    -> 'HABIS'
 *  - 0 < stock <= minStock         -> 'MENIPIS'
 *  - otherwise                     -> 'AMAN'
 */
export function deriveAccessoryStatus(
  stock: number,
  minStock: number,
): AccessoryStatus {
  const s = toNumber(stock);
  const min = toNumber(minStock);

  if (s <= 0) return 'HABIS';
  if (s <= min) return 'MENIPIS';
  return 'AMAN';
}

// ---------- Predicates ----------

/** Type guard: a category is valid iff it is a member of ACCESSORY_CATEGORIES. */
export function isValidCategory(c: string): c is AccessoryCategory {
  return (ACCESSORY_CATEGORIES as readonly string[]).includes(c);
}

/** A non-negative integer (used for stock, minStock, and price). */
function isNonNegativeInteger(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

// ---------- Validation ----------

/**
 * Validate accessory input in ascending criterion order; return the FIRST unmet
 * rule. Each value is checked independently and the core never throws:
 *  1) name required (non-empty after trim) -> 'Nama pelengkap wajib diisi'
 *  2) category in ACCESSORY_CATEGORIES      -> 'Kategori tidak valid'
 *  3) stock integer >= 0                    -> 'Stok tidak boleh negatif'
 *  4) minStock integer >= 0                 -> 'Stok minimum tidak boleh negatif'
 *  5) price integer >= 0                    -> 'Harga tidak boleh negatif'
 */
export function validateAccessoryInput(
  input: AccessoryInputCore,
): ValidationResult {
  const trimmedName = input.name?.trim() ?? '';
  if (trimmedName.length === 0) {
    return { ok: false, message: 'Nama pelengkap wajib diisi' };
  }

  if (!isValidCategory(input.category)) {
    return { ok: false, message: 'Kategori tidak valid' };
  }

  if (!isNonNegativeInteger(input.stock)) {
    return { ok: false, message: 'Stok tidak boleh negatif' };
  }

  if (!isNonNegativeInteger(input.minStock)) {
    return { ok: false, message: 'Stok minimum tidak boleh negatif' };
  }

  if (!isNonNegativeInteger(input.price)) {
    return { ok: false, message: 'Harga tidak boleh negatif' };
  }

  return { ok: true };
}

/**
 * Validate a stock-take ("ambil") quantity against the available stock; return
 * the FIRST unmet rule (never throws):
 *  - qty integer >= 1     -> 'Jumlah ambil minimal 1'
 *  - qty <= available     -> 'Jumlah melebihi stok tersedia'
 */
export function validateTakeQuantity(
  available: number,
  qty: number,
): ValidationResult {
  if (!(Number.isInteger(qty) && qty >= 1)) {
    return { ok: false, message: 'Jumlah ambil minimal 1' };
  }

  if (qty > available) {
    return { ok: false, message: 'Jumlah melebihi stok tersedia' };
  }

  return { ok: true };
}
