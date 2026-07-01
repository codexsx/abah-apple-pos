import { describe, expect, it } from 'vitest';

import {
  calculateDistanceMeters,
  calculateLateMinutes,
  calculateLatePenalty,
  isWithinRadius,
  normalizeShifts,
} from './attendanceCore';

describe('attendanceCore', () => {
  it('calculates short GPS distance and radius status', () => {
    const store = { latitude: -0.0249301, longitude: 109.3188553 };
    const nearby = { latitude: -0.0249, longitude: 109.3189 };

    const distance = calculateDistanceMeters(store, nearby);

    expect(distance).toBeGreaterThanOrEqual(0);
    expect(distance).toBeLessThan(10);
    expect(isWithinRadius(distance, 150)).toBe(true);
  });

  it('applies tolerance before counting late minutes', () => {
    expect(calculateLateMinutes({
      attendanceDate: '2026-07-01',
      startTime: '10:00',
      checkInAt: '2026-07-01T03:10:00.000Z',
      toleranceMinutes: 10,
    })).toBe(0);

    expect(calculateLateMinutes({
      attendanceDate: '2026-07-01',
      startTime: '10:00',
      checkInAt: '2026-07-01T03:12:01.000Z',
      toleranceMinutes: 10,
    })).toBe(3);
  });

  it('calculates one flat late penalty after tolerance', () => {
    expect(calculateLatePenalty(0, 50_000)).toBe(0);
    expect(calculateLatePenalty(1, 50_000)).toBe(50_000);
    expect(calculateLatePenalty(120, 50_000)).toBe(50_000);
  });

  it('normalizes invalid shift settings to defaults', () => {
    expect(normalizeShifts(null)).toHaveLength(3);
    expect(normalizeShifts([{ id: 'custom', name: 'Custom', start_time: '11:30' }])).toEqual([
      { id: 'custom', name: 'Custom', start_time: '11:30' },
    ]);
  });
});
