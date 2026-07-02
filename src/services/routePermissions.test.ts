import { describe, expect, it } from 'vitest';
import { canAccessPath, pathToPermission } from './routePermissions';

describe('routePermissions', () => {
  it('maps operational and history routes to the same feature gates as their source pages', () => {
    expect(pathToPermission('/penjualan')).toBe('penjualan');
    expect(pathToPermission('/riwayat/penjualan')).toBe('penjualan');
    expect(pathToPermission('/pemasukan-lain')).toBe('pengeluaran');
    expect(pathToPermission('/ambil-pelengkap')).toBe('stok');
    expect(pathToPermission('/laporan/tutup-harian')).toBe('finance');
    expect(pathToPermission('/pengaturan/perusahaan')).toBe('manage_users');
    expect(pathToPermission('/staff-performance')).toBe('manage_users');
    expect(pathToPermission('/approval/transaksi')).toBe('manage_users');
    expect(pathToPermission('/')).toBeNull();
  });

  it('allows MANAJER through every mapped route', () => {
    const profile = { role: 'MANAJER', permissions: { finance: false } };

    expect(canAccessPath(profile, '/laporan/tutup-harian')).toBe(true);
    expect(canAccessPath(profile, '/riwayat/pembelian')).toBe(true);
  });

  it('honours per-user overrides for Home/Navbar visibility and direct route guards', () => {
    const cashier = {
      role: 'KASIR',
      permissions: { penjualan: false, stok: false },
    };

    expect(canAccessPath(cashier, '/penjualan')).toBe(false);
    expect(canAccessPath(cashier, '/riwayat/penjualan')).toBe(false);
    expect(canAccessPath(cashier, '/stok/pelengkap')).toBe(false);
    expect(canAccessPath(cashier, '/pengeluaran')).toBe(true);
  });

  it('allows admin keuangan to access finance closing routes without user management', () => {
    const financeAdmin = {
      role: 'KEUANGAN',
      permissions: {},
    };

    expect(canAccessPath(financeAdmin, '/laporan/tutup-harian')).toBe(true);
    expect(canAccessPath(financeAdmin, '/akun-kas')).toBe(true);
    expect(canAccessPath(financeAdmin, '/pengeluaran')).toBe(true);
    expect(canAccessPath(financeAdmin, '/pengaturan/users')).toBe(false);
    expect(canAccessPath(financeAdmin, '/penjualan')).toBe(false);
  });
});
