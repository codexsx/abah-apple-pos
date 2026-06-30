import type { StockStatus } from '@/services/stockCore';

export interface RawExcelRow {
  rowNumber: number;
  values: unknown[];
}

export interface ParsedAgentDefectStockRow {
  sourceRowNumber: number;
  no: string;
  model: string;
  capacity: string;
  originalModel: string;
  imei: string | null;
  hasImei: boolean;
  batteryHealth: number | null;
  carrier: string;
  defectDescription: string;
  costPrice: number;
  price: number;
  status: StockStatus;
  condition: string;
  count: number;
  warnings: string[];
  errors: string[];
}

export interface AgentDefectImportPreview {
  rows: ParsedAgentDefectStockRow[];
  validRows: ParsedAgentDefectStockRow[];
  errorRows: ParsedAgentDefectStockRow[];
  summary: {
    totalRows: number;
    validRows: number;
    warningRows: number;
    errorRows: number;
    totalCost: number;
    imeiCount: number;
    duplicateImeis: string[];
  };
}

export interface AgentDefectImportPayloadRow {
  model: string;
  capacity: string;
  condition: string;
  color: string;
  imei: string | null;
  has_imei: boolean;
  status: StockStatus;
  count: number;
  price: number;
  cost_price: number;
  battery_health: number | null;
  carrier: string;
  defect_description: string;
  source_row_number: number;
  import_note: string;
  warnings: string[];
}

const HEADER_ALIASES: Record<string, string[]> = {
  no: ['no', 'nomor', 'number', '#'],
  model: ['model', 'type', 'seri', 'series'],
  imei: ['imei', 'ime1', 'sn', 'serial'],
  batteryHealth: ['bh', 'battery health', 'baterai', 'battery'],
  carrier: ['carrier', 'operator', 'lock', 'status carrier'],
  defectDescription: ['defect description', 'defect', 'minus', 'kerusakan', 'keterangan', 'catatan'],
  costPrice: ['harga', 'modal', 'harga modal', 'cost', 'cost price'],
};

const HEAVY_DEFECT_KEYWORDS = [
  'gak bisa dicek',
  'tidak bisa dicek',
  'dicas gak ngisi',
  'cas gak ngisi',
  'lcd gak bisa sentuh',
  'lcd tidak bisa sentuh',
  'mdm',
  'mati',
];

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeImei(value: unknown): string | null {
  const raw = normalizeText(value);
  if (!raw || raw === '-') return null;
  const scientific = /e/i.test(raw) || raw.includes('.');
  if (scientific) {
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) {
      return String(Math.round(num));
    }
  }
  const digits = raw.replace(/\D/g, '');
  return digits || null;
}

function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.round(value);
  }
  const cleaned = String(value)
    .replace(/rp/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '');
  if (!cleaned || cleaned === '-') return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function parseBatteryHealth(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim().replace('%', '').replace(',', '.');
  if (!raw || raw === '-') return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return Math.round(num <= 1 ? num * 100 : num);
}

export function parseModelCapacity(original: string): { model: string; capacity: string } {
  const normalized = normalizeText(original);
  const match = normalized.match(/\b(\d+\s*(?:GB|TB))\b/i);
  if (!match) {
    return { model: normalized, capacity: '' };
  }
  const capacity = match[1].replace(/\s+/g, '').toUpperCase();
  const model = normalizeText(normalized.replace(match[0], ''));
  return { model, capacity };
}

function findHeaderMap(rows: RawExcelRow[]): { headerIndex: number; columns: Record<string, number> } {
  let best = { headerIndex: -1, columns: {} as Record<string, number>, score: 0 };

  rows.slice(0, 12).forEach((row, index) => {
    const columns: Record<string, number> = {};
    row.values.forEach((cell, colIndex) => {
      const header = normalizeHeader(cell);
      if (!header) return;
      Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
        if (columns[key] !== undefined) return;
        if (aliases.includes(header)) {
          columns[key] = colIndex;
        }
      });
    });
    const score = Object.keys(columns).length;
    if (score > best.score) {
      best = { headerIndex: index, columns, score };
    }
  });

  return { headerIndex: best.headerIndex, columns: best.columns };
}

function readCell(row: RawExcelRow, columns: Record<string, number>, key: string): unknown {
  const col = columns[key];
  return col === undefined ? undefined : row.values[col];
}

export function parseAgentDefectStockRows(
  rows: RawExcelRow[],
  defaultStatus: StockStatus = 'READY',
): AgentDefectImportPreview {
  const { headerIndex, columns } = findHeaderMap(rows);
  if (headerIndex < 0 || columns.model === undefined || columns.costPrice === undefined) {
    throw new Error('Format Excel tidak dikenali. Kolom minimal: Model dan Harga.');
  }

  const parsed = rows
    .slice(headerIndex + 1)
    .filter((row) => row.values.some((cell) => normalizeText(cell) !== ''))
    .map((row): ParsedAgentDefectStockRow => {
      const warnings: string[] = [];
      const errors: string[] = [];

      const originalModel = normalizeText(readCell(row, columns, 'model'));
      const { model, capacity } = parseModelCapacity(originalModel);
      const imei = normalizeImei(readCell(row, columns, 'imei'));
      const batteryHealth = parseBatteryHealth(readCell(row, columns, 'batteryHealth'));
      const carrier = normalizeText(readCell(row, columns, 'carrier'));
      const defectDescription = normalizeText(readCell(row, columns, 'defectDescription'));
      const costPrice = parseMoney(readCell(row, columns, 'costPrice'));
      const no = normalizeText(readCell(row, columns, 'no'));

      if (!model) errors.push('Model kosong');
      if (!costPrice || costPrice <= 0) errors.push('Harga modal kosong');
      if (!imei) warnings.push('IMEI kosong, unit akan masuk sebagai stok tanpa IMEI');
      if (imei && !/^\d{15}$/.test(imei)) errors.push('IMEI harus 15 digit');
      if (batteryHealth === null) warnings.push('BH kosong');
      if (batteryHealth !== null && (batteryHealth < 0 || batteryHealth > 100)) {
        errors.push('BH harus 0-100');
      }
      if (!defectDescription) warnings.push('Defect kosong');

      const defectLower = defectDescription.toLowerCase();
      if (HEAVY_DEFECT_KEYWORDS.some((keyword) => defectLower.includes(keyword))) {
        warnings.push('Defect berat, cek status sebelum dijual');
      }

      return {
        sourceRowNumber: row.rowNumber,
        no,
        model,
        capacity,
        originalModel,
        imei,
        hasImei: Boolean(imei),
        batteryHealth,
        carrier,
        defectDescription,
        costPrice: costPrice ?? 0,
        price: 0,
        status: defaultStatus,
        condition: 'Second Minus',
        count: 1,
        warnings,
        errors,
      };
    });

  const imeiCounts = new Map<string, number>();
  parsed.forEach((row) => {
    if (!row.imei) return;
    imeiCounts.set(row.imei, (imeiCounts.get(row.imei) ?? 0) + 1);
  });
  const duplicateImeis = Array.from(imeiCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([imei]) => imei);

  if (duplicateImeis.length > 0) {
    const duplicates = new Set(duplicateImeis);
    parsed.forEach((row) => {
      if (row.imei && duplicates.has(row.imei)) {
        row.errors.push('IMEI duplikat dalam file');
      }
    });
  }

  const validRows = parsed.filter((row) => row.errors.length === 0);
  const errorRows = parsed.filter((row) => row.errors.length > 0);
  const warningRows = validRows.filter((row) => row.warnings.length > 0);

  return {
    rows: parsed,
    validRows,
    errorRows,
    summary: {
      totalRows: parsed.length,
      validRows: validRows.length,
      warningRows: warningRows.length,
      errorRows: errorRows.length,
      totalCost: validRows.reduce((sum, row) => sum + row.costPrice, 0),
      imeiCount: validRows.filter((row) => row.imei).length,
      duplicateImeis,
    },
  };
}

export function toAgentDefectImportPayloadRows(
  rows: ParsedAgentDefectStockRow[],
): AgentDefectImportPayloadRow[] {
  return rows.map((row) => ({
    model: row.model,
    capacity: row.capacity,
    condition: row.condition,
    color: '',
    imei: row.imei,
    has_imei: row.hasImei,
    status: row.status,
    count: row.count,
    price: row.price,
    cost_price: row.costPrice,
    battery_health: row.batteryHealth,
    carrier: row.carrier,
    defect_description: row.defectDescription,
    source_row_number: row.sourceRowNumber,
    import_note: row.originalModel && row.originalModel !== `${row.model} ${row.capacity}`.trim()
      ? `Original model: ${row.originalModel}`
      : '',
    warnings: row.warnings,
  }));
}
