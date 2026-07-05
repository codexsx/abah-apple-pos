import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const from = vi.fn();
  const rpc = vi.fn();
  const insert = vi.fn();
  const update = vi.fn();
  const upsert = vi.fn();
  const remove = vi.fn();
  const eq = vi.fn();
  const gte = vi.fn();
  const lte = vi.fn();
  const order = vi.fn();
  const select = vi.fn();
  const single = vi.fn();
  return { eq, from, gte, insert, lte, order, remove, rpc, select, single, update, upsert };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

import {
  createAttendanceAutoOffDate,
  getAttendanceAbsences,
  requestAttendanceOff,
  reviewAttendanceOffRequest,
  updateAttendanceStaffRequirement,
  type AttendanceSettings,
  type AttendanceAutoOffDate,
  type AttendanceOffRequest,
} from './attendance';
import { DEFAULT_ATTENDANCE_SHIFTS } from './attendanceCore';

const settings: AttendanceSettings = {
  id: 'default',
  store_name: 'Abah Apple Pontianak',
  store_latitude: -0.0249301,
  store_longitude: 109.3188553,
  radius_meters: 150,
  tolerance_minutes: 10,
  penalty_per_minute: 50_000,
  absence_penalty_amount: 150_000,
  retention_days: 35,
  shifts: DEFAULT_ATTENDANCE_SHIFTS,
  updated_at: '2026-07-01T00:00:00.000Z',
};

beforeEach(() => {
  mocks.from.mockReset();
  mocks.insert.mockReset();
  mocks.update.mockReset();
  mocks.upsert.mockReset();
  mocks.remove.mockReset();
  mocks.eq.mockReset();
  mocks.gte.mockReset();
  mocks.lte.mockReset();
  mocks.order.mockReset();
  mocks.select.mockReset();
  mocks.single.mockReset();
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({
    data: [
      {
        id: 'staff-1',
        name: 'Bella',
        role: 'KASIR',
        initials: 'BE',
        avatar_url: null,
      },
    ],
    error: null,
  });

  mocks.from.mockReturnValue({
    insert: mocks.insert,
    update: mocks.update,
    upsert: mocks.upsert,
    delete: mocks.remove,
  });
  mocks.insert.mockReturnValue({ select: mocks.select });
  mocks.upsert.mockReturnValue({ select: mocks.select });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.remove.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ single: mocks.single });
  mocks.single.mockResolvedValue({
    data: {
      id: 'off-1',
      staff_id: 'staff-1',
      attendance_date: '2026-07-05',
      reason: 'Acara keluarga',
      status: 'pending',
      requested_by: 'staff-1',
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    },
    error: null,
  });
});

describe('attendance service', () => {
  it('excludes approved off days from generated absence penalties', async () => {
    const offRequests: AttendanceOffRequest[] = [
      {
        id: 'off-1',
        staff_id: 'staff-1',
        attendance_date: '2026-07-01',
        reason: 'Libur jadwal',
        status: 'approved',
        requested_by: 'staff-1',
        reviewed_by: 'boss-1',
        reviewed_at: '2026-07-01T01:00:00.000Z',
        review_note: null,
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-01T01:00:00.000Z',
        staff: {
          id: 'staff-1',
          name: 'Bella',
          role: 'KASIR',
          initials: 'BE',
          avatar_url: null,
          avatar_crop_x: 50,
          avatar_crop_y: 50,
          avatar_zoom: 1,
          attendance_required: true,
        },
      },
    ];

    const absences = await getAttendanceAbsences({
      currentUserId: 'boss-1',
      canManage: true,
      startDate: '2026-07-01',
      endDate: '2026-07-01',
      settings,
      records: [],
      offRequests,
      latestClosedDate: '2026-07-01',
    });

    expect(absences).toEqual([]);
  });

  it('still counts pending off requests as absences until approved', async () => {
    const offRequests: AttendanceOffRequest[] = [
      {
        id: 'off-1',
        staff_id: 'staff-1',
        attendance_date: '2026-07-01',
        reason: 'Minta libur',
        status: 'pending',
        requested_by: 'staff-1',
        reviewed_by: null,
        reviewed_at: null,
        review_note: null,
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
        staff: {
          id: 'staff-1',
          name: 'Bella',
          role: 'KASIR',
          initials: 'BE',
          avatar_url: null,
          avatar_crop_x: 50,
          avatar_crop_y: 50,
          avatar_zoom: 1,
          attendance_required: true,
        },
      },
    ];

    const absences = await getAttendanceAbsences({
      currentUserId: 'boss-1',
      canManage: true,
      startDate: '2026-07-01',
      endDate: '2026-07-01',
      settings,
      records: [],
      offRequests,
      latestClosedDate: '2026-07-01',
    });

    expect(absences).toHaveLength(1);
    expect(absences[0]).toMatchObject({
      staff_id: 'staff-1',
      attendance_date: '2026-07-01',
      penalty_amount: 150_000,
    });
  });

  it('excludes manager configured auto-off dates from generated absence penalties', async () => {
    const autoOffDates: AttendanceAutoOffDate[] = [
      {
        attendance_date: '2026-07-01',
        label: 'Libur toko',
        active: true,
        created_by: 'boss-1',
        created_at: '2026-07-01T00:00:00.000Z',
      },
    ];

    const absences = await getAttendanceAbsences({
      currentUserId: 'boss-1',
      canManage: true,
      startDate: '2026-07-01',
      endDate: '2026-07-01',
      settings,
      records: [],
      offRequests: [],
      autoOffDates,
      latestClosedDate: '2026-07-01',
    });

    expect(absences).toEqual([]);
  });

  it('creates a pending off request with trimmed reason', async () => {
    await requestAttendanceOff({
      staffId: 'staff-1',
      attendanceDate: '2026-07-05',
      reason: '  Acara keluarga  ',
    });

    expect(mocks.from).toHaveBeenCalledWith('attendance_off_requests');
    expect(mocks.insert).toHaveBeenCalledWith({
      staff_id: 'staff-1',
      attendance_date: '2026-07-05',
      reason: 'Acara keluarga',
    });
  });

  it('reviews an off request as approved by the boss account', async () => {
    await reviewAttendanceOffRequest({
      id: 'off-1',
      status: 'approved',
      reviewerId: 'boss-1',
      note: '  OK libur  ',
    });

    expect(mocks.from).toHaveBeenCalledWith('attendance_off_requests');
    expect(mocks.update).toHaveBeenCalledWith({
      status: 'approved',
      reviewed_by: 'boss-1',
      reviewed_at: expect.any(String),
      review_note: 'OK libur',
    });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'off-1');
  });

  it('creates an active auto-off date with a trimmed label', async () => {
    await createAttendanceAutoOffDate({
      attendanceDate: '2026-07-17',
      label: '  Libur toko  ',
      createdBy: 'boss-1',
    });

    expect(mocks.from).toHaveBeenCalledWith('attendance_auto_off_dates');
    expect(mocks.upsert).toHaveBeenCalledWith({
      attendance_date: '2026-07-17',
      label: 'Libur toko',
      active: true,
      created_by: 'boss-1',
    }, { onConflict: 'attendance_date' });
  });

  it('updates whether a staff member is required to use attendance', async () => {
    await updateAttendanceStaffRequirement({
      staffId: 'staff-1',
      required: false,
    });

    expect(mocks.rpc).toHaveBeenCalledWith('set_staff_attendance_required', {
      p_staff_id: 'staff-1',
      p_required: false,
    });
  });
});
