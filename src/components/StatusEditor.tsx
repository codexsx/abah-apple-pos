// Feature: stock-source-of-truth (Phase 3)
// Reusable, presentational status editor for a stock unit. The parent owns the
// unit's current status and persistence; this component never fetches or
// mutates. It renders the five lifecycle statuses as selectable options, marks
// the current `value` active, validates a chosen transition via
// `isValidStatusTransition`, and surfaces the mapped Indonesian message inline
// when a transition is not allowed (Req 5.1–5.4).

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  type StockStatus,
  STOCK_STATUSES,
  isValidStatusTransition,
} from '@/services/stockCore';

export interface StatusEditorProps {
  /** The unit's current lifecycle status. */
  value: StockStatus;
  /** Called with a valid target status once a transition is confirmed. */
  onSelect: (target: StockStatus) => void;
  /** Force the whole control non-interactive (in addition to terminal TERJUAL). */
  disabled?: boolean;
}

/**
 * Per-status color palette, mirroring the `StatusBadge` mapping in
 * `Stok.tsx` for visual consistency. `active` is used for the currently
 * selected status; `idle` for the rest.
 */
const STATUS_STYLES: Record<
  StockStatus,
  { active: string; idle: string }
> = {
  READY: {
    active: 'border-[#0D9488] bg-[#F0FDFA] text-[#0D9488]',
    idle: 'border-slate-200 bg-white text-slate-500 hover:bg-[#F0FDFA] hover:text-[#0D9488]',
  },
  SERVIS: {
    active: 'border-[#8B5CF6] bg-[#F5F3FF] text-[#8B5CF6]',
    idle: 'border-slate-200 bg-white text-slate-500 hover:bg-[#F5F3FF] hover:text-[#8B5CF6]',
  },
  KANIBAL: {
    active: 'border-[#F43F5E] bg-[#FFF1F2] text-[#F43F5E]',
    idle: 'border-slate-200 bg-white text-slate-500 hover:bg-[#FFF1F2] hover:text-[#F43F5E]',
  },
  RUSAK: {
    active: 'border-[#B45309] bg-[#FFFBEB] text-[#B45309]',
    idle: 'border-slate-200 bg-white text-slate-500 hover:bg-[#FFFBEB] hover:text-[#B45309]',
  },
  TERJUAL: {
    active: 'border-slate-400 bg-slate-100 text-slate-500',
    idle: 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100',
  },
};

export default function StatusEditor({
  value,
  onSelect,
  disabled,
}: StatusEditorProps) {
  const [error, setError] = useState<string | null>(null);

  // A TERJUAL unit is terminal (Req 5.3); the whole control is also inert when
  // the parent passes `disabled`.
  const controlDisabled = disabled === true || value === 'TERJUAL';

  function handleSelect(target: StockStatus) {
    if (controlDisabled) return;
    const result = isValidStatusTransition(value, target);
    if (result.ok) {
      setError(null);
      onSelect(target);
    } else {
      setError(result.message);
    }
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Ubah status stok"
        aria-disabled={controlDisabled}
        className={`flex flex-wrap gap-2 ${
          controlDisabled ? 'opacity-50' : ''
        }`}
      >
        {STOCK_STATUSES.map((status) => {
          const selected = status === value;
          const styles = STATUS_STYLES[status];
          return (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={status}
              disabled={controlDisabled}
              onClick={() => handleSelect(status)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] transition-colors ${
                selected ? styles.active : styles.idle
              } ${controlDisabled ? 'cursor-not-allowed' : ''}`}
            >
              {status}
            </button>
          );
        })}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700"
        >
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
