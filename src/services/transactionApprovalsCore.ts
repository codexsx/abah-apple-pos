export type TransactionChangeAction = 'edit' | 'delete';

const DELETE_SUPPORTED_TYPES = new Set([
  'Penjualan',
  'Pembelian',
  'Tukar Tambah',
  'Buyback',
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstString(source: Record<string, unknown> | null, keys: string[]): string {
  if (!source) return '';
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function firstNumber(source: Record<string, unknown> | null, keys: string[]): number {
  if (!source) return 0;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const digits = value.replace(/[^\d]/g, '');
      if (digits) return Number(digits);
    }
  }
  return 0;
}

function compactParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

function formatIdr(amount: number): string {
  return `Rp ${Math.round(amount).toLocaleString('id-ID')}`;
}

function normalizeAmount(value: number | null | undefined): number | null {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  return Math.round(value);
}

export function summarizeTransactionDetailForApproval(
  detail: string | null | undefined,
): string[] {
  const raw = normalizeText(detail);
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [raw];
  }

  const root = asRecord(parsed);
  if (!root) return [];

  const lines: string[] = [];
  const supplier = asRecord(root.supplier);
  const supplierName = firstString(supplier, ['name', 'supplierName']);
  if (supplierName) lines.push(`Agen: ${supplierName}`);

  const specs = asRecord(root.specs);
  const units = asArray(root.units)
    .map(asRecord)
    .filter((unit): unit is Record<string, unknown> => unit !== null);
  const buybackUnit = asRecord(root.unit);
  if (buybackUnit) {
    units.push(buybackUnit);
  }

  units.forEach((unit, index) => {
    const unitLabel = compactParts([
      firstString(unit, ['model']) || firstString(specs, ['model']),
      firstString(unit, ['capacity']) || firstString(specs, ['capacity']),
      firstString(unit, ['condition']) || firstString(specs, ['condition']),
      firstString(unit, ['color']) || firstString(specs, ['color']),
    ]);
    lines.push(`Unit ${index + 1}: ${unitLabel || 'Detail unit belum lengkap'}`);

    const imei = firstString(unit, ['imei', 'serial']);
    if (imei) lines.push(`IMEI: ${imei}`);

    const batteryHealth = firstNumber(unit, ['batteryHealth', 'battery_health', 'bh']);
    if (batteryHealth > 0) lines.push(`BH: ${batteryHealth}%`);

    const costPrice = firstNumber(unit, ['costPrice', 'cost_price', 'modal']);
    if (costPrice > 0) lines.push(`Modal: ${formatIdr(costPrice)}`);

    const sellingPrice = firstNumber(unit, ['sellingPrice', 'selling_price', 'price', 'hargaJual']);
    if (sellingPrice > 0) lines.push(`Jual: ${formatIdr(sellingPrice)}`);

    const defect = firstString(unit, ['defectDescription', 'defect_description', 'minus', 'note']);
    if (defect) lines.push(`Minus: ${defect}`);
  });

  const stockGroups = asArray(root.stockGroups)
    .map(asRecord)
    .filter((group): group is Record<string, unknown> => group !== null);
  stockGroups.forEach((group, index) => {
    const color = firstString(group, ['color']);
    const quantity = firstNumber(group, ['quantity', 'qty', 'count']);
    const costPrice = firstNumber(group, ['costPrice', 'cost_price', 'modal']);
    const groupParts = [
      color || `Grup ${index + 1}`,
      quantity > 0 ? `${quantity} unit` : '',
      costPrice > 0 ? `Modal ${formatIdr(costPrice)}/unit` : '',
    ].filter(Boolean);
    if (groupParts.length > 0) lines.push(`Stok: ${groupParts.join(' - ')}`);
  });

  const customer = asRecord(root.customer);
  const customerName = firstString(customer, ['name']);
  if (customerName) lines.push(`Customer: ${customerName}`);

  const buybackPrice = firstNumber(root, ['buybackPrice', 'buyback_price']);
  if (buybackPrice > 0) lines.push(`Buyback: ${formatIdr(buybackPrice)}`);

  const payment = asRecord(root.payment);
  const debt = firstNumber(payment, ['debt', 'hutang']);
  const cash = firstNumber(payment, ['cash']);
  const transfer = firstNumber(payment, ['transfer']);
  if (debt > 0) lines.push(`Hutang: ${formatIdr(debt)}`);
  if (cash > 0) lines.push(`Cash: ${formatIdr(cash)}`);
  if (transfer > 0) lines.push(`Transfer: ${formatIdr(transfer)}`);

  return lines;
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
