import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

// Phase 6 — role-based access. The Navbar filters the finance "Laporan
// Keuangan" section out of the quick-access Sheet drawer for non-Boss roles
// via `canAccessFinance(profile?.role)`. We mock `useAuth` with vi.fn() so each
// test can drive the active role (and therefore the access decision).
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '@/contexts/AuthContext';
import Navbar from './Navbar';

function setRole(role: string) {
  vi.mocked(useAuth).mockReturnValue({
    profile: { role, name: 'Test User', initials: 'TU' },
    signOut: vi.fn(),
  } as any);
}

function renderNavbar() {
  return render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>,
  );
}

async function openDrawer() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Menu cepat' }));
  // Wait for the radix Sheet portal content to mount.
  await screen.findByRole('dialog');
}

describe('Navbar — finance-section access filtering (Phase 6, role-based-access)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Boss (MANAJER) sees the Laporan Keuangan section and its finance entries', async () => {
    setRole('MANAJER');
    renderNavbar();
    await openDrawer();

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Laporan Keuangan' })).toBeTruthy();
    expect(within(dialog).getByText('Akun & Kas')).toBeTruthy();
    expect(within(dialog).getByText('Tutup Harian')).toBeTruthy();
  });

  it('Staff (KASIR) does not see the finance section or its entries, but keeps operational entries', async () => {
    setRole('KASIR');
    renderNavbar();
    await openDrawer();

    // Finance surfaces are hidden for non-Boss roles.
    expect(screen.queryByText('Laporan Keuangan')).toBeNull();
    expect(screen.queryByText('Akun & Kas')).toBeNull();
    expect(screen.queryByText('Tutup Harian')).toBeNull();

    // Operational entry stays visible.
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Pengeluaran')).toBeTruthy();
  });

  it('Staff (KASIR) still sees other operational sections (Transaksi, Stok HP)', async () => {
    setRole('KASIR');
    renderNavbar();
    await openDrawer();

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Transaksi' })).toBeTruthy();
    expect(within(dialog).getByText('Stok HP')).toBeTruthy();
  });
});
