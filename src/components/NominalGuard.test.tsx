// Feature: role-based-access (Phase 6)
// Component tests for NominalGuard (Req 4).
// Uses the real pure accessCore; only useAuth is mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import NominalGuard from './NominalGuard';
import { useAuth } from '@/contexts/AuthContext';

// Mock ONLY the auth context — accessCore stays real.
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));

/** Drive the guard by setting the current user's role. */
function setRole(role: string) {
  vi.mocked(useAuth).mockReturnValue({ profile: { role } } as any);
}

describe('NominalGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the nominal figure for the Boss (MANAJER) and no placeholder', () => {
    setRole('MANAJER');

    render(
      <NominalGuard>
        <span>Rp 1.000.000</span>
      </NominalGuard>,
    );

    expect(screen.getByText('Rp 1.000.000')).toBeTruthy();
    expect(screen.queryByText('••••')).toBeNull();
  });

  it('masks the nominal figure for Staff (KASIR) with the default placeholder', () => {
    setRole('KASIR');

    render(
      <NominalGuard>
        <span>Rp 1.000.000</span>
      </NominalGuard>,
    );

    expect(screen.queryByText('Rp 1.000.000')).toBeNull();
    expect(screen.getByText('••••')).toBeTruthy();
  });

  it('renders a custom placeholder for Staff instead of the value', () => {
    setRole('KASIR');

    render(
      <NominalGuard placeholder="—">
        <span>Rp 5.000</span>
      </NominalGuard>,
    );

    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText('Rp 5.000')).toBeNull();
  });

  it('keeps surrounding operational content while masking the value for Staff', () => {
    setRole('KASIR');

    const { container } = render(
      <div>
        Total Hutang{' '}
        <NominalGuard>
          <span>Rp 9</span>
        </NominalGuard>
      </div>,
    );

    // Surrounding operational label still renders.
    expect(screen.getByText(/Total Hutang/)).toBeTruthy();
    // The nominal value is masked, the placeholder is shown in its place.
    expect(screen.queryByText('Rp 9')).toBeNull();
    expect(container.textContent).toContain('••••');
  });
});
