import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { ArrowLeft, Award, Loader2, RefreshCw, Star, Trophy, Users } from 'lucide-react';
import {
  getStaffPerformanceLeaderboard,
  type StaffPerformance,
} from '@/services/staffPerformance';

const easeOutExpo = [0.19, 1, 0.22, 1] as [number, number, number, number];

const BATCH_CLASS: Record<StaffPerformance['batch'], string> = {
  Bronze: 'bg-amber-50 text-amber-800 border-amber-200',
  Silver: 'bg-slate-100 text-slate-700 border-slate-200',
  Gold: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  Platinum: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  Lord: 'bg-violet-50 text-violet-800 border-violet-200',
};

function formatUnit(value: number): string {
  return `${value.toLocaleString('id-ID')} unit`;
}

function StaffAvatar({ row }: { row: StaffPerformance }) {
  if (row.avatar_url) {
    return (
      <img
        src={row.avatar_url}
        alt={row.staff_name}
        className="h-11 w-11 rounded-2xl object-cover ring-1 ring-slate-200"
      />
    );
  }
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-[13px] font-bold text-white">
      {row.staff_name.slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function StaffPerformancePage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<StaffPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    getStaffPerformanceLeaderboard()
      .then(setRows)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Gagal memuat staff performance.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const currentUnits = rows.reduce((sum, row) => sum + row.current_month_units, 0);
    const previousUnits = rows.reduce((sum, row) => sum + row.previous_month_units, 0);
    const top = rows[0] ?? null;
    return { currentUnits, previousUnits, top };
  }, [rows]);

  return (
    <div className="pb-10">
      <div className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100" />
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: easeOutExpo }}
        className="relative z-10 mx-auto max-w-6xl"
      >
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
              aria-label="Kembali"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-blue-600">
                Boss Detail
              </p>
              <h1 className="font-display text-[28px] leading-tight text-slate-950">
                Staff Performance
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-card">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Users size={18} />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Staff Sales Aktif</p>
            <p className="mt-2 font-mono text-[28px] font-bold text-slate-950">{rows[0]?.active_sales_staff ?? rows.length}</p>
          </div>
          <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-card">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Trophy size={18} />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Unit Bulan Ini</p>
            <p className="mt-2 font-mono text-[28px] font-bold text-slate-950">{formatUnit(summary.currentUnits)}</p>
          </div>
          <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-card">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Award size={18} />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Top Batch Bulan Lalu</p>
            <p className="mt-2 truncate text-[22px] font-bold text-slate-950">{summary.top ? `${summary.top.staff_name} - ${summary.top.batch}` : '-'}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-[30px] border border-slate-100 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-[16px] font-semibold text-slate-950">Leaderboard Staff</h2>
              <p className="mt-1 text-[12px] text-slate-500">
                Batch dihitung dari unit bulan sebelumnya. Level dari lifetime unit.
              </p>
            </div>
            <span className="hidden rounded-full bg-slate-50 px-3 py-1 text-[12px] font-semibold text-slate-500 sm:inline-flex">
              Bulan lalu {formatUnit(summary.previousUnits)}
            </span>
          </div>

          {loading ? (
            <div className="flex h-56 items-center justify-center text-slate-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : error ? (
            <div className="p-6 text-[14px] font-medium text-rose-600">{error}</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-[14px] font-medium text-slate-500">Belum ada staff sales aktif.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <div key={row.staff_id} className="grid grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-[minmax(260px,1fr)_130px_130px_130px_160px] lg:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 font-mono text-[13px] font-bold text-slate-500">
                      {index + 1}
                    </div>
                    <StaffAvatar row={row} />
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold text-slate-950">{row.staff_name}</div>
                      <div className="mt-1 text-[12px] font-medium text-slate-400">{row.role}</div>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Bulan Ini</p>
                    <p className="mt-1 font-mono text-[16px] font-bold text-slate-950">{formatUnit(row.current_month_units)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Bulan Lalu</p>
                    <p className="mt-1 font-mono text-[16px] font-bold text-slate-950">{formatUnit(row.previous_month_units)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Lifetime</p>
                    <p className="mt-1 font-mono text-[16px] font-bold text-slate-950">{formatUnit(row.lifetime_units)}</p>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-bold ${BATCH_CLASS[row.batch]}`}>
                        <Trophy size={12} />
                        {row.batch}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[12px] font-bold text-blue-700">
                        <Star size={12} />
                        Lv {row.level}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${row.batchProgressPercent}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] font-medium text-slate-400">
                      Target {row.targetUnits} unit/staff
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
