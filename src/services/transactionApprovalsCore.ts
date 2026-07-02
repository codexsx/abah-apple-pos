export type TransactionChangeAction = 'edit' | 'delete';

const DELETE_SUPPORTED_TYPES = new Set([
  'Penjualan',
  'Pembelian',
  'Pengeluaran',
  'Pemasukan Lain',
  'Upah Servis',
]);

export function isTransactionDeleteRequestSupported(type: string): boolean {
  return DELETE_SUPPORTED_TYPES.has(type);
}

export interface TransactionChangeCurrentValue {
  description: string;
  detail: string;
  amount: number | null;
}

export interface TransactionChangeDraft {
  description?: string | null;
  detail?: string | null;
  amount?: number | null;
}

export interface NormalizedTransactionChangePayload {
  action: TransactionChangeAction;
  reason: string;
  proposedDescription: string | null;
  proposedDetail: string | null;
  proposedAmount: number | null;
}

export type NormalizeTransactionChangeResult =
  | { ok: true; payload: NormalizedTransactionChangePayload }
  | { ok: false; message: string };

interface NormalizeTransactionChangeInput {
  action: TransactionChangeAction;
  reason: string;
  current: TransactionChangeCurrentValue;
  proposed?: TransactionChangeDraft;
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function normalizeAmount(value: number | null | undefined): number | null {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  return Math.round(value);
}

export function normalizeTransactionChangeRequest(
  input: NormalizeTransactionChangeInput,
): NormalizeTransactionChangeResult {
  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, message: 'Alasan wajib diisi.' };
  }

  if (input.action === 'delete') {
    return {
      ok: true,
      payload: {
        action: input.action,
        reason,
        proposedDescription: null,
        proposedDetail: null,
        proposedAmount: null,
      },
    };
  }

  const proposedDescription = normalizeText(input.proposed?.description);
  const proposedDetail = normalizeText(input.proposed?.detail);
  const proposedAmount = normalizeAmount(input.proposed?.amount);

  if (proposedAmount !== null && proposedAmount < 0) {
    return { ok: false, message: 'Nominal transaksi tidak boleh negatif.' };
  }

  const currentDescription = normalizeText(input.current.description);
  const currentDetail = normalizeText(input.current.detail);
  const currentAmount = normalizeAmount(input.current.amount);
  const nextAmount = proposedAmount ?? currentAmount;

  const hasChange =
    proposedDescription !== currentDescription ||
    proposedDetail !== currentDetail ||
    nextAmount !== currentAmount;

  if (!hasChange) {
    return { ok: false, message: 'Tidak ada perubahan untuk diajukan.' };
  }

  return {
    ok: true,
    payload: {
      action: input.action,
      reason,
      proposedDescription,
      proposedDetail,
      proposedAmount: nextAmount,
    },
  };
}
