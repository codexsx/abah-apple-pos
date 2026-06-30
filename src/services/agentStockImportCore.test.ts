import { describe, expect, it } from 'vitest';

import {
  parseAgentDefectStockRows,
  toAgentDefectImportPayloadRows,
  type RawExcelRow,
} from '@/services/agentStockImportCore';

const header: RawExcelRow = {
  rowNumber: 2,
  values: ['', 'No', 'Model', 'Imei', 'BH', 'Carrier', 'Defect Description', 'Harga'],
};

function row(rowNumber: number, values: unknown[]): RawExcelRow {
  return { rowNumber, values };
}

describe('parseAgentDefectStockRows', () => {
  it('normalizes agent minus-unit rows from the Fahri Excel shape', () => {
    const preview = parseAgentDefectStockRows([
      row(1, ['Fahri']),
      header,
      row(3, ['', 1, 'iPhone 11 64GB', '3.52905118703077E14', 0.71, 'Unlock', 'Speaker Atas', 2650000]),
      row(4, ['', 2, 'iPhone 11 128GB', '352905118703078', '83%', 'Simlock', 'LCD Gantian', '2.800.000']),
    ]);

    expect(preview.summary).toMatchObject({
      totalRows: 2,
      validRows: 2,
      errorRows: 0,
      totalCost: 5450000,
      imeiCount: 2,
    });
    expect(preview.validRows[0]).toMatchObject({
      sourceRowNumber: 3,
      model: 'iPhone 11',
      capacity: '64GB',
      imei: '352905118703077',
      batteryHealth: 71,
      carrier: 'Unlock',
      defectDescription: 'Speaker Atas',
      costPrice: 2650000,
      condition: 'Second Minus',
      status: 'READY',
    });
    expect(toAgentDefectImportPayloadRows(preview.validRows)[0]).toMatchObject({
      has_imei: true,
      source_row_number: 3,
      cost_price: 2650000,
    });
  });

  it('marks rows without modal as errors and keeps valid rows importable', () => {
    const preview = parseAgentDefectStockRows([
      header,
      row(3, ['', 1, 'iPhone 13 128GB', '352905118703079', 0.91, 'Unlock', 'Baret', '']),
      row(4, ['', 2, 'iPhone 11 64GB', '352905118703080', 0.78, 'Unlock', 'WS', 2400000]),
    ]);

    expect(preview.summary.totalRows).toBe(2);
    expect(preview.summary.validRows).toBe(1);
    expect(preview.summary.errorRows).toBe(1);
    expect(preview.errorRows[0].errors).toContain('Harga modal kosong');
  });

  it('rejects duplicate IMEI values inside one file', () => {
    const preview = parseAgentDefectStockRows([
      header,
      row(3, ['', 1, 'iPhone 11 64GB', '352905118703081', 0.8, 'Unlock', 'Baret', 2500000]),
      row(4, ['', 2, 'iPhone 11 64GB', '352905118703081', 0.82, 'Unlock', 'WS', 2500000]),
    ]);

    expect(preview.summary.validRows).toBe(0);
    expect(preview.summary.errorRows).toBe(2);
    expect(preview.summary.duplicateImeis).toEqual(['352905118703081']);
    expect(preview.errorRows[0].errors).toContain('IMEI duplikat dalam file');
  });
});
