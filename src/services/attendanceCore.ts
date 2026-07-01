export interface AttendanceShift {
  id: string;
  name: string;
  start_time: string;
}

export interface AttendanceLocation {
  latitude: number;
  longitude: number;
}

export const DEFAULT_ATTENDANCE_SHIFTS: AttendanceShift[] = [
  { id: 'pagi', name: 'Pagi', start_time: '10:00' },
  { id: 'middle', name: 'Middle', start_time: '12:00' },
  { id: 'sore', name: 'Sore', start_time: '15:00' },
];

export const DEFAULT_ATTENDANCE_TOLERANCE_MINUTES = 10;
export const DEFAULT_ATTENDANCE_LATE_PENALTY = 50_000;
export const DEFAULT_ATTENDANCE_ABSENCE_PENALTY = 150_000;
export const DEFAULT_ATTENDANCE_RADIUS_METERS = 150;
export const DEFAULT_ATTENDANCE_RETENTION_DAYS = 35;
export const PONTIANAK_TIME_ZONE_OFFSET = '+07:00';

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function calculateDistanceMeters(a: AttendanceLocation, b: AttendanceLocation): number {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export function isWithinRadius(distanceMeters: number, radiusMeters: number): boolean {
  return Number.isFinite(distanceMeters) && distanceMeters <= Math.max(0, radiusMeters);
}

export function scheduledStartDate(
  attendanceDate: string,
  startTime: string,
  timezoneOffset = PONTIANAK_TIME_ZONE_OFFSET,
): Date {
  return new Date(`${attendanceDate}T${startTime}:00${timezoneOffset}`);
}

export function calculateLateMinutes(input: {
  attendanceDate: string;
  startTime: string;
  checkInAt: string | Date;
  toleranceMinutes?: number;
}): number {
  const tolerance = Math.max(0, Math.floor(input.toleranceMinutes ?? DEFAULT_ATTENDANCE_TOLERANCE_MINUTES));
  const scheduled = scheduledStartDate(input.attendanceDate, input.startTime).getTime();
  const checkIn = input.checkInAt instanceof Date ? input.checkInAt.getTime() : new Date(input.checkInAt).getTime();
  if (!Number.isFinite(scheduled) || !Number.isFinite(checkIn)) return 0;

  const lateMs = checkIn - scheduled - tolerance * 60_000;
  return lateMs <= 0 ? 0 : Math.ceil(lateMs / 60_000);
}

export function calculateLatePenalty(lateMinutes: number, latePenaltyAmount: number): number {
  return Math.max(0, Math.floor(lateMinutes)) > 0
    ? Math.max(0, Math.floor(latePenaltyAmount))
    : 0;
}

export function calculateAbsencePenalty(hasCheckIn: boolean, absencePenaltyAmount: number): number {
  return hasCheckIn ? 0 : Math.max(0, Math.floor(absencePenaltyAmount));
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T00:00:00Z`).getTime());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function listAttendanceDates(startDate: string, endDate: string, latestDate: string): string[] {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || !isIsoDate(latestDate)) return [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const latest = new Date(`${latestDate}T00:00:00Z`);
  const cappedEnd = end.getTime() < latest.getTime() ? end : latest;
  if (start.getTime() > cappedEnd.getTime()) return [];

  const dates: string[] = [];
  for (let current = start; current.getTime() <= cappedEnd.getTime(); current = addDays(current, 1)) {
    dates.push(toIsoDate(current));
  }
  return dates;
}

export function normalizeShifts(value: unknown): AttendanceShift[] {
  if (!Array.isArray(value)) return DEFAULT_ATTENDANCE_SHIFTS;
  const parsed = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Partial<AttendanceShift>;
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      const startTime = typeof row.start_time === 'string' ? row.start_time.trim() : '';
      if (!id || !name || !/^\d{2}:\d{2}$/.test(startTime)) return null;
      return { id, name, start_time: startTime };
    })
    .filter((row): row is AttendanceShift => row !== null);

  return parsed.length > 0 ? parsed : DEFAULT_ATTENDANCE_SHIFTS;
}
