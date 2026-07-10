import { describe, expect, it } from 'vitest';
import {
  buildReconciliation,
  type ReconciliationEntry,
} from '@/services/reconciliationCore';

function entry(
  id: string,
  source: ReconciliationEntry['source'],
  amount: number,
  overrides: Partial<ReconciliationEntry> = {},
): ReconciliationEntry {
  return {
    id,
    source,
    date: '2026-07-09',
    direction: 'in',
    amount,
    accountName: 'BCA',
    description: `Transaksi ${id}`,
    ...overrides,
  };
}

describe('buildReconciliation', () => {
  it('matches webapp, manual, and bank rows with exact nominal/date/account', () => {
    const result = buildReconciliation({
      webappEntries: [entry('w1', 'webapp', 3_500_000)],
      manualEntries: [entry('m1', 'manual', 3_500_000)],
      bankEntries: [entry('b1', 'bank', 3_500_000)],
    });

    expect(result.summary.webapp.net).toBe(3_500_000);
    expect(result.summary.webappVsManualNet).toBe(0);
    expect(result.summary.webappVsBankNet).toBe(0);
    expect(result.pairs.filter((pair) => pair.status === 'exact').length).toBeGreaterThanOrEqual(2);
    expect(result.issues).toHaveLength(0);
  });

  it('flags a bank settlement difference as possible admin fee', () => {
    const result = buildReconciliation({
      webappEntries: [entry('w1', 'webapp', 3_970_000)],
      manualEntries: [],
      bankEntries: [entry('b1', 'bank', 3_940_000)],
      bankFeeTolerance: 50_000,
    });

    expect(result.issues.some((issue) => issue.kind === 'possible_bank_fee')).toBe(true);
    expect(result.issues.find((issue) => issue.kind === 'possible_bank_fee')?.amountImpact).toBe(30_000);
  });

  it('detects real rows missing from the webapp', () => {
    const result = buildReconciliation({
      webappEntries: [],
      manualEntries: [entry('m1', 'manual', 100_000)],
      bankEntries: [entry('b1', 'bank', 100_000)],
    });

    expect(result.issues.filter((issue) => issue.kind === 'missing_in_webapp')).toHaveLength(2);
    expect(result.summary.criticalCount).toBe(2);
  });

  it('keeps money out totals negative in the net comparison', () => {
    const result = buildReconciliation({
      webappEntries: [
        entry('w1', 'webapp', 500_000, { direction: 'out', description: 'Biaya admin' }),
      ],
      manualEntries: [
        entry('m1', 'manual', 500_000, { direction: 'out', description: 'Biaya admin' }),
      ],
      bankEntries: [],
    });

    expect(result.summary.webapp.moneyOut).toBe(500_000);
    expect(result.summary.webapp.net).toBe(-500_000);
    expect(result.summary.webappVsManualNet).toBe(0);
  });
});
