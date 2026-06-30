// Feature: role-based-access
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import FinanceRoute from './FinanceRoute';

// Mock the auth context so the guard's decision is fully driven per-test.
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

describe('FinanceRoute — Boss-only guard (Req 2.1-2.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders finance content for a Boss (MANAJER)', () => {
    vi.mocked(useAuth).mockReturnValue({ profile: { role: 'MANAJER' }, isLoading: false } as any);
    renderGuard();
    expect(screen.queryByText('FINANCE CONTENT')).not.toBeNull();
  });

  it('redirects Staff (KASIR) to home, hiding finance content', () => {
    vi.mocked(useAuth).mockReturnValue({ profile: { role: 'KASIR' }, isLoading: false } as any);
    renderGuard();
    expect(screen.queryByText('FINANCE CONTENT')).toBeNull();
    expect(screen.queryByText('HOME')).not.toBeNull();
  });

  it('shows neither content nor home while loading', () => {
    vi.mocked(useAuth).mockReturnValue({ profile: { role: 'MANAJER' }, isLoading: true } as any);
    renderGuard();
    expect(screen.queryByText('FINANCE CONTENT')).toBeNull();
    expect(screen.queryByText('HOME')).toBeNull();
  });
});
