// Feature: role-based-access
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import type { AuthProfile } from '@/services/auth';
import FinanceRoute from './FinanceRoute';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/akun-kas']}>
      <Routes>
        <Route path="/" element={<div>HOME</div>} />
        <Route
          path="/akun-kas"
          element={
            <FinanceRoute>
              <div>FINANCE CONTENT</div>
            </FinanceRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function testProfile(role: AuthProfile['role'], permissions: AuthProfile['permissions'] = {}): AuthProfile {
  return {
    id: `${role.toLowerCase()}-id`,
    name: role,
    role,
    initials: role.slice(0, 2),
    email: `${role.toLowerCase()}@test.local`,
    username: role.toLowerCase(),
    permissions,
    avatar_url: null,
    avatar_crop_x: 50,
    avatar_crop_y: 50,
    avatar_zoom: 1,
  };
}

function mockAuth(value: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    profile: null,
    isLoading: false,
    signIn: async () => undefined,
    signOut: async () => undefined,
    refreshProfile: async () => undefined,
    ...value,
  });
}

describe('FinanceRoute finance guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders finance content for Boss users', () => {
    mockAuth({ profile: testProfile('MANAJER') });
    renderGuard();
    expect(screen.queryByText('FINANCE CONTENT')).not.toBeNull();
  });

  it('renders finance content for Admin/Keuangan users', () => {
    mockAuth({ profile: testProfile('KEUANGAN') });
    renderGuard();
    expect(screen.queryByText('FINANCE CONTENT')).not.toBeNull();
  });

  it('redirects Staff users to home', () => {
    mockAuth({ profile: testProfile('KASIR') });
    renderGuard();
    expect(screen.queryByText('FINANCE CONTENT')).toBeNull();
    expect(screen.queryByText('HOME')).not.toBeNull();
  });

  it('shows neither content nor home while loading', () => {
    mockAuth({ profile: testProfile('MANAJER'), isLoading: true });
    renderGuard();
    expect(screen.queryByText('FINANCE CONTENT')).toBeNull();
    expect(screen.queryByText('HOME')).toBeNull();
  });
});
