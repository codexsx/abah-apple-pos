// Feature: role-based-access
// Pure, dependency-free domain module. No React, no Supabase imports.
//
// This is the property-tested core for Phase 6 role-based access: it maps a
// raw `profiles.role` value to an access level and exposes the finance-route
// set plus the Boss-only permission predicates. Every decision is fail-closed:
// only the exact role 'MANAJER' is treated as Boss; everything else (including
// null/undefined/empty/arbitrary strings) is Staff. No function ever throws.

// ---------- Domain types ----------

/** The persisted role values (`profiles.role`, CHECK-constrained). */
export type AppRole = 'MANAJER' | 'KASIR' | 'TEKNISI';

/** The derived access tier: Boss sees everything, Staff is gated. */
export type AccessLevel = 'BOSS' | 'STAFF';

// ---------- Constants ----------

/**
 * The finance route prefixes that are Boss-only. A path is a finance route
 * when it exactly equals one of these or is a sub-path (`entry + '/'`) of one
 * (Req 1.3).
 */
export const FINANCE_ROUTES: readonly string[] = [
  '/akun-kas',
  '/laporan/tutup-harian',
  '/laporan/keuangan',
] as const;

// ---------- Mapping ----------

/**
 * Map a raw role value to an access level (Req 1.1). Returns 'BOSS' IFF the
 * input is exactly 'MANAJER'; every other value — including null, undefined,
 * empty, and arbitrary strings — maps to 'STAFF' (fail closed). Total: never
 * throws.
 */
export function roleToAccessLevel(role: string | null | undefined): AccessLevel {
  return role === 'MANAJER' ? 'BOSS' : 'STAFF';
}

// ---------- Permission predicates ----------

/**
 * True iff the role may access the finance surfaces — Boss only (Req 1.1, 1.2).
 */
export function canAccessFinance(role: string | null | undefined): boolean {
  return roleToAccessLevel(role) === 'BOSS';
}

/**
 * True iff the role may view aggregate nominal figures — Boss only, identical
 * semantics to {@link canAccessFinance} (Req 1.1, 1.2).
 */
export function canViewNominal(role: string | null | undefined): boolean {
  return roleToAccessLevel(role) === 'BOSS';
}

// ---------- Route predicates ----------

/**
 * True iff `path` is a finance route: it exactly equals a {@link FINANCE_ROUTES}
 * entry, or is a sub-path of one (`startsWith(entry + '/')`) (Req 1.3). Robust
 * to a non-string or empty path (treated as not a finance route); never throws.
 */
export function isFinanceRoute(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0) {
    return false;
  }
  return FINANCE_ROUTES.some(
    (route) => path === route || path.startsWith(route + '/'),
  );
}

/**
 * True iff the role may access `path` (Req 1.4): finance routes require finance
 * permission (Boss only), all other routes are always allowed.
 */
export function canAccessRoute(
  role: string | null | undefined,
  path: string,
): boolean {
  return isFinanceRoute(path) ? canAccessFinance(role) : true;
}
