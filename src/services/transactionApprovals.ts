import { supabase } from '@/lib/supabase';
import {
  normalizeTransactionChangeRequest,
  type TransactionChangeAction,
  type TransactionChangeDraft,
} from '@/services/transactionApprovalsCore';
import type { Transaction, TransactionStaff } from '@/services/transactions';

export type TransactionChangeStatus = 'pending' | 'approved' | 'rejected';
export type TransactionReviewDecision = 'approved' | 'rejected';

export interface TransactionChangeRequest {
  id: string;
  transaction_id: string;
  action: TransactionChangeAction;
  status: TransactionChangeStatus;
  requested_by: string;
  reviewed_by: string | null;
  reason: string;
  proposed_description: string | null;
  proposed_detail: string | null;
  proposed_amount: number | null;
  snapshot: Record<string, unknown>;
  review_note: string;
  created_at: string;
  reviewed_at: string | null;
  transaction?: Transaction | null;
  requester?: TransactionStaff | null;
  reviewer?: TransactionStaff | null;
}

export interface SubmitTransactionChangeRequestInput {
  transaction: Transaction;
  action: TransactionChangeAction;
  reason: string;
  requestedBy: string;
  proposed?: TransactionChangeDraft;
}

export interface ReviewTransactionChangeRequestInput {
  requestId: string;
  decision: TransactionReviewDecision;
  reviewNote?: string;
}

const REQUEST_SELECT = [
  '*',
  'transaction:transactions(id, type, description, detail, amount, created_at, staff_id)',
  'requester:profiles!transaction_change_requests_requested_by_fkey(id, name, role, initials)',
  'reviewer:profiles!transaction_change_requests_reviewed_by_fkey(id, name, role, initials)',
].join(', ');

function snapshotTransaction(transaction: Transaction): Record<string, unknown> {
  return {
    id: transaction.id,
    type: transaction.type,
    description: transaction.description,
    detail: transaction.detail,
    amount: transaction.amount,
    created_at: transaction.created_at,
    staff_id: transaction.staff_id ?? null,
  };
}

export async function submitTransactionChangeRequest(
  input: SubmitTransactionChangeRequestInput,
): Promise<void> {
  const normalized = normalizeTransactionChangeRequest({
    action: input.action,
    reason: input.reason,
    current: {
      description: input.transaction.description,
      detail: input.transaction.detail,
      amount: input.transaction.amount,
    },
    proposed: input.proposed,
  });

  if (!normalized.ok) {
    throw new Error(normalized.message);
  }

  const { payload } = normalized;
  const { error } = await supabase.from('transaction_change_requests').insert({
    transaction_id: input.transaction.id,
    action: payload.action,
    requested_by: input.requestedBy,
    reason: payload.reason,
    proposed_description: payload.proposedDescription,
    proposed_detail: payload.proposedDetail,
    proposed_amount: payload.proposedAmount,
    snapshot: snapshotTransaction(input.transaction),
  });

  if (error) throw error;
}

export async function getTransactionChangeRequests(): Promise<TransactionChangeRequest[]> {
  const { data, error } = await supabase
    .from('transaction_change_requests')
    .select(REQUEST_SELECT)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as TransactionChangeRequest[];
}

export async function reviewTransactionChangeRequest(
  input: ReviewTransactionChangeRequestInput,
): Promise<void> {
  const { error } = await supabase.rpc('review_transaction_change_request', {
    p_request_id: input.requestId,
    p_decision: input.decision,
    p_review_note: input.reviewNote?.trim() ?? '',
  });

  if (error) throw error;
}
