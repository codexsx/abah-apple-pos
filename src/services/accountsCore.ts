// Feature: financial-accounts
// Pure, dependency-free domain module. No React, no Supabase imports.
//
// This is the property-tested core for the financial accounts (rekening/kas)
// feature: it holds the balance-derivation formula, validation rules, name
// normalization, and predicates. A balance is always derived, never stored:
//   Current_Balance = Opening_Balance + Σ(money_in) − Σ(money_out)

// ---------- Constants ----------

/** Inclusive lower bound for an opening balance, in integer IDR. */
export const MIN_OPENING_BALANCE = 0;

/** Inclusive upper bound for monetary amounts, in integer IDR. */
export const MAX_IDR = 999_999_999_999;

/** Inclusive lower bound for a ledger entry amount, in integer IDR. */
export const MIN_AMOUNT = 1;

/** Maximum length of an account name. */
export const NAME_MAX = 100;

/** Maximum length of a note (account or ledger entry). */
export const NOTE_MAX = 500;

/** Maximum length of a ledger entry source reference. */
export const SOURCE_REF_MAX = 100;

/** Source reference value used for manual adjustment ledger entries. */
export const MANUAL_ADJUSTMENT_REF = 'manual_adjustment';

// ---------- Domain types ----------

export type AccountType = 'Cash' | 'Bank';
export type Direction = 'money_in' | 'money_out';

export interface LedgerEntryCore {
  direction: Direction;
  amount: number; // integer IDR, 1..MAX_IDR
}

export interface AccountInputCore {
  name: string;
  type: AccountType;
  openingBalance?: number; // omitted => 0
  note?: string;
}

export interface LedgerEntryInputCore {
  direction: Direction;
  amount: number;
  sourceReference: string;
  note?: string;
}

export type ValidationCode =
  | 'NAME_REQUIRED'
  | 'NAME_TOO_LONG'
  | 'NOTE_TOO_LONG'
  | 'TYPE_INVALID'
  | 'OPENING_OUT_OF_RANGE'
  | 'AMOUNT_OUT_OF_RANGE'
  | 'DIRECTION_INVALID'
  | 'SOURCE_REF_INVALID'
  | 'ADJUSTMENT_NOTE_REQUIRED';

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: ValidationCode; message: string };

// ---------- Helpers / predicates ----------

/**
 * An amount is valid iff it is an integer in 1..MAX_IDR (Req 5.5).
 */
export function isValidAmount(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_AMOUNT && n <= MAX_IDR;
}

/**
 * An opening balance is valid iff it is an integer in 0..MAX_IDR (Req 1.8).
 */
export function isValidOpeningBalance(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_OPENING_BALANCE && n <= MAX_IDR;
}

/**
 * Type guard: a direction is valid iff it is one of {money_in, money_out}
 * (Req 5.6).
 */
export function isValidDirection(d: string): d is Direction {
  return d === 'money_in' || d === 'money_out';
}

/**
 * A balance is overdrawn iff it is strictly negative (Req 8.2).
 */
export function isOverdraft(balance: number): boolean {
  return balance < 0;
}

/**
 * Case-insensitive uniqueness key: trim surrounding whitespace and lowercase
 * (Req 1.7, 3.5). Idempotent: normalizeName(normalizeName(x)) === normalizeName(x).
 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

// ---------- Balance ----------

/**
 * Fold ledger entries onto an opening balance: money_in adds, money_out
 * subtracts. The result is never clamped and may be negative (overdraft —
 * Req 2.2, 2.3, 7.1, 7.3, 7.5, 8.1). Order-independent because integer
 * addition/subtraction is commutative and associative (Req 7.4).
 *
 * Defensive guard (Req 7.6): throws if any entry has an invalid direction or a
 * non-integer/out-of-range amount, so incomplete or corrupt entry data surfaces
 * rather than silently producing a wrong balance. Stored entries are validated
 * at write time, so this should never fire in normal operation.
 */
export function computeBalance(
  openingBalance: number,
  entries: LedgerEntryCore[],
): number {
  return entries.reduce((balance, entry, index) => {
    if (!isValidDirection(entry.direction)) {
      throw new Error(
        `computeBalance: entry at index ${index} has invalid direction: ${String(
          entry.direction,
        )}`,
      );
    }
    if (!isValidAmount(entry.amount)) {
      throw new Error(
        `computeBalance: entry at index ${index} has invalid amount: ${String(
          entry.amount,
        )}`,
      );
    }
    return entry.direction === 'money_in'
      ? balance + entry.amount
      : balance - entry.amount;
  }, openingBalance);
}

// ---------- Validation ----------

/**
 * Validate account input in ascending criterion order; return the FIRST unmet
 * rule (Req 1.1, 1.2, 1.4, 1.5, 1.6, 1.8, 1.9, 3.4):
 *  1) name required (non-empty after trim)      -> NAME_REQUIRED
 *  2) name length <= NAME_MAX (100)             -> NAME_TOO_LONG
 *  3) note length <= NOTE_MAX (500)             -> NOTE_TOO_LONG
 *  4) type in {Cash, Bank}                      -> TYPE_INVALID
 *  5) opening balance integer in 0..MAX_IDR     -> OPENING_OUT_OF_RANGE
 * An omitted/undefined opening balance is treated as 0 and accepted.
 */
export function validateAccountInput(input: AccountInputCore): ValidationResult {
  const trimmedName = input.name?.trim() ?? '';
  if (trimmedName.length === 0) {
    return {
      ok: false,
      code: 'NAME_REQUIRED',
      message: 'Nama akun wajib diisi',
    };
  }
  if (input.name.length > NAME_MAX) {
    return {
      ok: false,
      code: 'NAME_TOO_LONG',
      message: `Nama akun maksimal ${NAME_MAX} karakter`,
    };
  }

  const note = input.note ?? '';
  if (note.length > NOTE_MAX) {
    return {
      ok: false,
      code: 'NOTE_TOO_LONG',
      message: `Catatan maksimal ${NOTE_MAX} karakter`,
    };
  }

  if (input.type !== 'Cash' && input.type !== 'Bank') {
    return {
      ok: false,
      code: 'TYPE_INVALID',
      message: 'Tipe akun harus Cash atau Bank',
    };
  }

  const opening = input.openingBalance ?? MIN_OPENING_BALANCE;
  if (!isValidOpeningBalance(opening)) {
    return {
      ok: false,
      code: 'OPENING_OUT_OF_RANGE',
      message: `Saldo awal harus bilangan bulat antara ${MIN_OPENING_BALANCE} dan ${MAX_IDR}`,
    };
  }

  return { ok: true };
}

/**
 * Validate ledger entry input in ascending criterion order; return the FIRST
 * unmet rule (Req 5.2, 5.5, 5.6, 5.9, 5.10):
 *  1) direction in {money_in, money_out}        -> DIRECTION_INVALID
 *  2) amount integer in 1..MAX_IDR              -> AMOUNT_OUT_OF_RANGE
 *  3) source reference non-empty and <= 100     -> SOURCE_REF_INVALID
 *  4) note length <= NOTE_MAX (500)             -> NOTE_TOO_LONG
 */
export function validateLedgerEntryInput(
  input: LedgerEntryInputCore,
): ValidationResult {
  if (!isValidDirection(input.direction)) {
    return {
      ok: false,
      code: 'DIRECTION_INVALID',
      message: 'Arah transaksi harus money_in atau money_out',
    };
  }

  if (!isValidAmount(input.amount)) {
    return {
      ok: false,
      code: 'AMOUNT_OUT_OF_RANGE',
      message: `Jumlah harus bilangan bulat antara ${MIN_AMOUNT} dan ${MAX_IDR}`,
    };
  }

  const sourceReference = input.sourceReference ?? '';
  if (sourceReference.length === 0 || sourceReference.length > SOURCE_REF_MAX) {
    return {
      ok: false,
      code: 'SOURCE_REF_INVALID',
      message: `Referensi sumber wajib diisi dan maksimal ${SOURCE_REF_MAX} karakter`,
    };
  }

  const note = input.note ?? '';
  if (note.length > NOTE_MAX) {
    return {
      ok: false,
      code: 'NOTE_TOO_LONG',
      message: `Catatan maksimal ${NOTE_MAX} karakter`,
    };
  }

  return { ok: true };
}

/**
 * Validate a manual adjustment: apply all ledger entry rules, then additionally
 * require a non-empty (after trim) note (Req 6.2, 6.3). The first unmet ledger
 * rule is returned before the note check.
 */
export function validateManualAdjustment(
  input: LedgerEntryInputCore,
): ValidationResult {
  const base = validateLedgerEntryInput(input);
  if (!base.ok) {
    return base;
  }

  const trimmedNote = input.note?.trim() ?? '';
  if (trimmedNote.length === 0) {
    return {
      ok: false,
      code: 'ADJUSTMENT_NOTE_REQUIRED',
      message: 'Catatan wajib diisi untuk penyesuaian manual',
    };
  }

  return { ok: true };
}
