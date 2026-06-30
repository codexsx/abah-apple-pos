import { describe, expect, it } from 'vitest';
import {
  calculateStaffBatch,
  calculateStaffLevel,
  getPerStaffMonthlyTarget,
} from './staffPerformanceCore';

describe('staff performance core', () => {
  it('uses a 5-staff benchmark for the 500 unit store target', () => {
    expect(getPerStaffMonthlyTarget(5)).toBe(100);
    expect(getPerStaffMonthlyTarget(4)).toBe(100);
    expect(getPerStaffMonthlyTarget(1)).toBe(100);
    expect(getPerStaffMonthlyTarget(0)).toBe(100);
    expect(getPerStaffMonthlyTarget(10)).toBe(50);
  });

  it('assigns dynamic batch labels from previous month unit sales', () => {
    const activeStaff = 5;

    expect(calculateStaffBatch(49, activeStaff).batch).toBe('Bronze');
    expect(calculateStaffBatch(50, activeStaff).batch).toBe('Silver');
    expect(calculateStaffBatch(90, activeStaff).batch).toBe('Gold');
    expect(calculateStaffBatch(120, activeStaff).batch).toBe('Platinum');
    expect(calculateStaffBatch(160, activeStaff).batch).toBe('Lord');
  });

  it('keeps level as lifetime progress that does not reset monthly', () => {
    expect(calculateStaffLevel(0)).toMatchObject({
      level: 1,
      xp: 0,
      currentLevelXp: 0,
      nextLevelXp: 100,
    });

    expect(calculateStaffLevel(100)).toMatchObject({
      level: 4,
      xp: 1000,
      currentLevelXp: 900,
      nextLevelXp: 1600,
    });
  });
});
