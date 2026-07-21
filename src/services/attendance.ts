import { supabase } from '@/lib/supabase';
import { normalizeAvatarCrop, type AvatarCrop } from '@/services/avatarCrop';
import { drawImageToCanvas, encodeCanvasImageBlob } from '@/services/mediaCore';
import { deleteR2Media, getR2MediaUrl, isR2MediaPath, uploadR2Webp } from '@/services/r2Media';
import {
  DEFAULT_ATTENDANCE_ABSENCE_PENALTY,
  DEFAULT_ATTENDANCE_LATE_PENALTY,
  DEFAULT_ATTENDANCE_RADIUS_METERS,
  DEFAULT_ATTENDANCE_RETENTION_DAYS,
  DEFAULT_ATTENDANCE_SHIFTS,
  DEFAULT_ATTENDANCE_TOLERANCE_MINUTES,
  attendanceDateKey,
  calculateAbsencePenalty,
  calculateDistanceMeters,
  isWithinRadius,
  listAttendanceDates,
  normalizeShifts,
  shouldCountAbsenceForDate,
  type AttendanceLocation,
  type AttendanceOffStatus,
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
  attendance_required: boolean;
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
  late_reason: string | null;
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

export interface AttendanceOffRequest {
  id: string;
  staff_id: string;
  attendance_date: string;
  reason: string;
  status: AttendanceOffStatus;
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  staff: AttendanceStaff;
}

export interface AttendanceRevisionRequest {
  id: string;
  attendance_record_id: string;
  staff_id: string;
  attendance_date: string | null;
  check_in_at: string | null;
  current_shift_id: string;
  current_shift_name: string;
  current_start_time: string;
  requested_shift_id: string;
  requested_shift_name: string;
  requested_start_time: string;
  reason: string;
  status: AttendanceOffStatus;
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  late_minutes: number;
  penalty_amount: number;
  staff: AttendanceStaff;
}

export interface AttendanceAutoOffDate {
  attendance_date: string;
  label: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
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
  late_reason?: string | null;
  status: AttendanceStatus;
  verification_note: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
}

interface RawAttendanceOffRow {
  id: string;
  staff_id: string;
  attendance_date: string;
  reason: string;
  status: AttendanceOffStatus;
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

interface RawRevisionRecordRow {
  attendance_date?: string | null;
  check_in_at?: string | null;
  late_minutes?: number | null;
  penalty_amount?: number | null;
}

interface RawAttendanceRevisionRow {
  id: string;
  attendance_record_id: string;
  staff_id: string;
  current_shift_id: string;
  current_shift_name: string;
  current_start_time: string;
  requested_shift_id: string;
  requested_shift_name: string;
  requested_start_time: string;
  reason: string;
  status: AttendanceOffStatus;
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  attendance_record?: RawRevisionRecordRow | RawRevisionRecordRow[] | null;
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
  attendance_required?: boolean | null;
}

interface RawAttendanceAutoOffRow {
  attendance_date: string;
  label: string | null;
  active: boolean | null;
  created_by: string | null;
  created_at: string | null;
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
    attendance_required: row?.attendance_required ?? true,
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
    late_reason: row.late_reason?.trim() || null,
    staff,
  };
}

function normalizeOffRequest(row: RawAttendanceOffRow, staff: AttendanceStaff): AttendanceOffRequest {
  return {
    ...row,
    attendance_date: String(row.attendance_date),
    reason: row.reason || '',
    staff,
  };
}

function normalizeJoinedRevisionRecord(row: RawAttendanceRevisionRow): RawRevisionRecordRow | null {
  const record = row.attendance_record;
  if (Array.isArray(record)) return record[0] ?? null;
  return record ?? null;
}

function normalizeRevisionRequest(row: RawAttendanceRevisionRow, staff: AttendanceStaff): AttendanceRevisionRequest {
  const record = normalizeJoinedRevisionRecord(row);
  return {
    ...row,
    attendance_date: record?.attendance_date ? String(record.attendance_date) : null,
    check_in_at: record?.check_in_at ?? null,
    current_start_time: String(row.current_start_time ?? '').slice(0, 5),
    requested_start_time: String(row.requested_start_time ?? '').slice(0, 5),
    reason: row.reason || '',
    late_minutes: record?.late_minutes ?? 0,
    penalty_amount: record?.penalty_amount ?? 0,
    staff,
  };
}

function normalizeAutoOffDate(row: RawAttendanceAutoOffRow): AttendanceAutoOffDate {
  return {
    attendance_date: String(row.attendance_date),
    label: row.label?.trim() || 'Libur toko',
    active: row.active ?? true,
    created_by: row.created_by ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
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

export async function captureVideoFrameToWebp(
  video: HTMLVideoElement,
  options: { mirror?: boolean } = {},
): Promise<Blob> {
  const sourceWidth = video.videoWidth || 720;
  const sourceHeight = video.videoHeight || 960;
  // Attendance only needs a clear verification photo. Keeping the long edge at
  // 480px significantly reduces Storage egress when the photo is reviewed.
  const maxDimension = 480;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Browser tidak mendukung kamera absensi.');
  drawImageToCanvas(ctx, video, width, height, options.mirror ?? false);

  const blob = await encodeCanvasImageBlob(canvas, {
    preferredType: 'image/webp',
    fallbackType: 'image/jpeg',
    quality: 0.68,
  });
  if (!blob) throw new Error('Foto absen tidak dapat dikompres.');
  return blob;
}

function attendancePhotoContentType(blob: Blob): string {
  return ['image/webp', 'image/jpeg', 'image/png'].includes(blob.type) ? blob.type : 'image/webp';
}

export async function createAttendanceRecord(input: {
  staffId: string;
  settings: AttendanceSettings;
  shift: AttendanceShift;
  location: AttendanceLocation & { accuracy?: number | null };
  photoBlob: Blob;
  lateReason?: string;
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
  if (attendancePhotoContentType(input.photoBlob) !== 'image/webp') {
    throw new Error('Foto absensi harus dikompres ke WebP.');
  }
  const path = await uploadR2Webp('attendance', input.photoBlob);

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
      late_reason: input.lateReason?.trim() || null,
    })
    .select('*')
    .single();

  if (error) {
    await deleteR2Media('attendance', path).catch(() => undefined);
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

export async function getAttendanceStaffDirectory(): Promise<AttendanceStaff[]> {
  const { data, error } = await supabase.rpc('get_attendance_staff_directory');
  if (error) throw error;
  return ((data ?? []) as RawStaffRow[]).map((row) => normalizeStaff(row, row.id));
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

  // Keep the bucket private and avoid downloading every attendance image each
  // time a history list is opened. A signed URL is requested only on demand.
  return rows.map((row) => (
    normalizeRecord(row, normalizeStaff(staffMap.get(row.staff_id), row.staff_id), null)
  ));
}

export async function getAttendancePhotoUrl(photoPath: string): Promise<string | null> {
  if (!photoPath) return null;
  if (isR2MediaPath(photoPath)) return getR2MediaUrl('attendance', photoPath);

  const { data, error } = await supabase.storage
    .from(ATTENDANCE_PHOTOS_BUCKET)
    .createSignedUrl(photoPath, 60 * 60);

  if (error) throw error;
  return data.signedUrl;
}

export async function getAttendanceAbsences(input: {
  currentUserId: string;
  canManage: boolean;
  startDate: string;
  endDate: string;
  settings: AttendanceSettings;
  records: AttendanceRecord[];
  offRequests?: AttendanceOffRequest[];
  autoOffDates?: AttendanceAutoOffDate[];
  latestClosedDate?: string;
}): Promise<AttendanceAbsence[]> {
  const dates = listAttendanceDates(
    input.startDate,
    input.endDate,
    input.latestClosedDate ?? previousPontianakDate(),
  );
  if (dates.length === 0) return [];

  const staff = await getAttendanceExpectedStaff({
    currentUserId: input.currentUserId,
    canManage: input.canManage,
  });
  if (staff.length === 0) return [];

  const checkedIn = new Set(
    input.records.map((record) => attendanceDateKey(record.staff_id, record.attendance_date)),
  );
  const approvedOff = new Set(
    (input.offRequests ?? [])
      .filter((request) => request.status === 'approved')
      .map((request) => attendanceDateKey(request.staff_id, request.attendance_date)),
  );
  const autoOffDates = new Set(
    (input.autoOffDates ?? [])
      .filter((date) => date.active)
      .map((date) => date.attendance_date),
  );

  return staff.flatMap((member) => dates
    .filter((date) => shouldCountAbsenceForDate({
      staffId: member.id,
      date,
      checkedInKeys: checkedIn,
      approvedOffKeys: approvedOff,
      autoOffDates,
    }))
    .map((date) => ({
      id: `absence-${member.id}-${date}`,
      staff_id: member.id,
      attendance_date: date,
      penalty_amount: calculateAbsencePenalty(false, input.settings.absence_penalty_amount),
      staff: member,
    })));
}

export async function getAttendanceAutoOffDates(input: {
  startDate: string;
  endDate: string;
}): Promise<AttendanceAutoOffDate[]> {
  const { data, error } = await supabase
    .from('attendance_auto_off_dates')
    .select('*')
    .gte('attendance_date', input.startDate)
    .lte('attendance_date', input.endDate)
    .order('attendance_date', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as RawAttendanceAutoOffRow[]).map(normalizeAutoOffDate);
}

export async function createAttendanceAutoOffDate(input: {
  attendanceDate: string;
  label: string;
  createdBy: string;
}): Promise<void> {
  const { error } = await supabase
    .from('attendance_auto_off_dates')
    .upsert({
      attendance_date: input.attendanceDate,
      label: input.label.trim() || 'Libur toko',
      active: true,
      created_by: input.createdBy,
    }, { onConflict: 'attendance_date' });

  if (error) throw error;
}

export async function deleteAttendanceAutoOffDate(attendanceDate: string): Promise<void> {
  const { error } = await supabase
    .from('attendance_auto_off_dates')
    .delete()
    .eq('attendance_date', attendanceDate);

  if (error) throw error;
}

export async function updateAttendanceStaffRequirement(input: {
  staffId: string;
  required: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc('set_staff_attendance_required', {
    p_staff_id: input.staffId,
    p_required: input.required,
  });
  if (error) throw error;
}

export async function getAttendanceOffRequests(input: {
  currentUserId: string;
  canManage: boolean;
  startDate: string;
  endDate: string;
}): Promise<AttendanceOffRequest[]> {
  let query = supabase
    .from('attendance_off_requests')
    .select('*')
    .gte('attendance_date', input.startDate)
    .lte('attendance_date', input.endDate)
    .order('attendance_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (!input.canManage) query = query.eq('staff_id', input.currentUserId);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as RawAttendanceOffRow[];
  if (rows.length === 0) return [];

  const staffIds = Array.from(new Set(rows.map((row) => row.staff_id)));
  const { data: staffRows, error: staffError } = await supabase
    .rpc('get_attendance_staff', { p_staff_ids: staffIds });
  if (staffError) throw staffError;

  const staffMap = new Map(
    ((staffRows ?? []) as RawStaffRow[]).map((row) => [row.id, row]),
  );

  return rows.map((row) => normalizeOffRequest(
    row,
    normalizeStaff(staffMap.get(row.staff_id), row.staff_id),
  ));
}

export async function requestAttendanceOff(input: {
  staffId: string;
  attendanceDate: string;
  reason: string;
}): Promise<AttendanceOffRequest> {
  const reason = input.reason.trim();
  if (!reason) throw new Error('Alasan libur wajib diisi.');

  const { data, error } = await supabase
    .from('attendance_off_requests')
    .insert({
      staff_id: input.staffId,
      attendance_date: input.attendanceDate,
      reason,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Request libur untuk tanggal ini sudah ada.');
    throw error;
  }

  return normalizeOffRequest(
    data as RawAttendanceOffRow,
    normalizeStaff(undefined, input.staffId),
  );
}

export async function getAttendanceRevisionRequests(input: {
  currentUserId: string;
  canManage: boolean;
  startDate: string;
  endDate: string;
}): Promise<AttendanceRevisionRequest[]> {
  let query = supabase
    .from('attendance_revision_requests')
    .select('*, attendance_record:attendance_records!inner(attendance_date, check_in_at, late_minutes, penalty_amount)')
    .gte('attendance_record.attendance_date', input.startDate)
    .lte('attendance_record.attendance_date', input.endDate);

  if (!input.canManage) query = query.eq('staff_id', input.currentUserId);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as RawAttendanceRevisionRow[];
  if (rows.length === 0) return [];

  const staffIds = Array.from(new Set(rows.map((row) => row.staff_id)));
  const { data: staffRows, error: staffError } = await supabase
    .rpc('get_attendance_staff', { p_staff_ids: staffIds });
  if (staffError) throw staffError;

  const staffMap = new Map(
    ((staffRows ?? []) as RawStaffRow[]).map((row) => [row.id, row]),
  );

  return rows.map((row) => normalizeRevisionRequest(
    row,
    normalizeStaff(staffMap.get(row.staff_id), row.staff_id),
  ));
}

export async function requestAttendanceRevision(input: {
  attendanceRecordId: string;
  staffId: string;
  requestedBy: string;
  currentShiftId: string;
  currentShiftName: string;
  currentStartTime: string;
  requestedShift: AttendanceShift;
  reason: string;
}): Promise<AttendanceRevisionRequest> {
  const reason = input.reason.trim();
  if (!reason) throw new Error('Alasan revisi shift wajib diisi.');

  const { data, error } = await supabase
    .from('attendance_revision_requests')
    .insert({
      attendance_record_id: input.attendanceRecordId,
      staff_id: input.staffId,
      requested_by: input.requestedBy,
      current_shift_id: input.currentShiftId,
      current_shift_name: input.currentShiftName,
      current_start_time: input.currentStartTime,
      requested_shift_id: input.requestedShift.id,
      requested_shift_name: input.requestedShift.name,
      requested_start_time: input.requestedShift.start_time,
      reason,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Request revisi shift untuk absen ini masih pending.');
    throw error;
  }

  return normalizeRevisionRequest(
    data as RawAttendanceRevisionRow,
    normalizeStaff(undefined, input.staffId),
  );
}

export async function reviewAttendanceRevisionRequest(input: {
  id: string;
  status: Extract<AttendanceOffStatus, 'approved' | 'rejected'>;
  note?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('review_attendance_revision_request', {
    p_request_id: input.id,
    p_status: input.status,
    p_review_note: input.note?.trim() || null,
  });

  if (error) throw error;
}

export async function reviewAttendanceOffRequest(input: {
  id: string;
  status: Extract<AttendanceOffStatus, 'approved' | 'rejected'>;
  reviewerId: string;
  note?: string;
}): Promise<AttendanceOffRequest> {
  const { data, error } = await supabase
    .from('attendance_off_requests')
    .update({
      status: input.status,
      reviewed_by: input.reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: input.note?.trim() || null,
    })
    .eq('id', input.id)
    .select('*')
    .single();

  if (error) throw error;
  const row = data as RawAttendanceOffRow;
  return normalizeOffRequest(row, normalizeStaff(undefined, row.staff_id));
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
