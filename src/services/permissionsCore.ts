// Feature: user-management
// Pure, dependency-free domain module. No React, no Supabase imports.
//
// This is the property-tested core for Phase 9 user management: it resolves a
// login identifier into an authentication email (Req 1) and computes the
// effective per-feature permissions for a role, honouring per-user overrides
// (Req 2). Every decision is fail-closed: an unknown role grants nothing, a
// missing override falls back to the role default, and MANAJER is always fully
// permitted. No function ever throws and no input is ever mutated.

// ---------- Constants ----------

/** The canonical, ordered set of permission keys gating each feature (Req 2). */
export const PERMISSION_KEYS = [
  'finance',
  'manage_users',
  'penjualan',
  'pembelian',
  'servis',
  'pengeluaran',
  'tukar_tambah',
  'stok',
  'agen',
] as const;

// ---------- Domain types ----------

/** A single feature permission key (Req 2). */
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/**
 * The persisted role values (`profiles.role`, CHECK-constrained). Re-declared
 * locally to keep this module pure and independent of accessCore.
 */
export type AppRole = 'MANAJER' | 'KEUANGAN' | 'KASIR' | 'TEKNISI';

/** A sparse per-user override map; an absent key means "use the role default" (Req 2). */
export type PermissionOverrides = Partial<Record<PermissionKey, boolean>>;

/**
 * The baseline permission grants per role (Req 2):
 * - MANAJER: every feature is granted.
 * - KEUANGAN: finance surfaces plus pengeluaran/closing adjustments.
 * - KASIR: all operational features except `finance` and `manage_users`.
 * - TEKNISI: only `servis` and `stok`.
 */
export const ROLE_DEFAULTS: Record<AppRole, Record<PermissionKey, boolean>> = {
  MANAJER: {
    finance: true,
    manage_users: true,
    penjualan: true,
    pembelian: true,
    servis: true,
    pengeluaran: true,
    tukar_tambah: true,
    stok: true,
    agen: true,
  },
  KEUANGAN: {
    finance: true,
    manage_users: false,
    penjualan: false,
    pembelian: false,
    servis: false,
    pengeluaran: true,
    tukar_tambah: false,
    stok: false,
    agen: false,
  },
  KASIR: {
    finance: false,
    manage_users: false,
    penjualan: true,
    pembelian: true,
    servis: true,
    pengeluaran: true,
    tukar_tambah: true,
    stok: true,
    agen: true,
  },
  TEKNISI: {
    finance: false,
    manage_users: false,
    penjualan: false,
    pembelian: false,
    servis: true,
    pengeluaran: false,
    tukar_tambah: false,
    stok: true,
    agen: false,
  },
};

// ---------- Username / email resolution (Req 1) ----------

/**
 * Normalize a raw username (Req 1): coerce a non-string to '', trim, lowercase,
 * and strip any character that is not `[a-z0-9._-]`. Returns the cleaned string
 * (which may be empty). Never throws, never mutates.
 */
export function normalizeUsername(raw: string): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

/**
 * Resolve a login identifier into an authentication email (Req 1). A non-string
 * identifier is coerced to ''. The trimmed identifier is returned lowercased
 * verbatim when it already contains '@'; otherwise the normalized username is
 * suffixed with `@${domain}`. An empty/blank identifier resolves to ''. Never
 * throws, never mutates.
 */
export function resolveLoginEmail(identifier: string, domain = 'gmail.com'): string {
  const trimmed = typeof identifier === 'string' ? identifier.trim() : '';
  if (trimmed === '') return '';
  if (trimmed.includes('@')) return trimmed.toLowerCase();
  const u = normalizeUsername(trimmed);
  return u === '' ? '' : `${u}@${domain}`;
}

// ---------- Effective permissions (Req 2) ----------

/**
 * Resolve the effective grant for a single feature key (Req 2): MANAJER is
 * always permitted (overrides ignored); otherwise a boolean override for the
 * key wins; otherwise the role default applies. An unknown role yields false
 * (fail closed). Never throws, never mutates.
 */
export function effectivePermission(
  role: string | null | undefined,
  overrides: PermissionOverrides | null | undefined,
  key: PermissionKey,
): boolean {
  if (role === 'MANAJER') return true;
  if (overrides != null && typeof overrides === 'object') {
    const override = overrides[key];
    if (typeof override === 'boolean') return override;
  }
  return ROLE_DEFAULTS[role as AppRole]?.[key] ?? false;
}

/**
 * Build the full effective permission map by resolving every key in
 * {@link PERMISSION_KEYS} via {@link effectivePermission} (Req 2). Never throws,
 * never mutates.
 */
export function effectivePermissions(
  role: string | null | undefined,
  overrides: PermissionOverrides | null | undefined,
): Record<PermissionKey, boolean> {
  const result = {} as Record<PermissionKey, boolean>;
  for (const key of PERMISSION_KEYS) {
    result[key] = effectivePermission(role, overrides, key);
  }
  return result;
}
