import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Receipt } from './Receipt';
import type { ReceiptData } from '@/services/receipt';

// Phase 5 (sales-discount): receipt discount line behavior.
//
// The Receipt totals section renders, in order:
//   Subtotal → Diskon (only when totals.discount > 0, as "−{money}") →
//   Total Transaksi → Tunai → Transfer → Kembalian.
//
// These component tests use concrete ReceiptData literals (no fast-check).

/**
 * Re-create the component's id-ID currency formatter so the test computes the
 * exact monetary strings the component renders (2 decimal places, "," decimal
 * separator), e.g. 10000000 -> "Rp 10.000.000,00".
 */
const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const formatMoney = (amount: number): string => idrFormatter.format(amount);

/** Build a concrete ReceiptData snapshot with the new SaleTotals shape. */
function makeReceiptData(
  totals: ReceiptData['totals'],
): ReceiptData {
  return {
    units: [
      {
        imei: '356789012345678',
        model: 'iPhone 13',
        capacity: '128GB',
        condition: 'Bekas',
        color: 'Midnight',
        sellingPrice: 7_000_000,
      },
      {
        imei: '356789012345999',
        model: 'iPhone 12',
        capacity: '64GB',
        condition: 'Bekas',
        color: 'Blue',
        sellingPrice: 3_000_000,
      },
    ],
    items: [],
    bonuses: [],
    warranty: null,
    customerName: null,
    customerPhone: null,
    totals,
    payment: { cash: totals.paymentTotal, transfer: 0 },
    finalizedAt: new Date(Date.UTC(2025, 0, 15, 3, 30)).toISOString(),
  };
}

describe('Receipt — sales-discount line (Phase 5)', () => {
  it('renders Subtotal, Diskon, and Total Transaksi lines with formatted values when discount > 0', () => {
    const totals = {
      subtotal: 10_000_000,
      discount: 1_500_000,
      transactionTotal: 8_500_000,
      paymentTotal: 8_500_000,
      changeDue: 0,
    };

    const { container } = render(<Receipt data={makeReceiptData(totals)} />);
    const text = container.textContent ?? '';

    // Labels are present.
    expect(screen.getByText('Subtotal')).toBeTruthy();
    expect(screen.getByText('Diskon')).toBeTruthy();
    expect(screen.getByText('Total Transaksi')).toBeTruthy();

    // Subtotal and net transaction total render their exact formatted values.
    expect(text).toContain(formatMoney(totals.subtotal)); // 10.000.000
    expect(text).toContain(formatMoney(totals.transactionTotal)); // 8.500.000

    // Discount line shows the discount value. The component prefixes a minus
    // glyph, so match the numeric formatted substring to stay robust.
    expect(text).toContain(formatMoney(totals.discount)); // 1.500.000
  });

  it('omits the Diskon line when discount === 0 but still renders Subtotal and Total Transaksi', () => {
    const totals = {
      subtotal: 10_000_000,
      discount: 0,
      transactionTotal: 10_000_000,
      paymentTotal: 10_000_000,
      changeDue: 0,
    };

    const { container } = render(<Receipt data={makeReceiptData(totals)} />);
    const text = container.textContent ?? '';

    // Total Transaksi line and its value still render.
    expect(screen.getByText('Total Transaksi')).toBeTruthy();
    expect(text).toContain(formatMoney(totals.transactionTotal)); // 10.000.000

    // Subtotal line is always shown.
    expect(screen.getByText('Subtotal')).toBeTruthy();

    // The zero-discount line is omitted entirely.
    expect(screen.queryByText('Diskon')).toBeNull();
  });
});
