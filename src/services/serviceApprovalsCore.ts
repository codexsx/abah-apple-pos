// Feature: service-edit-approvals
// Pure, dependency-free domain core for service record edit requests.
// Mirrors the style of transactionApprovalsCore.ts: normalization with
// first-error-result + human-readable diff summaries for the approval UI.
//
// A service edit request carries proposed field changes (whitelist) plus
// sparepart-usage changes (upsert/delete) and a mandatory reason. The DB
// applies the proposal atomically on approval (private.apply_service_edit_request).

/** Fields of service_records that may be edited through the approval flow. */
export const SERVICE_EDITABLE_FIELDS = [
  'customer_name',
  'phone_model',
  'capacity',
  'condition',
  'color',
  'imei',
  'battery_health',
  'issue',
  'additional_note',
  'technician',
  'wage_amount',
] as const;

export type ServiceEditableField = (typeof SERVICE_EDITABLE_FIELDS)[number];

/** Indonesian labels for the editable fields (approval diff display). */
export const SERVICE_FIELD_LABELS: Record<ServiceEditableField, string> = {
  customer_name: 'Nama Customer',
  phone_model: 'Tipe HP',
  capacity: 'Kapasitas',
  condition: 'Kondisi',
  color: 'Warna',
  imei: 'IMEI/SN',
  battery_health: 'Battery Health',
  issue: 'Keluhan',
  additional_note: 'Catatan Tambahan',
  technician: 'Tukang',
  wage_amount: 'Upah',
};

/** A sparepart-usage row change. `id` absent = new manual row (no stock). */
export interface ProposedServiceUsageEdit {
  id?: string;
  sparepart_id?: string | null;
  sparepart_name?: string;
  quantity: number;
  unit_cost: number;
}

export interface ProposedServiceEdit {
  fields?: Partial<Record<ServiceEditableField, string | number | null>>;
  usagesUpsert?: ProposedServiceUsageEdit[];
  usagesDelete?: string[];
}

/** Current state of one sparepart-usage row (for diffing). */
export interface ServiceUsageSnapshot {
  id: string;
  sparepart_id: string | null;
  sparepart_name: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
}

export interface ServiceChangeCurrentValue {
  /** Current values keyed by editable field name. */
  fields: Partial<Record<ServiceEditableField, string | number | null>>;
  usages: ServiceUsageSnapshot[];
}

export interface NormalizedServiceEditPayload {
  reason: string;
  /** Only fields that actually change, normalized. */
  fields: Partial<Record<ServiceEditableField, string | number | null>>;
  usagesUpsert: ProposedServiceUsageEdit[];
  usagesDelete: string[];
}

export type NormalizeServiceEditResult =
  | { ok: true; payload: NormalizedServiceEditPayload }
  | { ok: false; message: string };

// ---------- helpers ----------

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function formatIdr(amount: number): string {
  return `Rp ${Math.round(amount).toLocaleString('id-ID')}`;
}

function isValidAmount(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

const EDITABLE_SET: ReadonlySet<string> = new Set(SERVICE_EDITABLE_FIELDS);

// ---------- normalization ----------

/**
 * Validate a service edit request and return the normalized payload, or the
 * FIRST failure message:
 *  1) reason required (trimmed, 1..500 chars)
 *  2) field keys whitelisted + per-field rules (battery 0–100, wage int >= 0)
 *  3) usage upsert/delete rules (qty >= 1, cost >= 0, ids known, no conflicts)
 *  4) at least one effective change
 */
export function normalizeServiceEditRequest(input: {
  reason: string;
  current: ServiceChangeCurrentValue;
  proposed: ProposedServiceEdit;
}): NormalizeServiceEditResult {
  const reason = input.reason.trim();
  if (reason.length < 1 || reason.length > 500) {
    return { ok: false, message: 'Alasan wajib diisi (maks. 500 karakter).' };
  }

  const currentUsagesById = new Map(input.current.usages.map((u) => [u.id, u]));

  // ---- fields ----
  const proposedFields = input.proposed.fields ?? {};
  const normalizedFields: Partial<Record<ServiceEditableField, string | number | null>> = {};
  for (const [key, rawValue] of Object.entries(proposedFields)) {
    if (!EDITABLE_SET.has(key)) {
      return { ok: false, message: `Field ${key} tidak boleh diedit.` };
    }
    const field = key as ServiceEditableField;
    const currentValue = input.current.fields[field] ?? null;

    if (field === 'battery_health') {
      const next =
        rawValue === null || rawValue === ''
          ? null
          : typeof rawValue === 'number'
            ? Math.round(rawValue)
            : Number(normalizeText(String(rawValue)).replace(/[^\d]/g, ''));
      if (next !== null && (!Number.isInteger(next) || next < 0 || next > 100)) {
        return { ok: false, message: 'Battery health harus 0-100.' };
      }
      if (next !== (currentValue ?? null)) {
        normalizedFields.battery_health = next;
      }
      continue;
    }

    if (field === 'wage_amount') {
      const next =
        typeof rawValue === 'number'
          ? Math.round(rawValue)
          : Number(normalizeText(String(rawValue)).replace(/[^\d]/g, '')) || 0;
      if (!isValidAmount(next)) {
        return { ok: false, message: 'Upah tidak boleh negatif.' };
      }
      if (next !== (typeof currentValue === 'number' ? currentValue : Number(currentValue ?? 0))) {
        normalizedFields.wage_amount = next;
      }
      continue;
    }

    // text fields
    const nextText = normalizeText(typeof rawValue === 'string' ? rawValue : String(rawValue ?? ''));
    const limited = field === 'imei' ? nextText.slice(0, 20) : nextText;
    if (limited !== normalizeText(currentValue as string | null | undefined)) {
      normalizedFields[field] = limited;
    }
  }

  // ---- usages upsert ----
  const usagesUpsert: ProposedServiceUsageEdit[] = [];
  const seenUpsertIds = new Set<string>();
  for (const row of input.proposed.usagesUpsert ?? []) {
    const quantity = Math.round(Number(row.quantity));
    const unitCost = Math.round(Number(row.unit_cost));
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { ok: false, message: 'Jumlah sparepart minimal 1.' };
    }
    if (!Number.isInteger(unitCost) || unitCost < 0) {
      return { ok: false, message: 'Modal sparepart tidak boleh negatif.' };
    }

    if (row.id) {
      if (seenUpsertIds.has(row.id)) {
        return { ok: false, message: 'Ada baris sparepart yang diubah lebih dari sekali.' };
      }
      seenUpsertIds.add(row.id);
      const current = currentUsagesById.get(row.id);
      if (!current) {
        return { ok: false, message: 'Baris sparepart yang diubah tidak ditemukan.' };
      }
      // Only keep effective changes.
      if (current.quantity === quantity && current.unit_cost === unitCost) {
        continue;
      }
      usagesUpsert.push({ id: row.id, quantity, unit_cost: unitCost });
    } else {
      // New rows are manual-only (catalog adds are out of scope).
      if (row.sparepart_id) {
        return { ok: false, message: 'Penambahan sparepart katalog lewat approval tidak didukung.' };
      }
      usagesUpsert.push({
        sparepart_id: null,
        sparepart_name: normalizeText(row.sparepart_name) || 'Spare Part Manual',
        quantity,
        unit_cost: unitCost,
      });
    }
  }

  // ---- usages delete ----
  const usagesDelete: string[] = [];
  for (const id of input.proposed.usagesDelete ?? []) {
    if (!isValidUuid(id) || !currentUsagesById.has(id)) {
      return { ok: false, message: 'Baris sparepart yang dihapus tidak ditemukan.' };
    }
    if (seenUpsertIds.has(id)) {
      return { ok: false, message: 'Baris sparepart tidak bisa diubah dan dihapus sekaligus.' };
    }
    if (!usagesDelete.includes(id)) {
      usagesDelete.push(id);
    }
  }

  // ---- at least one effective change ----
  const hasFieldChange = Object.keys(normalizedFields).length > 0;
  if (!hasFieldChange && usagesUpsert.length === 0 && usagesDelete.length === 0) {
    return { ok: false, message: 'Tidak ada perubahan untuk diajukan.' };
  }

  return {
    ok: true,
    payload: { reason, fields: normalizedFields, usagesUpsert, usagesDelete },
  };
}

// ---------- diff summary ----------

function formatFieldValue(field: ServiceEditableField, value: string | number | null | undefined): string {
  if (field === 'wage_amount') return formatIdr(Number(value ?? 0));
  if (field === 'battery_health') return value === null || value === undefined || value === '' ? '-' : `${value}%`;
  return normalizeText(value as string | null | undefined) || '-';
}

function usageLabel(u: { sparepart_name: string; quantity: number; unit_cost: number }): string {
  return `${u.sparepart_name} x${u.quantity} (${formatIdr(u.unit_cost)}/pcs)`;
}

/**
 * Compute the modal-part total after applying the proposal to the current
 * usages (deletes removed, upserts applied, new manual rows added).
 */
export function computeProposedModalPart(
  current: ServiceUsageSnapshot[],
  proposed: Pick<ProposedServiceEdit, 'usagesUpsert' | 'usagesDelete'>,
): number {
  const deleteSet = new Set(proposed.usagesDelete ?? []);
  const upsertById = new Map((proposed.usagesUpsert ?? []).filter((u) => u.id).map((u) => [u.id as string, u]));

  let total = 0;
  for (const u of current) {
    if (deleteSet.has(u.id)) continue;
    const edit = upsertById.get(u.id);
    total += edit ? edit.quantity * edit.unit_cost : u.quantity * u.unit_cost;
  }
  for (const u of proposed.usagesUpsert ?? []) {
    if (!u.id) total += u.quantity * u.unit_cost;
  }
  return total;
}

/**
 * Human-readable diff lines for the approval card, e.g.
 *  "Upah: Rp 310.000 → Rp 350.000"
 *  "Ubah sparepart: Spare Part Manual x1 (Rp 190.000/pcs) → x2 (Rp 150.000/pcs)"
 *  "Hapus sparepart: Battery iPhone 11 x1"
 *  "Tambah sparepart manual: Sealant Pack x1 (Rp 25.000/pcs)"
 *  "Modal part: Rp 190.000 → Rp 150.000"
 */
export function summarizeServiceEditForApproval(
  current: ServiceChangeCurrentValue,
  proposed: ProposedServiceEdit,
): string[] {
  const lines: string[] = [];
  const currentUsagesById = new Map(current.usages.map((u) => [u.id, u]));

  for (const field of SERVICE_EDITABLE_FIELDS) {
    if (!proposed.fields || !(field in proposed.fields)) continue;
    const before = formatFieldValue(field, current.fields[field]);
    const after = formatFieldValue(field, proposed.fields[field]);
    if (before !== after) {
      lines.push(`${SERVICE_FIELD_LABELS[field]}: ${before} → ${after}`);
    }
  }

  for (const row of proposed.usagesUpsert ?? []) {
    if (row.id) {
      const before = currentUsagesById.get(row.id);
      if (before && (before.quantity !== row.quantity || before.unit_cost !== row.unit_cost)) {
        lines.push(`Ubah sparepart: ${usageLabel(before)} → x${row.quantity} (${formatIdr(row.unit_cost)}/pcs)`);
      }
    } else {
      lines.push(`Tambah sparepart manual: ${usageLabel({ sparepart_name: normalizeText(row.sparepart_name) || 'Spare Part Manual', quantity: row.quantity, unit_cost: row.unit_cost })}`);
    }
  }

  for (const id of proposed.usagesDelete ?? []) {
    const before = currentUsagesById.get(id);
    if (before) {
      lines.push(`Hapus sparepart: ${usageLabel(before)}`);
    }
  }

  const currentModal = current.usages.reduce((sum, u) => sum + u.quantity * u.unit_cost, 0);
  const nextModal = computeProposedModalPart(current.usages, proposed);
  if (currentModal !== nextModal) {
    lines.push(`Modal part: ${formatIdr(currentModal)} → ${formatIdr(nextModal)}`);
  }

  return lines;
}
