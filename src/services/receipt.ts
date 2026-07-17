// Feature: print-nota
// Receipt utilities and types. Includes safe browser print + reconstruct
// ReceiptData from a persisted Penjualan transaction so Riwayat can reprint
// the original nota.

import type {
  FinalizedUnit,
  FinalizedItem,
  FinalizedBonus,
  PaymentBreakdown,
  SaleTotals,
} from '@/services/finalization';
import {
  computeTotals,
  deserializeSaleDetail,
} from '@/services/finalization';
import type { TransactionWithStockDetails } from '@/services/transactions';
import type { DeviceCategory } from '@/services/stockCore';

/** Snapshot of a finalized sale used to render the printable receipt. */
export interface ReceiptData {
  transactionId?: string;
  units: FinalizedUnit[];
  items: FinalizedItem[];
  bonuses: FinalizedBonus[];
  warranty: string | null;
  customerName: string | null;
  customerPhone: string | null;
  totals: SaleTotals; // transactionTotal, paymentTotal, changeDue
  payment: PaymentBreakdown; // cash + transfer breakdown
  finalizedAt: string; // ISO timestamp captured at confirmation
}

/**
 * Trigger the browser print dialog. Throws a consistent error when print is
 * unavailable (e.g. SSR or disabled browser).
 */
export function printReceipt(): void {
  if (typeof window === 'undefined' || typeof window.print !== 'function') {
    throw new Error('PRINT_UNAVAILABLE');
  }
  window.print();
}

function toFinalizedUnit(unit: {
  imei?: string;
  sellingPrice?: number;
  model?: string;
  capacity?: string;
  condition?: string;
  color?: string;
  batteryHealth?: number;
  deviceCategory?: DeviceCategory;
}): FinalizedUnit {
  return {
    imei: unit.imei ?? '',
    sellingPrice: Number(unit.sellingPrice) || 0,
    model: unit.model ?? '',
    capacity: unit.capacity ?? '',
    condition: unit.condition ?? '',
    color: unit.color ?? '',
    ...(unit.batteryHealth !== undefined
      ? { batteryHealth: Number(unit.batteryHealth) || 0 }
      : {}),
    // Opsional: data lama tanpa kategori tetap dirender sebagai IMEI.
    ...(unit.deviceCategory ? { deviceCategory: unit.deviceCategory } : {}),
  };
}

function toFinalizedItem(item: {
  name?: string;
  price?: number;
}): FinalizedItem {
  return {
    name: item.name ?? '',
    price: Number(item.price) || 0,
  };
}

function toFinalizedBonus(bonus: { name?: string; costPrice?: number }): FinalizedBonus {
  return {
    name: bonus.name ?? '',
    ...(bonus.costPrice !== undefined
      ? { costPrice: Number(bonus.costPrice) || 0 }
      : {}),
  };
}

/**
 * Reconstruct a ReceiptData snapshot from a persisted Penjualan transaction.
 * Returns null when the transaction detail is not a valid serialized SaleDetail
 * (e.g. legacy seed rows that store plain text in detail).
 */
export function transactionToReceiptData(
  tx: TransactionWithStockDetails,
): ReceiptData | null {
  try {
    const detail = deserializeSaleDetail(tx.detail);

    const units = Array.isArray(detail.units)
      ? detail.units.map(toFinalizedUnit)
      : [];
    const items = Array.isArray(detail.items)
      ? detail.items.map(toFinalizedItem)
      : [];
    const bonuses = Array.isArray(detail.bonuses)
      ? detail.bonuses.map(toFinalizedBonus)
      : [];

    const sale = {
      units,
      items,
      bonuses,
      warranty: detail.warranty ?? null,
      customerName: detail.customer?.name ?? null,
      customerPhone: detail.customer?.phone ?? null,
      payment: {
        cash: Number(detail.payment?.cash) || 0,
        transfer: Number(detail.payment?.transfer) || 0,
      },
      discount: Number(detail.discount) || 0,
      manualSalePrice: Number(detail.manualSalePrice) || 0,
      imeiActivationPrice: Number(detail.imeiActivationPrice) || 0,
    };

    const totals = computeTotals(sale);

    return {
      transactionId: tx.id,
      units: sale.units,
      items: sale.items,
      bonuses: sale.bonuses,
      warranty: sale.warranty,
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      totals,
      payment: sale.payment,
      finalizedAt: tx.created_at,
    };
  } catch {
    return null;
  }
}
