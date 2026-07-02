import { describe, expect, it } from 'vitest';
import { normalizeTransactionChangeRequest } from './transactionApprovalsCore';

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
});
