import { describe, expect, it } from 'vitest';
import {
  buildAttendanceCsv,
  buildAttendancePhotoReportHtml,
  attendanceReportFilename,
  type AttendanceReportItem,
} from './attendanceReport';

const staff = {
  id: 'staff-1',
  name: 'Ali, Staff',
  role: 'KASIR',
  initials: 'AS',
  avatar_url: null,
  avatar_crop_x: 50,
  avatar_crop_y: 50,
  avatar_zoom: 1,
};

const recordItem: AttendanceReportItem = {
  type: 'record',
  key: 'record-1',
  date: '2026-07-01',
  sortTime: '2026-07-01T03:15:00.000Z',
  record: {
    id: 'record-1',
    staff_id: 'staff-1',
    attendance_date: '2026-07-01',
    shift_id: 'pagi',
    shift_name: 'Pagi',
    scheduled_start_time: '10:00',
    tolerance_minutes: 10,
    penalty_per_minute: 50_000,
    check_in_at: '2026-07-01T03:15:00.000Z',
    photo_path: 'staff-1/2026-07-01/record-1.webp',
    photo_url: 'https://signed.test/attendance.webp',
    store_latitude: -0.0249301,
    store_longitude: 109.3188553,
    latitude: -0.0249301,
    longitude: 109.3188553,
    accuracy_meters: 8,
    distance_meters: 12,
    within_radius: true,
    late_minutes: 5,
    penalty_amount: 50_000,
    status: 'approved',
    verification_note: null,
    verified_by: null,
    verified_at: null,
    created_at: '2026-07-01T03:15:00.000Z',
    staff,
  },
};

const absenceItem: AttendanceReportItem = {
  type: 'absence',
  key: 'absence-staff-2-2026-07-01',
  date: '2026-07-01',
  sortTime: '2026-07-01T23:59:59+07:00',
  absence: {
    id: 'absence-staff-2-2026-07-01',
    staff_id: 'staff-2',
    attendance_date: '2026-07-01',
    penalty_amount: 150_000,
    staff: {
      ...staff,
      id: 'staff-2',
      name: 'Bella Staff',
      initials: 'BS',
    },
  },
};

describe('attendance report helpers', () => {
  it('builds a CSV report with attendance rows, absence rows, and photo URLs', () => {
    const csv = buildAttendanceCsv([recordItem, absenceItem]);

    expect(csv).toContain('Nama Staff,Jabatan,Tanggal,Status,Shift');
    expect(csv).toContain('"Ali, Staff",KASIR,2026-07-01,Disetujui,Pagi');
    expect(csv).toContain('https://signed.test/attendance.webp');
    expect(csv).toContain('Bella Staff,KASIR,2026-07-01,Tidak Absen');
    expect(csv).toContain('150000');
  });

  it('builds a print-ready photo report that includes signed attendance photos', () => {
    const html = buildAttendancePhotoReportHtml({
      title: 'Report Absensi',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      generatedAt: new Date('2026-07-31T12:00:00+07:00'),
      items: [recordItem, absenceItem],
    });

    expect(html).toContain('Report Absensi');
    expect(html).toContain('Periode 2026-07-01 sampai 2026-07-31');
    expect(html).toContain('<img src="https://signed.test/attendance.webp"');
    expect(html).toContain('Ali, Staff');
    expect(html).toContain('Tidak Absen');
    expect(html).toContain('Bella Staff');
  });

  it('creates a stable filename for attendance exports', () => {
    expect(attendanceReportFilename('2026-07-01', '2026-07-31', 'csv')).toBe(
      'absensi-2026-07-01-2026-07-31.csv',
    );
  });
});
