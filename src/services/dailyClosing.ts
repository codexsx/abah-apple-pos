// Feature: tutup-harian (daily closing)
// Service layer for the "Tutup Harian" feature: computes today's closing
// summary from live transactions + account balances, and persists snapshots
// to the `daily_closings` table.
//
// Follows the thrown-error service convention used across the app (see
// transactions.ts / accounts.ts): typed interfaces, thrown errors on failure,
// and the shared supabase client. All money figures are integer IDR; a null
// transaction amount counts as 0.

import { supabase } from '@/lib/supabase';
import { getTransactions } from '@/services/transactions';
import { getAccounts } from '@/services/accounts';
import {
  REVENUE_TYPES,
  COST_TYPES,
  EXPENSE_TYPES,
} from '@/services/financeCore';

// ---------- Interfaces ----------

export interface DailyClosingSummary {
  date: string; // YYYY-MM-DD
  revenue: number; // sum of REVENUE_TYPES today
  cogs: number; // sum of COST_TYPES (Pembelian) today
  expenses: number; // sum of EXPENSE_TYPES today
  netProfit: number; // revenue - cogs - expenses
  cashTotal: number; // sum current_balance of Cash accounts
  bankTotal: number; // sum current_balance of Bank accounts
  cashBankTotal: number; // cashTotal + bankTotal
  transactionCount: number; // number of transactions today
}

export interface DailyClosing {
  id: string;
  closing_date: string;
  summary: DailyClosingSummary;
  note: string;
  created_at: string;
}

// ---------- Helpers ----------

/** Coerce a possibly-absent numeric amount to a safe integer, treating
 *  null/undefined/NaN as 0. */
function toAmount(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return value;
}

/** Zero-pad a number to two digits. */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Build a local YYYY-MM-DD string from a Date. */
function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Pure helper: true when the ISO timestamp falls on the same local calendar
 * day as `ref`. An unparseable timestamp returns false (never throws).
 */
export function isSameLocalDay(iso: string, ref: Date): boolean {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return false;
  return (
    t.getFullYear() === ref.getFullYear() &&
    t.getMonth() === ref.getMonth() &&
    t.getDate() === ref.getDate()
  );
}

// ---------- Computation ----------

/**
 * Compute today's closing summary from live transactions and account balances.
 * Transactions are filtered to those whose `created_at` falls on the current
 * local calendar day. Revenue/COGS/Expenses are summed by type; cash and bank
 * totals come from the derived current balances. Throws if an underlying fetch
 * fails (no catch).
 */
export async function computeTodayClosing(): Promise<DailyClosingSummary> {
  const [transactions, accounts] = await Promise.all([
    getTransactions(),
    getAccounts(),
  ]);

  const now = new Date();
  const todayTx = transactions.filter((tx) =>
    isSameLocalDay(tx.created_at, now),
  );

  let revenue = 0;
  let cogs = 0;
  let expenses = 0;
  for (const tx of todayTx) {
    const amount = toAmount(tx.amount);
    if ((REVENUE_TYPES as readonly string[]).includes(tx.type)) {
      revenue += amount;
    } else if ((COST_TYPES as readonly string[]).includes(tx.type)) {
      cogs += amount;
    } else if ((EXPENSE_TYPES as readonly string[]).includes(tx.type)) {
      expenses += amount;
    }
  }

  const netProfit = revenue - cogs - expenses;

  let cashTotal = 0;
  let bankTotal = 0;
  for (const account of accounts) {
    if (account.type === 'Cash') {
      cashTotal += account.current_balance;
    } else if (account.type === 'Bank') {
      bankTotal += account.current_balance;
    }
  }
  const cashBankTotal = cashTotal + bankTotal;

  return {
    date: toLocalDateString(now),
    revenue,
    cogs,
    expenses,
    netProfit,
    cashTotal,
    bankTotal,
    cashBankTotal,
    transactionCount: todayTx.length,
  };
}

// ---------- Persistence ----------

interface DailyClosingRow {
  id: string;
  closing_date: string;
  summary: DailyClosingSummary;
  note: string;
  created_at: string;
}

function toDailyClosing(row: DailyClosingRow): DailyClosing {
  return {
    id: row.id,
    closing_date: row.closing_date,
    summary: row.summary as DailyClosingSummary,
    note: row.note,
    created_at: row.created_at,
  };
}

/**
 * Return up to `limit` saved daily closings, newest closing_date first.
 * Throws on error.
 */
export async function getDailyClosings(limit = 30): Promise<DailyClosing[]> {
  const { data, error } = await supabase
    .from('daily_closings')
    .select('*')
    .order('closing_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data as DailyClosingRow[]) || []).map(toDailyClosing);
}

/**
 * Persist a closing snapshot. Inserts the summary as jsonb under the summary's
 * own date. Returns the saved row. Throws on error.
 */
export async function saveDailyClosing(
  summary: DailyClosingSummary,
  note = '',
): Promise<DailyClosing> {
  const { data, error } = await supabase
    .from('daily_closings')
    .insert({ closing_date: summary.date, summary, note })
    .select()
    .single();
  if (error) throw error;
  if (!data) throw new Error('Failed to save daily closing');
  return toDailyClosing(data as DailyClosingRow);
}
