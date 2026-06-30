// Feature: financial-accounts
// Service layer for accounts (rekening/kas) and the append-only ledger.
//
// Mirrors the agents.ts convention: typed interfaces, getX/createX/updateX/
// deleteX functions, thrown errors on failure, and the shared supabase client.
// A balance is always derived from the `account_balances` view, never stored
// as an editable field.

import { supabase } from '@/lib/supabase';
import {
  isOverdraft,
  normalizeName,
  validateAccountInput,
  validateLedgerEntryInput,
  validateManualAdjustment,
  MANUAL_ADJUSTMENT_REF,
  type AccountType,
  type Direction,
  type ValidationCode,
} from '@/services/accountsCore';

// ---------- Interfaces ----------

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  opening_balance: number;
  note: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface AccountInsert {
  name: string;
  type: AccountType;
  opening_balance?: number;
  note?: string;
}

export interface AccountUpdate {
  name?: string; // name and note only (Req 3)
  note?: string;
}

export interface LedgerEntry {
  id: string;
  account_id: string;
  direction: Direction;
  amount: number;
  source_reference: string;
  note: string;
  created_at: string;
}

export interface LedgerEntryInsert {
  account_id: string;
  direction: Direction;
  amount: number;
  source_reference: string;
  note?: string;
}

export interface AccountWithBalance extends Account {
  current_balance: number;
  is_overdraft: boolean;
}

// ---------- Typed errors ----------

/** Thrown when an input fails domain validation. Carries the failing code. */
export class ValidationError extends Error {
  code: ValidationCode;
  constructor(code: ValidationCode, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

/** Thrown when an account name collides (case-insensitive) with another. */
export class DuplicateNameError extends Error {
  constructor(message = 'Nama akun sudah digunakan') {
    super(message);
    this.name = 'DuplicateNameError';
  }
}

/** Thrown when a referenced account does not exist. */
export class AccountNotFoundError extends Error {
  constructor(message = 'Akun tidak ditemukan') {
    super(message);
    this.name = 'AccountNotFoundError';
  }
}

/** Thrown when attempting to delete an account that has ledger history. */
export class AccountHasHistoryError extends Error {
  constructor(
    message = 'Akun yang memiliki riwayat tidak dapat dihapus. Arsipkan akun sebagai gantinya.',
  ) {
    super(message);
    this.name = 'AccountHasHistoryError';
  }
}

// ---------- Internal helpers ----------

interface BalanceRow {
  account_id: string;
  current_balance: number;
}

/** Postgres unique-violation error code. */
const PG_UNIQUE_VIOLATION = '23505';
/** Postgres foreign-key-violation error code. */
const PG_FK_VIOLATION = '23503';
/** PostgREST "no rows returned" code (treated as not-found). */
const PGRST_NOT_FOUND = 'PGRST116';

function toAccountWithBalance(
  account: Account,
  balanceById: Map<string, number>,
): AccountWithBalance {
  // Fall back to the opening balance if the view row is missing (no entries).
  const current_balance = balanceById.has(account.id)
    ? balanceById.get(account.id)!
    : account.opening_balance;
  return {
    ...account,
    current_balance,
    is_overdraft: isOverdraft(current_balance),
  };
}

// ---------- Reads ----------

/**
 * Return every account (active and archived) with its derived current balance,
 * ordered ascending alphabetically by name, case-insensitive (Req 2, 9.1).
 */
export async function getAccounts(): Promise<AccountWithBalance[]> {
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('*');
  if (accountsError) throw accountsError;

  const { data: balances, error: balancesError } = await supabase
    .from('account_balances')
    .select('account_id, current_balance');
  if (balancesError) throw balancesError;

  const balanceById = new Map<string, number>(
    ((balances as BalanceRow[]) || []).map((b) => [
      b.account_id,
      b.current_balance,
    ]),
  );

  return ((accounts as Account[]) || [])
    .map((account) => toAccountWithBalance(account, balanceById))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
}

/**
 * Return a single account with its derived balance, or null if not found
 * (Req 2). Mirrors agents.ts: PGRST116 maps to null.
 */
export async function getAccountById(
  id: string,
): Promise<AccountWithBalance | null> {
  const { data: account, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === PGRST_NOT_FOUND) return null;
    throw error;
  }
  if (!account) return null;

  const { data: balance, error: balanceError } = await supabase
    .from('account_balances')
    .select('account_id, current_balance')
    .eq('account_id', id)
    .single();
  if (balanceError && balanceError.code !== PGRST_NOT_FOUND) {
    throw balanceError;
  }

  const balanceById = new Map<string, number>();
  if (balance) {
    const row = balance as BalanceRow;
    balanceById.set(row.account_id, row.current_balance);
  }

  return toAccountWithBalance(account as Account, balanceById);
}

/**
 * Return up to `limit` most recent ledger entries for an account, newest first
 * (Req 9.4). Default limit is 50.
 */
export async function getLedgerEntries(
  accountId: string,
  limit = 50,
): Promise<LedgerEntry[]> {
  const { data, error } = await supabase
    .from('account_ledger')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as LedgerEntry[]) || [];
}

/**
 * Return active accounts (is_archived = false) with balances for the account
 * picker, ordered alphabetically; empty when none active (Req 10).
 */
export async function getAccountPickerData(): Promise<AccountWithBalance[]> {
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_archived', false);
  if (accountsError) throw accountsError;

  const activeAccounts = (accounts as Account[]) || [];
  if (activeAccounts.length === 0) return [];

  const { data: balances, error: balancesError } = await supabase
    .from('account_balances')
    .select('account_id, current_balance');
  if (balancesError) throw balancesError;

  const balanceById = new Map<string, number>(
    ((balances as BalanceRow[]) || []).map((b) => [
      b.account_id,
      b.current_balance,
    ]),
  );

  return activeAccounts
    .map((account) => {
      const current_balance = balanceById.get(account.id) ?? 0;
      return {
        ...account,
        current_balance,
        is_overdraft: isOverdraft(current_balance),
      };
    })
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
}

// ---------- Account writes ----------

/**
 * Create an account (Req 1). Validates input, defaults opening balance to 0,
 * pre-checks case-insensitive name uniqueness, and inserts with is_archived
 * false. A DB unique-violation (race) is mapped to DuplicateNameError.
 */
export async function createAccount(input: AccountInsert): Promise<Account> {
  const result = validateAccountInput({
    name: input.name,
    type: input.type,
    openingBalance: input.opening_balance,
    note: input.note,
  });
  if (!result.ok) {
    throw new ValidationError(result.code, result.message);
  }

  const opening_balance = input.opening_balance ?? 0;

  // Case-insensitive uniqueness pre-check against existing names.
  const { data: existing, error: existingError } = await supabase
    .from('accounts')
    .select('name');
  if (existingError) throw existingError;

  const target = normalizeName(input.name);
  const collision = ((existing as { name: string }[]) || []).some(
    (a) => normalizeName(a.name) === target,
  );
  if (collision) {
    throw new DuplicateNameError();
  }

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      name: input.name.trim(),
      type: input.type,
      opening_balance,
      note: input.note ?? '',
      is_archived: false,
    })
    .select()
    .single();
  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      throw new DuplicateNameError();
    }
    throw error;
  }
  if (!data) throw new Error('Failed to create account');
  return data as Account;
}

/**
 * Update an account's name and/or note only (Req 3). Never touches the opening
 * balance. Re-validates a provided name (non-empty, length) and enforces
 * case-insensitive uniqueness excluding the account itself.
 */
export async function updateAccount(
  id: string,
  patch: AccountUpdate,
): Promise<Account> {
  const update: { name?: string; note?: string } = {};

  if (patch.name !== undefined) {
    // Re-validate name (and note, if present) using the shared rules. Use a
    // valid placeholder type so only name/note rules can fail here.
    const result = validateAccountInput({
      name: patch.name,
      type: 'Cash',
      note: patch.note,
    });
    if (!result.ok) {
      throw new ValidationError(result.code, result.message);
    }

    // Uniqueness excluding self.
    const { data: existing, error: existingError } = await supabase
      .from('accounts')
      .select('id, name');
    if (existingError) throw existingError;

    const target = normalizeName(patch.name);
    const collision = ((existing as { id: string; name: string }[]) || []).some(
      (a) => a.id !== id && normalizeName(a.name) === target,
    );
    if (collision) {
      throw new DuplicateNameError();
    }

    update.name = patch.name.trim();
  } else if (patch.note !== undefined) {
    // Note-only update: validate note length via the shared rules.
    const result = validateAccountInput({
      name: 'placeholder',
      type: 'Cash',
      note: patch.note,
    });
    if (!result.ok) {
      throw new ValidationError(result.code, result.message);
    }
  }

  if (patch.note !== undefined) {
    update.note = patch.note;
  }

  const { data, error } = await supabase
    .from('accounts')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      throw new DuplicateNameError();
    }
    throw error;
  }
  if (!data) throw new Error('Failed to update account');
  return data as Account;
}

/** Archive (deactivate) an account (Req 4.1). */
export async function archiveAccount(id: string): Promise<Account> {
  const { data, error } = await supabase
    .from('accounts')
    .update({ is_archived: true })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  if (!data) throw new Error('Failed to archive account');
  return data as Account;
}

/** Reactivate an archived account (Req 4.2). */
export async function reactivateAccount(id: string): Promise<Account> {
  const { data, error } = await supabase
    .from('accounts')
    .update({ is_archived: false })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  if (!data) throw new Error('Failed to reactivate account');
  return data as Account;
}

/**
 * Permanently delete an account only if it has zero ledger entries (Req 4.5,
 * 4.6). Throws AccountHasHistoryError when entries exist; the FK on delete
 * restrict is the DB backstop and a raised FK violation maps to the same error.
 */
export async function deleteAccount(id: string): Promise<void> {
  const { count, error: countError } = await supabase
    .from('account_ledger')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', id);
  if (countError) throw countError;

  if ((count ?? 0) > 0) {
    throw new AccountHasHistoryError();
  }

  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) {
    if (error.code === PG_FK_VIOLATION) {
      throw new AccountHasHistoryError();
    }
    throw error;
  }
}

// ---------- Ledger writes ----------

/**
 * Record a ledger entry (Req 5). Validates input, verifies the referenced
 * account exists, then inserts. Overdraft-causing money_out entries are still
 * recorded (Req 8.1). The ledger is append-only — there is no update or delete.
 */
export async function createLedgerEntry(
  input: LedgerEntryInsert,
): Promise<LedgerEntry> {
  const result = validateLedgerEntryInput({
    direction: input.direction,
    amount: input.amount,
    sourceReference: input.source_reference,
    note: input.note,
  });
  if (!result.ok) {
    throw new ValidationError(result.code, result.message);
  }

  const account = await getAccountById(input.account_id);
  if (!account) {
    throw new AccountNotFoundError();
  }

  const { data, error } = await supabase
    .from('account_ledger')
    .insert({
      account_id: input.account_id,
      direction: input.direction,
      amount: input.amount,
      source_reference: input.source_reference,
      note: input.note ?? '',
    })
    .select()
    .single();
  if (error) {
    if (error.code === PG_FK_VIOLATION) {
      throw new AccountNotFoundError();
    }
    throw error;
  }
  if (!data) throw new Error('Failed to create ledger entry');
  return data as LedgerEntry;
}

/**
 * Record a manual adjustment (Req 6): a ledger entry with a mandatory note and
 * source_reference = MANUAL_ADJUSTMENT_REF.
 */
export async function recordManualAdjustment(input: {
  account_id: string;
  direction: Direction;
  amount: number;
  note: string;
}): Promise<LedgerEntry> {
  const result = validateManualAdjustment({
    direction: input.direction,
    amount: input.amount,
    sourceReference: MANUAL_ADJUSTMENT_REF,
    note: input.note,
  });
  if (!result.ok) {
    throw new ValidationError(result.code, result.message);
  }

  return createLedgerEntry({
    account_id: input.account_id,
    direction: input.direction,
    amount: input.amount,
    source_reference: MANUAL_ADJUSTMENT_REF,
    note: input.note,
  });
}
