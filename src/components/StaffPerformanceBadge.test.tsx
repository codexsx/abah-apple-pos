import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StaffPerformanceBadge from './StaffPerformanceBadge';

describe('StaffPerformanceBadge', () => {
  it('renders batch, level, and monthly unit progress', () => {
    render(
      <StaffPerformanceBadge
        performance={{
          staff_id: 'staff-1',
          staff_name: 'Regga',
          role: 'KASIR',
          avatar_url: null,
          previous_month_units: 90,
          current_month_units: 12,
          lifetime_units: 100,
          active_sales_staff: 5,
          batch: 'Gold',
          targetUnits: 100,
          nextBatch: 'Platinum',
          nextBatchUnits: 120,
          batchProgressPercent: 75,
          level: 4,
          xp: 1000,
          currentLevelXp: 900,
          nextLevelXp: 1600,
          levelProgressPercent: 14,
        }}
      />,
    );

    expect(screen.getByText('Gold')).toBeVisible();
    expect(screen.getByText('Level 4')).toBeVisible();
    expect(screen.getByText('12 unit bulan ini')).toBeVisible();
    expect(screen.getByText('Target 100 unit/staff')).toBeVisible();
  });

  it('renders a loading state without showing stale performance text', () => {
    render(<StaffPerformanceBadge performance={null} loading />);

    expect(screen.getByText('Memuat performa')).toBeVisible();
    expect(screen.queryByText(/Level/i)).not.toBeInTheDocument();
  });
});
