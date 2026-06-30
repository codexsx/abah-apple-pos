import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  computeBalance,
  isOverdraft,
  normalizeName,
  validateAccountInput,
  validateLedgerEntryInput,
  validateManualAdjustment,
  MAX_IDR,
  MIN_AMOUNT,
  MIN_OPENING_BALANCE,
  NAME_MAX,
  NOTE_MAX,
  SOURCE_REF_MAX,
  type LedgerEntryCore,
  type AccountInputCore,
  type LedgerEntryInputCore,
  type Direction,
} from './accountsCore';

// ---------------------------------------------------------------------------
// Shared generators
// ---------------------------------------------------------------------------

const RUNS = { numRuns: 100 } as const;

/** Opening balance in the inclusive domain 0 … MAX_IDR. */
const openingArb = fc.integer({ min: MIN_OPENING_BALANCE, max: MAX_IDR });

/** A valid ledger entry amount: integer 1 … MAX_IDR. */
const amountArb = fc.integer({ min: MIN_AMOUNT, max: MAX_IDR });

const directionArb = fc.constantFrom<Direction>('money_in', 'money_out');

/** A valid LedgerEntryCore. */
const entryArb: fc.Arbitrary<LedgerEntryCore> = fc.record({
  direction: directionArb,
  amount: amountArb,
});

/** A list of valid ledger entries, including the empty list. */
const entriesArb = fc.array(entryArb, { maxLength: 50 });

const LETTERS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Non-empty, non-whitespace string of a given length window. */
function lettersArb(minLength: number, maxLength: number): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...LETTERS.split('')), { minLength, maxLength })
    .map((chars) => chars.join(''));
}

/** Whitespace-only string (may be empty). */
const whitespaceArb = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'), { maxLength: 6 })
  .map((chars) => chars.join(''));

// Deterministic, fast-check-seeded shuffle so permutations are reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Property 1
// ---------------------------------------------------------------------------

describe('Property 1: Balance Invariant', () => {
  // Feature: financial-accounts, Property 1: Balance Invariant
  it('computeBalance equals opening + Σ(money_in) − Σ(money_out)', () => {
    fc.assert(
      fc.property(openingArb, entriesArb, (opening, entries) => {
        // Independent reference sum (never clamped, may go negative).
        let reference = opening;
        for (const entry of entries) {
          if (entry.direction === 'money_in') {
            reference += entry.amount;
          } else {
            reference -= entry.amount;
          }
        }
        expect(computeBalance(opening, entries)).toBe(reference);
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2
// ---------------------------------------------------------------------------

describe('Property 2: Balance Order Independence', () => {
  // Feature: financial-accounts, Property 2: Balance Order Independence
  it('computeBalance is invariant under permutation of the entries', () => {
    fc.assert(
      fc.property(
        openingArb,
        entriesArb,
        fc.integer({ min: 1, max: 0xffffffff }),
        (opening, entries, seed) => {
          const permuted = seededShuffle(entries, seed);
          expect(computeBalance(opening, permuted)).toBe(
            computeBalance(opening, entries),
          );
        },
      ),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3
// ---------------------------------------------------------------------------

describe('Property 3: Name Normalization Is Idempotent and Case-Insensitive', () => {
  // Feature: financial-accounts, Property 3: Name Normalization Is Idempotent and Case-Insensitive
  it('is idempotent and collides on case/whitespace-only differences', () => {
    fc.assert(
      fc.property(
        lettersArb(1, 40),
        whitespaceArb,
        whitespaceArb,
        whitespaceArb,
        whitespaceArb,
        (base, ws1, ws2, ws3, ws4) => {
          const key = normalizeName(base);

          // Idempotence: normalizing an already-normalized value is a fixpoint.
          expect(normalizeName(key)).toBe(key);

          // Two variants differing only by surrounding whitespace and letter
          // case normalize to the same key.
          const upperVariant = `${ws1}${base.toUpperCase()}${ws2}`;
          const lowerVariant = `${ws3}${base.toLowerCase()}${ws4}`;
          expect(normalizeName(upperVariant)).toBe(key);
          expect(normalizeName(lowerVariant)).toBe(key);
          expect(normalizeName(upperVariant)).toBe(normalizeName(lowerVariant));
        },
      ),
      RUNS,
    );
  });

  // Feature: financial-accounts, Property 3: Name Normalization Is Idempotent and Case-Insensitive
  it('is idempotent for arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(normalizeName(normalizeName(s))).toBe(normalizeName(s));
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4
// ---------------------------------------------------------------------------

const validTypeArb = fc.constantFrom<'Cash' | 'Bank'>('Cash', 'Bank');
const validNameArb = lettersArb(1, NAME_MAX); // raw length 1..100, trimmed non-empty
const validNoteArb = fc
  .array(fc.constantFrom(...LETTERS.split(''), ' '), { maxLength: NOTE_MAX })
  .map((chars) => chars.join(''));
// Omitted opening is treated as 0; otherwise integer 0..MAX_IDR.
const validOpeningArb = fc.option(openingArb, { nil: undefined });

describe('Property 4: Account Input Validation Accepts Exactly the Valid Domain', () => {
  // Feature: financial-accounts, Property 4: Account Input Validation Accepts Exactly the Valid Domain
  it('accepts in-domain account inputs (omitted opening => 0)', () => {
    fc.assert(
      fc.property(
        validNameArb,
        validTypeArb,
        validNoteArb,
        validOpeningArb,
        (name, type, note, openingBalance) => {
          const input: AccountInputCore = { name, type, note, openingBalance };
          expect(validateAccountInput(input)).toEqual({ ok: true });
        },
      ),
      RUNS,
    );
  });

  // Feature: financial-accounts, Property 4: Account Input Validation Accepts Exactly the Valid Domain
  it('rejects empty/whitespace name with NAME_REQUIRED', () => {
    fc.assert(
      fc.property(
        whitespaceArb,
        validTypeArb,
        validNoteArb,
        validOpeningArb,
        (name, type, note, openingBalance) => {
          const result = validateAccountInput({ name, type, note, openingBalance });
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.code).toBe('NAME_REQUIRED');
        },
      ),
      RUNS,
    );
  });

  // Feature: financial-accounts, Property 4: Account Input Validation Accepts Exactly the Valid Domain
  it('rejects over-long name with NAME_TOO_LONG', () => {
    fc.assert(
      fc.property(
        lettersArb(NAME_MAX + 1, NAME_MAX + 60),
        validTypeArb,
        validNoteArb,
        validOpeningArb,
        (name, type, note, openingBalance) => {
          const result = validateAccountInput({ name, type, note, openingBalance });
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.code).toBe('NAME_TOO_LONG');
        },
      ),
      RUNS,
    );
  });

  // Feature: financial-accounts, Property 4: Account Input Validation Accepts Exactly the Valid Domain
  it('rejects over-long note with NOTE_TOO_LONG', () => {
    fc.assert(
      fc.property(
        validNameArb,
        validTypeArb,
        lettersArb(NOTE_MAX + 1, NOTE_MAX + 60),
        validOpeningArb,
        (name, type, note, openingBalance) => {
          const result = validateAccountInput({ name, type, note, openingBalance });
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.code).toBe('NOTE_TOO_LONG');
        },
      ),
      RUNS,
    );
  });

  // Feature: financial-accounts, Property 4: Account Input Validation Accepts Exactly the Valid Domain
  it('rejects invalid type with TYPE_INVALID', () => {
    const invalidTypeArb = fc
      .string()
      .filter((s) => s !== 'Cash' && s !== 'Bank');
    fc.assert(
      fc.property(
        validNameArb,
        invalidTypeArb,
        validNoteArb,
        validOpeningArb,
        (name, type, note, openingBalance) => {
          const result = validateAccountInput({
            name,
            type: type as 'Cash' | 'Bank',
            note,
            openingBalance,
          });
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.code).toBe('TYPE_INVALID');
        },
      ),
      RUNS,
    );
  });

  // Feature: financial-accounts, Property 4: Account Input Validation Accepts Exactly the Valid Domain
  it('rejects out-of-range opening balance with OPENING_OUT_OF_RANGE', () => {
    const invalidOpeningArb = fc.oneof(
      fc.integer({ min: -MAX_IDR, max: -1 }), // negative
      fc.integer({ min: MAX_IDR + 1, max: MAX_IDR + 1_000_000 }), // too large
      fc
        .double({ min: 0.1, max: 1000, noNaN: true })
        .filter((n) => !Number.isInteger(n)), // non-integer
    );
    fc.assert(
      fc.property(
        validNameArb,
        validTypeArb,
        validNoteArb,
        invalidOpeningArb,
        (name, type, note, openingBalance) => {
          const result = validateAccountInput({ name, type, note, openingBalance });
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.code).toBe('OPENING_OUT_OF_RANGE');
        },
      ),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5
// ---------------------------------------------------------------------------

const validSourceRefArb = lettersArb(1, SOURCE_REF_MAX);

describe('Property 5: Ledger Input Validation Accepts Exactly the Valid Domain', () => {
  // Feature: financial-accounts, Property 5: Ledger Input Validation Accepts Exactly the Valid Domain
  it('accepts in-domain ledger entry inputs', () => {
    fc.assert(
      fc.property(
        directionArb,
        amountArb,
        validSourceRefArb,
        validNoteArb,
        (direction, amount, sourceReference, note) => {
          const input: LedgerEntryInputCore = {
            direction,
            amount,
            sourceReference,
            note,
          };
          expect(validateLedgerEntryInput(input)).toEqual({ ok: true });
        },
      ),
      RUNS,
    );
  });

  // Feature: financial-accounts, Property 5: Ledger Input Validation Accepts Exactly the Valid Domain
  it('rejects invalid direction with DIRECTION_INVALID', () => {
    const invalidDirectionArb = fc
      .string()
      .filter((s) => s !== 'money_in' && s !== 'money_out');
    fc.assert(
      fc.property(
        invalidDirectionArb,
        amountArb,
        validSourceRefArb,
        validNoteArb,
        (direction, amount, sourceReference, note) => {
          const result = validateLedgerEntryInput({
            direction: direction as Direction,
            amount,
            sourceReference,
            note,
          });
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.code).toBe('DIRECTION_INVALID');
        },
      ),
      RUNS,
    );
  });

  // Feature: financial-accounts, Property 5: Ledger Input Validation Accepts Exactly the Valid Domain
  it('rejects out-of-range amount with AMOUNT_OUT_OF_RANGE', () => {
    const invalidAmountArb = fc.oneof(
      fc.integer({ min: -MAX_IDR, max: 0 }), // < MIN_AMOUNT (includes 0)
      fc.integer({ min: MAX_IDR + 1, max: MAX_IDR + 1_000_000 }), // too large
      fc
        .double({ min: 1.1, max: 1000, noNaN: true })
        .filter((n) => !Number.isInteger(n)), // non-integer
    );
    fc.assert(
      fc.property(
        directionArb,
        invalidAmountArb,
        validSourceRefArb,
        validNoteArb,
        (direction, amount, sourceReference, note) => {
          const result = validateLedgerEntryInput({
            direction,
            amount,
            sourceReference,
            note,
          });
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.code).toBe('AMOUNT_OUT_OF_RANGE');
        },
      ),
      RUNS,
    );
  });

  // Feature: financial-accounts, Property 5: Ledger Input Validation Accepts Exactly the Valid Domain
  it('rejects empty/over-long source reference with SOURCE_REF_INVALID', () => {
    const invalidSourceRefArb = fc.oneof(
      fc.constant(''),
      lettersArb(SOURCE_REF_MAX + 1, SOURCE_REF_MAX + 60),
    );
    fc.assert(
      fc.property(
        directionArb,
        amountArb,
        invalidSourceRefArb,
        validNoteArb,
        (direction, amount, sourceReference, note) => {
          const result = validateLedgerEntryInput({
            direction,
            amount,
            sourceReference,
            note,
          });
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.code).toBe('SOURCE_REF_INVALID');
        },
      ),
      RUNS,
    );
  });

  // Feature: financial-accounts, Property 5: Ledger Input Validation Accepts Exactly the Valid Domain
  it('rejects over-long note with NOTE_TOO_LONG', () => {
    fc.assert(
      fc.property(
        directionArb,
        amountArb,
        validSourceRefArb,
        lettersArb(NOTE_MAX + 1, NOTE_MAX + 60),
        (direction, amount, sourceReference, note) => {
          const result = validateLedgerEntryInput({
            direction,
            amount,
            sourceReference,
            note,
          });
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.code).toBe('NOTE_TOO_LONG');
        },
      ),
      RUNS,
    );
  });

  // Feature: financial-accounts, Property 5: Ledger Input Validation Accepts Exactly the Valid Domain
  it('validateManualAdjustment accepts valid ledger input with a non-empty trimmed note', () => {
    fc.assert(
      fc.property(
        directionArb,
        amountArb,
        validSourceRefArb,
        lettersArb(1, 200), // guaranteed non-empty after trim
        (direction, amount, sourceReference, note) => {
          expect(
            validateManualAdjustment({ direction, amount, sourceReference, note }),
          ).toEqual({ ok: true });
        },
      ),
      RUNS,
    );
  });

  // Feature: financial-accounts, Property 5: Ledger Input Validation Accepts Exactly the Valid Domain
  it('validateManualAdjustment rejects empty/whitespace note with ADJUSTMENT_NOTE_REQUIRED', () => {
    fc.assert(
      fc.property(
        directionArb,
        amountArb,
        validSourceRefArb,
        whitespaceArb, // empty or whitespace-only => trimmed empty
        (direction, amount, sourceReference, note) => {
          const result = validateManualAdjustment({
            direction,
            amount,
            sourceReference,
            note,
          });
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.code).toBe('ADJUSTMENT_NOTE_REQUIRED');
        },
      ),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6
// ---------------------------------------------------------------------------

describe('Property 6: Overdraft Detection', () => {
  // Feature: financial-accounts, Property 6: Overdraft Detection
  it('isOverdraft(b) is true iff b < 0', () => {
    const balanceArb = fc.oneof(
      fc.integer({ min: -MAX_IDR, max: -1 }), // negative
      fc.constant(0), // zero
      fc.integer({ min: 1, max: MAX_IDR }), // positive
      fc.integer(), // full integer range
    );
    fc.assert(
      fc.property(balanceArb, (b) => {
        expect(isOverdraft(b)).toBe(b < 0);
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7
// ---------------------------------------------------------------------------

interface PickerAccount {
  id: string;
  name: string;
  type: 'Cash' | 'Bank';
  current_balance: number;
  is_archived: boolean;
}

const pickerAccountArb: fc.Arbitrary<PickerAccount> = fc.record({
  id: fc.uuid(),
  name: lettersArb(1, 30),
  type: validTypeArb,
  current_balance: fc.integer({ min: -MAX_IDR, max: MAX_IDR }),
  is_archived: fc.boolean(),
});

describe('Property 7: Account Picker Returns Exactly the Active Accounts', () => {
  // Feature: financial-accounts, Property 7: Account Picker Returns Exactly the Active Accounts
  it('returns exactly the non-archived accounts, preserving fields', () => {
    fc.assert(
      fc.property(
        fc.array(pickerAccountArb, { maxLength: 40 }),
        (accounts) => {
          // The active-only filter applied by the service.
          const filtered = accounts.filter((a) => !a.is_archived);

          // Returns exactly the active subset (count + identity-preserving).
          const expectedActive = accounts.filter(
            (a) => a.is_archived === false,
          );
          expect(filtered).toEqual(expectedActive);

          // No archived account leaks through.
          expect(filtered.every((a) => a.is_archived === false)).toBe(true);

          // Every field is preserved unchanged.
          for (const account of filtered) {
            expect(accounts).toContainEqual(account);
          }

          // Empty list when no account is active.
          if (accounts.every((a) => a.is_archived)) {
            expect(filtered).toEqual([]);
          }
        },
      ),
      RUNS,
    );
  });
});
