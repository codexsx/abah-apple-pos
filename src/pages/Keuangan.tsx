// Feature: finance-menu — Boss-only read-only finance summary page.
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Wallet,
  TrendingUp,
  Package,
} from 'lucide-react';
import { getFinanceSummary } from '@/services/finance';
import type { FinanceSummary } from '@/services/financeCore';
import { useCanViewAgentMoney } from '@/hooks/useCanViewAgentMoney';

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
/* ------------------------------------------------------------------ */

const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];
const easeOutExpo = [0.19, 1, 0.22, 1] as [number, number, number, number];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatRupiah(n: number) {
  const sign = n < 0 ? '-' : '';
  return sign + 'Rp ' + Math.abs(n).toLocaleString('id-ID');
}

/* ------------------------------------------------------------------ */
/*  Approximation notes (Bahasa Indonesia)                             */
/* ------------------------------------------------------------------ */

const NOTES: string[] = [
  'HPP dihitung dari total harga modal (cost_price × jumlah) unit berstatus TERJUAL, bukan dari total Pembelian per periode.',
  'Nilai persediaan dihitung dari harga jual × jumlah untuk unit berstatus READY.',
  'Pengeluaran termasuk biaya operasional dan upah servis. Tukar Tambah tidak dimasukkan ke laba.',
  'Pembelian Pelengkap mengurangi kas/bank dan menambah stok pelengkap; biayanya masuk HPP saat pelengkap dipakai di penjualan.',
];

/* ------------------------------------------------------------------ */
/*  Summary row                                                        */
/* ------------------------------------------------------------------ */

function SummaryRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: number;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <span className="text-[14px] text-slate-600 font-body">{label}</span>
      <span className={`font-mono text-[14px] font-semibold ${valueClass ?? 'text-slate-900'}`}>
        {formatRupiah(value)}
      </span>
    </div>
  );
}

function LockedSummaryRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <span className="text-[14px] text-slate-600 font-body">{label}</span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
        Dikunci Boss
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Highlighted total row                                              */
/* ------------------------------------------------------------------ */

function HighlightRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: number;
  valueClass: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4">
      <span className="text-[15px] font-semibold text-slate-800 font-body">{label}</span>
      <span className={`font-mono text-[18px] font-bold ${valueClass}`}>{formatRupiah(value)}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function Keuangan() {
  const navigate = useNavigate();
  const canViewAgentMoney = useCanViewAgentMoney();
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getFinanceSummary(undefined, { includeAgentMoney: canViewAgentMoney });
      setSummary(data);
    } catch (err: unknown) {
      console.error('[Keuangan] load error:', err);
      setError(err instanceof Error && err.message ? err.message : 'Gagal memuat ringkasan keuangan');
    } finally {
      setLoading(false);
    }
  }, [canViewAgentMoney]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  /* ----- Loading / error states (mirror AkunKas.tsx) ----- */

  if (loading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-teal-200 border-t-teal-600" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8">
        <AlertCircle size={48} className="text-rose-500 mb-4" />
        <p className="text-[16px] font-medium text-slate-700 text-center">
          {error || 'Gagal memuat ringkasan keuangan'}
        </p>
        <button
          onClick={loadSummary}
          className="mt-4 flex items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors"
        >
          <RefreshCw size={15} />
          Coba lagi
        </button>
      </div>
    );
  }

  const netProfitClass = summary.netProfit < 0 ? 'text-rose-600' : 'text-emerald-600';

  return (
    <div className="pb-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: easeOutExpo }}
        className="mb-6"
      >
        <div className="flex items-center gap-3 mb-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            aria-label="Kembali"
          >
            <ArrowLeft size={18} />
          </motion.button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-[36px] text-slate-900 leading-tight">Keuangan</h1>
              <span className="font-mono text-[13px] text-slate-500">Ringkasan seluruh periode</span>
            </div>
          </div>
          <motion.button
            whileHover={{ rotate: 180 }}
            whileTap={{ scale: 0.95 }}
            onClick={loadSummary}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            title="Refresh"
            aria-label="Muat ulang"
          >
            <RefreshCw size={16} />
          </motion.button>
        </div>
        <div className="ml-12 h-[3px] rounded-full bg-slate-200 overflow-hidden max-w-[200px]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: 0.8, ease: easeOutExpo }}
            className="h-full bg-teal-500 rounded-full"
          />
        </div>
      </motion.div>

      <div className="flex flex-col gap-5">
        {/* Laba / Rugi */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05, ease: easeSmooth }}
          className="rounded-2xl border border-slate-200 bg-white shadow-card overflow-hidden"
        >
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <TrendingUp size={18} />
            </div>
            <h2 className="text-[16px] font-semibold text-slate-900 font-body">Laba / Rugi</h2>
          </div>
          <div className="divide-y divide-slate-100">
            <SummaryRow label="Pendapatan" value={summary.revenue} />
            <SummaryRow label="HPP / Pembelian" value={summary.cogs} />
            <SummaryRow label="Pengeluaran" value={summary.expenses} />
          </div>
          <HighlightRow label="Laba Bersih" value={summary.netProfit} valueClass={netProfitClass} />
        </motion.section>

        {/* Aset */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: easeSmooth }}
          className="rounded-2xl border border-slate-200 bg-white shadow-card overflow-hidden"
        >
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
              <Wallet size={18} />
            </div>
            <h2 className="text-[16px] font-semibold text-slate-900 font-body">Aset</h2>
          </div>
          <div className="divide-y divide-slate-100">
            <SummaryRow label="Kas &amp; Bank" value={summary.cashBankTotal} />
            <SummaryRow label="Nilai Persediaan" value={summary.inventoryValue} />
            {canViewAgentMoney ? (
              <>
                <SummaryRow label="Piutang Agen" value={summary.agentReceivable} />
                <SummaryRow
                  label="Titipan/Deposit Agen"
                  value={summary.agentDepositLiability}
                  valueClass="text-rose-600"
                />
              </>
            ) : (
              <>
                <LockedSummaryRow label="Piutang Agen" />
                <LockedSummaryRow label="Titipan/Deposit Agen" />
              </>
            )}
          </div>
          <HighlightRow label="Total Aset" value={summary.totalAsset} valueClass="text-slate-900" />
        </motion.section>

        {/* Catatan / disclaimer */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: easeSmooth }}
          className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Package size={15} className="text-slate-400" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 font-body">
              Catatan Perhitungan
            </h3>
          </div>
          <ol className="list-decimal space-y-2 pl-5">
            {NOTES.map((note, i) => (
              <li key={i} className="text-[12px] leading-relaxed text-slate-500 font-body">
                {note}
              </li>
            ))}
          </ol>
        </motion.section>
      </div>
    </div>
  );
}
