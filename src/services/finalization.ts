// Feature: pos-finalization
// Pure, dependency-free domain module for Sales (Penjualan) finalization.
// No imports from React or Supabase — this is the property-tested core.
//
// This file defines the domain types and constants only. The pure functions
// (computeTransactionTotal, computePaymentTotal, computeChangeDue, computeTotals,
// validateSale, buildDescription, serializeSaleDetail, deserializeSaleDetail,
// toSaleDetail) are implemented in later tasks.

// ---------- Constants ----------

/** Inclusive upper bound for monetary amounts, in integer IDR (Req 2.6). */
export const MAX_IDR = 999_999_999_999;

// ---------- Domain types ----------

export interface FinalizedUnit {
  imei: string;
  model: string;
  capacity: string;
  condition: string;
  color: string;
  batteryHealth?: number;
  sellingPrice: number; // integer IDR
}

export interface FinalizedItem {
  name: string;
  price: number; // integer IDR
}

export interface FinalizedBonus {
  name: string;
  costPrice?: number; // modal bonus/free accessory, used for future COGS tracing
}

export interface PaymentBreakdown {
  cash: number; // integer IDR (Cash_Amount)
  transfer: number; // integer IDR (Transfer_Amount)
}

/** Normalized view of the assembled sale, derived from Penjualan form state. */
export interface AssembledSale {
  units: FinalizedUnit[];
  manualSalePrice: number; // hargaJualNum (0 if unset)
  imeiActivationPrice: number; // imeiActivationNum (0 if unset)
  items: FinalizedItem[];
  bonuses: FinalizedBonus[];
  warranty: string | null; // null/'' = none
  customerName: string | null;
  customerPhone: string | null;
  payment: PaymentBreakdown;
  discount?: number; // integer IDR >= 0; absent/undefined => 0
}

/** The structure serialized into Transaction_Record.detail (Req 3.5, 3.6). */
export interface SaleDetail {
  units: Array<{
    imei: string;
    sellingPrice: number;
    model: string;
    capacity: string;
    condition: string;
    color: string;
    batteryHealth?: number;
  }>;
  manualSalePrice: number;
  imeiActivationPrice: number;
  items: FinalizedItem[];
  bonuses: FinalizedBonus[];
  warranty: string | null;
  payment: PaymentBreakdown;
  customer: { name: string | null; phone: string | null };
  discount: number; // always serialized; 0 when none
}

/** Computed monetary outcome of a sale. */
export interface SaleTotals {
  subtotal: number; // Gross_Subtotal
  discount: number; // applied Discount
  transactionTotal: number; // Net_Total = max(0, subtotal - discount)
  paymentTotal: number; // Req 2.2
  changeDue: number; // Req 2.3, 2.4, 2.5
}

export type ValidationResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | 'NO_UNITS'
        | 'INVALID_PRICE'
        | 'INVALID_DISCOUNT'
        | 'INSUFFICIENT_PAYMENT';
      message: string;
    };

// ---------- Pure functions ----------

/** Coerce a possibly-absent numeric input to a safe integer amount, treating
 *  null/undefined/NaN as 0. */
function toAmount(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return value;
}

/**
 * Σ unit selling prices + manualSalePrice + imeiActivationPrice + Σ item prices.
 * Absent/unset inputs are treated as 0 (Req 2.1). This is the gross subtotal,
 * before any discount is applied.
 */
export function computeSubtotal(sale: AssembledSale): number {
  const unitsTotal = sale.units.reduce(
    (sum, unit) => sum + toAmount(unit.sellingPrice),
    0,
  );
  const itemsTotal = sale.items.reduce(
    (sum, item) => sum + toAmount(item.price),
    0,
  );
  return (
    unitsTotal +
    toAmount(sale.manualSalePrice) +
    toAmount(sale.imeiActivationPrice) +
    itemsTotal
  );
}

/**
 * Net-of-discount transaction total: max(0, computeSubtotal(sale) - discount).
 * Absent/unset discount is treated as 0, so the value equals the subtotal when
 * no discount is present (Req 1.2, 1.4).
 */
export function computeTransactionTotal(sale: AssembledSale): number {
  return Math.max(0, computeSubtotal(sale) - toAmount(sale.discount));
}

/** cash + transfer, treating unset as 0 (Req 2.2). */
export function computePaymentTotal(sale: AssembledSale): number {
  return toAmount(sale.payment.cash) + toAmount(sale.payment.transfer);
}

/**
 * max(0, paymentTotal - transactionTotal): positive only when overpaid,
 * 0 when equal or underpaid (Req 2.3, 2.4, 2.5).
 */
export function computeChangeDue(
  transactionTotal: number,
  paymentTotal: number,
): number {
  return Math.max(0, paymentTotal - transactionTotal);
}

/** Convenience: all totals from one sale. */
export function computeTotals(sale: AssembledSale): SaleTotals {
  const subtotal = computeSubtotal(sale);
  const discount = toAmount(sale.discount);
  const transactionTotal = computeTransactionTotal(sale);
  const paymentTotal = computePaymentTotal(sale);
  const changeDue = computeChangeDue(transactionTotal, paymentTotal);
  return { subtotal, discount, transactionTotal, paymentTotal, changeDue };
}

/**
 * Validate in ascending criterion order; return the FIRST unmet rule (Req 1.6):
 *  1) units.length === 0           -> NO_UNITS    "Pilih minimal satu unit"
 *  2) any unit.sellingPrice <= 0   -> INVALID_PRICE (identifies the affected unit)
 *  3) discount not int in 0..subtotal -> INVALID_DISCOUNT
 *  4) paymentTotal < transactionTotal (net) -> INSUFFICIENT_PAYMENT (states shortfall IDR)
 * Pure: never mutates `sale` (Req 1.5).
 */
export function validateSale(sale: AssembledSale): ValidationResult {
  // Rule 1: at least one unit must be selected.
  if (sale.units.length === 0) {
    return {
      ok: false,
      code: 'NO_UNITS',
      message: 'Pilih minimal satu unit',
    };
  }

  // Rule 2: every unit must have a selling price greater than 0 IDR.
  const invalidIndex = sale.units.findIndex(
    (unit) => toAmount(unit.sellingPrice) <= 0,
  );
  if (invalidIndex !== -1) {
    const unit = sale.units[invalidIndex];
    const label = unit.imei && unit.imei.length > 0
      ? `${unit.model} (IMEI ${unit.imei})`
      : unit.model || `unit #${invalidIndex + 1}`;
    return {
      ok: false,
      code: 'INVALID_PRICE',
      message: `Unit ${label} harus memiliki harga jual lebih dari 0 IDR`,
    };
  }

  // Rule 3: discount must be an integer within 0..gross subtotal (inclusive).
  const discount = toAmount(sale.discount);
  if (
    !(
      Number.isInteger(discount) &&
      discount >= 0 &&
      discount <= computeSubtotal(sale)
    )
  ) {
    return {
      ok: false,
      code: 'INVALID_DISCOUNT',
      message: 'Diskon harus berupa angka 0 sampai subtotal',
    };
  }

  // Rule 4: payment total must cover the net transaction total.
  const transactionTotal = computeTransactionTotal(sale);
  const paymentTotal = computePaymentTotal(sale);
  if (paymentTotal < transactionTotal) {
    const shortfall = transactionTotal - paymentTotal;
    return {
      ok: false,
      code: 'INSUFFICIENT_PAYMENT',
      message: `Pembayaran kurang ${shortfall} IDR`,
    };
  }

  return { ok: true };
}

/**
 * Build Transaction_Record.description (Req 3.3, 3.4):
 *  - with name: includes name truncated to <=100 chars + unit count
 *  - without name: unit count only, omits name.
 */
export function buildDescription(
  customerName: string | null,
  unitCount: number,
): string {
  const trimmed = customerName?.trim() ?? '';
  if (trimmed.length > 0) {
    const name = trimmed.slice(0, 100);
    return `Penjualan ${unitCount} unit untuk ${name}`;
  }
  return `Penjualan ${unitCount} unit`;
}

/** Map an AssembledSale into the SaleDetail persisted shape. */
export function toSaleDetail(sale: AssembledSale): SaleDetail {
  return {
    units: sale.units.map((unit) => ({
      imei: unit.imei,
      sellingPrice: unit.sellingPrice,
      model: unit.model,
      capacity: unit.capacity,
      condition: unit.condition,
      color: unit.color,
      ...(unit.batteryHealth !== undefined ? { batteryHealth: unit.batteryHealth } : {}),
    })),
    manualSalePrice: sale.manualSalePrice,
    imeiActivationPrice: sale.imeiActivationPrice,
    items: sale.items.map((item) => ({ name: item.name, price: item.price })),
    bonuses: sale.bonuses.map((bonus) => ({
      name: bonus.name,
      ...(bonus.costPrice !== undefined ? { costPrice: bonus.costPrice } : {}),
    })),
    warranty: sale.warranty,
    payment: { cash: sale.payment.cash, transfer: sale.payment.transfer },
    customer: { name: sale.customerName, phone: sale.customerPhone },
    discount: toAmount(sale.discount),
  };
}

/** Serialize SaleDetail to a string for Transaction_Record.detail (Req 3.5). */
export function serializeSaleDetail(detail: SaleDetail): string {
  return JSON.stringify(detail);
}

/**
 * Parse a serialized detail back into an equivalent SaleDetail (Req 3.6).
 * Normalizes missing collections to [] and missing warranty to null so the
 * round-trip property holds.
 */
export function deserializeSaleDetail(serialized: string): SaleDetail {
  const raw = JSON.parse(serialized) as Partial<SaleDetail> | null;
  const source = raw ?? {};

  const units = Array.isArray(source.units)
    ? source.units.map((unit) => ({
        imei: unit.imei,
        sellingPrice: unit.sellingPrice,
        model: unit.model,
        capacity: unit.capacity,
        condition: unit.condition,
        color: unit.color,
        ...(unit.batteryHealth !== undefined
          ? { batteryHealth: Number(unit.batteryHealth) || 0 }
          : {}),
      }))
    : [];

  const items = Array.isArray(source.items)
    ? source.items.map((item) => ({ name: item.name, price: item.price }))
    : [];

  const bonuses = Array.isArray(source.bonuses)
    ? source.bonuses.map((bonus) => ({
        name: bonus.name,
        ...(bonus.costPrice !== undefined
          ? { costPrice: Number(bonus.costPrice) || 0 }
          : {}),
      }))
    : [];

  const payment: PaymentBreakdown = {
    cash: toAmount(source.payment?.cash),
    transfer: toAmount(source.payment?.transfer),
  };

  const customer = {
    name: source.customer?.name ?? null,
    phone: source.customer?.phone ?? null,
  };

  return {
    units,
    manualSalePrice: toAmount(source.manualSalePrice),
    imeiActivationPrice: toAmount(source.imeiActivationPrice),
    items,
    bonuses,
    warranty: source.warranty ?? null,
    payment,
    customer,
    discount: toAmount(source.discount),
  };
}
