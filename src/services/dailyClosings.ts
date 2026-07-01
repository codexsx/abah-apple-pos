// Feature: complete-backends
// Service layer for daily closings. Mirrors the stock.ts/accounts.ts
// convention: shared supabase client, typed interfaces, getX/createX
// functions, and thrown errors on failure.

import { supabase } from '@/lib/supabase';
import type { TransactionStaff } from '@/services/transactions';

/** PostgREST "no rows returned" code (treated as not-found). */
const PGRST_NOT_FOUND = 'PGRST116';

export interface DailyClosing {
  id: string;
  closing_date: string;
  summary: Record<string, unknown>;
  note: string;
  created_at: string;
  closed_by?: string | null;
  closed_by_staff?: TransactionStaff | null;
}

export interface DailyClosingInsert {
  closing_date: string;
  summary: Record<string, unknown>;
  note?: string;
}

const DAILY_CLOSING_SELECT = '*, closed_by_staff:profiles!daily_closings_closed_by_fkey(id, name, role, initials)';

/** Return every daily closing, most recent closing_date first. */
export async function getDailyClosings(): Promise<DailyClosing[]> {
  const { data, error } = await supabase
    .from('daily_closings')
    .select(DAILY_CLOSING_SELECT)
    .order('closing_date', { ascending: false });
  if (error) throw error;
  return (data as DailyClosing[]) || [];
}

/** Return the closing for a given date, or null when none exists. */
export async function getClosingByDate(date: string): Promise<DailyClosing | null> {
  const { data, error } = await supabase
    .from('daily_closings')
    .select(DAILY_CLOSING_SELECT)
    .eq('closing_date', date)
    .single();
  if (error) {
    if (error.code === PGRST_NOT_FOUND) return null;
    throw error;
  }
  return data as DailyClosing;
}

/** Create a daily closing. */
export async function createDailyClosing(
  input: DailyClosingInsert,
): Promise<DailyClosing> {
  const { data, error } = await supabase
    .from('daily_closings')
    .insert(input)
    .select(DAILY_CLOSING_SELECT)
    .single();
  if (error) throw error;
  if (!data) throw new Error('Failed to create daily closing');
  return data as DailyClosing;
}
