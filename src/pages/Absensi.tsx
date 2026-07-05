import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarCheck,
  CalendarOff,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  FlipHorizontal2,
  Loader2,
  MapPin,
  PenLine,
  Printer,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';

import { CroppedAvatar } from '@/components/CroppedAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { effectivePermission } from '@/services/permissionsCore';
import {
  captureVideoFrameToWebp,
  createAttendanceAutoOffDate,
  createAttendanceRecord,
  deleteAttendanceAutoOffDate,
  getAttendanceAbsences,
  getAttendanceAutoOffDates,
  getAttendanceExpectedStaff,
  getAttendanceOffRequests,
  getAttendanceRecords,
  getAttendanceRevisionRequests,
  getAttendanceSettings,
  getAttendanceStaffDirectory,
  pontianakDate,
  requestAttendanceOff,
  requestAttendanceRevision,
  reviewAttendanceRevisionRequest,
  reviewAttendanceOffRequest,
  saveAttendanceSettings,
  updateAttendanceStaffRequirement,
  verifyAttendanceRecord,
  type AttendanceAbsence,
  type AttendanceAutoOffDate,
  type AttendanceOffRequest,
  type AttendanceRecord,
  type AttendanceRevisionRequest,
  type AttendanceSettings,
  type AttendanceStaff,
  type AttendanceStatus,
} from '@/services/attendance';
import {
  attendanceReportFilename,
  buildAttendanceCsv,
  buildAttendancePhotoReportHtml,
  type AttendanceReportItem,
} from '@/services/attendanceReport';
import {
  DEFAULT_ATTENDANCE_SHIFTS,
  calculateLateMinutes,
  calculateDistanceMeters,
  filterAttendanceSearchItems,
  isWithinRadius,
  summarizeAttendanceByStaff,
  type AttendanceLocation,
  type AttendanceSearchStatus,
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

type AttendanceListItem = AttendanceReportItem;

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
  const [offRequests, setOffRequests] = useState<AttendanceOffRequest[]>([]);
  const [revisionRequests, setRevisionRequests] = useState<AttendanceRevisionRequest[]>([]);
  const [autoOffDates, setAutoOffDates] = useState<AttendanceAutoOffDate[]>([]);
  const [expectedStaff, setExpectedStaff] = useState<AttendanceStaff[]>([]);
  const [staffDirectory, setStaffDirectory] = useState<AttendanceStaff[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState(DEFAULT_ATTENDANCE_SHIFTS[0].id);
  const [position, setPosition] = useState<(AttendanceLocation & { accuracy?: number | null; distance: number; ok: boolean }) | null>(null);
  const [startDate, setStartDate] = useState(range.startDate);
  const [endDate, setEndDate] = useState(range.endDate);
  const [offDate, setOffDate] = useState(pontianakDate());
  const [offReason, setOffReason] = useState('');
  const [lateReason, setLateReason] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyStatus, setHistoryStatus] = useState<AttendanceSearchStatus>('all');
  const [activeRevisionRecordId, setActiveRevisionRecordId] = useState<string | null>(null);
  const [revisionDrafts, setRevisionDrafts] = useState<Record<string, { shiftId: string; reason: string }>>({});
  const [revisionReviewNotes, setRevisionReviewNotes] = useState<Record<string, string>>({});
  const [autoOffDate, setAutoOffDate] = useState(pontianakDate());
  const [autoOffLabel, setAutoOffLabel] = useState('Libur toko');
  const [loading, setLoading] = useState(true);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requestingOff, setRequestingOff] = useState(false);
  const [savingAutoOff, setSavingAutoOff] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [reviewingOffId, setReviewingOffId] = useState<string | null>(null);
  const [requestingRevisionId, setRequestingRevisionId] = useState<string | null>(null);
  const [reviewingRevisionId, setReviewingRevisionId] = useState<string | null>(null);
  const [togglingStaffId, setTogglingStaffId] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [mirrorCamera, setMirrorCamera] = useState(true);
  const [error, setError] = useState('');

  const selectedShift = useMemo(() => (
    settings?.shifts.find((shift) => shift.id === selectedShiftId) ?? settings?.shifts[0]
  ), [settings?.shifts, selectedShiftId]);

  const estimatedLateMinutes = useMemo(() => {
    if (!settings || !selectedShift) return 0;
    return calculateLateMinutes({
      attendanceDate: pontianakDate(),
      startTime: selectedShift.start_time,
      checkInAt: new Date().toISOString(),
      toleranceMinutes: settings.tolerance_minutes,
    });
  }, [selectedShift, settings]);

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
      { total: 0, pending: 0, late: 0, absent: 0, approvedOff: 0, pendingOff: 0, penalty: 0 },
    );
    recordSummary.absent = absences.length;
    recordSummary.approvedOff = offRequests.filter((request) => request.status === 'approved').length;
    recordSummary.pendingOff = offRequests.filter((request) => request.status === 'pending').length;
    recordSummary.total += absences.length;
    recordSummary.penalty += absences.reduce((sum, absence) => sum + absence.penalty_amount, 0);
    return recordSummary;
  }, [absences, offRequests, records]);

  const staffSummaries = useMemo(() => summarizeAttendanceByStaff({
    staff: expectedStaff,
    records,
    absences,
    offRequests,
  }), [absences, expectedStaff, offRequests, records]);

  const pendingOffRequests = useMemo(
    () => offRequests.filter((request) => request.status === 'pending'),
    [offRequests],
  );

  const pendingRevisionRequests = useMemo(
    () => revisionRequests.filter((request) => request.status === 'pending'),
    [revisionRequests],
  );

  const pendingRevisionByRecordId = useMemo(() => new Map(
    pendingRevisionRequests.map((request) => [request.attendance_record_id, request]),
  ), [pendingRevisionRequests]);

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
      ...offRequests
        .filter((request) => request.status === 'approved')
        .map((offRequest): AttendanceListItem => ({
          type: 'off',
          key: offRequest.id,
          date: offRequest.attendance_date,
          sortTime: `${offRequest.attendance_date}T23:58:59+07:00`,
          offRequest,
        })),
    ].sort((a, b) => {
      const dateDiff = b.date.localeCompare(a.date);
      if (dateDiff !== 0) return dateDiff;
      return b.sortTime.localeCompare(a.sortTime);
    });
  }, [absences, offRequests, records]);

  const filteredAttendanceItems = useMemo(() => (
    attendanceItems
      .map((item) => {
        if (item.type === 'record') {
          const { record } = item;
          return {
            item,
            search: {
              type: 'record' as const,
              staffId: record.staff_id,
              staffName: record.staff.name,
              staffRole: record.staff.role,
              date: record.attendance_date,
              status: record.late_minutes > 0 ? 'late' as const : 'present' as const,
              searchableText: [
                record.shift_name,
                record.scheduled_start_time,
                record.late_reason ?? '',
                record.late_minutes > 0 ? 'telat terlambat' : 'hadir masuk',
              ].join(' '),
            },
          };
        }
        if (item.type === 'absence') {
          const { absence } = item;
          return {
            item,
            search: {
              type: 'absence' as const,
              staffId: absence.staff_id,
              staffName: absence.staff.name,
              staffRole: absence.staff.role,
              date: absence.attendance_date,
              status: 'absence' as const,
              searchableText: 'tidak absen alfa tanpa check in',
            },
          };
        }
        const { offRequest } = item;
        return {
          item,
          search: {
            type: 'off' as const,
            staffId: offRequest.staff_id,
            staffName: offRequest.staff.name,
            staffRole: offRequest.staff.role,
            date: offRequest.attendance_date,
            status: 'off' as const,
            searchableText: `libur off ${offRequest.reason}`,
          },
        };
      })
      .filter(({ search }) => filterAttendanceSearchItems([search], {
        query: historyQuery,
        status: historyStatus,
      }).length > 0)
      .map(({ item }) => item)
  ), [attendanceItems, historyQuery, historyStatus]);

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
      const loadedStaff = await getAttendanceExpectedStaff({
        currentUserId: user.id,
        canManage,
      });
      setExpectedStaff(loadedStaff);
      setStaffDirectory(canManage ? await getAttendanceStaffDirectory() : loadedStaff);
      const loadedRecords = await getAttendanceRecords({
        currentUserId: user.id,
        canManage,
        startDate,
        endDate,
      });
      const loadedOffRequests = await getAttendanceOffRequests({
        currentUserId: user.id,
        canManage,
        startDate,
        endDate,
      });
      const loadedRevisionRequests = await getAttendanceRevisionRequests({
        currentUserId: user.id,
        canManage,
        startDate,
        endDate,
      });
      const loadedAutoOffDates = await getAttendanceAutoOffDates({
        startDate,
        endDate,
      });
      setRecords(loadedRecords);
      setOffRequests(loadedOffRequests);
      setRevisionRequests(loadedRevisionRequests);
      setAutoOffDates(loadedAutoOffDates);
      setAbsences(await getAttendanceAbsences({
        currentUserId: user.id,
        canManage,
        startDate,
        endDate,
        settings: loadedSettings,
        records: loadedRecords,
        offRequests: loadedOffRequests,
        autoOffDates: loadedAutoOffDates,
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
      const photoBlob = await captureVideoFrameToWebp(videoRef.current, { mirror: mirrorCamera });
      await createAttendanceRecord({
        staffId: user.id,
        settings,
        shift: selectedShift,
        location: position,
        photoBlob,
        lateReason,
      });
      setLateReason('');
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

  async function submitAutoOffDate() {
    if (!user?.id) return;
    setSavingAutoOff(true);
    setError('');
    try {
      await createAttendanceAutoOffDate({
        attendanceDate: autoOffDate,
        label: autoOffLabel,
        createdBy: user.id,
      });
      setAutoOffLabel('Libur toko');
      await loadData();
    } catch (err) {
      console.error('[Absensi] auto off error:', err);
      setError(err instanceof Error ? err.message : 'Tanggal auto-off tidak dapat disimpan.');
    } finally {
      setSavingAutoOff(false);
    }
  }

  async function removeAutoOffDate(attendanceDate: string) {
    setSavingAutoOff(true);
    setError('');
    try {
      await deleteAttendanceAutoOffDate(attendanceDate);
      await loadData();
    } catch (err) {
      console.error('[Absensi] auto off delete error:', err);
      setError(err instanceof Error ? err.message : 'Tanggal auto-off tidak dapat dihapus.');
    } finally {
      setSavingAutoOff(false);
    }
  }

  async function toggleAttendanceRequirement(staff: AttendanceStaff) {
    setTogglingStaffId(staff.id);
    setError('');
    try {
      await updateAttendanceStaffRequirement({
        staffId: staff.id,
        required: !staff.attendance_required,
      });
      await loadData();
    } catch (err) {
      console.error('[Absensi] staff attendance toggle error:', err);
      setError(err instanceof Error ? err.message : 'Status wajib absen staff tidak dapat diubah.');
    } finally {
      setTogglingStaffId(null);
    }
  }

  async function submitOffRequest() {
    if (!user?.id) return;
    setRequestingOff(true);
    setError('');
    try {
      await requestAttendanceOff({
        staffId: user.id,
        attendanceDate: offDate,
        reason: offReason,
      });
      setOffReason('');
      await loadData();
    } catch (err) {
      console.error('[Absensi] off request error:', err);
      setError(err instanceof Error ? err.message : 'Request libur tidak dapat disimpan.');
    } finally {
      setRequestingOff(false);
    }
  }

  async function reviewOff(request: AttendanceOffRequest, status: 'approved' | 'rejected') {
    if (!user?.id) return;
    setReviewingOffId(request.id);
    setError('');
    try {
      await reviewAttendanceOffRequest({
        id: request.id,
        status,
        reviewerId: user.id,
      });
      await loadData();
    } catch (err) {
      console.error('[Absensi] off review error:', err);
      setError(err instanceof Error ? err.message : 'Request libur tidak dapat diproses.');
    } finally {
      setReviewingOffId(null);
    }
  }

  function updateRevisionDraft(recordId: string, patch: Partial<{ shiftId: string; reason: string }>) {
    setRevisionDrafts((current) => ({
      ...current,
      [recordId]: {
        shiftId: current[recordId]?.shiftId ?? '',
        reason: current[recordId]?.reason ?? '',
        ...patch,
      },
    }));
  }

  async function submitRevision(record: AttendanceRecord) {
    if (!settings) return;
    const draftState = revisionDrafts[record.id] ?? { shiftId: record.shift_id, reason: '' };
    const requestedShift = settings.shifts.find((shift) => shift.id === draftState.shiftId);
    if (!requestedShift) {
      setError('Pilih shift revisi dulu.');
      return;
    }
    if (requestedShift.id === record.shift_id && requestedShift.start_time === record.scheduled_start_time) {
      setError('Shift revisi masih sama dengan data absen saat ini.');
      return;
    }

    setRequestingRevisionId(record.id);
    setError('');
    try {
      await requestAttendanceRevision({
        attendanceRecordId: record.id,
        staffId: record.staff_id,
        currentShiftId: record.shift_id,
        currentShiftName: record.shift_name,
        currentStartTime: record.scheduled_start_time,
        requestedShift,
        reason: draftState.reason,
      });
      setActiveRevisionRecordId(null);
      setRevisionDrafts((current) => {
        const next = { ...current };
        delete next[record.id];
        return next;
      });
      await loadData();
    } catch (err) {
      console.error('[Absensi] revision request error:', err);
      setError(err instanceof Error ? err.message : 'Request revisi shift tidak dapat disimpan.');
    } finally {
      setRequestingRevisionId(null);
    }
  }

  async function reviewRevision(request: AttendanceRevisionRequest, status: 'approved' | 'rejected') {
    setReviewingRevisionId(request.id);
    setError('');
    try {
      await reviewAttendanceRevisionRequest({
        id: request.id,
        status,
        note: revisionReviewNotes[request.id],
      });
      setRevisionReviewNotes((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      await loadData();
    } catch (err) {
      console.error('[Absensi] revision review error:', err);
      setError(err instanceof Error ? err.message : 'Request revisi shift tidak dapat diproses.');
    } finally {
      setReviewingRevisionId(null);
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

  function exportCsvReport() {
    if (!canManage || filteredAttendanceItems.length === 0) return;
    const csv = buildAttendanceCsv(filteredAttendanceItems);
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = attendanceReportFilename(startDate, endDate, 'csv');
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function printPhotoReport() {
    if (!canManage || filteredAttendanceItems.length === 0) return;
    const html = buildAttendancePhotoReportHtml({
      title: `Report Absensi ${settings?.store_name ?? 'Toko'}`,
      startDate,
      endDate,
      generatedAt: new Date(),
      items: filteredAttendanceItems,
    });

    const reportWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!reportWindow) {
      setError('Popup report diblokir browser. Izinkan popup lalu coba lagi.');
      return;
    }

    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.focus();
    window.setTimeout(() => reportWindow.print(), 500);
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
              {settings?.store_name ?? 'Abah Apple Pontianak'} - {pontianakDate()}
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

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
          <div className="rounded-2xl bg-sky-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-500">Off Approved</p>
            <p className="mt-2 text-[28px] font-bold text-sky-700">{summary.approvedOff}</p>
            {summary.pendingOff > 0 && (
              <p className="mt-1 text-[11px] font-semibold text-sky-600">{summary.pendingOff} pending</p>
            )}
          </div>
          <div className="rounded-2xl bg-blue-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-500">Potongan</p>
            <p className="mt-2 text-[22px] font-bold text-blue-700">{formatRupiah(summary.penalty)}</p>
          </div>
        </div>

        {canManage && staffSummaries.length > 0 && (
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/70">
            <div className="flex flex-col gap-1 border-b border-slate-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-[15px] font-bold text-slate-950">Rangkuman Potongan Staff</h2>
                <p className="text-[12px] font-medium text-slate-500">
                  Periode {formatDate(startDate)} sampai {formatDate(endDate)}
                </p>
              </div>
              <span className="font-mono text-[13px] font-bold text-blue-700">
                Total {formatRupiah(summary.penalty)}
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {staffSummaries.map((item) => (
                <div key={item.staff_id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.2fr)_repeat(5,minmax(90px,0.55fr))] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-slate-950">{item.staff_name}</p>
                    <p className="text-[11px] font-semibold text-slate-500">{item.role}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryQuery(item.staff_name);
                        setHistoryStatus('all');
                      }}
                      className="mt-1 text-[11px] font-bold text-blue-600 hover:text-blue-700"
                    >
                      Lihat detail
                    </button>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Hadir</p>
                    <p className="font-mono text-[15px] font-bold text-slate-800">{item.attended}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Telat</p>
                    <p className="font-mono text-[15px] font-bold text-rose-700">{item.late}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Tidak Absen</p>
                    <p className="font-mono text-[15px] font-bold text-orange-700">{item.absent}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Off</p>
                    <p className="font-mono text-[15px] font-bold text-sky-700">{item.approvedOff}</p>
                    {item.pendingOff > 0 && (
                      <p className="text-[10px] font-semibold text-sky-600">{item.pendingOff} pending</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Potongan</p>
                    <p className="font-mono text-[15px] font-bold text-blue-700">{formatRupiah(item.totalPenalty)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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

          <div className="mb-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sky-600 ring-1 ring-sky-100">
                <CalendarOff size={17} />
              </span>
              <div>
                <h3 className="text-[14px] font-bold text-slate-950">Off / Libur</h3>
                <p className="text-[11px] font-semibold text-slate-500">Request harus di-approve boss.</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[145px_minmax(0,1fr)]">
              <input
                type="date"
                value={offDate}
                onChange={(event) => setOffDate(event.target.value)}
                className="h-10 rounded-xl border border-sky-100 bg-white px-3 text-[12px] font-semibold outline-none focus:border-sky-300"
              />
              <input
                type="text"
                value={offReason}
                onChange={(event) => setOffReason(event.target.value)}
                placeholder="Alasan libur / off"
                className="h-10 rounded-xl border border-sky-100 bg-white px-3 text-[12px] font-semibold outline-none placeholder:text-slate-300 focus:border-sky-300"
              />
            </div>
            <button
              type="button"
              onClick={submitOffRequest}
              disabled={requestingOff || offReason.trim().length < 3}
              className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-[12px] font-bold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {requestingOff ? <Loader2 size={15} className="animate-spin" /> : <CalendarOff size={15} />}
              Ajukan Off
            </button>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
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
            <button
              type="button"
              onClick={() => setMirrorCamera((value) => !value)}
              aria-pressed={mirrorCamera}
              className={
                'inline-flex h-12 items-center justify-center gap-2 rounded-2xl border px-4 text-[13px] font-semibold transition-colors ' +
                (mirrorCamera
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')
              }
            >
              <FlipHorizontal2 size={16} />
              Mirror {mirrorCamera ? 'On' : 'Off'}
            </button>
          </div>

          {position && (
            <div className={
              'mb-4 rounded-2xl border px-4 py-3 text-[13px] font-semibold ' +
              (position.ok ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700')
            }>
              {position.ok ? 'Lokasi valid' : 'Di luar radius'} - {position.distance}m
              {position.accuracy ? ` - akurasi ${Math.round(position.accuracy)}m` : ''}
            </div>
          )}

          <div className="mb-4 rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Keterangan Telat</span>
              <span className={estimatedLateMinutes > 0 ? 'text-[11px] font-bold text-rose-600' : 'text-[11px] font-bold text-emerald-600'}>
                Estimasi {estimatedLateMinutes} menit
              </span>
            </div>
            <textarea
              value={lateReason}
              onChange={(event) => setLateReason(event.target.value)}
              maxLength={300}
              placeholder={estimatedLateMinutes > 0 ? 'Contoh: macet, hujan, antar keluarga...' : 'Opsional jika ada catatan'}
              className="min-h-[72px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold outline-none placeholder:text-slate-300 focus:border-blue-300"
            />
          </div>

          <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-950">
            <video
              ref={videoRef}
              muted
              playsInline
              className="aspect-[3/4] w-full bg-slate-950 object-cover"
              style={{ transform: mirrorCamera ? 'scaleX(-1)' : 'none' }}
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
            <div className="flex flex-col gap-2 sm:items-end">
              <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_150px]">
                <label className="relative block">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={historyQuery}
                    onChange={(event) => setHistoryQuery(event.target.value)}
                    placeholder="Cari staff / tanggal / alasan..."
                    className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-[12px] font-semibold outline-none placeholder:text-slate-300 focus:border-blue-300"
                  />
                </label>
                <select
                  value={historyStatus}
                  onChange={(event) => setHistoryStatus(event.target.value as AttendanceSearchStatus)}
                  className="h-10 rounded-xl border border-slate-200 px-3 text-[12px] font-semibold outline-none focus:border-blue-300"
                >
                  <option value="all">Semua</option>
                  <option value="late">Telat</option>
                  <option value="absence">Tidak absen</option>
                  <option value="off">Off</option>
                  <option value="present">Hadir</option>
                </select>
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
              {canManage && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={exportCsvReport}
                    disabled={filteredAttendanceItems.length === 0}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Download size={14} />
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={printPhotoReport}
                    disabled={filteredAttendanceItems.length === 0}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-3 text-[12px] font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Printer size={14} />
                    Foto
                  </button>
                </div>
              )}
            </div>
          </div>

          {pendingOffRequests.length > 0 && (
            <div className="mb-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-sky-600 ring-1 ring-sky-100">
                  <ClipboardCheck size={16} />
                </span>
                <div>
                  <h3 className="text-[14px] font-bold text-slate-950">Approval Off / Libur</h3>
                  <p className="text-[11px] font-semibold text-slate-500">
                    {canManage ? 'Request pending dari staff.' : 'Request kamu masih menunggu approval.'}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {pendingOffRequests.map((request) => (
                  <div key={request.id} className="rounded-xl border border-sky-100 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-slate-950">
                          {request.staff.name}
                        </p>
                        <p className="text-[11px] font-semibold text-slate-500">
                          {formatDate(request.attendance_date)} - {request.reason}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 ring-1 ring-amber-100">
                        Pending
                      </span>
                    </div>
                    {canManage && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => reviewOff(request, 'rejected')}
                          disabled={reviewingOffId === request.id}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 text-[12px] font-bold text-white disabled:bg-rose-300"
                        >
                          <XCircle size={14} /> Tolak
                        </button>
                        <button
                          type="button"
                          onClick={() => reviewOff(request, 'approved')}
                          disabled={reviewingOffId === request.id}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-[12px] font-bold text-white disabled:bg-emerald-300"
                        >
                          <ShieldCheck size={14} /> Approve
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendingRevisionRequests.length > 0 && (
            <div className="mb-4 rounded-2xl border border-violet-100 bg-violet-50/70 p-3">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-violet-600 ring-1 ring-violet-100">
                  <PenLine size={16} />
                </span>
                <div>
                  <h3 className="text-[14px] font-bold text-slate-950">Approval Revisi Shift</h3>
                  <p className="text-[11px] font-semibold text-slate-500">
                    {canManage ? 'Cek request koreksi shift sebelum data absen berubah.' : 'Request revisi shift kamu masih menunggu approval.'}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {pendingRevisionRequests.map((request) => (
                  <div key={request.id} className="rounded-xl border border-violet-100 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-slate-950">
                          {request.staff.name}
                        </p>
                        <p className="text-[11px] font-semibold text-slate-500">
                          {request.attendance_date ? formatDate(request.attendance_date) : 'Tanggal absen'} - {formatTime(request.check_in_at ?? request.created_at)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 ring-1 ring-amber-100">
                        Pending
                      </span>
                    </div>
                    <div className="mt-3 rounded-xl bg-violet-50 px-3 py-2 text-[12px] font-semibold text-violet-800">
                      {request.current_shift_name} {request.current_start_time} &rarr; {request.requested_shift_name} {request.requested_start_time}
                    </div>
                    <p className="mt-2 text-[12px] font-semibold text-slate-600">
                      Alasan: {request.reason}
                    </p>
                    {canManage && (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={revisionReviewNotes[request.id] ?? ''}
                          onChange={(event) => setRevisionReviewNotes((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))}
                          maxLength={300}
                          placeholder="Catatan approval opsional"
                          className="min-h-[64px] w-full resize-none rounded-xl border border-violet-100 bg-white px-3 py-2 text-[12px] font-semibold outline-none placeholder:text-slate-300 focus:border-violet-300"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => reviewRevision(request, 'rejected')}
                            disabled={reviewingRevisionId === request.id}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 text-[12px] font-bold text-white disabled:bg-rose-300"
                          >
                            <XCircle size={14} /> Tolak
                          </button>
                          <button
                            type="button"
                            onClick={() => reviewRevision(request, 'approved')}
                            disabled={reviewingRevisionId === request.id}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-[12px] font-bold text-white disabled:bg-emerald-300"
                          >
                            <ShieldCheck size={14} /> Approve
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex min-h-[260px] items-center justify-center">
              <Loader2 size={26} className="animate-spin text-slate-300" />
            </div>
          ) : filteredAttendanceItems.length === 0 ? (
            <div className="flex min-h-[260px] items-center justify-center rounded-2xl bg-slate-50 text-[13px] font-semibold text-slate-400">
              Tidak ada data sesuai filter
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAttendanceItems.map((item) => {
                if (item.type === 'off') {
                  const { offRequest } = item;
                  return (
                    <div key={item.key} className="grid gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-3 sm:grid-cols-[92px_minmax(0,1fr)]">
                      <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl bg-white text-sky-500 ring-1 ring-sky-100">
                        <CalendarOff size={28} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            {offRequest.staff.avatar_url ? (
                              <CroppedAvatar
                                src={offRequest.staff.avatar_url}
                                alt={offRequest.staff.name}
                                crop={offRequest.staff}
                                className="h-9 w-9 rounded-full"
                              />
                            ) : (
                              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-600 text-[12px] font-bold text-white">
                                {offRequest.staff.initials}
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-bold text-slate-950">{offRequest.staff.name}</p>
                              <p className="text-[11px] font-semibold text-slate-500">{offRequest.staff.role}</p>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200">
                            Libur / Off
                          </span>
                        </div>

                        <div className="mt-3 grid gap-2 text-[12px] font-semibold text-slate-600 sm:grid-cols-2">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 size={13} /> {formatDate(offRequest.attendance_date)}
                          </span>
                          <span className="text-sky-700">Approved boss</span>
                          <span className="text-slate-600">{offRequest.reason}</span>
                          <span className="text-emerald-700">Potongan Rp 0</span>
                        </div>
                      </div>
                    </div>
                  );
                }

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
                              <CroppedAvatar
                                src={absence.staff.avatar_url}
                                alt={absence.staff.name}
                                crop={absence.staff}
                                className="h-9 w-9 rounded-full"
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
                const pendingRevision = pendingRevisionByRecordId.get(record.id);
                const revisionDraft = revisionDrafts[record.id] ?? {
                  shiftId: record.shift_id,
                  reason: '',
                };
                const requestedShift = settings?.shifts.find((shift) => shift.id === revisionDraft.shiftId) ?? null;
                const isSameRevisionShift = requestedShift
                  ? requestedShift.id === record.shift_id && requestedShift.start_time === record.scheduled_start_time
                  : true;
                const canRequestRevision = Boolean(settings && (canManage || record.staff_id === user?.id));
                return (
                <div key={item.key} className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[92px_minmax(0,1fr)]">
                  <AttendancePhoto record={record} />
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        {record.staff.avatar_url ? (
                          <CroppedAvatar
                            src={record.staff.avatar_url}
                            alt={record.staff.name}
                            crop={record.staff}
                            className="h-9 w-9 rounded-full"
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
                        <Clock3 size={13} /> {formatDate(record.attendance_date)} - {formatTime(record.check_in_at)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarCheck size={13} /> {record.shift_name} - {record.scheduled_start_time}
                      </span>
                      <span className={record.within_radius ? 'text-emerald-700' : 'text-rose-700'}>
                        GPS {record.distance_meters}m
                      </span>
                      <span className={record.late_minutes > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                        Telat {record.late_minutes} menit - {formatRupiah(record.penalty_amount)}
                      </span>
                      {record.late_reason && (
                        <span className="text-slate-700 sm:col-span-2">
                          Keterangan: {record.late_reason}
                        </span>
                      )}
                    </div>

                    {pendingRevision ? (
                      <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-[12px] font-semibold text-violet-800">
                        Revisi shift pending: {pendingRevision.current_shift_name} {pendingRevision.current_start_time} &rarr; {pendingRevision.requested_shift_name} {pendingRevision.requested_start_time}
                        <span className="mt-1 block text-violet-700">Alasan: {pendingRevision.reason}</span>
                      </div>
                    ) : canRequestRevision ? (
                      <div className="mt-3">
                        {activeRevisionRecordId === record.id ? (
                          <div className="rounded-2xl border border-violet-100 bg-white p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-[12px] font-bold text-slate-950">Ajukan revisi shift</p>
                              <button
                                type="button"
                                onClick={() => setActiveRevisionRecordId(null)}
                                className="text-[11px] font-bold text-slate-400 hover:text-slate-600"
                              >
                                Batal
                              </button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)]">
                              <select
                                value={revisionDraft.shiftId}
                                onChange={(event) => updateRevisionDraft(record.id, { shiftId: event.target.value })}
                                className="h-10 rounded-xl border border-slate-200 px-3 text-[12px] font-semibold outline-none focus:border-violet-300"
                              >
                                {(settings?.shifts ?? DEFAULT_ATTENDANCE_SHIFTS).map((shift) => (
                                  <option key={shift.id} value={shift.id}>
                                    {shift.name} - {shift.start_time}
                                  </option>
                                ))}
                              </select>
                              <input
                                value={revisionDraft.reason}
                                onChange={(event) => updateRevisionDraft(record.id, { reason: event.target.value })}
                                maxLength={300}
                                placeholder="Alasan revisi, contoh: salah pilih shift"
                                className="h-10 rounded-xl border border-slate-200 px-3 text-[12px] font-semibold outline-none placeholder:text-slate-300 focus:border-violet-300"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => submitRevision(record)}
                              disabled={requestingRevisionId === record.id || revisionDraft.reason.trim().length < 3 || isSameRevisionShift}
                              className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                              {requestingRevisionId === record.id ? <Loader2 size={14} className="animate-spin" /> : <PenLine size={14} />}
                              Kirim Revisi Shift
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveRevisionRecordId(record.id);
                              updateRevisionDraft(record.id, { shiftId: record.shift_id });
                            }}
                            className="inline-flex h-9 items-center gap-2 rounded-full border border-violet-100 bg-white px-3 text-[12px] font-bold text-violet-700 hover:bg-violet-50"
                          >
                            <PenLine size={14} /> Revisi Shift
                          </button>
                        )}
                      </div>
                    ) : null}

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

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
              <div className="mb-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-sky-600">Auto-Off</p>
                <h3 className="text-[15px] font-bold text-slate-950">Tanggal libur otomatis</h3>
              </div>
              <div className="grid gap-2 sm:grid-cols-[145px_minmax(0,1fr)]">
                <input
                  type="date"
                  value={autoOffDate}
                  onChange={(event) => setAutoOffDate(event.target.value)}
                  className="h-10 rounded-xl border border-sky-100 bg-white px-3 text-[12px] font-semibold outline-none focus:border-sky-300"
                />
                <input
                  value={autoOffLabel}
                  onChange={(event) => setAutoOffLabel(event.target.value)}
                  placeholder="Label libur"
                  className="h-10 rounded-xl border border-sky-100 bg-white px-3 text-[12px] font-semibold outline-none placeholder:text-slate-300 focus:border-sky-300"
                />
              </div>
              <button
                type="button"
                onClick={submitAutoOffDate}
                disabled={savingAutoOff || !autoOffDate}
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-[12px] font-bold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {savingAutoOff ? <Loader2 size={15} className="animate-spin" /> : <CalendarOff size={15} />}
                Simpan tanggal
              </button>

              <div className="mt-3 space-y-2">
                {autoOffDates.length === 0 ? (
                  <p className="rounded-xl bg-white/70 px-3 py-2 text-[12px] font-semibold text-slate-400">
                    Belum ada tanggal auto-off di periode ini.
                  </p>
                ) : autoOffDates.map((date) => (
                  <div key={date.attendance_date} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-sky-100">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-bold text-slate-950">{date.label}</p>
                      <p className="text-[11px] font-semibold text-slate-500">{formatDate(date.attendance_date)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAutoOffDate(date.attendance_date)}
                      disabled={savingAutoOff}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                      aria-label={`Hapus auto-off ${date.attendance_date}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="mb-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Staff Absensi</p>
                <h3 className="text-[15px] font-bold text-slate-950">Wajib absen</h3>
              </div>
              <div className="space-y-2">
                {staffDirectory.length === 0 ? (
                  <p className="rounded-xl bg-white px-3 py-2 text-[12px] font-semibold text-slate-400">
                    Belum ada staff.
                  </p>
                ) : staffDirectory.map((staff) => (
                  <div key={staff.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
                    <div className="flex min-w-0 items-center gap-2">
                      {staff.avatar_url ? (
                        <CroppedAvatar
                          src={staff.avatar_url}
                          alt={staff.name}
                          crop={staff}
                          className="h-9 w-9 rounded-full"
                        />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-[12px] font-bold text-white">
                          {staff.initials}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-slate-950">{staff.name}</p>
                        <p className="text-[11px] font-semibold text-slate-500">{staff.role}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleAttendanceRequirement(staff)}
                      disabled={togglingStaffId === staff.id}
                      className={
                        'inline-flex h-9 shrink-0 items-center justify-center rounded-full px-3 text-[11px] font-bold transition-colors disabled:opacity-60 ' +
                        (staff.attendance_required
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                          : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200')
                      }
                    >
                      {togglingStaffId === staff.id ? '...' : staff.attendance_required ? 'Aktif' : 'Nonaktif'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
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
