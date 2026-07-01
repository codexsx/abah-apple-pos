import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import type { AuthProfile } from '@/services/auth';
import Navbar from './Navbar';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

function profileFor(role: AuthProfile['role'], name = 'Test User'): AuthProfile {
  return {
    id: `${role.toLowerCase()}-id`,
    name,
    role,
    initials: name.slice(0, 2).toUpperCase(),
    email: `${role.toLowerCase()}@test.local`,
    username: role.toLowerCase(),
    permissions: {},
    avatar_url: null,
    avatar_crop_x: 50,
    avatar_crop_y: 50,
    avatar_zoom: 1,
  };
}

function setProfile(profile: AuthProfile) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    profile,
    isLoading: false,
    signIn: async () => undefined,
    signOut: async () => undefined,
    refreshProfile: async () => undefined,
  });
}

function setRole(role: AuthProfile['role']) {
  setProfile(profileFor(role));
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
  await screen.findByRole('dialog');
}

describe('Navbar finance-section access filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Boss sees the finance section and finance entries', async () => {
    setRole('MANAJER');
    renderNavbar();
    await openDrawer();

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Laporan Keuangan' })).toBeTruthy();
    expect(within(dialog).getByText('Akun & Kas')).toBeTruthy();
    expect(within(dialog).getByText('Tutup Harian')).toBeTruthy();
  });

  it('Staff does not see the finance section but keeps operational entries', async () => {
    setRole('KASIR');
    renderNavbar();
    await openDrawer();

    expect(screen.queryByText('Laporan Keuangan')).toBeNull();
    expect(screen.queryByText('Akun & Kas')).toBeNull();
    expect(screen.queryByText('Tutup Harian')).toBeNull();

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Pengeluaran')).toBeTruthy();
  });

  it('Admin/Keuangan sees finance entries and pengeluaran without boss settings', async () => {
    setProfile(profileFor('KEUANGAN', 'Finance'));
    renderNavbar();
    await openDrawer();

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Laporan Keuangan' })).toBeTruthy();
    expect(within(dialog).getByText('Tutup Harian')).toBeTruthy();
    expect(within(dialog).getByText('Pengeluaran')).toBeTruthy();
    expect(within(dialog).queryByText('Manajemen User')).toBeNull();
  });

  it('Staff still sees other operational sections', async () => {
    setRole('KASIR');
    renderNavbar();
    await openDrawer();

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Transaksi' })).toBeTruthy();
    expect(within(dialog).getByText('Stok HP')).toBeTruthy();
  });
});
