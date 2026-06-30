import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Calendar,
  Smartphone,
  TrendingUp,
  Loader2,
  AlertCircle,
  RotateCcw,
  Printer,
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
import { getDateRange, isInDateRange, type QuickFilter } from '@/services/dateFilters';
import { TransactionStockDetails } from '@/components/TransactionStockDetails';
import { ConfirmationView } from '@/components/sale/ConfirmationView';
import type { ReceiptData } from '@/services/receipt';
import { transactionToReceiptData, printReceipt } from '@/services/receipt';
import { deserializeSaleDetail, type SaleDetail } from '@/services/finalization';
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

type WarrantyClaimAction = 'Servis' | 'Refund' | 'Tukar Unit';

const quickFilters = ['Hari Ini', '7 Hari', '30 Hari', 'Bulan Ini', 'Bulan Lalu'];

const claimActions: Array<{
  value: WarrantyClaimAction;
  title: string;
  description: string;
}> = [
  {
    value: 'Servis',
    title: 'Servis',
    description: 'Masuk antrian teknisi.',
  },
  {
    value: 'Refund',
    title: 'Refund',
    description: 'Ditandai untuk proses pengembalian dana.',
  },
  {
    value: 'Tukar Unit',
    title: 'Tukar Unit',
    description: 'Ditandai untuk proses unit pengganti.',
  },
];

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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPersistedStockUnit(unit: StockItem) {
  return uuidPattern.test(unit.id);
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function findDetailUnit(detail: SaleDetail, unit: StockItem) {
  const unitImei = normalizeText(unit.imei);
  if (unitImei) {
    const byImei = detail.units.find((row) => normalizeText(row.imei) === unitImei);
    if (byImei) return byImei;
  }

  return detail.units.find(
    (row) =>
      normalizeText(row.model) === normalizeText(unit.model) &&
      normalizeText(row.capacity) === normalizeText(unit.capacity) &&
      normalizeText(row.condition) === normalizeText(unit.condition) &&
      normalizeText(row.color) === normalizeText(unit.color),
  );
}

function getSaleClaimContext(transaction: TransactionWithStockDetails, unit: StockItem) {
  try {
    const detail = deserializeSaleDetail(transaction.detail);
    const detailUnit = findDetailUnit(detail, unit);
    return {
      customerName: detail.customer.name?.trim() || '',
      customerPhone: detail.customer.phone?.trim() || '',
      warranty: detail.warranty?.trim() || '',
      batteryHealth:
        typeof detailUnit?.batteryHealth === 'number' ? detailUnit.batteryHealth : null,
    };
  } catch {
    return {
      customerName: '',
      customerPhone: '',
      warranty: '',
      batteryHealth: null,
    };
  }
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
export default function RiwayatPenjualan() {
  const [activeFilter, setActiveFilter] = useState<QuickFilter>('7 Hari');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [transactions, setTransactions] = useState<TransactionWithStockDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printReceiptData, setPrintReceiptData] = useState<ReceiptData | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [claimTarget, setClaimTarget] = useState<{
    transaction: TransactionWithStockDetails;
    unit: StockItem;
  } | null>(null);
  const [claimAction, setClaimAction] = useState<WarrantyClaimAction>('Servis');
  const [claimIssue, setClaimIssue] = useState('');
  const [claimNote, setClaimNote] = useState('');
  const [claimTechnician, setClaimTechnician] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSaving, setClaimSaving] = useState(false);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTransactionsWithStockDetailsByType('Penjualan');
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

  useEffect(() => {
    getTechnicians()
      .then(setTechnicians)
      .catch(() => setTechnicians([]));
  }, []);

  const selectedClaimContext = useMemo(
    () =>
      claimTarget
        ? getSaleClaimContext(claimTarget.transaction, claimTarget.unit)
        : null,
    [claimTarget],
  );

  const closeClaimDialog = useCallback(() => {
    setClaimTarget(null);
    setClaimAction('Servis');
    setClaimIssue('');
    setClaimNote('');
    setClaimTechnician('');
    setClaimError(null);
    setClaimSaving(false);
  }, []);

  const openClaimDialog = useCallback(
    (transaction: TransactionWithStockDetails, unit: StockItem) => {
      setClaimTarget({ transaction, unit });
      setClaimAction('Servis');
      setClaimIssue('');
      setClaimNote('');
      setClaimTechnician('');
      setClaimError(null);
      setClaimSaving(false);
    },
    [],
  );

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
    const claimContext = getSaleClaimContext(transaction, unit);
    const noteParts = [
      `Tindak lanjut: ${claimAction}`,
      `Penjualan: ${transaction.id}`,
      claimContext.warranty ? `Garansi: ${claimContext.warranty}` : '',
      claimContext.customerPhone ? `WA customer: ${claimContext.customerPhone}` : '',
      claimNote.trim() ? `Catatan: ${claimNote.trim()}` : '',
    ].filter(Boolean);

    const record: ServiceRecordInsert = {
      customer_name: claimContext.customerName || 'Customer Garansi',
      phone_model: unit.model,
      capacity: unit.capacity || '',
      condition: unit.condition || '',
      color: unit.color || '',
      imei: unit.imei || '',
      battery_health: claimContext.batteryHealth,
      issue,
      additional_note: noteParts.join(' - '),
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
    claimAction,
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
  const totalOmzet = useMemo(
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
          (i) => {
            const displayDetail = getTransactionDisplayDetail(i).toLowerCase();
            return (
              i.id.toLowerCase().includes(q) ||
              i.description.toLowerCase().includes(q) ||
              displayDetail.includes(q) ||
              (i.detail ?? '').toLowerCase().includes(q) ||
              i.stock_items.some(
                (u) =>
                  u.model.toLowerCase().includes(q) ||
                  u.color.toLowerCase().includes(q) ||
                  u.condition.toLowerCase().includes(q) ||
                  (u.imei ?? '').toLowerCase().includes(q)
              )
            );
          },
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
          Riwayat Penjualan
        </h1>
        <p className="text-[13px] text-slate-500 mt-1">
          {totalUnit} transaksi · {formatRupiah(totalOmzet)}
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
                    layoutId="sale-filter-pill"
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
              Total Unit Terjual
            </p>
          </div>
          <p className="font-mono text-[32px] font-bold text-slate-900 leading-none">
            {totalUnit}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-teal-500" />
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em]">
              Total Omzet
            </p>
          </div>
          <p className="font-mono text-[32px] font-bold text-slate-900 leading-none">
            {formatRupiah(totalOmzet)}
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
                    const claimableUnits = item.stock_items.filter(isPersistedStockUnit);

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
                                <p className="text-[12px] text-slate-500 mt-0.5">
                                  {displayDetail}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
                                <span>{formatTime(item.created_at)}</span>
                              </div>
                              <TransactionStockDetails items={item.stock_items} />
                              {claimableUnits.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {claimableUnits.map((unit) => (
                                    <button
                                      key={`claim-${item.id}-${unit.id}`}
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openClaimDialog(item, unit);
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
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const receipt = transactionToReceiptData(item);
                                if (receipt) {
                                  setPrintError(null);
                                  setPrintReceiptData(receipt);
                                } else {
                                  setPrintError('Detail transaksi tidak dapat dicetak ulang');
                                }
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-600 hover:text-teal-700"
                            >
                              <Printer size={12} />
                              Cetak Nota
                            </button>
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
              <p className="text-[15px] font-medium text-slate-500">Belum ada transaksi penjualan</p>
              <p className="text-[12px] text-slate-400 mt-1">
                Transaksi penjualan akan muncul di sini setelah dicatat
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
              aria-labelledby="sale-claim-dialog-title"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-card-elevated"
            >
              <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <h2
                    id="sale-claim-dialog-title"
                    className="text-[18px] font-semibold text-slate-900"
                  >
                    Klaim Garansi Penjualan
                  </h2>
                  <p className="mt-0.5 text-[13px] text-slate-500">
                    Unit masuk antrian servis dan stok berpindah ke SERVIS untuk tracking klaim.
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
                <div className="grid gap-3 rounded-xl bg-slate-50 p-3 text-[13px] text-slate-600 sm:grid-cols-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {claimTarget.unit.model} {claimTarget.unit.capacity}
                    </p>
                    <p className="mt-0.5">
                      {claimTarget.unit.condition} - {claimTarget.unit.color || 'Random'}
                    </p>
                    <p className="mt-0.5 font-mono text-[12px] text-slate-500">
                      {claimTarget.unit.imei || 'Tanpa IMEI'}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">
                      {selectedClaimContext?.customerName || 'Customer belum tercatat'}
                    </p>
                    <p className="mt-0.5">
                      {selectedClaimContext?.customerPhone || 'Nomor WA belum tercatat'}
                    </p>
                    <p className="mt-0.5">
                      Garansi: {selectedClaimContext?.warranty || 'Tidak tercatat'}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500">
                    Tindak Lanjut *
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {claimActions.map((action) => {
                      const selected = claimAction === action.value;
                      return (
                        <button
                          key={action.value}
                          type="button"
                          onClick={() => {
                            setClaimAction(action.value);
                            setClaimError(null);
                          }}
                          className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                            selected
                              ? 'border-purple-500 bg-purple-50 text-purple-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className="block text-[13px] font-semibold">
                            {action.title}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                            {action.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="sale-claim-issue"
                    className="mb-1.5 block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500"
                  >
                    Keluhan Klaim *
                  </label>
                  <textarea
                    id="sale-claim-issue"
                    value={claimIssue}
                    onChange={(event) => {
                      setClaimIssue(event.target.value);
                      setClaimError(null);
                    }}
                    rows={3}
                    className="min-h-[86px] w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-[14px] outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                    placeholder="Contoh: speaker mati setelah dipakai customer"
                  />
                </div>

                <div>
                  <label
                    htmlFor="sale-claim-note"
                    className="mb-1.5 block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500"
                  >
                    Catatan
                  </label>
                  <textarea
                    id="sale-claim-note"
                    value={claimNote}
                    onChange={(event) => setClaimNote(event.target.value)}
                    rows={2}
                    className="min-h-[64px] w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-[14px] outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                    placeholder="Catatan untuk teknisi, refund, atau unit pengganti"
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

      {printError && !printReceiptData && (
        <div className="fixed bottom-4 right-4 z-40 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl px-4 py-3 text-[13px] shadow-lg">
          {printError}
        </div>
      )}

      {printReceiptData && (
        <ConfirmationView
          title="Cetak Ulang Nota"
          subtitle="Nota ini dibuat ulang dari riwayat transaksi."
          receipt={printReceiptData}
          onPrint={() => {
            try {
              setPrintError(null);
              printReceipt();
            } catch {
              setPrintError('Tidak dapat membuka dialog cetak');
            }
          }}
          onDismiss={() => {
            setPrintReceiptData(null);
            setPrintError(null);
          }}
          printError={printError}
        />
      )}
    </div>
  );
}
