import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Calendar,
  Smartphone,
  ShoppingBag,
  Loader2,
  AlertCircle,
  RotateCcw,
  ShieldCheck,
  X,
  User,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  getTransactionDisplayDetail,
  getTransactionsWithStockDetailsByType,
  type TransactionWithStockDetails,
} from '@/services/transactions';
import { TransactionStockDetails } from '@/components/TransactionStockDetails';
import { getDateRange, isInDateRange, type QuickFilter } from '@/services/dateFilters';
import {
  recordServiceWithStockStatus,
  type ServiceRecordInsert,
} from '@/services/services';
import { getTechnicians, type Technician } from '@/services/technicians';
import type { StockItem } from '@/services/stock';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface DateGroup {
  date: string;
  dateLabel: string;
  items: TransactionWithStockDetails[];
}

const quickFilters = ['Hari Ini', '7 Hari', '30 Hari', 'Bulan Ini', 'Bulan Lalu'];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function formatRupiah(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID');
}

function formatDateLabel(isoDate: string) {
  return new Date(isoDate).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(isoDate: string) {
  return new Date(isoDate).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Group transactions by calendar date (derived from created_at). */
function groupByDate(transactions: TransactionWithStockDetails[]): DateGroup[] {
  const map = new Map<string, TransactionWithStockDetails[]>();
  for (const tx of transactions) {
    const dateKey = tx.created_at.slice(0, 10); // YYYY-MM-DD
    const bucket = map.get(dateKey);
    if (bucket) bucket.push(tx);
    else map.set(dateKey, [tx]);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest date first
    .map(([date, items]) => ({
      date,
      dateLabel: formatDateLabel(items[0].created_at),
      items,
    }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function RiwayatPembelian() {
  const [activeFilter, setActiveFilter] = useState<QuickFilter>('7 Hari');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [transactions, setTransactions] = useState<TransactionWithStockDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [claimTarget, setClaimTarget] = useState<{
    transaction: TransactionWithStockDetails;
    unit: StockItem;
  } | null>(null);
  const [claimIssue, setClaimIssue] = useState('');
  const [claimNote, setClaimNote] = useState('');
  const [claimTechnician, setClaimTechnician] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSaving, setClaimSaving] = useState(false);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTransactionsWithStockDetailsByType('Pembelian');
      setTransactions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data transaksi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    getTechnicians()
      .then(setTechnicians)
      .catch(() => setTechnicians([]));
  }, []);

  const closeClaimDialog = useCallback(() => {
    setClaimTarget(null);
    setClaimIssue('');
    setClaimNote('');
    setClaimTechnician('');
    setClaimError(null);
    setClaimSaving(false);
  }, []);

  const handleSaveClaim = useCallback(async () => {
    if (!claimTarget || claimSaving) return;
    const issue = claimIssue.trim();
    if (issue.length < 3) {
      setClaimError('Keluhan klaim minimal 3 karakter.');
      return;
    }
    if (!claimTechnician) {
      setClaimError('Pilih teknisi terlebih dahulu.');
      return;
    }

    const { transaction, unit } = claimTarget;
    const record: ServiceRecordInsert = {
      customer_name: 'Klaim Pembelian',
      phone_model: unit.model,
      capacity: unit.capacity || '',
      condition: unit.condition || '',
      color: unit.color || '',
      imei: unit.imei || '',
      battery_health: null,
      issue,
      additional_note: claimNote.trim() || `Klaim dari pembelian ${transaction.id}`,
      status: 'ANTRIAN',
      estimated_cost: 0,
      dp: 0,
      completed_at: null,
      technician: claimTechnician,
      service_type: 'Klaim Garansi',
      stk_id: '',
      wage_amount: 0,
      wage_paid: false,
      picked_up: false,
      picked_up_at: null,
    };

    setClaimSaving(true);
    setClaimError(null);
    try {
      await recordServiceWithStockStatus({
        stockId: unit.id,
        targetStatus: 'SERVIS',
        record,
      });
      closeClaimDialog();
      void fetchTransactions();
    } catch (err) {
      setClaimError(
        err instanceof Error && err.message
          ? err.message
          : 'Klaim garansi tidak dapat disimpan.',
      );
      setClaimSaving(false);
    }
  }, [
    claimIssue,
    claimNote,
    claimSaving,
    claimTarget,
    claimTechnician,
    closeClaimDialog,
    fetchTransactions,
  ]);

  /* derive stats */
  const dateRange = useMemo(
    () => getDateRange(activeFilter, fromDate, toDate),
    [activeFilter, fromDate, toDate]
  );
  const filteredTransactions = useMemo(
    () => transactions.filter((tx) => isInDateRange(tx.created_at, dateRange)),
    [transactions, dateRange]
  );
  const totalUnit = filteredTransactions.length;
  const totalPembelian = useMemo(
    () => filteredTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0),
    [filteredTransactions]
  );

  /* group + search filter */
  const filteredGroups = useMemo(() => {
    const groups = groupByDate(filteredTransactions);
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (i) =>
            i.id.toLowerCase().includes(q) ||
            i.description.toLowerCase().includes(q) ||
            (i.detail ?? '').toLowerCase().includes(q) ||
            i.stock_items.some(
              (u) =>
                u.model.toLowerCase().includes(q) ||
                u.color.toLowerCase().includes(q) ||
                u.condition.toLowerCase().includes(q) ||
                (u.imei ?? '').toLowerCase().includes(q)
            )
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [filteredTransactions, search]);

  return (
    <div className="pb-12">
      {/* ---------- Header ---------- */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        className="mb-8"
      >
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-[36px] sm:text-[40px] text-slate-900 leading-tight">
              Riwayat Pembelian
            </h1>
            <p className="text-[13px] text-slate-500 mt-1">
              {totalUnit} transaksi · {formatRupiah(totalPembelian)}
            </p>
          </div>
          <Link to="/pembelian">
            <Button className="rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-semibold gap-1.5 shadow-card-elevated">
              <Plus size={16} />
              Input
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* ---------- Date Filter ---------- */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        className="mb-6"
      >
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5">
          <div className="flex flex-wrap gap-2 mb-4">
            {quickFilters.map((f) => (
              <button
                key={f}
                onClick={() => {
                  setActiveFilter(f as QuickFilter);
                  const range = getDateRange(f as QuickFilter, fromDate, toDate);
                  setFromDate(range.from);
                  setToDate(range.to);
                }}
                className={
                  'relative px-4 py-2 rounded-xl text-[13px] font-medium transition-all duration-200 ' +
                  (activeFilter === f
                    ? 'bg-white text-teal-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50')
                }
              >
                {activeFilter === f && (
                  <motion.div
                    layoutId="purchase-filter-pill"
                    className="absolute inset-0 bg-white rounded-xl shadow-sm border border-slate-200"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{f}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-slate-500 uppercase tracking-wide">Dari</span>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setActiveFilter('Custom');
                  }}
                  className="h-10 pl-8 pr-3 rounded-xl border border-slate-300 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-slate-500 uppercase tracking-wide">Sampai</span>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setActiveFilter('Custom');
                  }}
                  className="h-10 pl-8 pr-3 rounded-xl border border-slate-300 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>
            </div>
            <Button className="rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-semibold text-[13px] h-10 px-5">
              Tampilkan
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ---------- Stats ---------- */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.16, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6"
      >
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <Smartphone size={14} className="text-teal-500" />
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em]">
              Total Unit Dibeli
            </p>
          </div>
          <p className="font-mono text-[32px] font-bold text-slate-900 leading-none">
            {totalUnit}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingBag size={14} className="text-teal-500" />
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em]">
              Total Pembelian
            </p>
          </div>
          <p className="font-mono text-[32px] font-bold text-slate-900 leading-none">
            {formatRupiah(totalPembelian)}
          </p>
        </div>
      </motion.div>

      {/* ---------- Search ---------- */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.24, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        className="relative mb-6"
      >
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Cari deskripsi / detail transaksi..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-11 h-12 rounded-xl border-slate-300 bg-white text-[14px] placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
        />
      </motion.div>

      {/* ---------- Loading State ---------- */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 size={36} className="text-teal-500 animate-spin" />
          <p className="text-[14px] text-slate-500 mt-4">Memuat transaksi...</p>
        </div>
      )}

      {/* ---------- Error State ---------- */}
      {!loading && error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 mb-4">
            <AlertCircle size={28} />
          </div>
          <p className="text-[15px] font-medium text-slate-700">Gagal memuat transaksi</p>
          <p className="text-[12px] text-slate-400 mt-1 max-w-sm">{error}</p>
          <Button
            onClick={fetchTransactions}
            className="mt-5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-semibold text-[13px] h-10 px-5 gap-2"
          >
            <RotateCcw size={14} />
            Coba Lagi
          </Button>
        </motion.div>
      )}

      {/* ---------- Transaction List ---------- */}
      {!loading && !error && (
        <div className="space-y-6">
          <AnimatePresence mode="popLayout">
            {filteredGroups.map((group, gi) => (
              <motion.div
                key={group.date}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{
                  duration: 0.4,
                  delay: gi * 0.05,
                  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Calendar size={14} className="text-slate-400" />
                  <h3 className="text-[14px] font-semibold text-slate-700">{group.dateLabel}</h3>
                  <span className="text-[11px] text-slate-400 ml-1">
                    {group.items.length} txn · {group.items.length} unit
                  </span>
                </div>

                <div className="space-y-2">
                  {group.items.map((item, ii) => {
                    const displayDetail = getTransactionDisplayDetail(item);
                    return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: ii * 0.04 }}
                      whileHover={{ y: -2 }}
                      className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 sm:p-5 cursor-pointer transition-shadow duration-200 hover:shadow-card-elevated"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-teal-50 text-teal-600 shrink-0">
                            <Smartphone size={18} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[15px] font-semibold text-slate-900">
                                {item.description}
                              </span>
                            </div>
                            {displayDetail && (
                              <p className="text-[12px] text-slate-500 mt-0.5">{displayDetail}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
                              <span>{formatTime(item.created_at)}</span>
                            </div>
                            <TransactionStockDetails items={item.stock_items} />
                            {item.stock_items.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {item.stock_items.map((unit) => (
                                  <button
                                    key={`claim-${item.id}-${unit.id}`}
                                    type="button"
                                    onClick={() => {
                                      setClaimTarget({ transaction: item, unit });
                                      setClaimIssue('');
                                      setClaimNote('');
                                      setClaimTechnician('');
                                      setClaimError(null);
                                    }}
                                    aria-label={`Klaim Garansi ${unit.model}`}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-[12px] font-semibold text-purple-700 hover:bg-purple-100"
                                  >
                                    <ShieldCheck size={13} />
                                    Klaim Garansi
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col sm:items-end gap-2">
                          <p className="font-mono text-[16px] font-semibold text-slate-900">
                            {formatRupiah(item.amount || 0)}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1">
                            <span className="font-mono">{item.id}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* ---------- Empty State ---------- */}
          {transactions.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
              <Smartphone size={48} className="mx-auto text-slate-300 mb-4" />
              <p className="text-[15px] font-medium text-slate-500">Belum ada transaksi pembelian</p>
              <p className="text-[12px] text-slate-400 mt-1">
                Transaksi pembelian akan muncul di sini setelah dicatat
              </p>
            </motion.div>
          )}

          {/* ---------- No Search Results ---------- */}
          {transactions.length > 0 && filteredGroups.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
              <Search size={48} className="mx-auto text-slate-300 mb-4" />
              <p className="text-[15px] font-medium text-slate-500">Tidak ada transaksi ditemukan</p>
              <p className="text-[12px] text-slate-400 mt-1">Coba ubah kata kunci pencarian</p>
            </motion.div>
          )}
        </div>
      )}

      <AnimatePresence>
        {claimTarget && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="claim-dialog-title"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-card-elevated"
            >
              <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 id="claim-dialog-title" className="text-[18px] font-semibold text-slate-900">
                    Klaim Garansi Pembelian
                  </h2>
                  <p className="mt-0.5 text-[13px] text-slate-500">
                    Unit masuk antrian servis dan stok berpindah ke SERVIS.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeClaimDialog}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                  aria-label="Tutup klaim garansi"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="space-y-4 p-5">
                <div className="rounded-xl bg-slate-50 p-3 text-[13px] text-slate-600">
                  <p className="font-semibold text-slate-900">
                    {claimTarget.unit.model} {claimTarget.unit.capacity}
                  </p>
                  <p className="mt-0.5">
                    {claimTarget.unit.condition} · {claimTarget.unit.color || 'Random'} ·{' '}
                    {claimTarget.unit.imei || 'Tanpa IMEI'}
                    {!claimTarget.unit.has_imei && claimTarget.unit.count > 1
                      ? ` · ${claimTarget.unit.count} pcs`
                      : ''}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="claim-issue"
                    className="mb-1.5 block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500"
                  >
                    Keluhan Klaim *
                  </label>
                  <textarea
                    id="claim-issue"
                    value={claimIssue}
                    onChange={(event) => {
                      setClaimIssue(event.target.value);
                      setClaimError(null);
                    }}
                    rows={3}
                    className="min-h-[86px] w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-[14px] outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                    placeholder="Contoh: LCD bergaris setelah pembelian"
                  />
                </div>

                <div>
                  <label
                    htmlFor="claim-note"
                    className="mb-1.5 block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500"
                  >
                    Catatan
                  </label>
                  <textarea
                    id="claim-note"
                    value={claimNote}
                    onChange={(event) => setClaimNote(event.target.value)}
                    rows={2}
                    className="min-h-[64px] w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-[14px] outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                    placeholder="Catatan untuk teknisi atau supplier"
                  />
                </div>

                <div>
                  <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500">
                    Teknisi *
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {technicians.map((tech) => {
                      const selected = claimTechnician === tech.name;
                      return (
                        <button
                          key={tech.id}
                          type="button"
                          onClick={() => {
                            setClaimTechnician(tech.name);
                            setClaimError(null);
                          }}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px] font-semibold transition-colors ${
                            selected
                              ? 'border-teal-500 bg-teal-50 text-teal-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <User size={14} />
                          {tech.name}
                        </button>
                      );
                    })}
                  </div>
                  {technicians.length === 0 && (
                    <p className="text-[12px] text-rose-500">Belum ada teknisi aktif.</p>
                  )}
                </div>

                {claimError && (
                  <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-600">
                    {claimError}
                  </p>
                )}
              </div>

              <div className="flex gap-3 border-t border-slate-200 px-5 py-4">
                <button
                  type="button"
                  onClick={closeClaimDialog}
                  className="flex-1 rounded-xl bg-slate-100 py-3 text-[14px] font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={claimSaving}
                  onClick={handleSaveClaim}
                  className="flex-1 rounded-xl bg-purple-500 py-3 text-[14px] font-semibold text-white hover:bg-purple-600 disabled:opacity-60"
                >
                  {claimSaving ? 'Menyimpan...' : 'Simpan Klaim'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
