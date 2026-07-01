import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Calendar,
  Receipt,
  Wallet,
  Loader2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  getTransactionDisplayDetail,
  getTransactionsWithStockDetailsByTypes,
  type TransactionWithStockDetails,
} from '@/services/transactions';
import { getDateRange, isInDateRange, type QuickFilter } from '@/services/dateFilters';
import { TransactionStockDetails } from '@/components/TransactionStockDetails';
import { TransactionStaffBadge } from '@/components/TransactionStaffBadge';

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
export default function RiwayatPengeluaran() {
  const [activeFilter, setActiveFilter] = useState<QuickFilter>('7 Hari');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [transactions, setTransactions] = useState<TransactionWithStockDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTransactionsWithStockDetailsByTypes(['Pengeluaran', 'Upah Servis']);
      setTransactions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data transaksi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

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
  const totalPengeluaran = useMemo(
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
        <h1 className="font-display text-[36px] sm:text-[40px] text-slate-900 leading-tight">
          Riwayat Pengeluaran
        </h1>
        <p className="text-[13px] text-slate-500 mt-1">
          {totalUnit} transaksi · {formatRupiah(totalPengeluaran)}
        </p>
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
                    layoutId="expense-filter-pill"
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
            <Receipt size={14} className="text-rose-500" />
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em]">
              Total Transaksi
            </p>
          </div>
          <p className="font-mono text-[32px] font-bold text-slate-900 leading-none">
            {totalUnit}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <Wallet size={14} className="text-rose-500" />
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em]">
              Total Pengeluaran
            </p>
          </div>
          <p className="font-mono text-[28px] sm:text-[32px] font-bold text-slate-900 leading-none">
            {formatRupiah(totalPengeluaran)}
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
                    {group.items.length} txn
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
                          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-rose-50 text-rose-500 shrink-0">
                            <Receipt size={18} />
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
                            <div className="mt-2">
                              <TransactionStaffBadge transaction={item} />
                            </div>
                            <TransactionStockDetails items={item.stock_items} />
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
              <Receipt size={48} className="mx-auto text-slate-300 mb-4" />
              <p className="text-[15px] font-medium text-slate-500">Belum ada transaksi pengeluaran</p>
              <p className="text-[12px] text-slate-400 mt-1">
                Transaksi pengeluaran akan muncul di sini setelah dicatat
              </p>
            </motion.div>
          )}

          {/* ---------- No Search Results ---------- */}
          {transactions.length > 0 && filteredGroups.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
              <Search size={48} className="mx-auto text-slate-300 mb-4" />
              <p className="text-[15px] font-medium text-slate-500">Tidak ada pengeluaran ditemukan</p>
              <p className="text-[12px] text-slate-400 mt-1">Coba ubah kata kunci pencarian</p>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
