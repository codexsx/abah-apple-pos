import { supabase } from '@/lib/supabase';
import { normalizeAvatarCrop, type AvatarCrop } from '@/services/avatarCrop';
import {
  DEFAULT_ATTENDANCE_ABSENCE_PENALTY,
  DEFAULT_ATTENDANCE_LATE_PENALTY,
  DEFAULT_ATTENDANCE_RADIUS_METERS,
  DEFAULT_ATTENDANCE_RETENTION_DAYS,
  DEFAULT_ATTENDANCE_SHIFTS,
  DEFAULT_ATTENDANCE_TOLERANCE_MINUTES,
  calculateAbsencePenalty,
  calculateDistanceMeters,
  isWithinRadius,
  listAttendanceDates,
  normalizeShifts,
  type AttendanceLocation,
  type AttendanceShift,
} from '@/services/attendanceCore';

export const ATTENDANCE_PHOTOS_BUCKET = 'attendance-photos';

export type AttendanceStatus = 'pending' | 'approved' | 'rejected';

export interface AttendanceSettings {
  id: 'default';
  store_name: string;
  store_latitude: number;
  store_longitude: number;
  radius_meters: number;
  tolerance_minutes: number;
  penalty_per_minute: number;
  absence_penalty_amount: number;
  retention_days: number;
  shifts: AttendanceShift[];
  updated_at: string;
}

export interface AttendanceStaff extends AvatarCrop {
  id: string;
  name: string;
  role: string;
  initials: string;
  avatar_url: string | null;
}

export interface AttendanceRecord {
  id: string;
  staff_id: string;
  attendance_date: string;
  shift_id: string;
  shift_name: string;
  scheduled_start_time: string;
  tolerance_minutes: number;
  penalty_per_minute: number;
  check_in_at: string;
  photo_path: string;
  photo_url: string | null;
  store_latitude: number;
  store_longitude: number;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  distance_meters: number;
  within_radius: boolean;
  late_minutes: number;
  penalty_amount: number;
  status: AttendanceStatus;
  verification_note: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  staff: AttendanceStaff;
}

export interface AttendanceAbsence {
  id: string;
  staff_id: string;
  attendance_date: string;
  penalty_amount: number;
  staff: AttendanceStaff;
}

interface RawSettingsRow {
  id: 'default';
  store_name: string | null;
  store_latitude: string | number | null;
  store_longitude: string | number | null;
  radius_meters: number | null;
  tolerance_minutes: number | null;
  penalty_per_minute: number | null;
  absence_penalty_amount?: number | null;
  retention_days: number | null;
  shifts: unknown;
  updated_at: string | null;
}

interface RawAttendanceRow {
  id: string;
  staff_id: string;
  attendance_date: string;
  shift_id: string;
  shift_name: string;
  scheduled_start_time: string;
  tolerance_minutes: number;
  penalty_per_minute: number;
  check_in_at: string;
  photo_path: string;
  store_latitude: string | number;
  store_longitude: string | number;
  latitude: string | number;
  longitude: string | number;
  accuracy_meters: string | number | null;
  distance_meters: number;
  within_radius: boolean;
  late_minutes: number;
  penalty_amount: number;
  status: AttendanceStatus;
  verification_note: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
}

interface RawStaffRow {
  id: string;
  name: string | null;
  role: string | null;
  initials: string | null;
  avatar_url: string | null;
  avatar_crop_x?: number | string | null;
  avatar_crop_y?: number | string | null;
  avatar_zoom?: number | string | null;
}

function toNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeSettings(row: RawSettingsRow | null | undefined): AttendanceSettings {
  return {
    id: 'default',
    store_name: row?.store_name || 'Abah Apple Pontianak',
    store_latitude: toNumber(row?.store_latitude, -0.0249301),
    store_longitude: toNumber(row?.store_longitude, 109.3188553),
    radius_meters: row?.radius_meters ?? DEFAULT_ATTENDANCE_RADIUS_METERS,
    tolerance_minutes: row?.tolerance_minutes ?? DEFAULT_ATTENDANCE_TOLERANCE_MINUTES,
    penalty_per_minute: row?.penalty_per_minute ?? DEFAULT_ATTENDANCE_LATE_PENALTY,
    absence_penalty_amount: row?.absence_penalty_amount ?? DEFAULT_ATTENDANCE_ABSENCE_PENALTY,
    retention_days: row?.retention_days ?? DEFAULT_ATTENDANCE_RETENTION_DAYS,
    shifts: normalizeShifts(row?.shifts ?? DEFAULT_ATTENDANCE_SHIFTS),
    updated_at: row?.updated_at ?? new Date().toISOString(),
  };
}

function normalizeStaff(row: RawStaffRow | undefined, fallbackId: string): AttendanceStaff {
  const name = row?.name?.trim() || 'Staff';
  return {
    id: row?.id ?? fallbackId,
    name,
    role: row?.role || 'STAFF',
    initials: row?.initials || name.slice(0, 2).toUpperCase(),
    avatar_url: row?.avatar_url ?? null,
    ...normalizeAvatarCrop(row ?? null),
  };
}

function normalizeRecord(row: RawAttendanceRow, staff: AttendanceStaff, photoUrl: string | null): AttendanceRecord {
  return {
    ...row,
    scheduled_start_time: row.scheduled_start_time.slice(0, 5),
    photo_url: photoUrl,
    store_latitude: toNumber(row.store_latitude, 0),
    store_longitude: toNumber(row.store_longitude, 0),
    latitude: toNumber(row.latitude, 0),
    longitude: toNumber(row.longitude, 0),
    accuracy_meters: row.accuracy_meters == null ? null : toNumber(row.accuracy_meters, 0),
    staff,
  };
}

export function pontianakDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export async function getAttendanceSettings(): Promise<AttendanceSettings> {
  const { data, error } = await supabase
    .from('attendance_settings')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();

  if (error) throw error;
  return normalizeSettings(data as RawSettingsRow | null);
}

export async function saveAttendanceSettings(settings: AttendanceSettings): Promise<void> {
  const { error } = await supabase
    .from('attendance_settings')
    .upsert({
      id: 'default',
      store_name: settings.store_name.trim() || 'Abah Apple Pontianak',
      store_latitude: settings.store_latitude,
      store_longitude: settings.store_longitude,
      radius_meters: settings.radius_meters,
      tolerance_minutes: settings.tolerance_minutes,
      penalty_per_minute: settings.penalty_per_minute,
      absence_penalty_amount: settings.absence_penalty_amount,
      retention_days: settings.retention_days,
      shifts: settings.shifts,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) throw error;
}

export async function cleanupOldAttendance(): Promise<void> {
  const { error } = await supabase.rpc('cleanup_old_attendance');
  if (error) console.warn('[attendance] cleanup skipped:', error.message);
}

export async function captureVideoFrameToWebp(video: HTMLVideoElement): Promise<Blob> {
  const sourceWidth = video.videoWidth || 720;
  const sourceHeight = video.videoHeight || 960;
  const maxDimension = 960;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Browser tidak mendukung kamera absensi.');
  ctx.drawImage(video, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', 0.78);
  });
  if (!blob) throw new Error('Foto absen tidak dapat dikompres.');
  return blob;
}

export async function createAttendanceRecord(input: {
  staffId: string;
  settings: AttendanceSettings;
  shift: AttendanceShift;
  location: AttendanceLocation & { accuracy?: number | null };
  photoBlob: Blob;
}): Promise<AttendanceRecord> {
  const attendanceDate = pontianakDate();
  const store = {
    latitude: input.settings.store_latitude,
    longitude: input.settings.store_longitude,
  };
  const distanceMeters = calculateDistanceMeters(store, input.location);
  const withinRadius = isWithinRadius(distanceMeters, input.settings.radius_meters);
  if (!withinRadius) {
    throw new Error(`Lokasi di luar radius toko (${distanceMeters}m).`);
  }

  const recordId = crypto.randomUUID();
  const path = `${input.staffId}/${attendanceDate}/${recordId}.webp`;

  const { error: uploadError } = await supabase.storage
    .from(ATTENDANCE_PHOTOS_BUCKET)
    .upload(path, input.photoBlob, {
      contentType: 'image/webp',
      cacheControl: '2678400',
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('attendance_records')
    .insert({
      id: recordId,
      staff_id: input.staffId,
      attendance_date: attendanceDate,
      shift_id: input.shift.id,
      shift_name: input.shift.name,
      scheduled_start_time: input.shift.start_time,
      tolerance_minutes: input.settings.tolerance_minutes,
      penalty_per_minute: input.settings.penalty_per_minute,
      photo_path: path,
      store_latitude: input.settings.store_latitude,
      store_longitude: input.settings.store_longitude,
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      accuracy_meters: input.location.accuracy ?? null,
      distance_meters: distanceMeters,
      within_radius: withinRadius,
    })
    .select('*')
    .single();

  if (error) {
    await supabase.storage.from(ATTENDANCE_PHOTOS_BUCKET).remove([path]);
    if (error.code === '23505') throw new Error('Kamu sudah absen hari ini.');
    throw error;
  }

  return normalizeRecord(data as RawAttendanceRow, normalizeStaff(undefined, input.staffId), null);
}

function previousPontianakDate(): string {
  const today = pontianakDate();
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export async function getAttendanceExpectedStaff(input: {
  currentUserId: string;
  canManage: boolean;
}): Promise<AttendanceStaff[]> {
  const { data, error } = await supabase.rpc('get_attendance_expected_staff');
  if (error) throw error;

  const rows = ((data ?? []) as RawStaffRow[])
    .filter((row) => input.canManage || row.id === input.currentUserId);
  return rows.map((row) => normalizeStaff(row, row.id));
}

export async function getAttendanceRecords(input: {
  currentUserId: string;
  canManage: boolean;
  startDate: string;
  endDate: string;
}): Promise<AttendanceRecord[]> {
  await cleanupOldAttendance();

  let query = supabase
    .from('attendance_records')
    .select('*')
    .gte('attendance_date', input.startDate)
    .lte('attendance_date', input.endDate)
    .order('attendance_date', { ascending: false })
    .order('check_in_at', { ascending: false });

  if (!input.canManage) query = query.eq('staff_id', input.currentUserId);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as RawAttendanceRow[];
  if (rows.length === 0) return [];

  const staffIds = Array.from(new Set(rows.map((row) => row.staff_id)));
  const { data: staffRows, error: staffError } = await supabase
    .rpc('get_attendance_staff', { p_staff_ids: staffIds });
  if (staffError) throw staffError;

  const staffMap = new Map(
    ((staffRows ?? []) as RawStaffRow[]).map((row) => [row.id, row]),
  );

  return Promise.all(rows.map(async (row) => {
    const { data: signed, error: signedError } = await supabase.storage
      .from(ATTENDANCE_PHOTOS_BUCKET)
      .createSignedUrl(row.photo_path, 10 * 60);
    const photoUrl = signedError ? null : signed.signedUrl;
    return normalizeRecord(row, normalizeStaff(staffMap.get(row.staff_id), row.staff_id), photoUrl);
  }));
}

export async function getAttendanceAbsences(input: {
  currentUserId: string;
  canManage: boolean;
  startDate: string;
  endDate: string;
  settings: AttendanceSettings;
  records: AttendanceRecord[];
}): Promise<AttendanceAbsence[]> {
  const dates = listAttendanceDates(input.startDate, input.endDate, previousPontianakDate());
  if (dates.length === 0) return [];

  const staff = await getAttendanceExpectedStaff({
    currentUserId: input.currentUserId,
    canManage: input.canManage,
  });
  if (staff.length === 0) return [];

  const checkedIn = new Set(
    input.records.map((record) => `${record.staff_id}:${record.attendance_date}`),
  );

  return staff.flatMap((member) => dates
    .filter((date) => !checkedIn.has(`${member.id}:${date}`))
    .map((date) => ({
      id: `absence-${member.id}-${date}`,
      staff_id: member.id,
      attendance_date: date,
      penalty_amount: calculateAbsencePenalty(false, input.settings.absence_penalty_amount),
      staff: member,
    })));
}

export async function verifyAttendanceRecord(input: {
  id: string;
  status: AttendanceStatus;
  note?: string;
  verifierId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('attendance_records')
    .update({
      status: input.status,
      verification_note: input.note?.trim() || null,
      verified_by: input.verifierId,
      verified_at: new Date().toISOString(),
    })
    .eq('id', input.id);

  if (error) throw error;
}
