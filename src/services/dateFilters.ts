// Feature: riwayat-date-filter
// Pure, dependency-free date-filter helpers for the Riwayat pages.
// All functions are total and timezone-safe for the Indonesia locale: filters
// operate on the calendar-date part (YYYY-MM-DD) of ISO 8601 timestamps.

export type QuickFilter =
  | 'Hari Ini'
  | '7 Hari'
  | '30 Hari'
  | 'Bulan Ini'
  | 'Bulan Lalu'
  | 'Custom';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

/** Format a Date as YYYY-MM-DD in local time. */
function ymd(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Resolve a quick-filter label (or 'Custom') into an inclusive [from, to]
 * date range. For 'Custom', the supplied fromDate/toDate values are returned.
 */
export function getDateRange(
  filter: QuickFilter,
  fromDate: string,
  toDate: string,
): DateRange {
  const today = new Date();

  switch (filter) {
    case 'Hari Ini':
      return { from: ymd(today), to: ymd(today) };

    case '7 Hari': {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      return { from: ymd(d), to: ymd(today) };
    }

    case '30 Hari': {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      return { from: ymd(d), to: ymd(today) };
    }

    case 'Bulan Ini': {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: ymd(from), to: ymd(to) };
    }

    case 'Bulan Lalu': {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: ymd(from), to: ymd(to) };
    }

    case 'Custom':
    default:
      return { from: fromDate, to: toDate };
  }
}

/**
 * Check whether an ISO 8601 timestamp falls inside an inclusive date range.
 * Empty from/to boundaries are treated as unbounded.
 */
export function isInDateRange(isoDate: string, range: DateRange): boolean {
  if (!range.from && !range.to) return true;
  const d = isoDate.slice(0, 10); // YYYY-MM-DD
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}
