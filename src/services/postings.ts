// Feature: transaction-account-integration
// Service layer — thin wrappers over the two atomic Postgres RPCs.
//
// These call the database functions that record a transaction (or agent
// payment) together with its 1–2 ledger postings inside a single database
// transaction, so balances always reflect real money movement (Req 3). Errors
// are rethrown using the existing thrown-error pattern; on failure the database
// rolls back the whole unit and nothing is persisted (Req 3.3, 3.4).

import { supabase } from '@/lib/supabase';
import type { Posting } from '@/services/paymentPosting';
import type { StockStatus } from '@/services/stockCore';

export interface RecordTransactionInput {
  type: string; // 'Penjualan' | ... | 'Pemasukan Lain'
  description: string;
  detail: string;
  amount: number | null; // settled/transaction amount, integer IDR
  postings: Posting[]; // 0..2 entries
}

/**
 * Calls record_transaction_with_postings; returns the new transaction id.
 * Throws on RPC error (atomic: nothing persisted on failure — Req 3.3, 3.4).
 */
export async function recordTransactionWithPostings(
  input: RecordTransactionInput,
): Promise<string> {
  const { data, error } = await supabase.rpc('record_transaction_with_postings', {
    p_type: input.type,
    p_description: input.description,
    p_detail: input.detail,
    p_amount: input.amount,
    p_postings: input.postings.map((p) => ({
      account_id: p.account_id,
      direction: p.direction,
      amount: p.amount,
      note: '',
    })),
  });
  if (error) throw error;
  return data as string;
}

/** A single accessory consumed in a sale (decrements accessory_stock and its
 *  cost rolls into the sold unit's modal). */
export interface SaleAccessoryInput {
  id: string;
  qty: number;
  unit_cost: number; // integer IDR per unit
}

/**
 * Calls record_sale_with_postings: records the Penjualan transaction + postings
 * AND marks each sold stock unit (count>1 decrements, else status -> TERJUAL),
 * AND consumes any accessories (decrements accessory_stock, rolling their cost
 * into the first sold unit's cost_price), all atomically. `stockIds` are the
 * real `stock_items.id` of the sold units. Returns the new transaction id;
 * throws on RPC error (nothing persisted).
 */
export async function recordSaleWithPostings(
  input: RecordTransactionInput & {
    stockIds: string[];
    accessories?: SaleAccessoryInput[];
  },
): Promise<string> {
  const { data, error } = await supabase.rpc('record_sale_with_postings', {
    p_type: input.type,
    p_description: input.description,
    p_detail: input.detail,
    p_amount: input.amount,
    p_postings: input.postings.map((p) => ({
      account_id: p.account_id,
      direction: p.direction,
      amount: p.amount,
      note: '',
    })),
    p_stock_ids: input.stockIds,
    p_accessories: (input.accessories ?? []).map((a) => ({
      id: a.id,
      qty: a.qty,
      unit_cost: a.unit_cost,
    })),
  });
  if (error) throw error;
  return data as string;
}

/** A single purchased unit to be inserted as a new stock row. */
export interface PurchaseItemInput {
  model: string;
  capacity: string;
  condition: string;
  color: string;
  imei?: string | null;
  defect_description?: string;
  status?: Exclude<StockStatus, 'TERJUAL'>;
  /** Harga jual (selling price). */
  price: number;
  /** Harga modal/beli (cost). Defaults to price when omitted. */
  cost_price?: number;
  count?: number;
}

export interface PurchaseAgentDebtInput {
  agentId: string;
  amount: number;
  method?: 'Hutang';
  note?: string;
}

export interface AccessoryPurchaseItemInput {
  id?: string | null;
  name: string;
  category: 'charger' | 'tempered_glass' | 'case' | 'kotak' | 'paperbag';
  qty: number;
  unit_cost: number;
  min_stock?: number;
}

/**
 * Calls record_purchase_with_postings: records the Pembelian transaction +
 * postings AND inserts each bought unit as a new stock_items row, all
 * atomically. Returns the new transaction id; throws on RPC error (e.g. a
 * duplicate IMEI rolls back the whole unit — nothing persisted).
 */
export async function recordPurchaseWithPostings(
  input: RecordTransactionInput & {
    items: PurchaseItemInput[];
    agentDebt?: PurchaseAgentDebtInput | null;
  },
): Promise<string> {
  const { data, error } = await supabase.rpc('record_purchase_with_postings', {
    p_type: input.type,
    p_description: input.description,
    p_detail: input.detail,
    p_amount: input.amount,
    p_postings: input.postings.map((p) => ({
      account_id: p.account_id,
      direction: p.direction,
      amount: p.amount,
      note: '',
    })),
    p_items: input.items.map((it) => ({
      model: it.model,
      capacity: it.capacity,
      condition: it.condition,
      color: it.color,
      imei: it.imei ?? null,
      defect_description: it.defect_description ?? '',
      status: it.status ?? 'READY',
      price: it.price,
      cost_price: it.cost_price ?? it.price,
      count: it.count ?? 1,
    })),
    p_agent_debt: input.agentDebt
      ? {
          agent_id: input.agentDebt.agentId,
          amount: input.agentDebt.amount,
          method: input.agentDebt.method ?? 'Hutang',
          note: input.agentDebt.note ?? '',
        }
      : null,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Records a pelengkap purchase as inventory movement + money_out ledger and
 * restocks accessory_stock atomically. COGS is recognized when sales consume
 * that accessory with a non-zero unit_cost.
 */
export async function recordAccessoryPurchaseWithPostings(
  input: RecordTransactionInput & {
    accessories: AccessoryPurchaseItemInput[];
  },
): Promise<string> {
  const { data, error } = await supabase.rpc('record_accessory_purchase_with_postings', {
    p_type: input.type,
    p_description: input.description,
    p_detail: input.detail,
    p_amount: input.amount,
    p_postings: input.postings.map((p) => ({
      account_id: p.account_id,
      direction: p.direction,
      amount: p.amount,
      note: '',
    })),
    p_accessories: input.accessories.map((item) => ({
      id: item.id ?? null,
      name: item.name,
      category: item.category,
      qty: item.qty,
      unit_cost: item.unit_cost,
      min_stock: item.min_stock ?? 0,
    })),
  });
  if (error) throw error;
  return data as string;
}

/**
 * Calls record_tukar_tambah_with_postings: records the Tukar Tambah transaction
 * + postings AND, atomically, (1) sells the HP Keluar unit (`sellStockId`:
 * count>1 decrements, else status -> TERJUAL) and (2) inserts the HP Masuk
 * trade-in (`newItem`) as a new READY stock_items row. When Selisih === 0 the
 * caller passes an empty `postings` array (no money moves) but the transaction
 * and both stock effects are still recorded. Returns the new transaction id;
 * throws on RPC error (nothing persisted — e.g. unit not found or duplicate IMEI).
 */
export async function recordTukarTambahWithPostings(
  input: RecordTransactionInput & {
    sellStockId: string;
    newItem: PurchaseItemInput;
  },
): Promise<string> {
  const { data, error } = await supabase.rpc('record_tukar_tambah_with_postings', {
    p_type: input.type,
    p_description: input.description,
    p_detail: input.detail,
    p_amount: input.amount,
    p_postings: input.postings.map((p) => ({
      account_id: p.account_id,
      direction: p.direction,
      amount: p.amount,
      note: '',
    })),
    p_sell_stock_id: input.sellStockId,
    p_new_item: {
      model: input.newItem.model,
      capacity: input.newItem.capacity,
      condition: input.newItem.condition,
      color: input.newItem.color,
      imei: input.newItem.imei ?? null,
      price: input.newItem.price,
      cost_price: input.newItem.cost_price ?? input.newItem.price,
      count: input.newItem.count ?? 1,
    },
  });
  if (error) throw error;
  return data as string;
}

export interface BuybackItemInput extends PurchaseItemInput {
  battery_health?: number | null;
}

/**
 * Records a Buyback as one atomic unit: transaction history, money_out ledger,
 * and the re-acquired HP row in stock_items. A previously-sold IMEI may be
 * re-entered, but an active duplicate IMEI is rejected by the database.
 */
export async function recordBuybackWithPostings(
  input: RecordTransactionInput & {
    item: BuybackItemInput;
  },
): Promise<string> {
  const { data, error } = await supabase.rpc('record_buyback_with_postings', {
    p_type: input.type,
    p_description: input.description,
    p_detail: input.detail,
    p_amount: input.amount,
    p_postings: input.postings.map((p) => ({
      account_id: p.account_id,
      direction: p.direction,
      amount: p.amount,
      note: '',
    })),
    p_item: {
      model: input.item.model,
      capacity: input.item.capacity,
      condition: input.item.condition,
      color: input.item.color,
      imei: input.item.imei ?? null,
      status: input.item.status ?? 'READY',
      price: input.item.price,
      cost_price: input.item.cost_price ?? input.item.price,
      battery_health: input.item.battery_health ?? null,
      defect_description: input.item.defect_description ?? '',
    },
  });
  if (error) throw error;
  return data as string;
}

export interface RecordAgentPaymentInput {
  agentId: string;
  amount: number;
  method: 'Cash' | 'Transfer';
  note: string;
  accountId: string;
}

/**
 * Calls record_agent_payment_with_posting; returns the new agent_transaction
 * id. Throws on RPC error (atomic — Req 9.6).
 */
export async function recordAgentPaymentWithPosting(
  input: RecordAgentPaymentInput,
): Promise<string> {
  const { data, error } = await supabase.rpc('record_agent_payment_with_posting', {
    p_agent_id: input.agentId,
    p_amount: input.amount,
    p_method: input.method,
    p_note: input.note,
    p_account_id: input.accountId,
  });
  if (error) throw error;
  return data as string;
}

export interface RecordAccountTransferInput {
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  note?: string;
}

/**
 * Calls record_account_transfer; returns the generated transfer source
 * reference. Throws on RPC error (atomic two-posting move — Req 6.3).
 */
export async function recordAccountTransfer(
  input: RecordAccountTransferInput,
): Promise<string> {
  const { data, error } = await supabase.rpc('record_account_transfer', {
    p_amount: input.amount,
    p_from_account_id: input.fromAccountId,
    p_to_account_id: input.toAccountId,
    p_note: input.note ?? '',
  });
  if (error) throw error;
  return data as string;
}

export interface RecordWagePaymentInput {
  technician: string;
  amount: number;
  accountId: string;
  note?: string;
  /** service_records ids being settled by this payment (marked wage_paid). */
  serviceIds: string[];
}

/**
 * Calls record_wage_payment_with_posting: records an 'Upah Servis' expense
 * transaction + a money_out posting from the chosen account AND marks the given
 * service_records as wage_paid, all atomically. Returns the new transaction id;
 * throws on RPC error (nothing persisted).
 */
export async function recordWagePaymentWithPosting(
  input: RecordWagePaymentInput,
): Promise<string> {
  const { data, error } = await supabase.rpc('record_wage_payment_with_posting', {
    p_technician: input.technician,
    p_amount: input.amount,
    p_account_id: input.accountId,
    p_note: input.note ?? '',
    p_service_ids: input.serviceIds,
  });
  if (error) throw error;
  return data as string;
}
