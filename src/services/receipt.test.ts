import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printReceipt, transactionToReceiptData } from './receipt';
import type { TransactionWithStockDetails } from './transactions';
import type { StockItem } from './stock';
import { serializeSaleDetail, toSaleDetail, computeTotals } from './finalization';

const baseUnit = {
  imei: '356789012345678',
  model: 'iPhone 13',
  capacity: '128GB',
  condition: 'Bekas',
  color: 'Midnight',
  sellingPrice: 7_000_000,
};

const baseSale = {
  units: [baseUnit],
  items: [{ name: 'Charger', price: 100_000 }],
  bonuses: [{ name: 'Tempered Glass' }],
  warranty: '7 hari',
  customerName: 'Budi',
  customerPhone: '08123456789',
  payment: { cash: 7_500_000, transfer: 0 },
  discount: 0,
  manualSalePrice: 0,
  imeiActivationPrice: 0,
};

describe('printReceipt', () => {
  let originalPrint: typeof window.print;

  beforeEach(() => {
    originalPrint = window.print;
  });

  afterEach(() => {
    window.print = originalPrint;
  });

  it('calls window.print when available', () => {
    const printSpy = vi.fn();
    window.print = printSpy;

    printReceipt();

    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('throws PRINT_UNAVAILABLE when window.print is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).print = undefined;

    expect(() => printReceipt()).toThrow('PRINT_UNAVAILABLE');
  });
});

describe('transactionToReceiptData', () => {
  function makeTx(overrides: {
    detail?: string;
    amount?: number;
  } = {}): TransactionWithStockDetails {
    return {
      id: 'txn-123e4567-89ab-cdef-0123-456789abcdef',
      type: 'Penjualan',
      description: 'Penjualan 1 unit',
      detail: overrides.detail ?? serializeSaleDetail(toSaleDetail(baseSale)),
      amount: overrides.amount ?? 7_100_000,
      created_at: '2026-06-29T10:00:00+07:00',
      stock_items: [] as StockItem[],
    };
  }

  it('reconstructs ReceiptData from a valid serialized SaleDetail', () => {
    const tx = makeTx();
    const receipt = transactionToReceiptData(tx);

    expect(receipt).not.toBeNull();
    expect(receipt?.transactionId).toBe(tx.id);
    expect(receipt?.units).toEqual(baseSale.units);
    expect(receipt?.items).toEqual(baseSale.items);
    expect(receipt?.bonuses).toEqual(baseSale.bonuses);
    expect(receipt?.warranty).toBe(baseSale.warranty);
    expect(receipt?.customerName).toBe(baseSale.customerName);
    expect(receipt?.customerPhone).toBe(baseSale.customerPhone);
    expect(receipt?.payment).toEqual(baseSale.payment);
    expect(receipt?.finalizedAt).toBe(tx.created_at);
    expect(receipt?.totals).toEqual(computeTotals(baseSale));
  });

  it('returns null when detail is plain text (legacy row)', () => {
    const tx = makeTx({ detail: 'iPhone 14 Pro 128GB Second iBox' });

    expect(transactionToReceiptData(tx)).toBeNull();
  });

  it('returns null when detail is invalid JSON', () => {
    const tx = makeTx({ detail: '{not json' });

    expect(transactionToReceiptData(tx)).toBeNull();
  });

  it('normalizes missing optional fields to safe defaults', () => {
    const tx = makeTx({
      detail: JSON.stringify({
        units: [baseUnit],
        payment: { cash: 7_000_000 },
      }),
    });

    const receipt = transactionToReceiptData(tx);
    expect(receipt).not.toBeNull();
    expect(receipt?.items).toEqual([]);
    expect(receipt?.bonuses).toEqual([]);
    expect(receipt?.warranty).toBeNull();
    expect(receipt?.customerName).toBeNull();
    expect(receipt?.customerPhone).toBeNull();
    expect(receipt?.payment).toEqual({ cash: 7_000_000, transfer: 0 });
  });
});
