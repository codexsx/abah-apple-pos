// Feature: finance-menu
// Pure, dependency-free domain module. No React, no Supabase imports.
//
// This is the property-tested core for the Phase 8 finance (Keuangan) feature:
// it classifies transactions by type, filters them to a reporting period, and
// computes the read-only roll-ups (Revenue, COGS, Expenses, Net Profit,
// Inventory Value, Total Asset). All figures are integer IDR; a null/NaN amount
// counts as 0. Net profit and total asset are never clamped and may be negative.

// ---------- Type sets ----------

/** Transaction types that contribute to Revenue (Req 1.1). */
export const REVENUE_TYPES = ['Penjualan', 'Servis', 'Pemasukan Lain'] as const;

/**
 * Transaction types that contribute to legacy COGS / purchases proxy (Req 1.2).
 * Pembelian Pelengkap is intentionally excluded: it only reduces cash/bank and
 * becomes HPP when consumed by a sold unit's cost_price.
 */
export const COST_TYPES = ['Pembelian'] as const;

/**
 * Transaction types that contribute to Expenses (Req 1.3). Pembelian Pelengkap
 * is inventory, not operating expense, to avoid double-counting against HPP.
 */
export const EXPENSE_TYPES = ['Pengeluaran', 'Upah Servis'] as const;

/** Stock status that identifies a sold unit for true-cost COGS (Req 1.2b). */
export const SOLD_STATUS = 'TERJUAL' as const;

// ---------- Domain types ----------

/** Minimal transaction shape consumed by the core (Req 1.1–1.4). */
export interface FinanceTxLike {
  type: string;
  amount: number | null;
  created_at: string;
}

/** Minimal stock-unit shape consumed for inventory valuation + COGS (Req 4.1). */
export interface FinanceStockLike {
  price: number;
  count: number;
  cost_price: number;
  status: string;
}

/** Inclusive reporting period; a null bound means unbounded on that side (Req 3.1–3.3). */
export interface FinancePeriod {
  from: string | null;
  to: string | null;
}

/** Component inputs for the Total Asset formula (Req 4.2, 4.3). */
export interface TotalAssetInput {
  cashBankTotal: number;
  inventoryValue: number;
  agentReceivable: number;
  agentDepositLiability: number;
}

/** The read-only finance aggregate returned to the UI. */
export interface FinanceSummary {
  period: FinancePeriod;
  revenue: number;
  cogs: number;
  expenses: number;
  netProfit: number;
  cashBankTotal: number;
  inventoryValue: number;
  agentReceivable: number;
  agentDepositLiability: number;
  totalAsset: number;
}

// ---------- Helpers ----------

/** Coerce a possibly-absent numeric input to a safe amount, treating
 *  null/undefined/NaN as 0 (mirrors finalization.ts; Req 1.4). */
function toAmount(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return value;
}

// ---------- Period filtering ----------

/**
 * Return the items whose `created_at` falls within the inclusive `[from, to]`
 * range (Req 3.1, 3.2, 3.3). Bounds are compared by parsed epoch milliseconds
 * (`Date.parse`) rather than lexicographically, so mixed ISO formats compare
 * correctly. A null `from`/`to` is unbounded on that side; a non-null but
 * unparseable bound is also treated as unbounded (never throws). An item whose
 * `created_at` is unparseable is included only when neither active bound
 * constrains it. The input array is never mutated (a new array is returned).
 */
export function filterByPeriod<T extends { created_at: string }>(
  txs: T[],
  from: string | null,
  to: string | null,
): T[] {
  const fromMsRaw = from == null ? NaN : Date.parse(from);
  const toMsRaw = to == null ? NaN : Date.parse(to);
  const hasFrom = from != null && !Number.isNaN(fromMsRaw);
  const hasTo = to != null && !Number.isNaN(toMsRaw);

  return txs.filter((tx) => {
    const t = Date.parse(tx.created_at);
    if (Number.isNaN(t)) {
      // Unparseable timestamp: cannot satisfy any active bound.
      return !hasFrom && !hasTo;
    }
    if (hasFrom && t < fromMsRaw) return false;
    if (hasTo && t > toMsRaw) return false;
    return true;
  });
}

// ---------- Type classification ----------

/**
 * Σ of `toAmount(amount)` over the transactions whose `type` is in `types`
 * (Req 1.1–1.4). Null amounts count as 0; non-matching types contribute 0.
 */
export function sumByTypes(
  txs: FinanceTxLike[],
  types: readonly string[],
): number {
  return txs.reduce(
    (sum, tx) => (types.includes(tx.type) ? sum + toAmount(tx.amount) : sum),
    0,
  );
}

/** Revenue = Σ amounts of REVENUE_TYPES transactions (Req 1.1). */
export function computeRevenue(txs: FinanceTxLike[]): number {
  return sumByTypes(txs, REVENUE_TYPES);
}

/** COGS = Σ amounts of COST_TYPES transactions; purchases proxy (Req 1.2). */
export function computeCOGS(txs: FinanceTxLike[]): number {
  return sumByTypes(txs, COST_TYPES);
}

/**
 * True COGS = Σ `toAmount(cost_price) × toAmount(count)` over units whose
 * status is `SOLD_STATUS` (Req 1.2b). This replaces the purchase-proxy COGS
 * with the actual cost of units that have been sold.
 */
export function computeCOGSFromSoldItems(items: FinanceStockLike[]): number {
  return items.reduce(
    (sum, item) =>
      item.status === SOLD_STATUS
        ? sum + toAmount(item.cost_price) * toAmount(item.count)
        : sum,
    0,
  );
}

/** Expenses = Σ amounts of EXPENSE_TYPES transactions (Req 1.3). */
export function computeExpenses(txs: FinanceTxLike[]): number {
  return sumByTypes(txs, EXPENSE_TYPES);
}

// ---------- Roll-ups ----------

/** Net profit = revenue − cogs − expenses; not clamped, may be negative (Req 2.1, 2.2, 2.3). */
export function computeNetProfit(
  revenue: number,
  cogs: number,
  expenses: number,
): number {
  return revenue - cogs - expenses;
}

/**
 * Inventory value = Σ `toAmount(price) × toAmount(count)` over READY units only
 * (Req 4.1, 4.4). Non-READY units contribute 0; the result is 0 when no READY
 * unit exists.
 */
export function computeInventoryValue(items: FinanceStockLike[]): number {
  return items.reduce(
    (sum, item) =>
      item.status === 'READY'
        ? sum + toAmount(item.price) * toAmount(item.count)
        : sum,
    0,
  );
}

/**
 * Total asset = cashBankTotal + inventoryValue + agentReceivable −
 * agentDepositLiability (Req 4.2, 4.3). Not clamped; 0 when all components are 0.
 */
export function computeTotalAsset(input: TotalAssetInput): number {
  return (
    input.cashBankTotal +
    input.inventoryValue +
    input.agentReceivable -
    input.agentDepositLiability
  );
}

/**
 * Orchestrate the core roll-ups into a `FinanceSummary` (Req 1.x–4.x):
 * transactions are filtered by `input.period` first, then revenue/cogs/expenses/
 * netProfit are derived from the FILTERED list; inventory value is derived from
 * the stock items; total asset is derived from the components. The period is
 * echoed back unchanged.
 */
export function buildFinanceSummary(input: {
  period: FinancePeriod;
  transactions: FinanceTxLike[];
  stockItems: FinanceStockLike[];
  cashBankTotal: number;
  agentReceivable: number;
  agentDepositLiability: number;
}): FinanceSummary {
  const filtered = filterByPeriod(
    input.transactions,
    input.period.from,
    input.period.to,
  );

  const revenue = computeRevenue(filtered);
  const cogs = computeCOGSFromSoldItems(input.stockItems);
  const expenses = computeExpenses(filtered);
  const netProfit = computeNetProfit(revenue, cogs, expenses);
  const inventoryValue = computeInventoryValue(input.stockItems);
  const totalAsset = computeTotalAsset({
    cashBankTotal: input.cashBankTotal,
    inventoryValue,
    agentReceivable: input.agentReceivable,
    agentDepositLiability: input.agentDepositLiability,
  });

  return {
    period: input.period,
    revenue,
    cogs,
    expenses,
    netProfit,
    cashBankTotal: input.cashBankTotal,
    inventoryValue,
    agentReceivable: input.agentReceivable,
    agentDepositLiability: input.agentDepositLiability,
    totalAsset,
  };
}
