import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  normalizeStockEditDraft,
  validateImeiPresence,
  validateIdentifierPresence,
  validateStockUnitInput,
  isValidSerialNumber,
  isValidStatus,
  isValidStatusTransition,
  normalizeSerialNumber,
} from './stockCore';
import type { StockUnitInputCore, StockValidationCode, StockStatus } from './stockCore';
import { MAX_IDR } from '@/services/accountsCore';

// ---------------------------------------------------------------------------
// Shared config & generators
// ---------------------------------------------------------------------------

const RUNS = { numRuns: 100 } as const;

/** Exactly 15 digits, built from 15 single-digit integers. */
const validImeiArb: fc.Arbitrary<string> = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 15, maxLength: 15 })
  .map((digits) => digits.join(''));

/** A numeric string whose length is not 15 (so it fails /^\d{15}$/). */
const nonFifteenDigitArb: fc.Arbitrary<string> = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 0, maxLength: 30 })
  .filter((digits) => digits.length !== 15)
  .map((digits) => digits.join(''));

/** Empty or whitespace-only string. */
const blankStringArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 8 })
  .map((chars) => chars.join(''));

const matchesImei = (s: string): boolean => /^\d{15}$/.test(s);
const isBlank = (s: string | null): boolean =>
  s === null || s.trim().length === 0;

// ---------------------------------------------------------------------------
// Property 1 (task 3.x)
// ---------------------------------------------------------------------------

describe('Property 1: IMEI presence is consistent', () => {
  // Feature: stock-source-of-truth, Property 1
  // Validates: Requirements 2.1, 2.2, 2.3, 2.4

  it('hasImei === true: ok iff imei is exactly 15 digits, else IMEI_REQUIRED_FORMAT', () => {
    const imeiCandidateArb = fc.oneof(
      validImeiArb,
      nonFifteenDigitArb,
      fc.string(),
      blankStringArb,
      fc.constant<string | null>(null),
    );

    fc.assert(
      fc.property(imeiCandidateArb, (imei) => {
        const result = validateImeiPresence(true, imei);
        if (imei !== null && matchesImei(imei)) {
          expect(result.ok).toBe(true);
        } else {
          expect(result.ok).toBe(false);
          expect(result.ok === false && result.code).toBe('IMEI_REQUIRED_FORMAT');
        }
      }),
      RUNS,
    );
  });

  it('hasImei === false: ok iff imei is null or blank, else IMEI_MUST_BE_ABSENT', () => {
    const imeiCandidateArb = fc.oneof(
      blankStringArb,
      fc.constant<string | null>(null),
      validImeiArb,
      nonFifteenDigitArb,
      fc.string(),
    );

    fc.assert(
      fc.property(imeiCandidateArb, (imei) => {
        const result = validateImeiPresence(false, imei);
        if (isBlank(imei)) {
          expect(result.ok).toBe(true);
        } else {
          expect(result.ok).toBe(false);
          expect(result.ok === false && result.code).toBe('IMEI_MUST_BE_ABSENT');
        }
      }),
      RUNS,
    );
  });
});

describe('normalizeStockEditDraft', () => {
  it('normalizes stock edit form values into the stock_items update payload', () => {
    const result = normalizeStockEditDraft({
      model: '  iPhone 12 Pro Max  ',
      capacity: ' 128GB ',
      condition: ' Second Inter Unlock Minus ',
      color: ' Silver ',
      hasImei: true,
      imei: '359481985375087',
      price: '6.000.000',
      costPrice: '5.000.000',
      batteryHealth: '86',
      defectDescription: ' Kaca Kamera Pecah ',
    });

    expect(result).toEqual({
      ok: true,
      payload: {
        model: 'iPhone 12 Pro Max',
        capacity: '128GB',
        condition: 'Second Inter Unlock Minus',
        color: 'Silver',
        has_imei: true,
        device_category: 'IPHONE',
        imei: '359481985375087',
        price: 6_000_000,
        cost_price: 5_000_000,
        battery_health: 86,
        defect_description: 'Kaca Kamera Pecah',
      },
    });
  });

  it('rejects a unit marked with IMEI when the IMEI is not 15 digits', () => {
    expect(
      normalizeStockEditDraft({
        model: 'iPhone 12 Pro Max',
        capacity: '128GB',
        condition: 'Second Inter Unlock Minus',
        color: 'Silver',
        hasImei: true,
        imei: '123',
        price: '6.000.000',
        costPrice: '5.000.000',
        batteryHealth: '',
        defectDescription: '',
      }),
    ).toEqual({
      ok: false,
      message: 'IMEI harus 15 digit angka',
    });
  });
});

// ---------------------------------------------------------------------------
// Property 2 (task 3.x)
// ---------------------------------------------------------------------------

describe('Property 2: First-unmet-rule ordering', () => {
  // Feature: stock-source-of-truth, Property 2
  // Validates: Requirements 3.5, 3.6

  const VALID_STATUSES = [
    'READY',
    'SERVIS',
    'KANIBAL',
    'RUSAK',
    'TERJUAL',
  ] as const;

  /**
   * Independent reference oracle: computes the expected first-failing code for
   * an input, mirroring the fixed rule order MODEL_REQUIRED -> IMEI rules ->
   * PRICE_OUT_OF_RANGE -> COUNT_OUT_OF_RANGE -> STATUS_INVALID, or null when
   * every rule passes.
   */
  function expectedCode(input: StockUnitInputCore): StockValidationCode | null {
    if (input.model.trim().length === 0) {
      return 'MODEL_REQUIRED';
    }

    if (input.hasImei) {
      if (!/^\d{15}$/.test(input.imei ?? '')) {
        return 'IMEI_REQUIRED_FORMAT';
      }
    } else if ((input.imei ?? '').trim().length > 0) {
      return 'IMEI_MUST_BE_ABSENT';
    }

    if (
      !(
        Number.isInteger(input.price) &&
        input.price >= 0 &&
        input.price <= MAX_IDR
      )
    ) {
      return 'PRICE_OUT_OF_RANGE';
    }

    if (!(Number.isInteger(input.count) && input.count >= 1)) {
      return 'COUNT_OUT_OF_RANGE';
    }

    if (!(VALID_STATUSES as readonly string[]).includes(input.status)) {
      return 'STATUS_INVALID';
    }

    return null;
  }

  it('returns the first unmet rule (or ok) matching the reference oracle', () => {
    const inputArb: fc.Arbitrary<StockUnitInputCore> = fc.record({
      model: fc.oneof(
        fc.constant(''),
        fc.constant('   '),
        fc.string(),
        fc.constant('iPhone 13'),
      ),
      hasImei: fc.boolean(),
      imei: fc.oneof(
        fc.constant<string | null>(null),
        validImeiArb,
        fc.string(),
        blankStringArb,
      ),
      price: fc.oneof(
        fc.integer(),
        fc.double(),
        fc.constant(-5),
        fc.integer({ min: 0, max: MAX_IDR }),
      ),
      count: fc.oneof(
        fc.integer(),
        fc.constant(0),
        fc.integer({ min: 1, max: 50 }),
      ),
      status: fc.oneof(
        fc.constantFrom('READY', 'SERVIS', 'KANIBAL', 'RUSAK', 'TERJUAL'),
        fc.string(),
      ),
    });

    fc.assert(
      fc.property(inputArb, (input) => {
        const expected = expectedCode(input);
        const result = validateStockUnitInput(input);
        if (expected === null) {
          expect(result.ok).toBe(true);
        } else {
          expect(result.ok).toBe(false);
          expect(result.ok === false && result.code).toBe(expected);
        }
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3 (task 3.x)
// ---------------------------------------------------------------------------

describe('Property 3: Status enum membership', () => {
  // Feature: stock-source-of-truth, Property 3
  // Validates: Requirements 3.4

  const VALID_STATUSES = [
    'READY',
    'SERVIS',
    'KANIBAL',
    'RUSAK',
    'TERJUAL',
  ] as const;

  it('isValidStatus(s) === true iff s is one of the five valid statuses', () => {
    const statusArb = fc.oneof(
      fc.constantFrom('READY', 'SERVIS', 'KANIBAL', 'RUSAK', 'TERJUAL'),
      fc.string(),
    );

    fc.assert(
      fc.property(statusArb, (s) => {
        expect(isValidStatus(s)).toBe(
          (VALID_STATUSES as readonly string[]).includes(s),
        );
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4 (task 3.x)
// ---------------------------------------------------------------------------

describe('Property 4: Transition rule', () => {
  // Feature: stock-source-of-truth, Property 4
  // Validates: Requirements 5.2, 5.3, 5.4

  const VALID = ['READY', 'SERVIS', 'KANIBAL', 'RUSAK', 'TERJUAL'];

  it('ok === true iff to is valid, from !== to, and from !== TERJUAL', () => {
    const fromArb = fc.constantFrom('READY', 'SERVIS', 'KANIBAL', 'RUSAK', 'TERJUAL');
    const toArb = fc.oneof(
      fc.constantFrom('READY', 'SERVIS', 'KANIBAL', 'RUSAK', 'TERJUAL'),
      fc.string(),
    );

    fc.assert(
      fc.property(fromArb, toArb, (from, to) => {
        const expectedOk = VALID.includes(to) && from !== to && from !== 'TERJUAL';
        const result = isValidStatusTransition(from as StockStatus, to);
        if (expectedOk) {
          expect(result.ok).toBe(true);
        } else {
          expect(result.ok).toBe(false);
          expect(result.ok === false && result.code).toBe('STATUS_TRANSITION_INVALID');
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5 (task 3.x)
// ---------------------------------------------------------------------------

describe('Property 5: Price/count ranges', () => {
  // Feature: stock-source-of-truth, Property 5
  // Validates: Requirements 3.2, 3.3

  it('with model/IMEI/status valid, ok iff price in 0..MAX_IDR integer and count integer >= 1 (price before count)', () => {
    const priceArb = fc.oneof(
      fc.integer({ min: 0, max: MAX_IDR }),
      fc.constant(-1),
      fc.constant(MAX_IDR + 1),
      fc.double({ min: 0.1, max: 5 }),
      fc.integer({ min: -1000, max: -1 }),
    );
    const countArb = fc.oneof(
      fc.integer({ min: 1, max: 100 }),
      fc.constant(0),
      fc.integer({ min: -50, max: 0 }),
      fc.double({ min: 1.1, max: 2 }),
    );

    fc.assert(
      fc.property(priceArb, countArb, (price, count) => {
        const input: StockUnitInputCore = {
          model: 'iPhone 13',
          hasImei: false,
          imei: null,
          price,
          count,
          status: 'READY',
        };
        const result = validateStockUnitInput(input);

        const priceOk = Number.isInteger(price) && price >= 0 && price <= MAX_IDR;
        const countOk = Number.isInteger(count) && count >= 1;

        if (!priceOk) {
          expect(result.ok).toBe(false);
          expect(result.ok === false && result.code).toBe('PRICE_OUT_OF_RANGE');
        } else if (!countOk) {
          expect(result.ok).toBe(false);
          expect(result.ok === false && result.code).toBe('COUNT_OUT_OF_RANGE');
        } else {
          expect(result.ok).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Device-aware identifier rules (iPad Serial Number)
// ---------------------------------------------------------------------------

describe('Property 6: Device-aware identifier (IMEI vs SN)', () => {
  // Feature: ipad-serial-number-support, Property 6
  // IPHONE keeps the 15-digit IMEI rule; IPAD accepts an 8–14 char
  // alphanumeric Serial Number (stored uppercase); hasImei=false unchanged.

  /** Valid SN: 8–14 chars from A–Z0–9. */
  const validSnArb: fc.Arbitrary<string> = fc
    .array(
      fc.constantFrom(
        ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),
      ),
      { minLength: 8, maxLength: 14 },
    )
    .map((chars) => chars.join(''));

  it('IPAD + hasImei: ok iff identifier is a valid SN (case-insensitive)', () => {
    fc.assert(
      fc.property(validSnArb, fc.boolean(), (sn, lower) => {
        const input = lower ? sn.toLowerCase() : sn;
        expect(validateIdentifierPresence('IPAD', true, input).ok).toBe(true);
      }),
      RUNS,
    );
  });

  it('IPAD + hasImei: rejects 15-digit IMEIs and other non-SN shapes', () => {
    const badArb = fc.oneof(
      validImeiArb, // 15 digits — too long for an SN
      blankStringArb,
      fc.constant<string | null>(null),
      fc
        .string({ minLength: 15, maxLength: 30 })
        .filter((s) => !/^[A-Z0-9]{8,14}$/i.test(s)),
    );

    fc.assert(
      fc.property(badArb, (val) => {
        const result = validateIdentifierPresence('IPAD', true, val);
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe('IMEI_REQUIRED_FORMAT');
      }),
      RUNS,
    );
  });

  it('IPHONE rule unchanged: ok iff exactly 15 digits', () => {
    const candidateArb = fc.oneof(validImeiArb, validSnArb, fc.string());

    fc.assert(
      fc.property(candidateArb, (val) => {
        const result = validateIdentifierPresence('IPHONE', true, val);
        expect(result.ok).toBe(matchesImei(val));
      }),
      RUNS,
    );
  });

  it('IPAD + hasImei=false: identifier must still be absent', () => {
    fc.assert(
      fc.property(validSnArb, (sn) => {
        const result = validateIdentifierPresence('IPAD', false, sn);
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe('IMEI_MUST_BE_ABSENT');
      }),
      RUNS,
    );
  });

  it('normalizeSerialNumber trims and uppercases (idempotent)', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const once = normalizeSerialNumber(s);
        expect(once).toBe(s.trim().toUpperCase());
        expect(normalizeSerialNumber(once)).toBe(once);
      }),
      RUNS,
    );
  });

  it('isValidSerialNumber matches the 8–14 alphanumeric oracle', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(isValidSerialNumber(s)).toBe(
          /^[A-Z0-9]{8,14}$/.test(s.trim().toUpperCase()),
        );
      }),
      RUNS,
    );
  });

  it('validateStockUnitInput honours deviceCategory for the identifier rule', () => {
    fc.assert(
      fc.property(validSnArb, validImeiArb, (sn, imei) => {
        const base = {
          model: 'iPad Air',
          price: 5_000_000,
          count: 1,
          status: 'READY',
          hasImei: true,
        };
        expect(
          validateStockUnitInput({ ...base, deviceCategory: 'IPAD', imei: sn }).ok,
        ).toBe(true);
        const rejected = validateStockUnitInput({
          ...base,
          deviceCategory: 'IPAD',
          imei,
        });
        expect(rejected.ok).toBe(false);
        expect(rejected.ok === false && rejected.code).toBe(
          'IMEI_REQUIRED_FORMAT',
        );
      }),
      RUNS,
    );
  });

  it('normalizeStockEditDraft stores iPad SN uppercase with device_category IPAD', () => {
    const result = normalizeStockEditDraft({
      model: 'iPad Pro 11',
      capacity: '256GB',
      condition: 'Second',
      color: 'Space Gray',
      hasImei: true,
      deviceCategory: 'IPAD',
      imei: '  dmr9abcd12  ',
      price: '8.000.000',
      costPrice: '7.000.000',
      batteryHealth: '92',
      defectDescription: '',
    });

    expect(result).toEqual({
      ok: true,
      payload: {
        model: 'iPad Pro 11',
        capacity: '256GB',
        condition: 'Second',
        color: 'Space Gray',
        has_imei: true,
        device_category: 'IPAD',
        imei: 'DMR9ABCD12',
        price: 8_000_000,
        cost_price: 7_000_000,
        battery_health: 92,
        defect_description: '',
      },
    });
  });

  it('normalizeStockEditDraft rejects a bad SN for iPad', () => {
    const result = normalizeStockEditDraft({
      model: 'iPad Pro 11',
      capacity: '256GB',
      condition: 'Second',
      color: 'Space Gray',
      hasImei: true,
      deviceCategory: 'IPAD',
      imei: 'abc',
      price: '8.000.000',
      costPrice: '7.000.000',
      batteryHealth: '',
      defectDescription: '',
    });

    expect(result).toEqual({
      ok: false,
      message: 'Serial Number harus 8–14 karakter alfanumerik',
    });
  });
});
