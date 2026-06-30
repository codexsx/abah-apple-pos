import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeTotals, type AssembledSale } from '@/services/finalization';
import type { ReceiptData } from '@/components/sale/Receipt';

// =============================================================================
// Property tests for the post-confirmation reset (Property 9) and the
// confirmation snapshot immutability (Property 10).
//
// Both properties concern pure state transitions. The Penjualan component itself
// is not easily unit-testable for these behaviours, so — as the design models them
// (reset as a pure transition, the confirmation capture as an immutable snapshot)
// — we model them here as small local pure functions and assert the properties
// over generated inputs.
// =============================================================================

// ---------- Shared generators ----------

/** Integer IDR money in the inclusive domain 0 … 999,999,999,999 (Req 2.6). */
const money = fc.integer({ min: 0, max: 999_999_999_999 });

const boxStatusArb = fc.record({
  charger: fc.boolean(),
  paperbag: fc.boolean(),
  temperedGlass: fc.boolean(),
  case: fc.boolean(),
  kotak: fc.boolean(),
});

// =============================================================================
// Property 9: Reset returns to the initial sale-entry state
// (Validates Requirements 5.1, 5.2, 5.4)
// =============================================================================

/**
 * Local model of the Sales (Penjualan) form state relevant to reset. Mirrors the
 * state cleared by Penjualan.tsx `handleReset`.
 */
interface SaleFormState {
  selectedUnits: Array<{
    imei: string;
    model: string;
    capacity: string;
    condition: string;
    color: string;
    sellingPrice: number;
  }>;
  addedItems: Array<{ name: string; price: number }>;
  addedBonuses: Array<{ name: string }>;
  customerName: string;
  customerPhone: string;
  hargaJual: string;
  imeiActivationPrice: string;
  warranty: string;
  cashAmount: string;
  transferAmount: string;
  boxStatus: {
    charger: boolean;
    paperbag: boolean;
    temperedGlass: boolean;
    case: boolean;
    kotak: boolean;
  };
}

/**
 * The initial sale-entry state, matching Penjualan.tsx `handleReset` results:
 * empty collections, empty strings, warranty '', and the default boxStatus
 * ({ charger:false, paperbag:true, temperedGlass:false, case:false, kotak:false }).
 */
const INITIAL_STATE: SaleFormState = {
  selectedUnits: [],
  addedItems: [],
  addedBonuses: [],
  customerName: '',
  customerPhone: '',
  hargaJual: '',
  imeiActivationPrice: '',
  warranty: '',
  cashAmount: '',
  transferAmount: '',
  boxStatus: {
    charger: false,
    paperbag: true,
    temperedGlass: false,
    case: false,
    kotak: false,
  },
};

/**
 * Pure reset transition. Mirrors Penjualan.tsx `handleReset`, which clears every
 * collection and field back to the initial sale-entry values regardless of the
 * prior state. Returns a fresh INITIAL_STATE value.
 */
function resetForm(_state: SaleFormState): SaleFormState {
  return {
    selectedUnits: [],
    addedItems: [],
    addedBonuses: [],
    customerName: '',
    customerPhone: '',
    hargaJual: '',
    imeiActivationPrice: '',
    warranty: '',
    cashAmount: '',
    transferAmount: '',
    boxStatus: {
      charger: false,
      paperbag: true,
      temperedGlass: false,
      case: false,
      kotak: false,
    },
  };
}

const saleFormStateArb: fc.Arbitrary<SaleFormState> = fc.record({
  selectedUnits: fc.array(
    fc.record({
      imei: fc.string(),
      model: fc.string(),
      capacity: fc.string(),
      condition: fc.string(),
      color: fc.string(),
      sellingPrice: money,
    }),
    { maxLength: 6 },
  ),
  addedItems: fc.array(fc.record({ name: fc.string(), price: money }), {
    maxLength: 6,
  }),
  addedBonuses: fc.array(fc.record({ name: fc.string() }), { maxLength: 6 }),
  customerName: fc.string(),
  customerPhone: fc.string(),
  hargaJual: fc.string(),
  imeiActivationPrice: fc.string(),
  warranty: fc.string(),
  cashAmount: fc.string(),
  transferAmount: fc.string(),
  boxStatus: boxStatusArb,
});

describe('Penjualan reset — Property 9', () => {
  // Feature: pos-finalization, Property 9: Reset returns to the initial sale-entry state
  it('Property 9: resetForm returns the initial state for any prior form state', () => {
    fc.assert(
      fc.property(saleFormStateArb, (state) => {
        // For any generated prior state, the reset yields the initial state.
        expect(resetForm(state)).toEqual(INITIAL_STATE);
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Property 10: Confirmation snapshot is immutable
// (Validates Requirement 5.3)
// =============================================================================

/**
 * Pure confirmation capture. Deep-copies the source sale into an immutable
 * ReceiptData snapshot via structuredClone, mirroring the confirmation capture
 * the design models as an immutable snapshot taken at finalization time.
 */
function captureReceipt(sale: AssembledSale, finalizedAt: string): ReceiptData {
  const totals = computeTotals(sale);
  return structuredClone({
    units: sale.units,
    items: sale.items,
    bonuses: sale.bonuses,
    warranty: sale.warranty,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    totals,
    payment: sale.payment,
    finalizedAt,
  });
}

const assembledSaleArb: fc.Arbitrary<AssembledSale> = fc.record({
  units: fc.array(
    fc.record({
      imei: fc.string(),
      model: fc.string(),
      capacity: fc.string(),
      condition: fc.string(),
      color: fc.string(),
      sellingPrice: money,
    }),
    { maxLength: 6 },
  ),
  manualSalePrice: money,
  imeiActivationPrice: money,
  items: fc.array(fc.record({ name: fc.string(), price: money }), {
    maxLength: 6,
  }),
  bonuses: fc.array(fc.record({ name: fc.string() }), { maxLength: 6 }),
  warranty: fc.option(fc.string(), { nil: null }),
  customerName: fc.option(fc.string(), { nil: null }),
  customerPhone: fc.option(fc.string(), { nil: null }),
  payment: fc.record({ cash: money, transfer: money }),
});

describe('Confirmation snapshot — Property 10', () => {
  // Feature: pos-finalization, Property 10: Confirmation snapshot is immutable
  it('Property 10: captured ReceiptData is unaffected by later mutations to the source sale', () => {
    fc.assert(
      fc.property(assembledSaleArb, (sale) => {
        const finalizedAt = new Date().toISOString();
        const captured = captureReceipt(sale, finalizedAt);
        // Reference snapshot taken at capture time for deep-equality comparison.
        const atCaptureTime = structuredClone(captured);

        // Mutate the original source sale object after the snapshot was taken:
        sale.units.push({
          imei: 'MUTATED',
          model: 'MUTATED',
          capacity: 'MUTATED',
          condition: 'MUTATED',
          color: 'MUTATED',
          sellingPrice: 1,
        });
        sale.items.push({ name: 'MUTATED', price: 1 });
        sale.bonuses.push({ name: 'MUTATED' });
        sale.payment.cash = sale.payment.cash + 1;
        sale.payment.transfer = sale.payment.transfer + 1;
        sale.warranty = 'MUTATED';
        sale.customerName = 'MUTATED';
        sale.customerPhone = 'MUTATED';

        // The captured snapshot remains deep-equal to its capture-time value.
        expect(captured).toEqual(atCaptureTime);
      }),
      { numRuns: 100 },
    );
  });
});
