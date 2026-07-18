import { supabase } from '@/lib/supabase';
import {
  getTransactionDisplayDetail,
  type Transaction,
  type TransactionStaff,
} from '@/services/transactions';
import type {
  MoneyDirection,
  ReconciliationEntry,
  ReconciliationResult,
} from '@/services/reconciliationCore';
import { compactReconciliationForAi } from '@/services/reconciliationCore';

interface LedgerAccountRow {
  id: string;
  name: string;
  type: string;
}

interface LedgerRow {
  id: string;
  account_id: string;
  direction: 'money_in' | 'money_out';
  amount: number;
  source_reference: string;
  note: string;
  created_at: string;
  account?: LedgerAccountRow | LedgerAccountRow[] | null;
}

type TransactionRow = Transaction & {
  staff?: TransactionStaff | null;
};

export interface AiReconciliationResponse {
  available: boolean;
  provider?: string;
  model?: string;
  summary?: string;
  recommendations?: string[];
  notes?: string[];
  error?: string;
}

export interface ParsedBankStatementPdfResponse {
  provider?: string;
  model?: string;
  entries: ReconciliationEntry[];
  warnings: string[];
  error?: string;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function dateRange(date: string): { from: string; to: string } {
  const [year, month, day] = date.split('-').map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

export function todayLocalDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function localDateFromIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseTransactionReference(ref: string): { type: string; id: string } | null {
  const match = ref.match(/^([^:]+):([0-9a-f-]{36})$/i);
  if (!match) return null;
  return { type: match[1], id: match[2] };
}

function normalizeAccount(row: LedgerRow): LedgerAccountRow | null {
  if (Array.isArray(row.account)) return row.account[0] ?? null;
  return row.account ?? null;
}

async function getTransactionsByIds(ids: string[]): Promise<Map<string, TransactionRow>> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('transactions')
    .select('*, staff:profiles!transactions_staff_id_fkey(id, name, role, initials)')
    .in('id', uniqueIds);

  if (error) throw error;

  return new Map(
    ((data as TransactionRow[]) ?? []).map((tx) => [tx.id, tx]),
  );
}

export async function getWebappReconciliationEntries(
  date: string,
): Promise<ReconciliationEntry[]> {
  const range = dateRange(date);
  const { data, error } = await supabase
    .from('account_ledger')
    .select('id, account_id, direction, amount, source_reference, note, created_at, account:accounts(id, name, type)')
    .gte('created_at', range.from)
    .lt('created_at', range.to)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const rows = (data as LedgerRow[]) ?? [];
  const txIds = rows
    .map((row) => parseTransactionReference(row.source_reference)?.id)
    .filter((id): id is string => Boolean(id));
  const txById = await getTransactionsByIds(txIds);

  return rows.map((row) => {
    const ref = parseTransactionReference(row.source_reference);
    const tx = ref ? txById.get(ref.id) : null;
    const account = normalizeAccount(row);
    const direction: MoneyDirection = row.direction === 'money_in' ? 'in' : 'out';
    const detail = tx ? getTransactionDisplayDetail(tx) : '';
    const description = tx?.description || row.note || detail || row.source_reference;

    return {
      id: row.id,
      source: 'webapp',
      date: localDateFromIso(row.created_at),
      direction,
      amount: Number(row.amount) || 0,
      accountName: account?.name ?? 'Akun tidak dikenal',
      accountType: account?.type,
      description,
      reference: row.source_reference,
      staffName: tx?.staff?.name ?? undefined,
      transactionType: tx?.type ?? ref?.type,
    };
  });
}

export async function analyzeReconciliationWithAi(
  result: ReconciliationResult,
): Promise<AiReconciliationResponse> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch('/api/reconciliation/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      reconciliation: compactReconciliationForAi(result),
    }),
  });

  const payload = (await response.json().catch(() => null)) as AiReconciliationResponse | null;
  if (!response.ok) {
    throw new Error(payload?.error || 'Analisa AI gagal diproses.');
  }
  return payload ?? { available: false, error: 'Response AI kosong.' };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('PDF mutasi tidak dapat dibaca.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const separator = result.indexOf(',');
      resolve(separator >= 0 ? result.slice(separator + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export async function parseBankStatementPdfWithAi(
  file: File,
  defaultDate: string,
): Promise<ParsedBankStatementPdfResponse> {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Mutasi bank harus diupload dalam format PDF.');
  }
  if (file.size <= 0 || file.size > 2 * 1024 * 1024) {
    throw new Error('Ukuran PDF mutasi maksimal 2 MB.');
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch('/api/reconciliation/parse-pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      fileName: file.name,
      fileBase64: await fileToBase64(file),
      defaultDate,
    }),
  });

  const payload = (await response.json().catch(() => null)) as ParsedBankStatementPdfResponse | null;
  if (!response.ok) {
    throw new Error(payload?.error || 'PDF mutasi tidak dapat diproses.');
  }
  return payload ?? { entries: [], warnings: ['Response parser PDF kosong.'] };
}
