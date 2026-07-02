// Feature: stock-source-of-truth
// Pure, dependency-free domain core. No React, no Supabase imports.
//
// This is the property-tested core for Phase 3 (stock source-of-truth): it
// holds the status enum, the IMEI-presence rules, the unit-input validation
// (first-unmet-rule), and the lifecycle status-transition rule. Validation
// returns the established `ValidationResult` shape with Indonesian messages and
// mirrors the style of accountsCore.ts / paymentPosting.ts.

import { MAX_IDR } from '@/services/accountsCore';

// ---------- Domain types ----------

/** Lifecycle status of a stock unit (Req 1.1). */
export type StockStatus = 'READY' | 'SERVIS' | 'KANIBAL' | 'RUSAK' | 'TERJUAL';

/** The canonical, ordered set of valid stock statuses (Req 3.4). */
export const STOCK_STATUSES: readonly StockStatus[] = [
  'READY',
  'SERVIS',
  'KANIBAL',
  'RUSAK',
  'TERJUAL',
] as const;

export type StockValidationCode =
  | 'MODEL_REQUIRED'
  | 'IMEI_REQUIRED_FORMAT'
  | 'IMEI_MUST_BE_ABSENT'
  | 'PRICE_OUT_OF_RANGE'
  | 'COUNT_OUT_OF_RANGE'
  | 'STATUS_INVALID'
  | 'STATUS_TRANSITION_INVALID';

export type StockValidationResult =
  | { ok: true }
  | { ok: false; code: StockValidationCode; message: string };

/**
 * The pure-core input model for a stock unit. `imei` is required as 15 digits
 * iff `hasImei`, and must be absent otherwise (Req 2.1–2.4).
 */
export interface StockUnitInputCore {
  model: string;
  price: number; // integer IDR, 0..MAX_IDR
  count: number; // integer >= 1
  status: string; // validated against STOCK_STATUSES
  hasImei: boolean;
  imei: string | null; // required 15 digits iff hasImei
}

export interface StockEditDraft {
  model: string;
  capacity: string;
  condition: string;
  color: string;
  hasImei: boolean;
  imei: string;
  price: string | number;
  costPrice: string | number;
  batteryHealth: string | number;
  defectDescription: string;
}

export interface StockEditPayload {
  model: string;
  capacity: string;
  condition: string;
  color: string;
  has_imei: boolean;
  imei: string | null;
  price: number;
  cost_price: number;
  battery_health: number | null;
  defect_description: string;
}

export type NormalizeStockEditDraftResult =
  | { ok: true; payload: StockEditPayload }
  | { ok: false; message: string };

// ---------- Helpers / predicates ----------

/** A real IMEI is exactly 15 digits (Req 2.1). */
const IMEI_RE = /^\d{15}$/;

/**
 * A price is valid iff it is an integer in 0..MAX_IDR (Req 3.2). Note 0 is
 * allowed — this intentionally differs from accountsCore's `isValidAmount`,
 * whose range is 1..MAX_IDR.
 */
function isValidPrice(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= MAX_IDR;
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function parseIdrLike(value: string | number): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value) : 0;
  }
  const digits = value.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function parseOptionalInteger(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

/**
 * Type guard: a status is valid iff it is a member of STOCK_STATUSES
 * (Req 3.4). Property 3.
 */
export function isValidStatus(s: string): s is StockStatus {
  return (STOCK_STATUSES as readonly string[]).includes(s);
}

// ---------- Validation ----------

/**
 * Validate IMEI presence against the `hasImei` flag (Req 2.1, 2.2, 2.3, 2.4).
 * Property 1:
 *  - hasImei === true: valid iff `imei` matches /^\d{15}$/, else
 *    IMEI_REQUIRED_FORMAT.
 *  - hasImei === false: a non-empty (after trim) `imei` is rejected with
 *    IMEI_MUST_BE_ABSENT; null or empty/whitespace is accepted.
 */
export function validateImeiPresence(
  hasImei: boolean,
  imei: string | null,
): StockValidationResult {
  if (hasImei) {
    if (imei !== null && IMEI_RE.test(imei)) {
      return { ok: true };
    }
    return {
      ok: false,
      code: 'IMEI_REQUIRED_FORMAT',
      message: 'IMEI harus 15 digit angka',
    };
  }

  const trimmed = imei?.trim() ?? '';
  if (trimmed.length > 0) {
    return {
      ok: false,
      code: 'IMEI_MUST_BE_ABSENT',
      message: 'Unit tanpa IMEI tidak boleh mengisi IMEI',
    };
  }

  return { ok: true };
}

/**
 * Validate stock unit input in ascending criterion order; return the FIRST
 * unmet rule (Req 3.1, 3.2, 3.3, 3.4, 3.5, 3.6). Property 2 / Property 5:
 *  1) model required (non-empty after trim)            -> MODEL_REQUIRED
 *  2) IMEI presence rules (validateImeiPresence)        -> IMEI_* codes
 *  3) price integer in 0..MAX_IDR                       -> PRICE_OUT_OF_RANGE
 *  4) count integer >= 1                                -> COUNT_OUT_OF_RANGE
 *  5) status in STOCK_STATUSES                          -> STATUS_INVALID
 */
export function validateStockUnitInput(
  input: StockUnitInputCore,
): StockValidationResult {
  const trimmedModel = input.model?.trim() ?? '';
  if (trimmedModel.length === 0) {
    return {
      ok: false,
      code: 'MODEL_REQUIRED',
      message: 'Model wajib diisi',
    };
  }

  const imeiResult = validateImeiPresence(input.hasImei, input.imei);
  if (!imeiResult.ok) {
    return imeiResult;
  }

  if (!isValidPrice(input.price)) {
    return {
      ok: false,
      code: 'PRICE_OUT_OF_RANGE',
      message: 'Harga di luar rentang yang diizinkan',
    };
  }

  if (!(Number.isInteger(input.count) && input.count >= 1)) {
    return {
      ok: false,
      code: 'COUNT_OUT_OF_RANGE',
      message: 'Jumlah unit minimal 1',
    };
  }

  if (!isValidStatus(input.status)) {
    return {
      ok: false,
      code: 'STATUS_INVALID',
      message: 'Status stok tidak valid',
    };
  }

  return { ok: true };
}

export function normalizeStockEditDraft(
  draft: StockEditDraft,
): NormalizeStockEditDraftResult {
  const model = normalizeText(draft.model);
  if (!model) {
    return { ok: false, message: 'Model wajib diisi' };
  }

  const imei = normalizeText(draft.imei);
  const imeiResult = validateImeiPresence(draft.hasImei, imei || null);
  if (!imeiResult.ok) {
    return { ok: false, message: imeiResult.message };
  }

  const price = parseIdrLike(draft.price);
  if (!isValidPrice(price)) {
    return { ok: false, message: 'Harga jual di luar rentang yang diizinkan' };
  }

  const costPrice = parseIdrLike(draft.costPrice);
  if (!isValidPrice(costPrice)) {
    return { ok: false, message: 'Harga modal di luar rentang yang diizinkan' };
  }

  const batteryHealth = parseOptionalInteger(draft.batteryHealth);
  if (batteryHealth !== null && (batteryHealth < 0 || batteryHealth > 100)) {
    return { ok: false, message: 'Battery health harus 0-100' };
  }

  return {
    ok: true,
    payload: {
      model,
      capacity: normalizeText(draft.capacity),
      condition: normalizeText(draft.condition),
      color: normalizeText(draft.color),
      has_imei: draft.hasImei,
      imei: draft.hasImei ? imei : null,
      price,
      cost_price: costPrice,
      battery_health: batteryHealth,
      defect_description: normalizeText(draft.defectDescription),
    },
  };
}

/**
 * Validate a lifecycle status transition (Req 5.2, 5.3, 5.4). Property 4:
 *  - target not in STOCK_STATUSES is rejected            (Req 5.2)
 *  - from === to is rejected (no-op)                     (Req 5.4)
 *  - from === 'TERJUAL' to anything is rejected (terminal) (Req 5.3)
 *  - otherwise any distinct valid target is allowed.
 */
export function isValidStatusTransition(
  from: StockStatus,
  to: string,
): StockValidationResult {
  if (!isValidStatus(to) || from === to || from === 'TERJUAL') {
    return {
      ok: false,
      code: 'STATUS_TRANSITION_INVALID',
      message: 'Perubahan status tidak diizinkan',
    };
  }

  return { ok: true };
}
