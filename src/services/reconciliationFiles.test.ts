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

  it('unwraps the sheet result returned by read-excel-file for a workbook', () => {
    const rows = normalizeSpreadsheetRows([{
      sheet: 'Sheet1',
      data: [
        ['TGL', 'TOTAL HARGA'],
        ['18/07/2026', 3_800_000],
      ],
    }]);

    expect(rows).toEqual([
      ['TGL', 'TOTAL HARGA'],
      ['18/07/2026', 3_800_000],
    ]);
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

  it('uses transfer and cash columns from the bookkeeping sheet without counting total twice', async () => {
    const file = new File(
      [
        'NO,TGL,NAMA,ITEM,IMEI,TOTAL HARGA,TRANSFER,CASH\n',
        '1,18/07/2026,VEMAS,iPhone 12 64GB,358259429372105,3800000,0,3800000\n',
        '2,18/07/2026,RIANDA,iPhone 13 Pro 128GB,356673374736571,6400000,6400000,0\n',
        'TOTAL,,,,,,6400000,3800000',
      ],
      'table-pembukuan.csv',
      { type: 'text/csv' },
    );

    const result = await parseReconciliationFile({
      file,
      source: 'manual',
      defaultDate: '2026-07-19',
    });

    expect(result.entries).toHaveLength(2);
    expect(result.entries).toMatchObject([
      {
        direction: 'in',
        amount: 3_800_000,
        accountName: 'Cash',
        description: 'VEMAS - iPhone 12 64GB',
        reference: '358259429372105',
      },
      {
        direction: 'in',
        amount: 6_400_000,
        accountName: 'Transfer',
        description: 'RIANDA - iPhone 13 Pro 128GB',
        reference: '356673374736571',
      },
    ]);
  });
});
