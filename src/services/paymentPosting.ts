// Feature: transaction-account-integration
// Pure, dependency-free domain core. No React, no Supabase imports.
//
// Derives posting direction, builds the posting array, validates the account
// selection, and formats the structured source reference for every
// money-moving transaction flow. This is the property-tested surface of the
// feature and mirrors the style of accountsCore.ts / finalization.ts.

import {
  type AccountType,
  type Direction,
  isValidAmount,
} from '@/services/accountsCore';

// ---------- Domain types ----------

/** Flow classification independent of the concrete page. */
export type FlowKind = 'income' | 'expense';

/** A single ledger posting to be sent to the RPC (note added at service layer). */
export interface Posting {
  account_id: string;
  direction: Direction;
  amount: number; // integer IDR, 1..MAX_IDR
}

/** Normalized payment selection shared by every money-moving form. */
export interface PaymentSelection {
  cashPortion: number; // integer IDR >= 0
  cashAccountId: string | null;
  transferPortion: number; // integer IDR >= 0
  transferAccountId: string | null;
}

export type PaymentValidationCode =
  | 'AMOUNT_OUT_OF_RANGE' // a portion or the settled sum is not an int in 0..MAX_IDR
  | 'PAYMENT_REQUIRED' // flow requires money but settled amount is 0
  | 'CASH_ACCOUNT_REQUIRED' // non-zero cash portion, no cash account selected
  | 'TRANSFER_ACCOUNT_REQUIRED' // non-zero transfer portion, no bank account selected
  | 'CASH_ACCOUNT_TYPE' // cash portion account is not type Cash
  | 'TRANSFER_ACCOUNT_TYPE'; // transfer portion account is not type Bank

export type PaymentValidationResult =
  | { ok: true }
  | { ok: false; code: PaymentValidationCode; message: string };

// ---------- Direction derivation ----------

/**
 * money_in for income flows, money_out for expense flows (Req 7.1, 7.2).
 */
export function deriveDirection(flow: FlowKind): Direction {
  return flow === 'income' ? 'money_in' : 'money_out';
}

/**
 * Tukar Tambah: the sign of Selisih drives the direction; |Selisih| is the
 * amount. Selisih > 0 → money_in, Selisih < 0 → money_out, Selisih === 0 →
 * null (no posting) (Req 6.5, 6.6, 7.3, 7.4, 7.8).
 */
export function deriveTukarTambahDirectionAndAmount(
  selisih: number,
): { direction: Direction; amount: number } | null {
  if (selisih > 0) {
    return { direction: 'money_in', amount: Math.abs(selisih) };
  }
  if (selisih < 0) {
    return { direction: 'money_out', amount: Math.abs(selisih) };
  }
  return null;
}

// ---------- Posting construction ----------

/**
 * Build the posting array for the non-zero portions (Req 2.1, 2.2, 5.1, 5.4).
 * A cash posting is emitted only when cashPortion >= 1, and a transfer posting
 * only when transferPortion >= 1, so the result length is 0, 1, or 2. Zero
 * portions produce no posting (Req 1.3, 1.4, 2.7).
 *
 * Assumes the selection has already passed validatePaymentSelection, so a
 * non-zero portion always has a non-null account id. A defensive guard skips a
 * portion with a null account id rather than emitting an invalid posting.
 */
export function buildPostings(
  direction: Direction,
  selection: PaymentSelection,
): Posting[] {
  const postings: Posting[] = [];

  if (selection.cashPortion >= 1 && selection.cashAccountId !== null) {
    postings.push({
      account_id: selection.cashAccountId,
      direction,
      amount: selection.cashPortion,
    });
  }

  if (selection.transferPortion >= 1 && selection.transferAccountId !== null) {
    postings.push({
      account_id: selection.transferAccountId,
      direction,
      amount: selection.transferPortion,
    });
  }

  return postings;
}

// ---------- Validation ----------

/**
 * Validate the payment selection in ascending criterion order; the FIRST unmet
 * rule wins (Req 4.1–4.6, 7.5, 7.6):
 *  1) each portion and their sum are integers in 0..MAX_IDR -> AMOUNT_OUT_OF_RANGE
 *  2) requiresPayment and settled sum === 0                -> PAYMENT_REQUIRED
 *  3) non-zero cash portion with null account              -> CASH_ACCOUNT_REQUIRED
 *  4) non-zero cash portion with type !== Cash             -> CASH_ACCOUNT_TYPE
 *  5) non-zero transfer portion with null account          -> TRANSFER_ACCOUNT_REQUIRED
 *  6) non-zero transfer portion with type !== Bank         -> TRANSFER_ACCOUNT_TYPE
 */
export function validatePaymentSelection(input: {
  cashPortion: number;
  cashAccountType: AccountType | null;
  transferPortion: number;
  transferAccountType: AccountType | null;
  requiresPayment: boolean;
}): PaymentValidationResult {
  const { cashPortion, transferPortion } = input;

  // 1) Range: each portion and their sum must be integers in 0..MAX_IDR.
  const sum = cashPortion + transferPortion;
  if (
    !isValidPortion(cashPortion) ||
    !isValidPortion(transferPortion) ||
    !isValidPortion(sum)
  ) {
    return {
      ok: false,
      code: 'AMOUNT_OUT_OF_RANGE',
      message: 'Jumlah di luar rentang yang diizinkan',
    };
  }

  // 2) Required payment but nothing settled.
  if (input.requiresPayment && sum === 0) {
    return {
      ok: false,
      code: 'PAYMENT_REQUIRED',
      message: 'Jumlah pembayaran wajib diisi',
    };
  }

  // 3) Non-zero cash portion needs a cash account.
  if (cashPortion >= 1 && input.cashAccountType === null) {
    return {
      ok: false,
      code: 'CASH_ACCOUNT_REQUIRED',
      message: 'Pilih akun kas untuk porsi cash',
    };
  }

  // 4) Cash portion account must be type Cash.
  if (cashPortion >= 1 && input.cashAccountType !== 'Cash') {
    return {
      ok: false,
      code: 'CASH_ACCOUNT_TYPE',
      message: 'Porsi cash harus akun Cash',
    };
  }

  // 5) Non-zero transfer portion needs a bank account.
  if (transferPortion >= 1 && input.transferAccountType === null) {
    return {
      ok: false,
      code: 'TRANSFER_ACCOUNT_REQUIRED',
      message: 'Pilih akun bank untuk porsi transfer',
    };
  }

  // 6) Transfer portion account must be type Bank.
  if (transferPortion >= 1 && input.transferAccountType !== 'Bank') {
    return {
      ok: false,
      code: 'TRANSFER_ACCOUNT_TYPE',
      message: 'Porsi transfer harus akun Bank',
    };
  }

  return { ok: true };
}

/**
 * A portion (or settled sum) is valid iff it is an integer in 0..MAX_IDR. The
 * zero lower bound distinguishes portions from ledger amounts (which use
 * isValidAmount's 1..MAX_IDR range from accountsCore).
 */
function isValidPortion(n: number): boolean {
  return n === 0 || isValidAmount(n);
}

// ---------- Source reference ----------

/**
 * Build the structured source reference `${type}:${id}` linking a ledger entry
 * to its originating transaction (Req 2.5, 5.3, 9.3).
 */
export function structuredSourceRef(type: string, id: string): string {
  return `${type}:${id}`;
}
