import type { AttendanceAbsence, AttendanceOffRequest, AttendanceRecord } from '@/services/attendance';

export type AttendanceReportItem =
  | { type: 'record'; key: string; date: string; sortTime: string; record: AttendanceRecord }
  | { type: 'absence'; key: string; date: string; sortTime: string; absence: AttendanceAbsence }
  | { type: 'off'; key: string; date: string; sortTime: string; offRequest: AttendanceOffRequest };

const CSV_HEADERS = [
  'Nama Staff',
  'Jabatan',
  'Tanggal',
  'Status',
  'Shift',
  'Jam Masuk',
  'Jadwal',
  'Telat Menit',
  'Potongan',
  'Keterangan',
  'GPS Meter',
  'Akurasi Meter',
  'Path Foto',
];

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function statusLabel(status: AttendanceRecord['status']): string {
  if (status === 'approved') return 'Disetujui';
  if (status === 'rejected') return 'Ditolak';
  return 'Menunggu';
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function rupiah(value: number): string {
  return `Rp ${Math.max(0, value).toLocaleString('id-ID')}`;
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function recordRow(record: AttendanceRecord): Array<string | number | null> {
  return [
    record.staff.name,
    record.staff.role,
    record.attendance_date,
    statusLabel(record.status),
    record.shift_name,
    formatTime(record.check_in_at),
    record.scheduled_start_time,
    record.late_minutes,
    record.penalty_amount,
    record.late_reason,
    record.distance_meters,
    record.accuracy_meters,
    record.photo_path,
  ];
}

function absenceRow(absence: AttendanceAbsence): Array<string | number | null> {
  return [
    absence.staff.name,
    absence.staff.role,
    absence.attendance_date,
    'Tidak Absen',
    '',
    '',
    '',
    '',
    absence.penalty_amount,
    '',
    '',
    '',
    '',
  ];
}

function offRow(offRequest: AttendanceOffRequest): Array<string | number | null> {
  return [
    offRequest.staff.name,
    offRequest.staff.role,
    offRequest.attendance_date,
    'Libur / Off',
    '',
    '',
    '',
    '',
    0,
    offRequest.reason,
    '',
    '',
    '',
  ];
}

export function buildAttendanceCsv(items: AttendanceReportItem[]): string {
  const rows = items.map((item) => {
    if (item.type === 'record') return recordRow(item.record);
    if (item.type === 'off') return offRow(item.offRequest);
    return absenceRow(item.absence);
  });
  return [
    CSV_HEADERS.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ].join('\r\n');
}

export function attendanceReportFilename(
  startDate: string,
  endDate: string,
  extension: 'csv' | 'html',
): string {
  return `absensi-${startDate}-${endDate}.${extension}`;
}

function photoBlock(item: AttendanceReportItem): string {
  if (item.type === 'off') {
    const { offRequest } = item;
    return `
      <article class="card off">
        <div class="photo empty">Libur / Off</div>
        <div class="meta">
          <h2>${escapeHtml(offRequest.staff.name)}</h2>
          <p>${escapeHtml(offRequest.staff.role)} - ${escapeHtml(offRequest.attendance_date)}</p>
          <span class="badge info">Libur / Off</span>
          <strong>${escapeHtml(offRequest.reason)}</strong>
        </div>
      </article>
    `;
  }

  if (item.type === 'absence') {
    const { absence } = item;
    return `
      <article class="card absence">
        <div class="photo empty">Tidak ada foto</div>
        <div class="meta">
          <h2>${escapeHtml(absence.staff.name)}</h2>
          <p>${escapeHtml(absence.staff.role)} - ${escapeHtml(absence.attendance_date)}</p>
          <span class="badge danger">Tidak Absen</span>
          <strong>${escapeHtml(rupiah(absence.penalty_amount))}</strong>
        </div>
      </article>
    `;
  }

  const { record } = item;
  return `
    <article class="card">
      ${
        record.photo_url
          ? `<img src="${escapeHtml(record.photo_url)}" alt="Foto absen ${escapeHtml(record.staff.name)}" />`
          : '<div class="photo empty">Foto tidak tersedia</div>'
      }
      <div class="meta">
        <h2>${escapeHtml(record.staff.name)}</h2>
        <p>${escapeHtml(record.staff.role)} - ${escapeHtml(record.attendance_date)} - ${escapeHtml(formatTime(record.check_in_at))}</p>
        <p>${escapeHtml(record.shift_name)} - Jadwal ${escapeHtml(record.scheduled_start_time)}</p>
        <span class="badge">${escapeHtml(statusLabel(record.status))}</span>
        <strong>${escapeHtml(record.late_minutes)} menit - ${escapeHtml(rupiah(record.penalty_amount))}</strong>
        ${record.late_reason ? `<p>${escapeHtml(record.late_reason)}</p>` : ''}
        <small>GPS ${escapeHtml(record.distance_meters)}m${record.accuracy_meters == null ? '' : ` - akurasi ${escapeHtml(record.accuracy_meters)}m`}</small>
      </div>
    </article>
  `;
}

export function buildAttendancePhotoReportHtml(input: {
  title: string;
  startDate: string;
  endDate: string;
  generatedAt: Date;
  items: AttendanceReportItem[];
}): string {
  const generated = input.generatedAt.toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    @page { margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #0f172a; font-family: Inter, Arial, sans-serif; background: #f8fafc; }
    header { margin-bottom: 20px; }
    h1 { margin: 0; font-size: 28px; }
    .period { margin-top: 6px; color: #64748b; font-weight: 600; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .card { break-inside: avoid; display: grid; grid-template-columns: 118px 1fr; gap: 14px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 18px; background: #fff; }
    img, .photo { width: 118px; aspect-ratio: 3 / 4; border-radius: 14px; object-fit: cover; background: #e2e8f0; }
    .empty { display: flex; align-items: center; justify-content: center; padding: 10px; color: #94a3b8; font-size: 12px; font-weight: 700; text-align: center; }
    .meta h2 { margin: 0 0 4px; font-size: 17px; }
    .meta p { margin: 3px 0; color: #475569; font-size: 12px; font-weight: 600; }
    .meta strong, .meta small { display: block; margin-top: 8px; }
    .badge { display: inline-flex; margin-top: 8px; padding: 4px 9px; border-radius: 999px; background: #dcfce7; color: #047857; font-size: 11px; font-weight: 800; }
    .danger { background: #ffedd5; color: #c2410c; }
    .info { background: #dbeafe; color: #1d4ed8; }
    @media print { body { background: #fff; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(input.title)}</h1>
    <div class="period">Periode ${escapeHtml(input.startDate)} sampai ${escapeHtml(input.endDate)} - dibuat ${escapeHtml(generated)}</div>
  </header>
  <main class="grid">
    ${input.items.map(photoBlock).join('\n')}
  </main>
</body>
</html>`;
}
