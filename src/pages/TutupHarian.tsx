import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  FileText,
  Calendar,
  TrendingUp,
  ShoppingBag,
  Receipt,
  Wallet,
  Coins,
  Banknote,
  Hash,
  Pencil,
  Save,
  Check,
  Loader2,
  AlertCircle,
  RefreshCw,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getTransactions,
  getTransactionsWithStockDetailsByType,
  type Transaction,
  type TransactionWithStockDetails,
} from '@/services/transactions';
import { getAccounts } from '@/services/accounts';
import { getStockItems, type StockItem } from '@/services/stock';
import {
  filterByPeriod,
  computeRevenue,
  computeExpenses,
  computeNetProfit,
} from '@/services/financeCore';
import {
  getDailyClosings,
  createDailyClosing,
  type DailyClosing,
} from '@/services/dailyClosings';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function formatRupiah(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

/** Zero-pad a number to two digits. */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local YYYY-MM-DD for the given date. */
function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Format a YYYY-MM-DD string into a readable Indonesian date. */
function formatTanggalIndo(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Safely read a numeric field from a stored summary record. */
function readNumber(summary: Record<string, unknown>, key: string): number {
  const v = summary[key];
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0;
}

/* ------------------------------------------------------------------ */
/*  Today's figures                                                   */
/* ------------------------------------------------------------------ */
interface TodayFigures {
  date: string; // YYYY-MM-DD (local)
  revenue: number;
  cogs: number;
  expenses: number;
  netProfit: number;
  cashBankTotal: number;
  cashStoreTotal: number;
  txCount: number;
  salesCount: number;
  salesTotal: number;
  serviceCount: number;
  serviceTotal: number;
  purchaseCount: number;
  purchaseTotal: number;
  tradeCount: number;
  tradeTotal: number;
  expenseCount: number;
  expenseTotal: number;
  readyStockCount: number;
  serviceStockCount: number;
  kanibalStockCount: number;
  rusakStockCount: number;
}

/** The summary snapshot persisted with each closing. The index signature
 *  keeps it assignable to the service's `Record<string, unknown>` field. */
interface ClosingSummary {
  revenue: number;
  cogs: number;
  expenses: number;
  netProfit: number;
  cashBankTotal: number;
  cashStoreTotal: number;
  txCount: number;
  [key: string]: number;
}

function isSameLocalDay(iso: string | null | undefined, ref: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

function sumToday(txs: Transaction[], type: Transaction['type']): number {
  return txs
    .filter((tx) => tx.type === type)
    .reduce((sum, tx) => sum + (tx.amount ?? 0), 0);
}

function countToday(txs: Transaction[], type: Transaction['type']): number {
  return txs.filter((tx) => tx.type === type).length;
}

function computeSoldCostToday(sales: TransactionWithStockDetails[], ref: Date): number {
  return sales
    .filter((tx) => isSameLocalDay(tx.created_at, ref))
    .reduce(
      (txSum, tx) =>
        txSum +
        tx.stock_items.reduce(
          (itemSum, item) => itemSum + (item.cost_price || 0) * (item.count || 1),
          0,
        ),
      0,
    );
}

function countStockByStatus(items: StockItem[], status: StockItem['status']): number {
  return items
    .filter((item) => item.status === status)
    .reduce((sum, item) => sum + (item.count || 0), 0);
}

/**
 * Compute today's figures from live transactions + account balances.
 * Transactions are filtered to the local-day range [midnight today, now]
 * via `filterByPeriod`, then rolled up with the finance core helpers.
 */
function computeTodayFigures(
  transactions: Transaction[],
  cashBankTotal: number,
  cashStoreTotal: number,
  saleTransactions: TransactionWithStockDetails[],
  stockItems: StockItem[],
): TodayFigures {
  const now = new Date();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );

  const todayTx = filterByPeriod(
    transactions,
    startOfDay.toISOString(),
    now.toISOString(),
  );

  const revenue = computeRevenue(todayTx);
  const cogs = computeSoldCostToday(saleTransactions, now);
  const expenses = computeExpenses(todayTx);
  const netProfit = computeNetProfit(revenue, cogs, expenses);

  return {
    date: toLocalDateString(now),
    revenue,
    cogs,
    expenses,
    netProfit,
    cashBankTotal,
    cashStoreTotal,
    txCount: todayTx.length,
    salesCount: countToday(todayTx, 'Penjualan'),
    salesTotal: sumToday(todayTx, 'Penjualan'),
    serviceCount: countToday(todayTx, 'Servis'),
    serviceTotal: sumToday(todayTx, 'Servis'),
    purchaseCount: countToday(todayTx, 'Pembelian'),
    purchaseTotal: sumToday(todayTx, 'Pembelian'),
    tradeCount: countToday(todayTx, 'Tukar Tambah'),
    tradeTotal: sumToday(todayTx, 'Tukar Tambah'),
    expenseCount: countToday(todayTx, 'Pengeluaran') + countToday(todayTx, 'Upah Servis'),
    expenseTotal: sumToday(todayTx, 'Pengeluaran') + sumToday(todayTx, 'Upah Servis'),
    readyStockCount: countStockByStatus(stockItems, 'READY'),
    serviceStockCount: countStockByStatus(stockItems, 'SERVIS'),
    kanibalStockCount: countStockByStatus(stockItems, 'KANIBAL'),
    rusakStockCount: countStockByStatus(stockItems, 'RUSAK'),
  };
}

/* ------------------------------------------------------------------ */
/*  Summary card config                                               */
/* ------------------------------------------------------------------ */
interface SummaryCard {
  label: string;
  value: (f: TodayFigures) => number;
  format: 'money' | 'count';
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  /** When true, render red if the value is negative. */
  signed?: boolean;
}

const summaryCards: SummaryCard[] = [
  { label: 'Pendapatan', value: (f) => f.revenue, format: 'money', icon: TrendingUp, color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-100' },
  { label: 'HPP Unit Terjual', value: (f) => f.cogs, format: 'money', icon: ShoppingBag, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  { label: 'Pengeluaran', value: (f) => f.expenses, format: 'money', icon: Receipt, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100' },
  { label: 'Laba Bersih', value: (f) => f.netProfit, format: 'money', icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', signed: true },
  { label: 'Cash Toko', value: (f) => f.cashStoreTotal, format: 'money', icon: Banknote, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  { label: 'Total Kas & Bank', value: (f) => f.cashBankTotal, format: 'money', icon: Coins, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
  { label: 'Jumlah Transaksi', value: (f) => f.txCount, format: 'count', icon: Hash, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-100' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function TutupHarian() {
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [saleTransactions, setSaleTransactions] = useState<TransactionWithStockDetails[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [cashBankTotal, setCashBankTotal] = useState(0);
  const [cashStoreTotal, setCashStoreTotal] = useState(0);
  const [history, setHistory] = useState<DailyClosing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [catatan, setCatatan] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [txs, sales, stock, accounts, closings] = await Promise.all([
        getTransactions(),
        getTransactionsWithStockDetailsByType('Penjualan'),
        getStockItems(),
        getAccounts(),
        getDailyClosings(),
      ]);
      const total = accounts.reduce((sum, a) => sum + a.current_balance, 0);
      const cashTotal = accounts
        .filter((a) => a.type === 'Cash')
        .reduce((sum, a) => sum + a.current_balance, 0);
      setTransactions(txs);
      setSaleTransactions(sales);
      setStockItems(stock);
      setCashBankTotal(total);
      setCashStoreTotal(cashTotal);
      setHistory(closings);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Gagal memuat data tutup harian.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const figures = useMemo<TodayFigures | null>(() => {
    if (loading || error) return null;
    return computeTodayFigures(transactions, cashBankTotal, cashStoreTotal, saleTransactions, stockItems);
  }, [loading, error, transactions, cashBankTotal, cashStoreTotal, saleTransactions, stockItems]);

  /** Today's existing closing (if any) — keeps the button idempotent. */
  const todayClosing = useMemo<DailyClosing | null>(() => {
    if (!figures) return null;
    return history.find((c) => c.closing_date === figures.date) ?? null;
  }, [history, figures]);

  const alreadyClosed = todayClosing !== null;

  const handleSave = useCallback(async () => {
    if (!figures || saving || alreadyClosed) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const summary: ClosingSummary = {
        revenue: figures.revenue,
        cogs: figures.cogs,
        expenses: figures.expenses,
        netProfit: figures.netProfit,
        cashBankTotal: figures.cashBankTotal,
        cashStoreTotal: figures.cashStoreTotal,
        txCount: figures.txCount,
        salesCount: figures.salesCount,
        salesTotal: figures.salesTotal,
        serviceCount: figures.serviceCount,
        serviceTotal: figures.serviceTotal,
        purchaseCount: figures.purchaseCount,
        purchaseTotal: figures.purchaseTotal,
        tradeCount: figures.tradeCount,
        tradeTotal: figures.tradeTotal,
        expenseCount: figures.expenseCount,
        expenseTotal: figures.expenseTotal,
        readyStockCount: figures.readyStockCount,
        serviceStockCount: figures.serviceStockCount,
        kanibalStockCount: figures.kanibalStockCount,
        rusakStockCount: figures.rusakStockCount,
      };
      await createDailyClosing({
        closing_date: figures.date,
        summary,
        note: catatan.trim(),
      });
      // Refresh the closings list so the new snapshot (and the "already
      // closed" state) reflect the saved record.
      const closings = await getDailyClosings();
      setHistory(closings);
      setCatatan('');
      setSaveSuccess(true);
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : 'Gagal menyimpan tutup harian.',
      );
    } finally {
      setSaving(false);
    }
  }, [figures, catatan, saving, alreadyClosed]);

  const headerDate = figures ? formatTanggalIndo(figures.date) : '';

  return (
    <div className="pb-32">
      {/* ---------- Header ---------- */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        className="mb-8"
      >
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-800 transition-colors mb-4"
        >
          <ArrowLeft size={16} />
          Kembali
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-teal-50 border border-teal-100 p-2.5 mt-0.5">
              <FileText size={20} className="text-teal-600" />
            </div>
            <div>
              <h1 className="font-display text-[36px] sm:text-[40px] text-slate-900 leading-tight">
                Tutup Harian
              </h1>
              <p className="text-[13px] text-slate-500 mt-1">
                {headerDate || 'Ringkasan keuangan hari ini'}
              </p>
            </div>
          </div>
          {figures && (
            <div className="flex items-center gap-2 text-[13px] text-slate-500">
              <Calendar size={16} className="text-slate-400" />
              <span className="font-mono">{figures.date}</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* ---------- Loading ---------- */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <Loader2 size={32} className="animate-spin text-teal-600 mb-3" />
          <p className="text-[14px]">Memuat data tutup harian&hellip;</p>
        </div>
      )}

      {/* ---------- Error + Retry ---------- */}
      {!loading && error && (
        <div className="bg-white rounded-2xl border border-rose-200 shadow-card p-8 text-center">
          <AlertCircle size={32} className="mx-auto text-rose-500 mb-3" />
          <p className="text-[15px] font-semibold text-slate-900 mb-1">Gagal memuat data</p>
          <p className="text-[13px] text-slate-500 mb-5">{error}</p>
          <Button
            onClick={() => void load()}
            className="rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-semibold text-[14px] px-6 gap-2"
          >
            <RefreshCw size={16} />
            Coba Lagi
          </Button>
        </div>
      )}

      {/* ---------- Content ---------- */}
      {!loading && !error && figures && (
        <div className="space-y-6">
          {/* ====== Sudah ditutup banner ====== */}
          {alreadyClosed && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4"
            >
              <Check size={18} className="text-emerald-600 shrink-0" />
              <p className="text-[13px] font-medium text-emerald-700">
                Sudah ditutup hari ini.
              </p>
            </motion.div>
          )}

          {/* ====== Ringkasan Hari Ini ====== */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-card p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-teal-600" />
              <h2 className="text-[16px] font-semibold text-slate-900">Ringkasan Hari Ini</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {summaryCards.map((card, i) => {
                const raw = card.value(figures);
                const negative = !!card.signed && raw < 0;
                return (
                  <motion.div
                    key={card.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.04 }}
                    className={`rounded-xl border ${card.border} ${card.bg} p-4`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <card.icon size={16} className={card.color} />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        {card.label}
                      </span>
                    </div>
                    <p
                      className={
                        'font-mono text-[20px] font-bold ' +
                        (negative ? 'text-rose-600' : 'text-slate-900')
                      }
                    >
                      {card.format === 'money' ? formatRupiah(raw) : raw.toLocaleString('id-ID')}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* ====== Breakdown Transaksi ====== */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.14 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-card p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <Receipt size={16} className="text-teal-600" />
              <h2 className="text-[16px] font-semibold text-slate-900">Breakdown Transaksi</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { label: 'Penjualan', count: figures.salesCount, total: figures.salesTotal },
                { label: 'Servis', count: figures.serviceCount, total: figures.serviceTotal },
                { label: 'Pembelian HP', count: figures.purchaseCount, total: figures.purchaseTotal },
                { label: 'Tukar Tambah', count: figures.tradeCount, total: figures.tradeTotal },
                { label: 'Pengeluaran', count: figures.expenseCount, total: figures.expenseTotal },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{item.label}</p>
                  <p className="mt-1 font-mono text-[18px] font-bold text-slate-900">
                    {item.count.toLocaleString('id-ID')} txn
                  </p>
                  <p className="mt-1 font-mono text-[12px] font-semibold text-slate-500">
                    {formatRupiah(item.total)}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ====== Audit Stok Fisik ====== */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-card p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <Hash size={16} className="text-teal-600" />
              <h2 className="text-[16px] font-semibold text-slate-900">Audit Stok Fisik</h2>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'READY', value: figures.readyStockCount, tone: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
                { label: 'SERVIS', value: figures.serviceStockCount, tone: 'text-purple-600 bg-purple-50 border-purple-100' },
                { label: 'KANIBAL', value: figures.kanibalStockCount, tone: 'text-rose-600 bg-rose-50 border-rose-100' },
                { label: 'RUSAK', value: figures.rusakStockCount, tone: 'text-amber-600 bg-amber-50 border-amber-100' },
              ].map((item) => (
                <div key={item.label} className={`rounded-xl border p-4 ${item.tone}`}>
                  <p className="text-[11px] font-bold uppercase tracking-wider">{item.label}</p>
                  <p className="mt-1 font-mono text-[24px] font-bold">{item.value.toLocaleString('id-ID')} unit</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ====== Catatan Harian ====== */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-card p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <Pencil size={16} className="text-teal-600" />
              <h2 className="text-[16px] font-semibold text-slate-900">Catatan Harian</h2>
            </div>
            <textarea
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              disabled={alreadyClosed}
              placeholder="Misal: Hari ini ramai customer service, ada 3 unit baru masuk dari agen Pak Andi."
              rows={4}
              className="w-full p-4 rounded-xl border border-slate-300 text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none disabled:bg-slate-50 disabled:text-slate-400"
            />
          </motion.div>

          {/* ====== Riwayat Tutup Harian ====== */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-card p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <History size={16} className="text-teal-600" />
              <h2 className="text-[16px] font-semibold text-slate-900">Riwayat Tutup Harian</h2>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-10">
                <History size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-[13px] text-slate-400">Belum ada riwayat tutup harian.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((closing, i) => {
                  const net = readNumber(closing.summary, 'netProfit');
                  const cashBank = readNumber(closing.summary, 'cashBankTotal');
                  const cashStore = readNumber(closing.summary, 'cashStoreTotal');
                  return (
                    <motion.div
                      key={closing.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.03 }}
                      className="rounded-xl border border-slate-100 bg-slate-50/50 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-semibold text-slate-800">
                            {formatTanggalIndo(closing.closing_date)}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {closing.closing_date}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-6">
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Laba Bersih</p>
                            <p
                              className={
                                'font-mono text-[14px] font-bold ' +
                                (net < 0 ? 'text-rose-600' : 'text-emerald-600')
                              }
                            >
                              {formatRupiah(net)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Cash Toko</p>
                            <p className="font-mono text-[14px] font-semibold text-amber-600">
                              {formatRupiah(cashStore)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Total Kas &amp; Bank</p>
                            <p className="font-mono text-[14px] font-semibold text-slate-700">
                              {formatRupiah(cashBank)}
                            </p>
                          </div>
                        </div>
                      </div>
                      {closing.note && (
                        <p className="text-[12px] text-slate-500 mt-3 pt-3 border-t border-slate-200">
                          {closing.note}
                        </p>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* ====== Bottom Bar: Tutup Harian Button ====== */}
      {!loading && !error && figures && (
        <motion.div
          initial={{ y: 72 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.5, delay: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-xl shadow-bottom-bar"
        >
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
            <div className="text-[12px] text-slate-500 min-w-0">
              {saveSuccess ? (
                <p className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                  <Check size={16} />
                  Tutup harian berhasil disimpan.
                </p>
              ) : saveError ? (
                <p className="flex items-center gap-1.5 text-rose-600 font-medium">
                  <AlertCircle size={16} />
                  {saveError}
                </p>
              ) : (
                <>
                  <p>
                    Laba Bersih:{' '}
                    <span
                      className={
                        'font-mono font-medium ' +
                        (figures.netProfit < 0 ? 'text-rose-600' : 'text-slate-700')
                      }
                    >
                      {formatRupiah(figures.netProfit)}
                    </span>
                  </p>
                  <p>
                    Cash Toko:{' '}
                    <span className="font-mono font-medium text-slate-700">
                      {formatRupiah(figures.cashStoreTotal)}
                    </span>
                  </p>
                  <p>
                    Total Kas &amp; Bank:{' '}
                    <span className="font-mono font-medium text-slate-700">
                      {formatRupiah(figures.cashBankTotal)}
                    </span>
                  </p>
                </>
              )}
            </div>
            <Button
              onClick={() => void handleSave()}
              disabled={saving || alreadyClosed}
              className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-[14px] px-8 py-3 h-auto shadow-card-elevated gap-2 disabled:opacity-60"
            >
              {alreadyClosed ? (
                <>
                  <Check size={18} />
                  Sudah Ditutup
                </>
              ) : saving ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Menyimpan&hellip;
                </>
              ) : (
                <>
                  <Save size={18} />
                  Simpan Penutupan
                </>
              )}
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
