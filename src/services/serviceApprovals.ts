// Feature: service-edit-approvals
// Service layer — thin wrappers over service_change_requests (insert/select)
// and the review_service_change_request RPC. Thrown-error pattern: callers see
// exceptions, never swallowed errors. Applying an approved edit happens
// atomically inside the DB (private.apply_service_edit_request).

import { supabase } from '@/lib/supabase';
import {
  normalizeServiceEditRequest,
  type ProposedServiceEdit,
  type ServiceChangeCurrentValue,
  type NormalizedServiceEditPayload,
} from '@/services/serviceApprovalsCore';
import type { ServiceRecord, ServiceSparepartUsage } from '@/services/services';
import type { TransactionStaff } from '@/services/transactions';

export type ServiceChangeStatus = 'pending' | 'approved' | 'rejected';
export type ServiceReviewDecision = 'approved' | 'rejected';
export type ServiceChangeAction = 'edit' | 'delete';

export interface ServiceChangeRequest {
  id: string;
  service_record_id: string;
  action: ServiceChangeAction;
  status: ServiceChangeStatus;
  requested_by: string;
  reviewed_by: string | null;
  reason: string;
  proposed: ProposedServiceEdit;
  snapshot: Record<string, unknown>;
  review_note: string;
  created_at: string;
  reviewed_at: string | null;
  service_record?: Pick<
    ServiceRecord,
    'id' | 'customer_name' | 'phone_model' | 'capacity' | 'status' | 'service_type' | 'technician'
  > | null;
  requester?: TransactionStaff | null;
  reviewer?: TransactionStaff | null;
}

const REQUEST_SELECT = [
  '*',
  'service_record:service_records(id, customer_name, phone_model, capacity, status, service_type, technician)',
  'requester:profiles!service_change_requests_requested_by_fkey(id, name, role, initials)',
  'reviewer:profiles!service_change_requests_reviewed_by_fkey(id, name, role, initials)',
].join(', ');

/** Build the "current value" model (fields + usages) from a loaded record. */
export function buildServiceChangeCurrentValue(
  record: ServiceRecord,
  usages: ServiceSparepartUsage[],
): ServiceChangeCurrentValue {
  return {
    fields: {
      customer_name: record.customer_name,
      phone_model: record.phone_model,
      capacity: record.capacity,
      condition: record.condition,
      color: record.color,
      imei: record.imei,
      battery_health: record.battery_health,
      issue: record.issue,
      additional_note: record.additional_note,
      technician: record.technician,
      wage_amount: record.wage_amount,
    },
    usages: usages
      .filter((u) => u.service_record_id === record.id)
      .map((u) => ({
        id: u.id,
        sparepart_id: u.sparepart_id,
        sparepart_name: u.sparepart_name,
        quantity: u.quantity,
        unit_cost: u.unit_cost,
        total_cost: u.total_cost,
      })),
  };
}

function snapshotServiceChange(
  record: ServiceRecord,
  usages: ServiceSparepartUsage[],
): Record<string, unknown> {
  return {
    id: record.id,
    customer_name: record.customer_name,
    phone_model: record.phone_model,
    capacity: record.capacity,
    condition: record.condition,
    color: record.color,
    imei: record.imei,
    battery_health: record.battery_health,
    issue: record.issue,
    additional_note: record.additional_note,
    status: record.status,
    service_type: record.service_type,
    technician: record.technician,
    wage_amount: record.wage_amount,
    estimated_cost: record.estimated_cost,
    usages: usages
      .filter((u) => u.service_record_id === record.id)
      .map((u) => ({
        id: u.id,
        sparepart_id: u.sparepart_id,
        sparepart_name: u.sparepart_name,
        quantity: u.quantity,
        unit_cost: u.unit_cost,
        total_cost: u.total_cost,
      })),
  };
}

export interface SubmitServiceChangeRequestInput {
  record: ServiceRecord;
  usages: ServiceSparepartUsage[];
  reason: string;
  requestedBy: string;
  proposed: ProposedServiceEdit;
}

/**
 * Validates the request against the current record state, then inserts a
 * pending change request. Throws the validation message when the proposal is
 * invalid (no reason / no effective change / bad rows).
 */
export async function submitServiceChangeRequest(
  input: SubmitServiceChangeRequestInput,
): Promise<{ id: string; payload: NormalizedServiceEditPayload }> {
  const current = buildServiceChangeCurrentValue(input.record, input.usages);
  const normalized = normalizeServiceEditRequest({
    reason: input.reason,
    current,
    proposed: input.proposed,
  });
  if (!normalized.ok) {
    throw new Error(normalized.message);
  }

  const proposedJson = {
    fields: normalized.payload.fields,
    usages_upsert: normalized.payload.usagesUpsert,
    usages_delete: normalized.payload.usagesDelete,
  };

  const { data, error } = await supabase
    .from('service_change_requests')
    .insert({
      service_record_id: input.record.id,
      requested_by: input.requestedBy,
      reason: normalized.payload.reason,
      proposed: proposedJson,
      snapshot: snapshotServiceChange(input.record, input.usages),
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id as string, payload: normalized.payload };
}

/** Submit a deletion for manager approval without deleting the service directly. */
export async function submitServiceDeleteRequest(input: {
  record: ServiceRecord;
  usages: ServiceSparepartUsage[];
  reason: string;
  requestedBy: string;
}): Promise<{ id: string }> {
  const reason = input.reason.trim();
  if (!reason || reason.length > 500) {
    throw new Error('Alasan hapus wajib diisi (maks. 500 karakter).');
  }
  if (!input.requestedBy) {
    throw new Error('Sesi login tidak ditemukan.');
  }

  const { data, error } = await supabase
    .from('service_change_requests')
    .insert({
      service_record_id: input.record.id,
      action: 'delete',
      requested_by: input.requestedBy,
      reason,
      proposed: {},
      snapshot: snapshotServiceChange(input.record, input.usages),
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

/** Managers see all requests (RLS); staff see their own. */
export async function getServiceChangeRequests(): Promise<ServiceChangeRequest[]> {
  const { data, error } = await supabase
    .from('service_change_requests')
    .select(REQUEST_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as ServiceChangeRequest[]) || [];
}

/** Pending request ids per service record (for the "Menunggu Approval" badge). */
export async function getPendingServiceChangeRecordIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('service_change_requests')
    .select('service_record_id')
    .eq('status', 'pending');
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.service_record_id as string));
}

/**
 * Approve (applies the proposal atomically in the DB) or reject a request.
 * Manager-only — enforced inside the RPC (private.has_permission).
 */
export async function reviewServiceChangeRequest(input: {
  requestId: string;
  decision: ServiceReviewDecision;
  reviewNote?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('review_service_change_request', {
    p_request_id: input.requestId,
    p_decision: input.decision,
    p_review_note: input.reviewNote ?? '',
  });
  if (error) throw error;
}
