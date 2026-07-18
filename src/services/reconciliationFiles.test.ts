import { describe, expect, it } from 'vitest';
import {
  normalizeSpreadsheetRows,
  parseReconciliationFile,
} from '@/services/reconciliationFiles';

describe('reconciliation file parsing', () => {
  it('normalizes iterable spreadsheet rows before reconciliation reads cells', () => {
    const rows = normalizeSpreadsheetRows([
      new Set(['Tanggal', 'Nominal']),
      new Set(['2026-07-19', 250_000]),
    ]);

    expect(rows).toEqual([
      ['Tanggal', 'Nominal'],
      ['2026-07-19', 250_000],
    ]);
  });

  it('returns a clear error for spreadsheet rows that cannot be read', () => {
    expect(() => normalizeSpreadsheetRows([{ tanggal: '2026-07-19' }]))
      .toThrow('Format Excel tidak valid pada baris 1.');
  });

  it('continues to parse a manual CSV table', async () => {
    const file = new File(
      ['Tanggal,Nominal,Arah,Keterangan\n2026-07-19,"250.000",Masuk,Setoran kas'],
      'closing.csv',
      { type: 'text/csv' },
    );

    const result = await parseReconciliationFile({
      file,
      source: 'manual',
      defaultDate: '2026-07-19',
    });

    expect(result.entries).toMatchObject([
      {
        direction: 'in',
        amount: 250_000,
        description: 'Setoran kas',
      },
    ]);
  });
});
