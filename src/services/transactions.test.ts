import { describe, expect, it } from 'vitest';
import {
  getTransactionDisplayDetail,
  hydrateTransactionStockDetails,
  type TransactionWithStockDetails,
} from './transactions';
import { serializeSaleDetail, toSaleDetail } from './finalization';
import type { StockItem } from './stock';

const createdAt = '2026-06-29T10:00:00+07:00';

function makeTx(
  overrides: Partial<TransactionWithStockDetails> = {},
): TransactionWithStockDetails {
  return {
    id: 'txn-123',
    type: 'Penjualan',
    description: 'Penjualan 1 unit',
    detail: serializeSaleDetail(
      toSaleDetail({
        units: [
          {
            imei: '',
            model: 'iPhone 11',
            capacity: '128GB',
            condition: 'Second Inter',
            color: 'Black',
            sellingPrice: 4_500_000,
          },
        ],
        manualSalePrice: 0,
        imeiActivationPrice: 0,
        items: [],
        bonuses: [],
        warranty: null,
        customerName: null,
        customerPhone: null,
        payment: { cash: 4_500_000, transfer: 0 },
        discount: 0,
      }),
    ),
    amount: 4_500_000,
    created_at: createdAt,
    stock_items: [],
    ...overrides,
  };
}

function makeStock(overrides: Partial<StockItem> = {}): StockItem {
  return {
    id: 'stock-1',
    model: 'iPhone 13',
    capacity: '128GB',
    condition: 'Second iBox',
    color: 'Midnight',
    imei: '356789012345678',
    has_imei: true,
    status: 'TERJUAL',
    count: 1,
    price: 7_000_000,
    cost_price: 6_000_000,
    created_at: createdAt,
    updated_at: createdAt,
    ...overrides,
  };
}

describe('hydrateTransactionStockDetails', () => {
  it('hydrates a non-IMEI sale unit from serialized detail when no stock row is linked', () => {
    const tx = hydrateTransactionStockDetails(makeTx());

    expect(tx.stock_items).toHaveLength(1);
    expect(tx.stock_items[0]).toMatchObject({
      id: 'txn-123:detail-unit:0',
      model: 'iPhone 11',
      capacity: '128GB',
      condition: 'Second Inter',
      color: 'Black',
      imei: null,
      has_imei: false,
      status: 'TERJUAL',
      count: 1,
      price: 4_500_000,
    });
  });

  it('does not duplicate an IMEI unit already returned by the stock_items join', () => {
    const linked = makeStock();
    const tx = hydrateTransactionStockDetails(
      makeTx({
        detail: serializeSaleDetail(
          toSaleDetail({
            units: [
              {
                imei: '356789012345678',
                model: 'iPhone 13',
                capacity: '128GB',
                condition: 'Second iBox',
                color: 'Midnight',
                sellingPrice: 7_000_000,
              },
            ],
            manualSalePrice: 0,
            imeiActivationPrice: 0,
            items: [],
            bonuses: [],
            warranty: null,
            customerName: null,
            customerPhone: null,
            payment: { cash: 7_000_000, transfer: 0 },
            discount: 0,
          }),
        ),
        stock_items: [linked],
      }),
    );

    expect(tx.stock_items).toEqual([linked]);
  });

  it('adds only the missing non-IMEI units after existing linked non-IMEI rows', () => {
    const linkedWithoutImei = makeStock({
      id: 'stock-no-imei',
      imei: null,
      has_imei: false,
      model: 'iPhone 11',
      price: 4_500_000,
    });
    const tx = hydrateTransactionStockDetails(
      makeTx({
        detail: serializeSaleDetail(
          toSaleDetail({
            units: [
              {
                imei: '',
                model: 'iPhone 11',
                capacity: '128GB',
                condition: 'Second Inter',
                color: 'Black',
                sellingPrice: 4_500_000,
              },
              {
                imei: '',
                model: 'iPhone 11',
                capacity: '128GB',
                condition: 'Second Inter',
                color: 'White',
                sellingPrice: 4_600_000,
              },
            ],
            manualSalePrice: 0,
            imeiActivationPrice: 0,
            items: [],
            bonuses: [],
            warranty: null,
            customerName: null,
            customerPhone: null,
            payment: { cash: 9_100_000, transfer: 0 },
            discount: 0,
          }),
        ),
        stock_items: [linkedWithoutImei],
      }),
    );

    expect(tx.stock_items).toHaveLength(2);
    expect(tx.stock_items[0]).toBe(linkedWithoutImei);
    expect(tx.stock_items[1]).toMatchObject({
      id: 'txn-123:detail-unit:1',
      color: 'White',
      imei: null,
      has_imei: false,
      price: 4_600_000,
    });
  });

  it('leaves legacy plain-text detail unchanged', () => {
    const tx = makeTx({ detail: 'iPhone 14 Pro 128GB Second iBox' });

    expect(hydrateTransactionStockDetails(tx)).toBe(tx);
  });
});

describe('getTransactionDisplayDetail', () => {
  it('formats serialized sale detail for dashboard activity rows', () => {
    const detail = getTransactionDisplayDetail(makeTx());

    expect(detail).toContain('iPhone 11 128GB Second Inter Black');
    expect(detail).not.toContain('"units"');
  });

  it('formats quantity-only purchase detail without leaking JSON', () => {
    const detail = getTransactionDisplayDetail({
      type: 'Pembelian',
      detail: JSON.stringify({
        supplier: {
          type: 'agen',
          name: 'DOPON',
          agentId: 'agent-1',
          code: 'AGN-001',
        },
        dataMode: 'quantity',
        specs: {
          model: 'iPhone 11',
          capacity: '128GB',
          condition: 'Second Inter Unlock',
          color: 'Random',
          quantity: 10,
        },
        stockGroups: [
          {
            color: 'Random',
            quantity: 10,
            totalCost: 30_000_000,
            costPrice: 3_000_000,
            sellPrice: 3_500_000,
            hasImei: false,
          },
        ],
        payment: { cash: 0, transfer: 0, debt: 30_000_000 },
        total: 30_000_000,
      }),
    });

    expect(detail).toContain('DOPON');
    expect(detail).toContain('10 unit iPhone 11 128GB Second Inter Unlock');
    expect(detail).toContain('Random 10 unit');
    expect(detail).toContain('Rp 3.000.000/unit');
    expect(detail).toContain('Hutang Rp 30.000.000');
    expect(detail).not.toContain('"supplier"');
    expect(detail).not.toContain('"stockGroups"');
  });

  it('formats accessory purchase detail without leaking JSON', () => {
    const detail = getTransactionDisplayDetail({
      type: 'Pembelian Pelengkap',
      detail: JSON.stringify({
        kind: 'accessory_purchase',
        items: [
          {
            name: 'Paper Bag Abah Apple',
            category: 'paperbag',
            quantity: 1000,
            unitCost: 8000,
            minStock: 20,
          },
        ],
        payment: { cash: 0, transfer: 8_000_000 },
        total: 8_000_000,
      }),
    });

    expect(detail).toContain('1000 pcs Paper Bag Abah Apple');
    expect(detail).toContain('Rp 8.000/pcs');
    expect(detail).toContain('Transfer Rp 8.000.000');
    expect(detail).toContain('Total Rp 8.000.000');
    expect(detail).not.toContain('"kind"');
    expect(detail).not.toContain('"items"');
  });

  it('leaves legacy plain-text sale detail unchanged', () => {
    expect(
      getTransactionDisplayDetail(makeTx({ detail: 'iPhone 14 Pro 128GB Second iBox' })),
    ).toBe('iPhone 14 Pro 128GB Second iBox');
  });
});
