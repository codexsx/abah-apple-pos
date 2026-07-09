import { describe, expect, it } from 'vitest';
import {
  getTransactionStaffName,
  getTransactionStaffRole,
  getTransactionDisplayDetail,
  getRecognizedSalesAmount,
  getRecognizedSalesNetOfImeiActivation,
  getRecognizedSalesUnitCount,
  getTransactionImeiActivationAmount,
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

  it('formats tukar tambah detail without leaking raw JSON', () => {
    const detail = getTransactionDisplayDetail({
      type: 'Tukar Tambah',
      detail: JSON.stringify({
        konsumen: { nama: 'Fibri', whatsapp: '085822054928' },
        tanggal: '2026-07-07',
        hpMasuk: {
          tipe: 'iPhone 11 Pro Max',
          kapasitas: '512GB',
          kondisi: 'Second Inter Unlock Minus',
          warna: 'Space Gray',
          imei: '353893100506451',
          batteryHealth: 97,
          appraisal: 3_000_000,
        },
        hpKeluar: {
          model: 'iPhone 14',
          capacity: '256GB',
          condition: 'Second Inter SimLock',
          color: 'Blue',
          imei: '353557670537275',
          price: 5_700_000,
        },
        garansi: '90 Hari',
        kelengkapan: ['Paperbag'],
        payment: { cash: 0, transfer: 2_700_000 },
        selisih: 2_700_000,
      }),
    });

    expect(detail).toContain('Customer: Fibri');
    expect(detail).toContain('Keluar: iPhone 14 256GB Second Inter SimLock Blue');
    expect(detail).toContain('Masuk: iPhone 11 Pro Max 512GB Second Inter Unlock Minus Space Gray');
    expect(detail).toContain('IMEI masuk 353893100506451');
    expect(detail).toContain('Selisih Rp 2.700.000');
    expect(detail).not.toContain('"konsumen"');
    expect(detail).not.toContain('"hpKeluar"');
  });

  it('formats legacy expense JSON detail without leaking raw keys', () => {
    const detail = getTransactionDisplayDetail({
      type: 'Pengeluaran',
      detail: JSON.stringify({
        kategori: 'Operasional Toko',
        tanggal: '2026-06-30',
        keterangan: 'Total Gaji Tanggal 1',
        referensi: '',
        cash: 0,
        transfer: 3_000_000,
      }),
    });

    expect(detail).toContain('Operasional Toko');
    expect(detail).toContain('Total Gaji Tanggal 1');
    expect(detail).toContain('Transfer Rp 3.000.000');
    expect(detail).not.toContain('"kategori"');
    expect(detail).not.toContain('"transfer"');
  });

  it('formats legacy other-income JSON detail without leaking raw keys', () => {
    const detail = getTransactionDisplayDetail({
      type: 'Pemasukan Lain',
      detail: JSON.stringify({
        jenis: 'Tambahan Modal',
        keterangan: 'Setoran owner',
        cashMasuk: 500_000,
        transferMasuk: 1_000_000,
      }),
    });

    expect(detail).toContain('Tambahan Modal');
    expect(detail).toContain('Setoran owner');
    expect(detail).toContain('Cash Rp 500.000');
    expect(detail).toContain('Transfer Rp 1.000.000');
    expect(detail).not.toContain('"jenis"');
  });

  it('leaves legacy plain-text sale detail unchanged', () => {
    expect(
      getTransactionDisplayDetail(makeTx({ detail: 'iPhone 14 Pro 128GB Second iBox' })),
    ).toBe('iPhone 14 Pro 128GB Second iBox');
  });
});

describe('sales recognition helpers', () => {
  it('keeps Penjualan total all-in while separating IMEI activation from HP sales', () => {
    const tx = makeTx({
      amount: 3_670_000,
      detail: serializeSaleDetail(
        toSaleDetail({
          units: [
            {
              imei: '353535353535353',
              model: 'iPhone 8 Plus',
              capacity: '64GB',
              condition: 'Second Inter Unlock',
              color: 'Space Gray',
              sellingPrice: 3_500_000,
            },
          ],
          manualSalePrice: 0,
          imeiActivationPrice: 170_000,
          items: [],
          bonuses: [],
          warranty: '30 Hari',
          customerName: 'Adam',
          customerPhone: null,
          payment: { cash: 0, transfer: 3_670_000 },
          discount: 0,
        }),
      ),
    });

    expect(getRecognizedSalesAmount(tx)).toBe(3_670_000);
    expect(getTransactionImeiActivationAmount(tx)).toBe(170_000);
    expect(getRecognizedSalesNetOfImeiActivation(tx)).toBe(3_500_000);
  });

  it('recognizes tukar tambah as one sold unit using HP keluar price, not selisih', () => {
    const tx = makeTx({
      type: 'Tukar Tambah',
      amount: 2_700_000,
      detail: JSON.stringify({
        hpKeluar: {
          model: 'iPhone 14',
          capacity: '256GB',
          price: 5_700_000,
        },
        hpMasuk: {
          tipe: 'iPhone 11 Pro Max',
          kapasitas: '512GB',
          appraisal: 3_000_000,
        },
        aktivasiImei: 170_000,
        selisih: 2_700_000,
      }),
    });

    expect(getRecognizedSalesAmount(tx)).toBe(5_870_000);
    expect(getTransactionImeiActivationAmount(tx)).toBe(170_000);
    expect(getRecognizedSalesNetOfImeiActivation(tx)).toBe(5_700_000);
    expect(getRecognizedSalesUnitCount(tx)).toBe(1);
  });

  it('recognizes multi-unit Penjualan from serialized sale detail', () => {
    const tx = makeTx({
      amount: 9_000_000,
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
          payment: { cash: 9_000_000, transfer: 0 },
          discount: 0,
        }),
      ),
    });

    expect(getRecognizedSalesAmount(tx)).toBe(9_000_000);
    expect(getRecognizedSalesUnitCount(tx)).toBe(2);
  });
});

describe('transaction staff helpers', () => {
  it('returns the profile name and role for transactions linked to a staff profile', () => {
    const tx = makeTx({
      staff_id: 'staff-1',
      staff: {
        id: 'staff-1',
        name: 'Regga Prayuda',
        role: 'KASIR',
      },
    });

    expect(getTransactionStaffName(tx)).toBe('Regga Prayuda');
    expect(getTransactionStaffRole(tx)).toBe('KASIR');
  });

  it('uses a clear fallback for old transactions without an input staff', () => {
    const tx = makeTx({ staff_id: null, staff: null });

    expect(getTransactionStaffName(tx)).toBe('Staff tidak tercatat');
    expect(getTransactionStaffRole(tx)).toBeNull();
  });
});
