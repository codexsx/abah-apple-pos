import { describe, expect, it } from 'vitest';
import { parseAiBankStatement } from './pdfBankStatement.js';

describe('parseAiBankStatement', () => {
  it('normalizes structured Kimi output into bank reconciliation entries', () => {
    const result = parseAiBankStatement({
      entries: [
        {
          date: '12 Jul 2026',
          direction: 'out',
          amount: '60000',
          accountName: 'BCA Tahapan 1234',
          description: 'BI-FAST DB - transfer',
          reference: 'FTSCY-1',
        },
      ],
    }, {
      defaultDate: '2026-07-12',
      fileName: 'myBCA.pdf',
      accountName: 'Mutasi Bank',
    });

    expect(result.entries).toEqual([expect.objectContaining({
      id: 'bank:myBCA.pdf:1',
      date: '2026-07-12',
      direction: 'out',
      amount: 60000,
      accountName: 'BCA Tahapan 1234',
    })]);
  });

  it('rejects non-positive or malformed amounts without throwing', () => {
    const result = parseAiBankStatement({
      entries: [{ amount: 0 }, { amount: 'not-a-number' }],
    }, {
      defaultDate: '2026-07-12',
      fileName: 'myBCA.pdf',
      accountName: 'Mutasi Bank',
    });

    expect(result.entries).toEqual([]);
    expect(result.warnings[0]).toContain('Tidak ada transaksi valid');
  });
});
