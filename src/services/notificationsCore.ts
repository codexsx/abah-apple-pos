// Feature: user-management (Phase 9)
// Pure, dependency-free domain module. No React, no Supabase imports.
//
// This is the property-tested core for the Phase 9 notifications feature: it
// derives a flat, ordered list of actionable alerts from the current business
// snapshot (HP stock, accessories, cash/bank accounts, agents, and recent
// transaction activity) and counts how many of those alerts require action.
// All functions are TOTAL and PURE: null/undefined arrays are coerced to [],
// non-number fields are coerced to 0, inputs are never mutated, and nothing
// ever throws. UI strings are Indonesian; money is shown as plain integers.

// ---------- Domain types ----------

/** A single derived notification rendered in the UI (Req 7.1–7.5). */
export interface NotificationItem {
  id: string;
  kind: string; // e.g. 'stock_out' | 'stock_low' | 'overdraft' | 'agent_receivable' | 'activity'
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  route: string; // always non-empty: where clicking navigates
}

/** Minimal HP stock shape consumed for stock alerts (Req 7.1, 7.2). */
export interface NotificationStockLike {
  model: string;
  count: number;
  status: string;
}

/** Minimal accessory shape consumed for stock alerts (Req 7.1, 7.2). */
export interface NotificationAccessoryLike {
  name: string;
  stock: number;
  status: string;
}

/** Minimal cash/bank account shape consumed for overdraft alerts (Req 7.3). */
export interface NotificationAccountLike {
  name: string;
  current_balance: number;
}

/** Minimal agent shape consumed for receivable alerts (Req 7.4). */
export interface NotificationAgentLike {
  name: string;
  outstandingDebt: number;
}

/** The full snapshot the core derives notifications from (Req 7.1–7.5). */
export interface NotificationInput {
  stock: NotificationStockLike[];
  accessories: NotificationAccessoryLike[];
  accounts: NotificationAccountLike[];
  agents: NotificationAgentLike[];
  recentTxCount: number; // number of transactions in a recent window
  lastTxAt: string | null; // ISO timestamp of the most recent transaction, or null
}

// ---------- Helpers ----------

/** Coerce a possibly-absent array to a safe array, treating
 *  null/undefined/non-array as [] (mirrors financeCore null-safety). */
function toArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

/** Coerce a possibly-absent numeric input to a safe number, treating
 *  null/undefined/NaN/non-number as 0 (mirrors financeCore toAmount). */
function toNumber(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return value;
}

/** Coerce a possibly-absent string to a safe, upper-cased, trimmed token
 *  for case-insensitive status comparison (Req 7.1, 7.2). */
function toStatusToken(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

/** Coerce a possibly-absent string to a safe display string. */
function toText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// ---------- Derivation ----------

/**
 * Derive the ordered list of notifications from the current snapshot
 * (Req 7.1–7.5). The list is built in a fixed order: HP stock, accessories,
 * accounts (overdraft), agents (receivable), then a single activity alert.
 *
 * Stock/accessory rules (Req 7.1, 7.2), status compared case-insensitively:
 *  - Out of stock — count <= 0 OR status === 'HABIS' — `critical`,
 *    kind 'stock_out'.
 *  - Low — status === 'MENIPIS' (low-but-not-empty) — `warning`,
 *    kind 'stock_low'.
 *  - Otherwise no alert.
 * Accounts (Req 7.3): current_balance < 0 — `critical`, kind 'overdraft'.
 * Agents (Req 7.4): outstandingDebt > 0 — `warning`, kind 'agent_receivable'.
 * Activity (Req 7.5): recentTxCount > 0 — exactly ONE `info` alert,
 * kind 'activity'; recentTxCount <= 0 emits nothing.
 *
 * Every `id` is unique and stable-ish (kind + index + identifier) and every
 * `route` is non-empty. Inputs are never mutated; nothing throws.
 */
export function deriveNotifications(input: NotificationInput): NotificationItem[] {
  const safe = input ?? ({} as NotificationInput);
  const items: NotificationItem[] = [];

  // --- HP stock (Req 7.1, 7.2) ---
  toArray(safe.stock).forEach((raw, index) => {
    const model = toText(raw?.model) || '(tanpa model)';
    const count = toNumber(raw?.count);
    const status = toStatusToken(raw?.status);

    if (count <= 0 || status === 'HABIS') {
      items.push({
        id: `stock_out-stock-${index}-${model}`,
        kind: 'stock_out',
        severity: 'critical',
        title: 'Stok habis',
        detail: `Stok HP ${model} habis.`,
        route: '/stok',
      });
    } else if (status === 'MENIPIS') {
      items.push({
        id: `stock_low-stock-${index}-${model}`,
        kind: 'stock_low',
        severity: 'warning',
        title: 'Stok menipis',
        detail: `Stok HP ${model} menipis (sisa ${count}).`,
        route: '/stok',
      });
    }
  });

  // --- Accessories (Req 7.1, 7.2) ---
  toArray(safe.accessories).forEach((raw, index) => {
    const name = toText(raw?.name) || '(tanpa nama)';
    const stock = toNumber(raw?.stock);
    const status = toStatusToken(raw?.status);

    if (stock <= 0 || status === 'HABIS') {
      items.push({
        id: `stock_out-accessory-${index}-${name}`,
        kind: 'stock_out',
        severity: 'critical',
        title: 'Stok habis',
        detail: `Stok pelengkap ${name} habis.`,
        route: '/stok/pelengkap',
      });
    } else if (status === 'MENIPIS') {
      items.push({
        id: `stock_low-accessory-${index}-${name}`,
        kind: 'stock_low',
        severity: 'warning',
        title: 'Stok menipis',
        detail: `Stok pelengkap ${name} menipis (sisa ${stock}).`,
        route: '/stok/pelengkap',
      });
    }
  });

  // --- Accounts / overdraft (Req 7.3) ---
  toArray(safe.accounts).forEach((raw, index) => {
    const name = toText(raw?.name) || '(tanpa nama)';
    const balance = toNumber(raw?.current_balance);

    if (balance < 0) {
      items.push({
        id: `overdraft-account-${index}-${name}`,
        kind: 'overdraft',
        severity: 'critical',
        title: 'Saldo minus',
        detail: `Saldo akun ${name} minus (${balance}).`,
        route: '/akun-kas',
      });
    }
  });

  // --- Agents / receivable (Req 7.4) ---
  toArray(safe.agents).forEach((raw, index) => {
    const name = toText(raw?.name) || '(tanpa nama)';
    const debt = toNumber(raw?.outstandingDebt);

    if (debt > 0) {
      items.push({
        id: `agent_receivable-agent-${index}-${name}`,
        kind: 'agent_receivable',
        severity: 'warning',
        title: 'Piutang agen',
        detail: `Agen ${name} memiliki piutang ${debt}.`,
        route: '/agen',
      });
    }
  });

  // --- Activity (Req 7.5) ---
  const recentTxCount = toNumber(safe.recentTxCount);
  if (recentTxCount > 0) {
    const lastTxAt =
      typeof safe.lastTxAt === 'string' && safe.lastTxAt.length > 0
        ? safe.lastTxAt
        : null;
    const detail =
      lastTxAt != null
        ? `${recentTxCount} transaksi terbaru (terakhir ${lastTxAt}).`
        : `${recentTxCount} transaksi terbaru.`;
    items.push({
      id: 'activity-0',
      kind: 'activity',
      severity: 'info',
      title: 'Aktivitas transaksi',
      detail,
      route: '/riwayat/penjualan',
    });
  }

  return items;
}

/**
 * Count the actionable notifications — those whose `severity` is not 'info'
 * (Req 7.6). Null-safe (a null/undefined/non-array input counts as 0); never
 * throws and never mutates its input.
 */
export function countActionable(items: NotificationItem[]): number {
  return toArray(items).reduce(
    (count, item) => (item?.severity !== 'info' ? count + 1 : count),
    0,
  );
}
