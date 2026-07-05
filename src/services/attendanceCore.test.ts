import { describe, expect, it } from 'vitest';

import {
  calculateDistanceMeters,
  calculateAbsencePenalty,
  calculateLateMinutes,
  calculateLatePenalty,
  isWithinRadius,
  listAttendanceDates,
  normalizeShifts,
  filterAttendanceSearchItems,
  shouldCountAbsenceForDate,
  summarizeAttendanceByStaff,
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

  it('calculates one flat absence penalty for days without check-in', () => {
    expect(calculateAbsencePenalty(true, 150_000)).toBe(0);
    expect(calculateAbsencePenalty(false, 150_000)).toBe(150_000);
    expect(calculateAbsencePenalty(false, -1)).toBe(0);
  });

  it('lists attendance dates only up to the latest closed date', () => {
    expect(listAttendanceDates('2026-07-01', '2026-07-05', '2026-07-03')).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ]);
    expect(listAttendanceDates('2026-07-05', '2026-07-01', '2026-07-03')).toEqual([]);
  });

  it('normalizes invalid shift settings to defaults', () => {
    expect(normalizeShifts(null)).toHaveLength(3);
    expect(normalizeShifts([{ id: 'custom', name: 'Custom', start_time: '11:30' }])).toEqual([
      { id: 'custom', name: 'Custom', start_time: '11:30' },
    ]);
  });

  it('does not count an absence when a staff has an approved off request for that date', () => {
    expect(shouldCountAbsenceForDate({
      staffId: 'staff-1',
      date: '2026-07-01',
      checkedInKeys: new Set(),
      approvedOffKeys: new Set(['staff-1:2026-07-01']),
      autoOffDates: new Set(),
    })).toBe(false);

    expect(shouldCountAbsenceForDate({
      staffId: 'staff-1',
      date: '2026-07-01',
      checkedInKeys: new Set(),
      approvedOffKeys: new Set(),
      autoOffDates: new Set(),
    })).toBe(true);
  });

  it('does not count an absence on manager configured auto-off dates', () => {
    expect(shouldCountAbsenceForDate({
      staffId: 'staff-1',
      date: '2026-07-05',
      checkedInKeys: new Set(),
      approvedOffKeys: new Set(),
      autoOffDates: new Set(['2026-07-05']),
    })).toBe(false);
  });

  it('filters attendance rows by staff name, status, date, and notes', () => {
    const rows = filterAttendanceSearchItems([
      {
        type: 'record',
        staffId: 'staff-1',
        staffName: 'Bella',
        staffRole: 'KASIR',
        date: '2026-07-01',
        status: 'late',
        searchableText: 'Macet hujan',
      },
      {
        type: 'absence',
        staffId: 'staff-2',
        staffName: 'Regga Prayuda',
        staffRole: 'KASIR',
        date: '2026-07-02',
        status: 'absence',
        searchableText: '',
      },
      {
        type: 'off',
        staffId: 'staff-3',
        staffName: 'Rendi',
        staffRole: 'TEKNISI',
        date: '2026-07-03',
        status: 'off',
        searchableText: 'Libur toko',
      },
    ], {
      query: 'bella macet',
      status: 'late',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ staffId: 'staff-1', status: 'late' });

    expect(filterAttendanceSearchItems(rows, { query: '2026-07-01', status: 'all' })).toHaveLength(1);
  });

  it('summarizes attendance deductions per staff including approved off days', () => {
    const summaries = summarizeAttendanceByStaff({
      staff: [
        { id: 'staff-1', name: 'Bella', role: 'KASIR', initials: 'BE' },
        { id: 'staff-2', name: 'Regga', role: 'KASIR', initials: 'RE' },
      ],
      records: [
        {
          staff_id: 'staff-1',
          late_minutes: 4,
          penalty_amount: 50_000,
          status: 'pending',
        },
        {
          staff_id: 'staff-2',
          late_minutes: 0,
          penalty_amount: 0,
          status: 'approved',
        },
      ],
      absences: [
        { staff_id: 'staff-1', penalty_amount: 150_000 },
      ],
      offRequests: [
        { staff_id: 'staff-2', status: 'approved' },
        { staff_id: 'staff-1', status: 'pending' },
      ],
    });

    expect(summaries).toEqual([
      expect.objectContaining({
        staff_id: 'staff-1',
        staff_name: 'Bella',
        attended: 1,
        late: 1,
        absent: 1,
        approvedOff: 0,
        pendingOff: 1,
        totalPenalty: 200_000,
      }),
      expect.objectContaining({
        staff_id: 'staff-2',
        staff_name: 'Regga',
        attended: 1,
        late: 0,
        absent: 0,
        approvedOff: 1,
        pendingOff: 0,
        totalPenalty: 0,
      }),
    ]);
  });
});
