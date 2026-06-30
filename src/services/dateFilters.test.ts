import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { getDateRange, isInDateRange, type QuickFilter } from './dateFilters';

// Feature: riwayat-date-filter
// Property tests for the pure date-filter helpers.

const QUICK_FILTERS: QuickFilter[] = [
  'Hari Ini',
  '7 Hari',
  '30 Hari',
  'Bulan Ini',
  'Bulan Lalu',
];

describe('dateFilters.getDateRange', () => {
  it('returns a range where from <= to for every built-in quick filter', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...QUICK_FILTERS),
        fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        (filter, fromDate, toDate) => {
          const range = getDateRange(filter, fromDate, toDate);
          if (range.from && range.to) {
            expect(range.from <= range.to).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns the supplied custom dates for the Custom filter', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        (fromDate, toDate) => {
          const range = getDateRange('Custom', fromDate, toDate);
          expect(range.from).toBe(fromDate);
          expect(range.to).toBe(toDate);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('dateFilters.isInDateRange', () => {
  it('always returns true when both boundaries are empty', () => {
    fc.assert(
      fc.property(fc.string(), (isoDate) => {
        expect(isInDateRange(isoDate, { from: '', to: '' })).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('returns true iff the date is within an inclusive [from, to] range', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        (fromDate, toDate, candidate) => {
          const range = { from: fromDate, to: toDate };
          const result = isInDateRange(`${candidate}T12:00:00Z`, range);
          if (fromDate <= toDate) {
            expect(result).toBe(candidate >= fromDate && candidate <= toDate);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
