import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
  },
}));

import {
  getOwnStaffPerformance,
  getStaffPerformanceLeaderboard,
} from './staffPerformance';

beforeEach(() => {
  mocks.rpc.mockReset();
});

describe('staffPerformance service', () => {
  it('loads and enriches the current staff performance summary', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        staff_id: 'staff-1',
        staff_name: 'Regga',
        role: 'KASIR',
        avatar_url: null,
        previous_month_units: 90,
        current_month_units: 12,
        lifetime_units: 100,
        active_sales_staff: 5,
      }],
      error: null,
    });

    const result = await getOwnStaffPerformance();

    expect(mocks.rpc).toHaveBeenCalledWith('get_own_staff_performance');
    expect(result).toMatchObject({
      staff_id: 'staff-1',
      batch: 'Gold',
      level: 4,
      xp: 1000,
      targetUnits: 100,
    });
  });

  it('loads the boss-only leaderboard from the all-staff rpc', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          staff_id: 'staff-2',
          staff_name: 'Ayu',
          role: 'KASIR',
          avatar_url: null,
          previous_month_units: 160,
          current_month_units: 20,
          lifetime_units: 220,
          active_sales_staff: 5,
        },
      ],
      error: null,
    });

    const rows = await getStaffPerformanceLeaderboard();

    expect(mocks.rpc).toHaveBeenCalledWith('get_staff_performance_leaderboard');
    expect(rows[0]).toMatchObject({
      staff_id: 'staff-2',
      batch: 'Lord',
      nextBatch: null,
    });
  });
});
