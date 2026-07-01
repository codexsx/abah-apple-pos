import { Smartphone } from 'lucide-react';
import type { StockItem } from '@/services/stock';

function formatRupiah(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID');
}

/**
 * Render the stock unit(s) linked to a transaction. Used by the Riwayat pages
 * to show detail HP (model, capacity, color, condition, IMEI, price) when the
 * backend returns joined stock_items via transaction_id.
 */
export function TransactionStockDetails({ items }: { items: StockItem[] }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {items.map((unit) => (
        <div
          key={unit.id}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-600 bg-slate-50 rounded-xl px-3 py-2"
        >
          <Smartphone size={14} className="text-slate-400 shrink-0" />
          <span className="font-medium text-slate-800">
            {unit.model} {unit.capacity}
          </span>
          <span className="text-slate-300">|</span>
          <span>{unit.color}</span>
          <span>{unit.condition}</span>
          {unit.has_imei && unit.imei && (
            <span className="font-mono text-[11px] text-slate-400">{unit.imei}</span>
          )}
          {unit.defect_description && (
            <span className="font-medium text-amber-700">Minus: {unit.defect_description}</span>
          )}
          <span className="ml-auto font-mono font-medium text-slate-700">
            {formatRupiah(unit.price)}
          </span>
        </div>
      ))}
    </div>
  );
}
