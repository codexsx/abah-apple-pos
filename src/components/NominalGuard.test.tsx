// Feature: role-based-access
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAuth } from '@/contexts/AuthContext';
import type { AuthProfile } from '@/services/auth';
import NominalGuard from './NominalGuard';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));

function testProfile(role: AuthProfile['role']): AuthProfile {
  return {
    id: `${role.toLowerCase()}-id`,
    name: role,
    role,
    initials: role.slice(0, 2),
    email: `${role.toLowerCase()}@test.local`,
    username: role.toLowerCase(),
    permissions: {},
    avatar_url: null,
    avatar_crop_x: 50,
    avatar_crop_y: 50,
    avatar_zoom: 1,
  };
}

function setRole(role: AuthProfile['role']) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    profile: testProfile(role),
    isLoading: false,
    signIn: async () => undefined,
    signOut: async () => undefined,
    refreshProfile: async () => undefined,
  });
}

describe('NominalGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the nominal figure for Boss users', () => {
    setRole('MANAJER');

    render(
      <NominalGuard placeholder="MASKED">
        <span>Rp 1.000.000</span>
      </NominalGuard>,
    );

    expect(screen.getByText('Rp 1.000.000')).toBeTruthy();
    expect(screen.queryByText('MASKED')).toBeNull();
  });

  it('renders the nominal figure for Admin/Keuangan users', () => {
    setRole('KEUANGAN');

    render(
      <NominalGuard placeholder="MASKED">
        <span>Rp 1.000.000</span>
      </NominalGuard>,
    );

    expect(screen.getByText('Rp 1.000.000')).toBeTruthy();
    expect(screen.queryByText('MASKED')).toBeNull();
  });

  it('masks the nominal figure for Staff users', () => {
    setRole('KASIR');

    render(
      <NominalGuard placeholder="MASKED">
        <span>Rp 1.000.000</span>
      </NominalGuard>,
    );

    expect(screen.queryByText('Rp 1.000.000')).toBeNull();
    expect(screen.getByText('MASKED')).toBeTruthy();
  });

  it('keeps surrounding operational content while masking the value for Staff', () => {
    setRole('KASIR');

    const { container } = render(
      <div>
        Total Hutang{' '}
        <NominalGuard placeholder="MASKED">
          <span>Rp 9</span>
        </NominalGuard>
      </div>,
    );

    expect(screen.getByText(/Total Hutang/)).toBeTruthy();
    expect(screen.queryByText('Rp 9')).toBeNull();
    expect(container.textContent).toContain('MASKED');
  });
});
