import { Award, Loader2, Star, Trophy } from 'lucide-react';
import type { StaffPerformance } from '@/services/staffPerformance';

const BATCH_STYLE: Record<StaffPerformance['batch'], string> = {
  Bronze: 'from-amber-700 to-orange-500 text-white',
  Silver: 'from-slate-400 to-slate-600 text-white',
  Gold: 'from-yellow-300 to-amber-500 text-slate-950',
  Platinum: 'from-cyan-200 to-blue-500 text-slate-950',
  Lord: 'from-violet-500 to-slate-950 text-white',
};

interface Props {
  performance: StaffPerformance | null;
  loading?: boolean;
}

export default function StaffPerformanceBadge({ performance, loading = false }: Props) {
  if (loading) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/70 bg-white/60 px-3 py-2 text-[12px] font-semibold text-slate-500 shadow-sm backdrop-blur-xl">
        <Loader2 size={14} className="animate-spin" />
        Memuat performa
      </div>
    );
  }

  if (!performance) {
    return (
      <div className="mt-3 rounded-2xl border border-white/70 bg-white/60 px-3 py-2 text-[12px] font-semibold text-slate-500 shadow-sm backdrop-blur-xl">
        Performance belum ada
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-[22px] border border-white/70 bg-white/65 p-3 shadow-sm shadow-blue-900/10 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r px-3 py-1 text-[12px] font-bold ${BATCH_STYLE[performance.batch]}`}>
          <Trophy size={13} />
          {performance.batch}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[12px] font-bold text-blue-700">
          <Star size={13} />
          Level {performance.level}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-600">
        <div>
          <div className="text-slate-950">{performance.current_month_units} unit bulan ini</div>
          <div className="mt-0.5 text-slate-400">Target {performance.targetUnits} unit/staff</div>
        </div>
        <div className="text-right">
          <div className="text-slate-950">{performance.xp.toLocaleString('id-ID')} XP</div>
          <div className="mt-0.5 text-slate-400">Bulan lalu {performance.previous_month_units} unit</div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
        <div
          className="h-full rounded-full bg-blue-600"
          style={{ width: `${performance.levelProgressPercent}%` }}
          aria-label="Progress level"
        />
      </div>
      {performance.nextBatch && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
          <Award size={12} />
          {performance.nextBatch} di {performance.nextBatchUnits} unit bulan lalu
        </div>
      )}
    </div>
  );
}
