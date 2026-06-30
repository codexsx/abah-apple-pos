// Feature: stock-integrity
// Pure, dependency-free integrity checks for the stock catalog.
// All functions accept StockItem[] and return structured issues; no DB access.

import type { StockItem } from '@/services/stock';
import type { StockStatus } from '@/services/stockCore';

export interface DuplicateImeiIssue {
  type: 'duplicate-imei';
  imei: string;
  count: number;
  items: StockItem[];
}

export interface InvalidStatusIssue {
  type: 'invalid-status';
  item: StockItem;
}

export interface MissingImeiIssue {
  type: 'missing-imei';
  item: StockItem;
}

export interface NegativeCountIssue {
  type: 'negative-count';
  item: StockItem;
}

export type ProblematicUnitIssue =
  | InvalidStatusIssue
  | MissingImeiIssue
  | NegativeCountIssue;

export interface IntegrityResult {
  totalScanned: number;
  duplicateImeis: DuplicateImeiIssue[];
  problematicUnits: ProblematicUnitIssue[];
}

/**
 * Find IMEIs that appear on more than one stock item. Only rows with has_imei
 * and a non-empty IMEI are considered.
 */
export function findDuplicateIMEIs(items: StockItem[]): DuplicateImeiIssue[] {
  const groups = new Map<string, StockItem[]>();
  for (const item of items) {
    if (!item.has_imei || !item.imei) continue;
    const bucket = groups.get(item.imei);
    if (bucket) bucket.push(item);
    else groups.set(item.imei, [item]);
  }

  return Array.from(groups.entries())
    .filter(([, bucket]) => bucket.length > 1)
    .map(([imei, bucket]) => ({
      type: 'duplicate-imei' as const,
      imei,
      count: bucket.length,
      items: bucket,
    }))
    .sort((a, b) => a.imei.localeCompare(b.imei));
}

/**
 * Find rows whose status is not one of the canonical StockStatus values.
 */
export function findInvalidStatuses(
  items: StockItem[],
  validStatuses: readonly StockStatus[],
): InvalidStatusIssue[] {
  const valid = new Set<string>(validStatuses);
  return items
    .filter((item) => !valid.has(item.status))
    .map((item) => ({ type: 'invalid-status' as const, item }));
}

/**
 * Find rows marked has_imei but with empty/null IMEI.
 */
export function findMissingIMEIs(items: StockItem[]): MissingImeiIssue[] {
  return items
    .filter((item) => item.has_imei && !item.imei)
    .map((item) => ({ type: 'missing-imei' as const, item }));
}

/**
 * Find rows with negative count.
 */
export function findNegativeCounts(items: StockItem[]): NegativeCountIssue[] {
  return items
    .filter((item) => (item.count ?? 0) < 0)
    .map((item) => ({ type: 'negative-count' as const, item }));
}

/**
 * Run the full integrity check suite on a stock snapshot.
 */
export function runStockIntegrityCheck(
  items: StockItem[],
  validStatuses: readonly StockStatus[],
): IntegrityResult {
  return {
    totalScanned: items.length,
    duplicateImeis: findDuplicateIMEIs(items),
    problematicUnits: [
      ...findInvalidStatuses(items, validStatuses),
      ...findMissingIMEIs(items),
      ...findNegativeCounts(items),
    ],
  };
}
