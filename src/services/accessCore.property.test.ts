import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { canAccessFinance, canViewNominal, canAccessRoute, isFinanceRoute, FINANCE_ROUTES, roleToAccessLevel } from './accessCore';

// ---------------------------------------------------------------------------
// Shared config & generators
// ---------------------------------------------------------------------------

const RUNS = { numRuns: 100 } as const;

/**
 * A role value mixing the known roles with edge/arbitrary values so the IFF
 * boundary around the exact string 'MANAJER' is exercised from both sides.
 */
const roleArb = fc.oneof(
  fc.constantFrom('MANAJER', 'KASIR', 'TEKNISI'),
  fc.constant(''),
  fc.string(),
);

// ---------------------------------------------------------------------------
// Property 1 (task: role-based-access)
// ---------------------------------------------------------------------------

describe('Property 1: Boss-only finance permission', () => {
  // Feature: role-based-access, Property 1
  // Validates: Requirements 1.1, 1.2
  it('grants finance + nominal access IFF the role is exactly MANAJER', () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        expect(canAccessFinance(role)).toBe(role === 'MANAJER');
        expect(canViewNominal(role)).toBe(role === 'MANAJER');
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2 (task: role-based-access)
// ---------------------------------------------------------------------------

describe('Property 2: Non-finance routes are always allowed', () => {
  // Feature: role-based-access, Property 2
  // Validates: Requirements 1.4, 2.5
  const nonFinancePathArb = fc
    .oneof(
      fc.constantFrom(
        '/',
        '/penjualan',
        '/pembelian',
        '/servis',
        '/pengeluaran',
        '/tukar-tambah',
        '/stok',
        '/agen',
        '/riwayat/penjualan',
      ),
      fc.string().map((s) => '/' + s),
    )
    .filter((p) => !isFinanceRoute(p));

  it('allows any role to access any non-finance route', () => {
    fc.assert(
      fc.property(roleArb, nonFinancePathArb, (role, path) => {
        expect(canAccessRoute(role, path)).toBe(true);
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3 (task: role-based-access)
// ---------------------------------------------------------------------------

describe('Property 3: Finance routes gated by finance permission', () => {
  // Feature: role-based-access, Property 3
  // Validates: Requirements 1.3, 1.4, 2.1, 2.2
  const financePathArb = fc
    .tuple(
      fc.constantFrom(...FINANCE_ROUTES),
      fc.oneof(
        fc.constant(''),
        fc.string().map((s) => '/' + s.replace(/\//g, '')),
      ),
    )
    .map(([base, suffix]) => base + suffix);

  it('gates any finance route (exact or sub-path) on finance permission for any role', () => {
    fc.assert(
      fc.property(roleArb, financePathArb, (role, path) => {
        expect(canAccessRoute(role, path)).toBe(canAccessFinance(role));
      }),
      RUNS,
    );
  });
});
// ---------------------------------------------------------------------------
// Property 4 (task: role-based-access)
// ---------------------------------------------------------------------------

describe('Property 4: Access level mapping is total and fail-closed', () => {
  // Feature: role-based-access, Property 4
  // Validates: Requirements 1.1, 5.2
  const inputArb = fc.oneof(
    fc.constantFrom('MANAJER', 'KASIR', 'TEKNISI'),
    fc.constant(''),
    fc.string(),
    fc.constant(null),
    fc.constant(undefined),
  );

  it('maps any input to BOSS IFF it is exactly MANAJER, else STAFF, and never throws', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        let result;
        expect(() => {
          result = roleToAccessLevel(input as any);
        }).not.toThrow();
        expect(result).toBe(input === 'MANAJER' ? 'BOSS' : 'STAFF');
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5 (task: role-based-access)
// ---------------------------------------------------------------------------

describe('Property 5: Pengeluaran is always accessible', () => {
  // Feature: role-based-access, Property 5
  // Validates: Requirements 2.5, 3.3
  it('allows any role to access /pengeluaran (expenses are never a finance route)', () => {
    expect(isFinanceRoute('/pengeluaran')).toBe(false);
    fc.assert(
      fc.property(roleArb, (role) => {
        expect(canAccessRoute(role, '/pengeluaran')).toBe(true);
      }),
      RUNS,
    );
  });
});
