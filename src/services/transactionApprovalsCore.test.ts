import { describe, expect, it } from 'vitest';
import {
  isTransactionDeleteRequestSupported,
  normalizeTransactionChangeRequest,
  summarizeTransactionDetailForApproval,
} from './transactionApprovalsCore';

const current = {
  description: 'Penjualan 1 unit',
  detail: 'iPhone 11 128GB Black',
  amount: 3_500_000,
};

describe('normalizeTransactionChangeRequest', () => {
  it('trims the reason for delete requests', () => {
    const result = normalizeTransactionChangeRequest({
      action: 'delete',
      reason: '  Salah input transaksi  ',
      current,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.reason).toBe('Salah input transaksi');
      expect(result.payload.proposedDescription).toBeNull();
    }
  });

  it('rejects a blank reason before submitting', () => {
    const result = normalizeTransactionChangeRequest({
      action: 'delete',
      reason: '   ',
      current,
    });

    expect(result).toEqual({
      ok: false,
      message: 'Alasan wajib diisi.',
    });
  });

  it('rejects edit requests when nothing changed', () => {
    const result = normalizeTransactionChangeRequest({
      action: 'edit',
      reason: 'Rapikan detail',
      current,
      proposed: { ...current },
    });

    expect(result).toEqual({
      ok: false,
      message: 'Tidak ada perubahan untuk diajukan.',
    });
  });

  it('rejects negative proposed amounts', () => {
    const result = normalizeTransactionChangeRequest({
      action: 'edit',
      reason: 'Koreksi nominal',
      current,
      proposed: { ...current, amount: -1 },
    });

    expect(result).toEqual({
      ok: false,
      message: 'Nominal transaksi tidak boleh negatif.',
    });
  });

  it('allows delete approval requests for simple cash expense transaction types', () => {
    expect(isTransactionDeleteRequestSupported('Pengeluaran')).toBe(true);
    expect(isTransactionDeleteRequestSupported('Pemasukan Lain')).toBe(true);
    expect(isTransactionDeleteRequestSupported('Upah Servis')).toBe(true);
    expect(isTransactionDeleteRequestSupported('Tukar Tambah')).toBe(true);
    expect(isTransactionDeleteRequestSupported('Buyback')).toBe(true);
  });
});

describe('summarizeTransactionDetailForApproval', () => {
  it('shows full purchase unit identifiers including IMEI, BH, and minus note', () => {
    const detail = JSON.stringify({
      supplier: { name: 'OPAN' },
      specs: {
        model: 'iPhone 12 Pro Max',
        capacity: '128GB',
        condition: 'Second Inter Unlock Minus',
        color: 'Silver',
        quantity: 1,
      },
      units: [
        {
          imei: '359481985375087',
          color: 'Silver',
          batteryHealth: 86,
          costPrice: 5_000_000,
          sellingPrice: 6_000_000,
          defectDescription: 'Kaca Kamera Pecah',
        },
      ],
      payment: { debt: 5_000_000 },
    });

    expect(summarizeTransactionDetailForApproval(detail)).toEqual([
      'Agen: OPAN',
      'Unit 1: iPhone 12 Pro Max 128GB Second Inter Unlock Minus Silver',
      'IMEI: 359481985375087',
      'BH: 86%',
      'Modal: Rp 5.000.000',
      'Jual: Rp 6.000.000',
      'Minus: Kaca Kamera Pecah',
      'Hutang: Rp 5.000.000',
    ]);
  });

  it('shows sale unit identifiers from serialized sale detail', () => {
    const detail = JSON.stringify({
      units: [
        {
          model: 'iPhone 11',
          capacity: '128GB',
          condition: 'Unlock',
          color: 'Tosca',
          imei: '352914118821897',
          batteryHealth: 78,
          sellingPrice: 3_400_000,
          defectDescription: 'LCD gantian',
        },
      ],
      customer: { name: 'Adam' },
      payment: { cash: 3_400_000, transfer: 0 },
    });

    expect(summarizeTransactionDetailForApproval(detail)).toContain('IMEI: 352914118821897');
    expect(summarizeTransactionDetailForApproval(detail)).toContain('Customer: Adam');
  });

  it('shows buyback unit identifiers and buyback price', () => {
    const detail = JSON.stringify({
      kind: 'buyback',
      customer: { name: 'Adam' },
      unit: {
        model: 'iPhone 13',
        capacity: '128GB',
        condition: 'Second Inter Unlock',
        color: 'Midnight',
        imei: '351234567890123',
        batteryHealth: 88,
        defectDescription: 'Kamera jamur',
        costPrice: 4_800_000,
      },
      buybackPrice: 4_800_000,
      payment: { cash: 800_000, transfer: 4_000_000 },
    });

    const lines = summarizeTransactionDetailForApproval(detail);

    expect(lines).toEqual(expect.arrayContaining([
      'Customer: Adam',
      'Unit 1: iPhone 13 128GB Second Inter Unlock Midnight',
      'IMEI: 351234567890123',
      'BH: 88%',
      'Minus: Kamera jamur',
      'Buyback: Rp 4.800.000',
    ]));
  });
});
