import type {
  MoneyDirection,
  ReconciliationEntry,
  ReconciliationSource,
} from '@/services/reconciliationCore';

export interface ParsedReconciliationFile {
  entries: ReconciliationEntry[];
  warnings: string[];
}

type CellValue = string | number | boolean | Date | null | undefined;

const DATE_HEADERS = ['tanggal', 'date', 'tgl', 'waktu', 'created at', 'transaction date'];
const AMOUNT_HEADERS = ['nominal', 'amount', 'jumlah', 'nilai', 'mutasi', 'total'];
const CREDIT_HEADERS = ['kredit', 'credit', 'masuk', 'uang masuk', 'in'];
const DEBIT_HEADERS = ['debit', 'debet', 'keluar', 'uang keluar', 'out'];
const DIRECTION_HEADERS = ['arah', 'direction', 'tipe', 'type', 'jenis'];
const DESCRIPTION_HEADERS = ['deskripsi', 'description', 'keterangan', 'berita', 'remark', 'catatan', 'note'];
const ACCOUNT_HEADERS = ['akun', 'account', 'rekening', 'bank', 'metode', 'method'];
const REFERENCE_HEADERS = ['referensi', 'reference', 'ref', 'no ref', 'id transaksi', 'transaction id'];

function normalizeHeader(value: CellValue): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findColumn(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) =>
    candidates.some((candidate) => header === candidate || header.includes(candidate)),
  );
}

function parseCurrency(value: CellValue): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(Math.abs(value));
  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  const negative = /(^-|keluar|debit|debet)/i.test(raw);
  let normalized = raw
    .replace(/rp/gi, '')
    .replace(/\s+/g, '')
    .replace(/[^\d,.-]/g, '');

  if (normalized.includes(',') && normalized.includes('.')) {
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (normalized.includes(',')) {
    const parts = normalized.split(',');
    normalized = parts[parts.length - 1].length <= 2
      ? normalized.replace(',', '.')
      : normalized.replace(/,/g, '');
  } else {
    normalized = normalized.replace(/\./g, '');
  }

  const amount = Number(normalized) || 0;
  return Math.round(Math.abs(negative ? -amount : amount));
}

function signedCurrency(value: CellValue): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const amount = parseCurrency(raw);
  return /(^-|keluar|debit|debet)/i.test(raw) ? -amount : amount;
}

function excelSerialToDate(value: number): Date {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + value * 86_400_000);
}

function toIsoDate(value: CellValue): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  }

  if (typeof value === 'number' && value > 20_000 && value < 90_000) {
    return toIsoDate(excelSerialToDate(value));
  }

  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const iso = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  const local = raw.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (local) {
    const year = local[3].length === 2 ? `20${local[3]}` : local[3];
    return `${year}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return toIsoDate(parsed);
  return '';
}

function parseDirection(value: CellValue): MoneyDirection | null {
  const text = normalizeHeader(value);
  if (!text) return null;
  if (/\b(in|masuk|kredit|credit|terima|debet masuk)\b/.test(text)) return 'in';
  if (/\b(out|keluar|debit|debet|bayar|potong)\b/.test(text)) return 'out';
  return null;
}

function splitDelimited(text: string): string[][] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const sample = lines[0];
  const delimiter = [';', '\t', ','].sort(
    (a, b) => sample.split(b).length - sample.split(a).length,
  )[0];

  return lines.map((line) => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

async function readRows(file: File): Promise<CellValue[][]> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    const mod = await import('read-excel-file/browser');
    const rows = await mod.default(file);
    return rows as unknown as CellValue[][];
  }

  const text = await file.text();
  return splitDelimited(text);
}

function readCell(row: CellValue[], index: number): CellValue {
  return index >= 0 ? row[index] : '';
}

function fallbackDate(defaultDate: string, value: string): string {
  return value || defaultDate;
}

function directionFromColumns(row: CellValue[], indexes: {
  amountIndex: number;
  debitIndex: number;
  creditIndex: number;
  directionIndex: number;
}): { direction: MoneyDirection; amount: number } {
  const credit = parseCurrency(readCell(row, indexes.creditIndex));
  const debit = parseCurrency(readCell(row, indexes.debitIndex));
  if (credit > 0 || debit > 0) {
    return credit >= debit
      ? { direction: 'in', amount: credit }
      : { direction: 'out', amount: debit };
  }

  const explicit = parseDirection(readCell(row, indexes.directionIndex));
  const signed = signedCurrency(readCell(row, indexes.amountIndex));
  if (signed < 0) return { direction: 'out', amount: Math.abs(signed) };
  return { direction: explicit ?? 'in', amount: Math.abs(signed) };
}

export async function parseReconciliationFile(input: {
  file: File;
  source: Exclude<ReconciliationSource, 'webapp'>;
  defaultDate: string;
}): Promise<ParsedReconciliationFile> {
  const rows = (await readRows(input.file)).filter((row) =>
    row.some((cell) => String(cell ?? '').trim().length > 0),
  );
  if (rows.length < 2) {
    return {
      entries: [],
      warnings: [`${input.file.name} tidak punya cukup baris untuk dibaca.`],
    };
  }

  const headers = rows[0].map(normalizeHeader);
  const indexes = {
    dateIndex: findColumn(headers, DATE_HEADERS),
    amountIndex: findColumn(headers, AMOUNT_HEADERS),
    debitIndex: findColumn(headers, DEBIT_HEADERS),
    creditIndex: findColumn(headers, CREDIT_HEADERS),
    directionIndex: findColumn(headers, DIRECTION_HEADERS),
    descriptionIndex: findColumn(headers, DESCRIPTION_HEADERS),
    accountIndex: findColumn(headers, ACCOUNT_HEADERS),
    referenceIndex: findColumn(headers, REFERENCE_HEADERS),
  };

  const warnings: string[] = [];
  if (indexes.amountIndex < 0 && indexes.debitIndex < 0 && indexes.creditIndex < 0) {
    warnings.push(`${input.file.name}: kolom nominal/debit/kredit tidak terdeteksi.`);
  }
  if (indexes.dateIndex < 0) {
    warnings.push(`${input.file.name}: kolom tanggal tidak terdeteksi, memakai tanggal closing.`);
  }

  const entries: ReconciliationEntry[] = [];
  rows.slice(1).forEach((row, rowIndex) => {
    const { direction, amount } = directionFromColumns(row, indexes);
    if (amount <= 0) return;

    const date = fallbackDate(input.defaultDate, toIsoDate(readCell(row, indexes.dateIndex)));
    const accountName = String(readCell(row, indexes.accountIndex) || input.source).trim();
    const description = String(readCell(row, indexes.descriptionIndex) || '').trim();
    const reference = String(readCell(row, indexes.referenceIndex) || '').trim();

    entries.push({
      id: `${input.source}:${input.file.name}:${rowIndex + 2}`,
      source: input.source,
      date,
      direction,
      amount,
      accountName,
      description: description || reference || `${input.source} row ${rowIndex + 2}`,
      reference: reference || undefined,
    });
  });

  return { entries, warnings };
}
