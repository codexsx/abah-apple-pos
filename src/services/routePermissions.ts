// Feature: route-permission-gates
// Shared mapping from application routes to feature permission keys. This keeps
// Navbar links, Home widgets, and direct route guards aligned.

import {
  effectivePermission,
  type PermissionKey,
  type PermissionOverrides,
} from '@/services/permissionsCore';

export interface RoutePermissionProfile {
  role?: string | null;
  permissions?: PermissionOverrides | null;
}

/**
 * Return the permission key required for a route, or null when a route is
 * intentionally public to every authenticated user.
 */
export function pathToPermission(path: string): PermissionKey | null {
  switch (path) {
    case '/penjualan':
    case '/riwayat/penjualan':
      return 'penjualan';
    case '/pembelian':
    case '/riwayat/pembelian':
      return 'pembelian';
    case '/servis':
      return 'servis';
    case '/pengeluaran':
    case '/pemasukan-lain':
    case '/riwayat/pengeluaran':
      return 'pengeluaran';
    case '/tukar-tambah':
    case '/riwayat/tukar-tambah':
      return 'tukar_tambah';
    case '/stok':
    case '/stok/pelengkap':
    case '/stok/sparepart':
    case '/ambil-pelengkap':
      return 'stok';
    case '/agen':
    case '/agen/riwayat':
      return 'agen';
    case '/laporan/keuangan':
    case '/akun-kas':
    case '/laporan/tutup-harian':
    case '/laporan/rekonsiliasi-kas':
      return 'finance';
    case '/pengaturan/perusahaan':
    case '/pengaturan/users':
    case '/staff-performance':
    case '/approval/transaksi':
      return 'manage_users';
    default:
      return null;
  }
}

export function canAccessPath(
  profile: RoutePermissionProfile | null | undefined,
  path: string,
): boolean {
  const permission = pathToPermission(path);
  if (permission === null) return true;
  return effectivePermission(profile?.role, profile?.permissions, permission);
}
