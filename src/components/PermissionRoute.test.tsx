// Feature: user-management — per-feature route guard
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import PermissionRoute from './PermissionRoute';

// Mock the auth context so the guard's decision is fully driven per-test.
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/penjualan']}>
      <Routes>
        <Route path="/" element={<div>HOME</div>} />
        <Route
          path="/penjualan"
          element={
            <PermissionRoute permission="penjualan">
              <div>PENJUALAN CONTENT</div>
            </PermissionRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PermissionRoute — per-feature guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders content for MANAJER (always permitted)', () => {
    vi.mocked(useAuth).mockReturnValue({ profile: { role: 'MANAJER', permissions: {} }, isLoading: false } as any);
    renderGuard();
    expect(screen.queryByText('PENJUALAN CONTENT')).not.toBeNull();
  });

  it('renders content for KASIR (penjualan granted by role default)', () => {
    vi.mocked(useAuth).mockReturnValue({ profile: { role: 'KASIR', permissions: {} }, isLoading: false } as any);
    renderGuard();
    expect(screen.queryByText('PENJUALAN CONTENT')).not.toBeNull();
  });

  it('redirects TEKNISI to home (penjualan denied by role default)', () => {
    vi.mocked(useAuth).mockReturnValue({ profile: { role: 'TEKNISI', permissions: {} }, isLoading: false } as any);
    renderGuard();
    expect(screen.queryByText('PENJUALAN CONTENT')).toBeNull();
    expect(screen.queryByText('HOME')).not.toBeNull();
  });

  it('honours a per-user override that revokes a default-granted feature', () => {
    vi.mocked(useAuth).mockReturnValue({
      profile: { role: 'KASIR', permissions: { penjualan: false } },
      isLoading: false,
    } as any);
    renderGuard();
    expect(screen.queryByText('PENJUALAN CONTENT')).toBeNull();
    expect(screen.queryByText('HOME')).not.toBeNull();
  });

  it('shows neither content nor home while loading', () => {
    vi.mocked(useAuth).mockReturnValue({ profile: { role: 'MANAJER', permissions: {} }, isLoading: true } as any);
    renderGuard();
    expect(screen.queryByText('PENJUALAN CONTENT')).toBeNull();
    expect(screen.queryByText('HOME')).toBeNull();
  });
});
