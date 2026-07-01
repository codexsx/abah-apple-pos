import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarCheck,
  Camera,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { avatarImageStyle } from '@/services/avatarCrop';
import { effectivePermission } from '@/services/permissionsCore';
import {
  captureVideoFrameToWebp,
  createAttendanceRecord,
  getAttendanceAbsences,
  getAttendanceRecords,
  getAttendanceSettings,
  pontianakDate,
  saveAttendanceSettings,
  verifyAttendanceRecord,
  type AttendanceAbsence,
  type AttendanceRecord,
  type AttendanceSettings,
  type AttendanceStatus,
} from '@/services/attendance';
import {
  DEFAULT_ATTENDANCE_SHIFTS,
  calculateDistanceMeters,
  isWithinRadius,
  type AttendanceLocation,
  type AttendanceShift,
} from '@/services/attendanceCore';

function formatRupiah(value: number): string {
  return `Rp ${Math.max(0, value).toLocaleString('id-ID')}`;
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00+07:00`).toLocaleDateString('id-ID', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function currentMonthRange() {
  const today = pontianakDate();
  const [year, month] = today.split('-').map(Number);
  const end = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    startDate: `${year}-${String(month).padStart(2, '0')}-01`,
    endDate: `${year}-${String(month).padStart(2, '0')}-${String(end).padStart(2, '0')}`,
  };
}

function statusStyle(status: AttendanceStatus): string {
  if (status === 'approved') return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
  if (status === 'rejected') return 'bg-rose-50 text-rose-700 ring-rose-100';
  return 'bg-amber-50 text-amber-700 ring-amber-100';
}

function statusLabel(status: AttendanceStatus): string {
  if (status === 'approved') return 'Disetujui';
  if (status === 'rejected') return 'Ditolak';
  return 'Menunggu';
}

type AttendanceListItem =
  | { type: 'record'; key: string; date: string; sortTime: string; record: AttendanceRecord }
  | { type: 'absence'; key: string; date: string; sortTime: string; absence: AttendanceAbsence };

function AttendancePhoto({ record }: { record: AttendanceRecord }) {
  if (!record.photo_url) {
    return (
      <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl bg-slate-100 text-[12px] font-semibold text-slate-400">
        Foto
      </div>
    );
  }

  return (
    <img
      src={record.photo_url}
      alt={`Foto absen ${record.staff.name}`}
      className="aspect-[3/4] w-full rounded-2xl object-cover ring-1 ring-slate-100"
    />
  );
}

function ShiftEditor({
  shifts,
  onChange,
}: {
  shifts: AttendanceShift[];
  onChange: (shifts: AttendanceShift[]) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {shifts.map((shift, index) => (
        <div key={shift.id} className="rounded-2xl border border-slate-200 bg-white p-3">
          <input
            value={shift.name}
            onChange={(event) => {
              const next = [...shifts];
              next[index] = { ...shift, name: event.target.value };
              onChange(next);
            }}
            className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-semibold outline-none focus:border-blue-300"
          />
          <input
            type="time"
            value={shift.start_time}
            onChange={(event) => {
              const next = [...shifts];
              next[index] = { ...shift, start_time: event.target.value };
              onChange(next);
            }}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-300"
          />
        </div>
      ))}
    </div>
  );
}

export default function Absensi() {
  const { user, profile } = useAuth();
  const canManage = effectivePermission(profile?.role, profile?.permissions, 'manage_users');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const range = useMemo(() => currentMonthRange(), []);

  const [settings, setSettings] = useState<AttendanceSettings | null>(null);
  const [draft, setDraft] = useState<AttendanceSettings | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [absences, setAbsences] = useState<AttendanceAbsence[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState(DEFAULT_ATTENDANCE_SHIFTS[0].id);
  const [position, setPosition] = useState<(AttendanceLocation & { accuracy?: number | null; distance: number; ok: boolean }) | null>(null);
  const [startDate, setStartDate] = useState(range.startDate);
  const [endDate, setEndDate] = useState(range.endDate);
  const [loading, setLoading] = useState(true);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState('');

  const selectedShift = useMemo(() => (
    settings?.shifts.find((shift) => shift.id === selectedShiftId) ?? settings?.shifts[0]
  ), [settings?.shifts, selectedShiftId]);

  const todayRecord = useMemo(() => {
    const today = pontianakDate();
    return records.find((record) => record.staff_id === user?.id && record.attendance_date === today) ?? null;
  }, [records, user?.id]);

  const summary = useMemo(() => {
    const recordSummary = records.reduce(
      (acc, record) => {
        acc.total += 1;
        if (record.status === 'pending') acc.pending += 1;
        if (record.late_minutes > 0) acc.late += 1;
        acc.penalty += record.penalty_amount;
        return acc;
      },
      { total: 0, pending: 0, late: 0, absent: 0, penalty: 0 },
    );
    recordSummary.absent = absences.length;
    recordSummary.total += absences.length;
    recordSummary.penalty += absences.reduce((sum, absence) => sum + absence.penalty_amount, 0);
    return recordSummary;
  }, [absences, records]);

  const attendanceItems = useMemo<AttendanceListItem[]>(() => {
    return [
      ...records.map((record): AttendanceListItem => ({
        type: 'record',
        key: record.id,
        date: record.attendance_date,
        sortTime: record.check_in_at,
        record,
      })),
      ...absences.map((absence): AttendanceListItem => ({
        type: 'absence',
        key: absence.id,
        date: absence.attendance_date,
        sortTime: `${absence.attendance_date}T23:59:59+07:00`,
        absence,
      })),
    ].sort((a, b) => {
      const dateDiff = b.date.localeCompare(a.date);
      if (dateDiff !== 0) return dateDiff;
      return b.sortTime.localeCompare(a.sortTime);
    });
  }, [absences, records]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      const loadedSettings = await getAttendanceSettings();
      setSettings(loadedSettings);
      setDraft(loadedSettings);
      setSelectedShiftId((current) => (
        loadedSettings.shifts.some((shift) => shift.id === current)
          ? current
          : loadedSettings.shifts[0]?.id ?? DEFAULT_ATTENDANCE_SHIFTS[0].id
      ));
      const loadedRecords = await getAttendanceRecords({
        currentUserId: user.id,
        canManage,
        startDate,
        endDate,
      });
      setRecords(loadedRecords);
      setAbsences(await getAttendanceAbsences({
        currentUserId: user.id,
        canManage,
        startDate,
        endDate,
        settings: loadedSettings,
        records: loadedRecords,
      }));
    } catch (err) {
      console.error('[Absensi] load error:', err);
      setError(err instanceof Error ? err.message : 'Data absensi tidak dapat dimuat.');
    } finally {
      setLoading(false);
    }
  }, [canManage, endDate, startDate, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  async function locateStore() {
    if (!settings) return;
    if (!navigator.geolocation) {
      setError('GPS browser tidak tersedia.');
      return;
    }

    setLocationLoading(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (geo) => {
        const next = {
          latitude: geo.coords.latitude,
          longitude: geo.coords.longitude,
          accuracy: geo.coords.accuracy,
        };
        const distance = calculateDistanceMeters(
          { latitude: settings.store_latitude, longitude: settings.store_longitude },
          next,
        );
        setPosition({
          ...next,
          distance,
          ok: isWithinRadius(distance, settings.radius_meters),
        });
        setLocationLoading(false);
      },
      (geoError) => {
        setError(geoError.message || 'Lokasi tidak dapat diambil.');
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function startCamera() {
    setCameraLoading(true);
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Kamera browser tidak tersedia.');
      }
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 960 },
          height: { ideal: 1280 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      console.error('[Absensi] camera error:', err);
      setError(err instanceof Error ? err.message : 'Kamera tidak dapat dibuka.');
    } finally {
      setCameraLoading(false);
    }
  }

  async function submitAttendance() {
    if (!user?.id || !settings || !selectedShift || !position || !videoRef.current) return;
    if (!position.ok) {
      setError(`Lokasi di luar radius toko (${position.distance}m).`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const photoBlob = await captureVideoFrameToWebp(videoRef.current);
      await createAttendanceRecord({
        staffId: user.id,
        settings,
        shift: selectedShift,
        location: position,
        photoBlob,
      });
      stopCamera();
      await loadData();
    } catch (err) {
      console.error('[Absensi] submit error:', err);
      setError(err instanceof Error ? err.message : 'Absensi tidak dapat disimpan.');
    } finally {
      setSubmitting(false);
    }
  }

  async function saveSettings() {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      await saveAttendanceSettings(draft);
      setSettings(draft);
      await loadData();
    } catch (err) {
      console.error('[Absensi] settings error:', err);
      setError(err instanceof Error ? err.message : 'Setting absensi tidak dapat disimpan.');
    } finally {
      setSaving(false);
    }
  }

  async function verify(record: AttendanceRecord, status: AttendanceStatus) {
    if (!user?.id) return;
    setVerifyingId(record.id);
    setError('');
    try {
      await verifyAttendanceRecord({
        id: record.id,
        status,
        verifierId: user.id,
      });
      await loadData();
    } catch (err) {
      console.error('[Absensi] verify error:', err);
      setError(err instanceof Error ? err.message : 'Status absensi tidak dapat diubah.');
    } finally {
      setVerifyingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[12px] font-semibold text-blue-700">
              <CalendarCheck size={14} />
              Absensi Staff
            </div>
            <h1 className="font-display text-[34px] leading-tight text-slate-950 sm:text-[42px]">
              Absen toko
            </h1>
            <p className="mt-1 text-[13px] font-medium text-slate-500">
              {settings?.store_name ?? 'Abah Apple Pontianak'} · {pontianakDate()}
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-wait"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Total</p>
            <p className="mt-2 text-[28px] font-bold text-slate-950">{summary.total}</p>
          </div>
          <div className="rounded-2xl bg-amber-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-500">Menunggu</p>
            <p className="mt-2 text-[28px] font-bold text-amber-700">{summary.pending}</p>
          </div>
          <div className="rounded-2xl bg-rose-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-500">Telat</p>
            <p className="mt-2 text-[28px] font-bold text-rose-700">{summary.late}</p>
          </div>
          <div className="rounded-2xl bg-orange-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-orange-500">Tidak Absen</p>
            <p className="mt-2 text-[28px] font-bold text-orange-700">{summary.absent}</p>
          </div>
          <div className="rounded-2xl bg-blue-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-500">Potongan</p>
            <p className="mt-2 text-[22px] font-bold text-blue-700">{formatRupiah(summary.penalty)}</p>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">
          {error}
        </div>
      )}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-semibold text-slate-950">Absen Masuk</h2>
              <p className="text-[12px] font-medium text-slate-500">
                {todayRecord ? `Hari ini: ${statusLabel(todayRecord.status)}` : 'Belum absen hari ini'}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-600">
              {profile?.role ?? 'STAFF'}
            </span>
          </div>

          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            {(settings?.shifts ?? DEFAULT_ATTENDANCE_SHIFTS).map((shift) => (
              <button
                key={shift.id}
                type="button"
                onClick={() => setSelectedShiftId(shift.id)}
                className={
                  'rounded-2xl border px-3 py-3 text-left transition-colors ' +
                  (selectedShiftId === shift.id
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
                }
              >
                <span className="block text-[13px] font-bold">{shift.name}</span>
                <span className="mt-1 block text-[12px] font-semibold opacity-70">{shift.start_time}</span>
              </button>
            ))}
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={locateStore}
              disabled={locationLoading || !settings}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-300"
            >
              {locationLoading ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
              Ambil GPS
            </button>
            <button
              type="button"
              onClick={startCamera}
              disabled={cameraLoading || todayRecord !== null}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-300"
            >
              {cameraLoading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              Kamera
            </button>
          </div>

          {position && (
            <div className={
              'mb-4 rounded-2xl border px-4 py-3 text-[13px] font-semibold ' +
              (position.ok ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700')
            }>
              {position.ok ? 'Lokasi valid' : 'Di luar radius'} · {position.distance}m
              {position.accuracy ? ` · akurasi ${Math.round(position.accuracy)}m` : ''}
            </div>
          )}

          <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-950">
            <video
              ref={videoRef}
              muted
              playsInline
              className="aspect-[3/4] w-full bg-slate-950 object-cover"
            />
          </div>

          <button
            type="button"
            onClick={submitAttendance}
            disabled={!cameraActive || !position?.ok || submitting || todayRecord !== null}
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-[14px] font-bold text-white shadow-md shadow-emerald-500/20 transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {submitting ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
            {todayRecord ? 'Sudah Absen' : 'Simpan Absensi'}
          </button>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-card">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[18px] font-semibold text-slate-950">Riwayat Absensi</h2>
              <p className="text-[12px] font-medium text-slate-500">
                {canManage ? 'Semua staff' : profile?.name ?? 'Staff'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 px-3 text-[12px] font-semibold outline-none focus:border-blue-300"
              />
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 px-3 text-[12px] font-semibold outline-none focus:border-blue-300"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[260px] items-center justify-center">
              <Loader2 size={26} className="animate-spin text-slate-300" />
            </div>
          ) : attendanceItems.length === 0 ? (
            <div className="flex min-h-[260px] items-center justify-center rounded-2xl bg-slate-50 text-[13px] font-semibold text-slate-400">
              Belum ada absensi
            </div>
          ) : (
            <div className="space-y-3">
              {attendanceItems.map((item) => {
                if (item.type === 'absence') {
                  const { absence } = item;
                  return (
                    <div key={item.key} className="grid gap-3 rounded-2xl border border-orange-100 bg-orange-50/70 p-3 sm:grid-cols-[92px_minmax(0,1fr)]">
                      <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl bg-white text-orange-500 ring-1 ring-orange-100">
                        <XCircle size={28} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            {absence.staff.avatar_url ? (
                              <img
                                src={absence.staff.avatar_url}
                                alt={absence.staff.name}
                                className="h-9 w-9 rounded-full object-cover"
                                style={avatarImageStyle(absence.staff)}
                              />
                            ) : (
                              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-600 text-[12px] font-bold text-white">
                                {absence.staff.initials}
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-bold text-slate-950">{absence.staff.name}</p>
                              <p className="text-[11px] font-semibold text-slate-500">{absence.staff.role}</p>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-bold text-orange-700 ring-1 ring-orange-200">
                            Tidak absen
                          </span>
                        </div>

                        <div className="mt-3 grid gap-2 text-[12px] font-semibold text-slate-600 sm:grid-cols-2">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 size={13} /> {formatDate(absence.attendance_date)}
                          </span>
                          <span className="text-orange-700">Tidak ada check-in</span>
                          <span className="text-orange-700">Potongan {formatRupiah(absence.penalty_amount)}</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                const { record } = item;
                return (
                <div key={item.key} className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[92px_minmax(0,1fr)]">
                  <AttendancePhoto record={record} />
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        {record.staff.avatar_url ? (
                          <img
                            src={record.staff.avatar_url}
                            alt={record.staff.name}
                            className="h-9 w-9 rounded-full object-cover"
                            style={avatarImageStyle(record.staff)}
                          />
                        ) : (
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-[12px] font-bold text-white">
                            {record.staff.initials}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-bold text-slate-950">{record.staff.name}</p>
                          <p className="text-[11px] font-semibold text-slate-500">{record.staff.role}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${statusStyle(record.status)}`}>
                        {statusLabel(record.status)}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-[12px] font-semibold text-slate-600 sm:grid-cols-2">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 size={13} /> {formatDate(record.attendance_date)} · {formatTime(record.check_in_at)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarCheck size={13} /> {record.shift_name} · {record.scheduled_start_time}
                      </span>
                      <span className={record.within_radius ? 'text-emerald-700' : 'text-rose-700'}>
                        GPS {record.distance_meters}m
                      </span>
                      <span className={record.late_minutes > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                        Telat {record.late_minutes} menit · {formatRupiah(record.penalty_amount)}
                      </span>
                    </div>

                    {canManage && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => verify(record, 'approved')}
                          disabled={verifyingId === record.id}
                          className="inline-flex h-9 items-center gap-2 rounded-full bg-emerald-600 px-3 text-[12px] font-bold text-white disabled:bg-emerald-300"
                        >
                          <ShieldCheck size={14} /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => verify(record, 'rejected')}
                          disabled={verifyingId === record.id}
                          className="inline-flex h-9 items-center gap-2 rounded-full bg-rose-600 px-3 text-[12px] font-bold text-white disabled:bg-rose-300"
                        >
                          <XCircle size={14} /> Tolak
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {canManage && draft && (
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-600">
                <Settings2 size={14} />
                Setting Boss
              </div>
              <h2 className="text-[18px] font-semibold text-slate-950">Aturan Absensi</h2>
            </div>
            <button
              type="button"
              onClick={saveSettings}
              disabled={saving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-slate-950 px-4 text-[13px] font-bold text-white disabled:bg-slate-300"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Simpan
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Nama Lokasi</span>
              <input
                value={draft.store_name}
                onChange={(event) => setDraft({ ...draft, store_name: event.target.value })}
                className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-[13px] font-semibold outline-none focus:border-blue-300"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Latitude</span>
              <input
                type="number"
                step="0.0000001"
                value={draft.store_latitude}
                onChange={(event) => setDraft({ ...draft, store_latitude: Number(event.target.value) })}
                className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-[13px] font-semibold outline-none focus:border-blue-300"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Longitude</span>
              <input
                type="number"
                step="0.0000001"
                value={draft.store_longitude}
                onChange={(event) => setDraft({ ...draft, store_longitude: Number(event.target.value) })}
                className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-[13px] font-semibold outline-none focus:border-blue-300"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Radius Meter</span>
              <input
                type="number"
                value={draft.radius_meters}
                onChange={(event) => setDraft({ ...draft, radius_meters: Number(event.target.value) })}
                className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-[13px] font-semibold outline-none focus:border-blue-300"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Toleransi Menit</span>
              <input
                type="number"
                value={draft.tolerance_minutes}
                onChange={(event) => setDraft({ ...draft, tolerance_minutes: Number(event.target.value) })}
                className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-[13px] font-semibold outline-none focus:border-blue-300"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Potongan Telat</span>
              <input
                type="number"
                value={draft.penalty_per_minute}
                onChange={(event) => setDraft({ ...draft, penalty_per_minute: Number(event.target.value) })}
                className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-[13px] font-semibold outline-none focus:border-blue-300"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Potongan Tidak Absen</span>
              <input
                type="number"
                value={draft.absence_penalty_amount}
                onChange={(event) => setDraft({ ...draft, absence_penalty_amount: Number(event.target.value) })}
                className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-[13px] font-semibold outline-none focus:border-blue-300"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Retensi Hari</span>
              <input
                type="number"
                value={draft.retention_days}
                onChange={(event) => setDraft({ ...draft, retention_days: Number(event.target.value) })}
                className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-[13px] font-semibold outline-none focus:border-blue-300"
              />
            </label>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Shift</p>
            <ShiftEditor
              shifts={draft.shifts}
              onChange={(shifts) => setDraft({ ...draft, shifts })}
            />
          </div>
        </section>
      )}
    </div>
  );
}
