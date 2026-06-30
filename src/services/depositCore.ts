// Feature: agent-supplier-deposit
// Pure, dependency-free domain core. No React, no Supabase imports.
//
// Phase 4 surface for the agent/supplier setor & deposit feature: splits an
// agent payment into owed vs surplus (deposit), derives the agent balance
// breakdown (outstanding debt vs deposit credit), validates an inter-account
// transfer (setor tunai), and builds the balanced two-posting transfer move.
// Mirrors the style of accountsCore.ts / paymentPosting.ts: integer IDR money,
// the established ValidationResult shape, and first-unmet-rule validation with
// Indonesian messages.

import { isValidAmount, type Direction } from '@/services/accountsCore';

// ---------- Domain types ----------

/** Split of a single agent payment: the part applied to debt, and the surplus. */
export interface AgentPaymentBreakdown {
  owed: number;
  surplus: number;
}

/** Agent balance decomposed into mutually exclusive debt/deposit plus signed net. */
export interface AgentBalanceBreakdown {
  outstandingDebt: number; // max(0, debt - paid)
  depositCredit: number; // max(0, paid - debt)
  net: number; // debt - paid (legacy sign)
}

/** Normalized inter-account transfer selection from the Transfer Uang form. */
export interface TransferSelection {
  amount: number;
  fromAccountId: string | null;
  toAccountId: string | null;
}

/** A single ledger posting for the transfer (note added at the service layer). */
export interface TransferPosting {
  account_id: string;
  direction: Direction;
  amount: number; // integer IDR, 1..MAX_IDR
}

export type DepositValidationCode = 'AMOUNT_OUT_OF_RANGE';

export type TransferValidationCode =
  | 'AMOUNT_OUT_OF_RANGE'
  | 'SOURCE_REQUIRED'
  | 'DESTINATION_REQUIRED'
  | 'SAME_ACCOUNT';

export type DepositValidationResult =
  | { ok: true }
  | {
      ok: false;
      code: DepositValidationCode | TransferValidationCode;
      message: string;
    };

// ---------- Payment breakdown ----------

/**
 * Split an agent payment into the portion applied to outstanding debt and the
 * surplus that becomes deposit credit (Req 1.1, 1.2, 1.3, 1.4). The amount must
 * be an integer in 1..MAX_IDR; otherwise the payment is rejected (Req 1.5).
 *
 * The debt floor (`Math.max(0, outstandingDebt)`) guards against a negative
 * input so `owed` and `surplus` are always non-negative and `owed + surplus`
 * equals the original amount.
 */
export function deriveAgentPaymentBreakdown(
  outstandingDebt: number,
  amount: number,
):
  | { ok: true; breakdown: AgentPaymentBreakdown }
  | { ok: false; code: 'AMOUNT_OUT_OF_RANGE'; message: string } {
  if (!isValidAmount(amount)) {
    return {
      ok: false,
      code: 'AMOUNT_OUT_OF_RANGE',
      message: 'Jumlah di luar rentang yang diizinkan',
    };
  }

  const debt = Math.max(0, outstandingDebt);
  const owed = Math.min(debt, amount);
  const surplus = amount - owed;

  return { ok: true, breakdown: { owed, surplus } };
}

// ---------- Balance breakdown ----------

/**
 * Decompose an agent's totals into mutually exclusive outstanding debt and
 * deposit credit, plus the signed legacy net (Req 2.1, 2.2). Outstanding debt
 * and deposit credit are never both positive: at most one of `debt - paid` and
 * `paid - debt` is positive.
 */
export function deriveAgentBalanceBreakdown(
  debt: number,
  paid: number,
): AgentBalanceBreakdown {
  return {
    outstandingDebt: Math.max(0, debt - paid),
    depositCredit: Math.max(0, paid - debt),
    net: debt - paid,
  };
}

// ---------- Transfer validation ----------

/**
 * Validate an inter-account transfer in ascending criterion order; return the
 * FIRST unmet rule (Req 4.1, 4.2, 4.3, 4.4, 4.5, 4.6):
 *  1) amount integer in 1..MAX_IDR                  -> AMOUNT_OUT_OF_RANGE
 *  2) source account selected (non-null/non-empty)  -> SOURCE_REQUIRED
 *  3) destination account selected                  -> DESTINATION_REQUIRED
 *  4) source and destination differ                 -> SAME_ACCOUNT
 */
export function validateAccountTransfer(
  sel: TransferSelection,
): DepositValidationResult {
  if (!isValidAmount(sel.amount)) {
    return {
      ok: false,
      code: 'AMOUNT_OUT_OF_RANGE',
      message: 'Jumlah di luar rentang yang diizinkan',
    };
  }

  if (!sel.fromAccountId) {
    return {
      ok: false,
      code: 'SOURCE_REQUIRED',
      message: 'Pilih rekening/kas sumber',
    };
  }

  if (!sel.toAccountId) {
    return {
      ok: false,
      code: 'DESTINATION_REQUIRED',
      message: 'Pilih rekening/kas tujuan',
    };
  }

  if (sel.fromAccountId === sel.toAccountId) {
    return {
      ok: false,
      code: 'SAME_ACCOUNT',
      message: 'Rekening sumber dan tujuan harus berbeda',
    };
  }

  return { ok: true };
}

// ---------- Transfer posting construction ----------

/**
 * Build the balanced two-posting transfer move (Req 5.1, 5.2, 5.3): a
 * `money_out` against the source and a `money_in` against the destination, each
 * for the full amount. Assumes the selection has already passed
 * validateAccountTransfer (amount in range, both accounts present and distinct).
 */
export function buildTransferPostings(sel: {
  amount: number;
  fromAccountId: string;
  toAccountId: string;
}): TransferPosting[] {
  return [
    { account_id: sel.fromAccountId, direction: 'money_out', amount: sel.amount },
    { account_id: sel.toAccountId, direction: 'money_in', amount: sel.amount },
  ];
}
