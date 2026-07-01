import { supabase } from '@/lib/supabase';
import { deserializeSaleDetail } from '@/services/finalization';
import type { StockItem } from '@/services/stock';

export type TransactionType =
  | 'Penjualan'
  | 'Pembelian'
  | 'Pembelian Pelengkap'
  | 'Servis'
  | 'Pengeluaran'
  | 'Tukar Tambah'
  | 'Pemasukan Lain'
  | 'Upah Servis';

export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  detail: string;
  amount: number | null;
  created_at: string;
  staff_id?: string | null;
  staff?: TransactionStaff | null;
}

export interface TransactionWithStockDetails extends Transaction {
  stock_items: StockItem[];
}

export type TransactionInsert = Omit<Transaction, 'id' | 'created_at' | 'staff'>;

export interface TransactionStaff {
  id: string;
  name: string | null;
  role?: string | null;
  initials?: string | null;
}

const TRANSACTION_SELECT = '*, staff:profiles!transactions_staff_id_fkey(id, name, role, initials)';
const TRANSACTION_WITH_STOCK_SELECT = `${TRANSACTION_SELECT}, stock_items(*)`;

function normalizeImei(imei: string | null | undefined): string | null {
  const trimmed = imei?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function toVirtualStockItem(
  tx: TransactionWithStockDetails,
  unit: {
    imei?: string;
    sellingPrice?: number;
    model?: string;
    capacity?: string;
    condition?: string;
    color?: string;
    defectDescription?: string;
  },
  index: number,
): StockItem {
  const imei = normalizeImei(unit.imei);
  return {
    id: `${tx.id}:detail-unit:${index}`,
    model: unit.model ?? '',
    capacity: unit.capacity ?? '',
    condition: unit.condition ?? '',
    color: unit.color ?? '',
    imei,
    has_imei: imei !== null,
    status: tx.type === 'Pembelian' ? 'READY' : 'TERJUAL',
    count: 1,
    price: Number(unit.sellingPrice) || 0,
    cost_price: 0,
    defect_description: unit.defectDescription ?? '',
    created_at: tx.created_at,
    updated_at: tx.created_at,
  };
}

function compactParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

function formatIdr(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  return Number(value) || 0;
}

function formatPurchaseDisplayDetail(rawDetail: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawDetail);
  } catch {
    return null;
  }

  const root = asRecord(parsed);
  if (!root) return null;

  const supplier = asRecord(root.supplier);
  const specs = asRecord(root.specs);
  if (!specs) return null;

  const supplierName = asString(supplier?.name);
  const quantity = asNumber(specs.quantity);
  const specLabel = compactParts([
    asString(specs.model),
    asString(specs.capacity),
    asString(specs.condition),
  ]);

  const sections: string[] = [];
  if (supplierName) sections.push(supplierName);
  if (quantity > 0 && specLabel) sections.push(`${quantity} unit ${specLabel}`);
  else if (specLabel) sections.push(specLabel);

  const groups = Array.isArray(root.stockGroups) ? root.stockGroups : [];
  const groupLabels = groups
    .map((group) => {
      const row = asRecord(group);
      if (!row) return '';
      const color = asString(row.color);
      const groupQty = asNumber(row.quantity);
      const costPrice = asNumber(row.costPrice);
      const parts: string[] = [];
      if (color || groupQty > 0) {
        parts.push(`${color || 'Stok'}${groupQty > 0 ? ` ${groupQty} unit` : ''}`);
      }
      if (costPrice > 0) parts.push(`${formatIdr(costPrice)}/unit`);
      return parts.join(' @ ');
    })
    .filter(Boolean);
  if (groupLabels.length > 0) sections.push(groupLabels.join(', '));

  const payment = asRecord(root.payment);
  const debt = asNumber(payment?.debt);
  if (debt > 0) sections.push(`Hutang ${formatIdr(debt)}`);

  const total = asNumber(root.total);
  if (total > 0 && debt <= 0) sections.push(`Total ${formatIdr(total)}`);

  return sections.length > 0 ? sections.join(' - ') : null;
}

function formatAccessoryPurchaseDisplayDetail(rawDetail: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawDetail);
  } catch {
    return null;
  }

  const root = asRecord(parsed);
  if (!root || root.kind !== 'accessory_purchase') return null;

  const itemLabels = (Array.isArray(root.items) ? root.items : [])
    .map((item) => {
      const row = asRecord(item);
      if (!row) return '';
      const name = asString(row.name);
      const quantity = asNumber(row.quantity);
      const unitCost = asNumber(row.unitCost);
      const parts: string[] = [];
      if (quantity > 0 && name) parts.push(`${quantity} pcs ${name}`);
      else if (name) parts.push(name);
      if (unitCost > 0) parts.push(`${formatIdr(unitCost)}/pcs`);
      return parts.join(' @ ');
    })
    .filter(Boolean);

  const sections: string[] = [];
  if (itemLabels.length > 0) sections.push(itemLabels.join(', '));

  const payment = asRecord(root.payment);
  const cash = asNumber(payment?.cash);
  const transfer = asNumber(payment?.transfer);
  if (cash > 0) sections.push(`Cash ${formatIdr(cash)}`);
  if (transfer > 0) sections.push(`Transfer ${formatIdr(transfer)}`);

  const total = asNumber(root.total);
  if (total > 0) sections.push(`Total ${formatIdr(total)}`);

  return sections.length > 0 ? sections.join(' - ') : null;
}

function formatJsonKindDisplayDetail(rawDetail: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawDetail);
  } catch {
    return null;
  }

  const root = asRecord(parsed);
  if (!root) return null;

  if (root.kind === 'servis') {
    const sections = compactParts([
      asString(root.customer),
      asString(root.model),
      asString(root.capacity),
      asString(root.issue),
    ]);
    return sections || null;
  }

  if (root.kind === 'pengeluaran') {
    const note = asString(root.note);
    const category = asString(root.category);
    return compactParts([category, note]) || null;
  }

  if (root.kind === 'pemasukan_lain') {
    const source = asString(root.source);
    const note = asString(root.note);
    return compactParts([source, note]) || null;
  }

  return null;
}

function formatLegacyTransactionJsonDetail(
  type: TransactionType,
  rawDetail: string,
): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawDetail);
  } catch {
    return null;
  }

  const root = asRecord(parsed);
  if (!root) return null;

  if (type === 'Pengeluaran') {
    const sections = compactParts([
      asString(root.kategori) || asString(root.category),
      asString(root.keterangan) || asString(root.note),
      asString(root.referensi) || asString(root.reference),
    ]);
    const paymentParts: string[] = [];
    const cash = asNumber(root.cash);
    const transfer = asNumber(root.transfer);
    if (cash > 0) paymentParts.push(`Cash ${formatIdr(cash)}`);
    if (transfer > 0) paymentParts.push(`Transfer ${formatIdr(transfer)}`);
    return compactParts([sections, paymentParts.join(' + ')]) || null;
  }

  if (type === 'Pemasukan Lain') {
    const sections = compactParts([
      asString(root.jenis) || asString(root.source),
      asString(root.keterangan) || asString(root.note),
      asString(root.referensi) || asString(root.reference),
    ]);
    const paymentParts: string[] = [];
    const cash = asNumber(root.cashMasuk ?? root.cash);
    const transfer = asNumber(root.transferMasuk ?? root.transfer);
    if (cash > 0) paymentParts.push(`Cash ${formatIdr(cash)}`);
    if (transfer > 0) paymentParts.push(`Transfer ${formatIdr(transfer)}`);
    const itemLabels = (Array.isArray(root.items) ? root.items : [])
      .map((item) => {
        const row = asRecord(item);
        if (!row) return '';
        const name = asString(row.name);
        const price = asNumber(row.price);
        return compactParts([name, price > 0 ? formatIdr(price) : '']);
      })
      .filter(Boolean);
    return compactParts([sections, itemLabels.join(', '), paymentParts.join(' + ')]) || null;
  }

  return null;
}

export function getTransactionDisplayDetail(
  tx: Pick<Transaction, 'type' | 'detail'>,
): string {
  const rawDetail = tx.detail?.trim() ?? '';
  if (rawDetail.length === 0) return rawDetail;

  if (tx.type === 'Pembelian') {
    return formatPurchaseDisplayDetail(rawDetail) ?? rawDetail;
  }

  if (tx.type === 'Pembelian Pelengkap') {
    return formatAccessoryPurchaseDisplayDetail(rawDetail) ?? rawDetail;
  }

  if (tx.type !== 'Penjualan') {
    return formatJsonKindDisplayDetail(rawDetail)
      ?? formatLegacyTransactionJsonDetail(tx.type, rawDetail)
      ?? rawDetail;
  }

  try {
    const saleDetail = deserializeSaleDetail(rawDetail);
    const unitLabels = saleDetail.units
      .map((unit) => compactParts([unit.model, unit.capacity, unit.condition, unit.color]))
      .filter(Boolean);
    const itemLabels = saleDetail.items
      .map((item) => item.name?.trim())
      .filter((item): item is string => Boolean(item));
    const bonusLabels = saleDetail.bonuses
      .map((bonus) => bonus.name?.trim())
      .filter((bonus): bonus is string => Boolean(bonus));

    const sections: string[] = [];
    if (unitLabels.length > 0) sections.push(unitLabels.join(', '));
    if (itemLabels.length > 0) sections.push(`Item: ${itemLabels.join(', ')}`);
    if (bonusLabels.length > 0) sections.push(`Bonus: ${bonusLabels.join(', ')}`);
    if (saleDetail.warranty) sections.push(`Garansi ${saleDetail.warranty}`);
    if (saleDetail.customer.name) sections.push(`Customer: ${saleDetail.customer.name}`);

    return sections.length > 0 ? sections.join(' - ') : rawDetail;
  } catch {
    return formatJsonKindDisplayDetail(rawDetail)
      ?? formatLegacyTransactionJsonDetail(tx.type, rawDetail)
      ?? rawDetail;
  }
}

/**
 * Sales of non-IMEI grouped stock can decrement stock_items.count without
 * linking a per-unit row to the transaction. The sale JSON still stores the
 * rendered unit details, so hydrate missing rows from detail.units for history.
 */
export function hydrateTransactionStockDetails(
  tx: TransactionWithStockDetails,
): TransactionWithStockDetails {
  let detailUnits: ReturnType<typeof deserializeSaleDetail>['units'];
  try {
    detailUnits = deserializeSaleDetail(tx.detail).units;
  } catch {
    return tx;
  }

  if (detailUnits.length === 0) return tx;

  const linkedItems = tx.stock_items ?? [];
  const linkedImeis = new Set(
    linkedItems
      .map((item) => normalizeImei(item.imei))
      .filter((imei): imei is string => imei !== null),
  );
  const linkedWithoutImeiCount = linkedItems.filter(
    (item) => normalizeImei(item.imei) === null,
  ).length;
  let matchedWithoutImei = 0;

  const virtualItems: StockItem[] = [];
  detailUnits.forEach((unit, index) => {
    const imei = normalizeImei(unit.imei);
    if (imei !== null && linkedImeis.has(imei)) return;

    if (imei === null && matchedWithoutImei < linkedWithoutImeiCount) {
      matchedWithoutImei += 1;
      return;
    }

    virtualItems.push(toVirtualStockItem(tx, unit, index));
  });

  if (virtualItems.length === 0) return tx;
  return { ...tx, stock_items: [...linkedItems, ...virtualItems] };
}

export function getTransactionStaffName(
  tx: Pick<Transaction, 'staff' | 'staff_id'>,
): string {
  const name = tx.staff?.name?.trim();
  return name || 'Staff tidak tercatat';
}

export function getTransactionStaffRole(
  tx: Pick<Transaction, 'staff'>,
): string | null {
  const role = tx.staff?.role?.trim();
  return role || null;
}

export async function getTransactions(): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(TRANSACTION_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getTransactionsByType(type: TransactionType): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(TRANSACTION_SELECT)
    .eq('type', type)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getTransactionsByTypes(types: TransactionType[]): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(TRANSACTION_SELECT)
    .in('type', types)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getTransactionsWithStockDetailsByType(
  type: TransactionType,
): Promise<TransactionWithStockDetails[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(TRANSACTION_WITH_STOCK_SELECT)
    .eq('type', type)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data || []) as TransactionWithStockDetails[]).map(
    hydrateTransactionStockDetails,
  );
}

export async function getTransactionsWithStockDetailsByTypes(
  types: TransactionType[],
): Promise<TransactionWithStockDetails[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(TRANSACTION_WITH_STOCK_SELECT)
    .in('type', types)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data || []) as TransactionWithStockDetails[]).map(
    hydrateTransactionStockDetails,
  );
}

export async function createTransaction(tx: TransactionInsert): Promise<Transaction> {
  const { data, error } = await supabase.from('transactions').insert(tx).select(TRANSACTION_SELECT).single();
  if (error) throw error;
  if (!data) throw new Error('Failed to create transaction');
  return data;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}
