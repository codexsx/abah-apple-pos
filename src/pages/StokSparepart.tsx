import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';

import {
  ArrowLeft,
  Search,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  RefreshCw,
  Cpu,
  Loader2,
  Check,
} from 'lucide-react';

import {
  getSpareparts,
  createSparepart,
  updateSparepart,
  deleteSparepart,
  type Sparepart,
  type SparepartInsert,
} from '@/services/spareparts';
import {
  deriveSparepartStatus,
  validateSparepartInput,
  type SparepartStatus,
  type SparepartInputCore,
} from '@/services/sparepartCore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/* ──────────────────────────────── easing tokens */
const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];
const easeOutExpo = [0.19, 1, 0.22, 1] as [number, number, number, number];

/* ──────────────────────────────── price formatter */
function formatPrice(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID');
}

/* ──────────────────────────────── rupiah input helpers */
function formatRupiahInput(value: string): string {
  const numeric = value.replace(/\D/g, '');
  if (!numeric) return '';
  return parseInt(numeric, 10).toLocaleString('id-ID');
}

function parseRupiah(value: string): number {
  return parseInt(value.replace(/\./g, '').replace(/,/g, '') || '0', 10) || 0;
}

/** Pull a human-readable message out of a thrown service/Supabase error. */
function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as { message?: unknown };
    if (typeof e.message === 'string' && e.message.trim()) return e.message;
  }
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}

/* ──────────────────────────────── status badge */
function StatusBadge({ status }: { status: SparepartStatus }) {
  const config: Record<SparepartStatus, { bg: string; text: string; label: string }> = {
    OK: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'AMAN' },
    'STOK RENDAH': { bg: 'bg-amber-50', text: 'text-amber-700', label: 'STOK RENDAH' },
    HABIS: { bg: 'bg-rose-50', text: 'text-rose-600', label: 'HABIS' },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.04em] ${c.bg} ${c.text}`}
    >
      {c.label}
    </span>
  );
}

/* ──────────────────────────────── shared input styling */
const inputClass =
  'w-full h-11 rounded-xl border border-slate-300 px-4 text-[14px] text-slate-700 outline-none transition-all duration-200 font-body focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10';
const labelClass =
  'block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5';

/* ═════════════════════════════════════════════════════════
   SPAREPART FORM DIALOG — create + edit share one modal form.
   Validates via the pure core; persists via the service layer.
   ═════════════════════════════════════════════════════════ */

interface SparepartFormDialogProps {
  /** When provided, the dialog edits this sparepart; otherwise it creates one. */
  existing?: Sparepart | null;
  onClose: () => void;
  onSaved: () => void;
}

function SparepartFormDialog({ existing, onClose, onSaved }: SparepartFormDialogProps) {
  const isEdit = !!existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [compatibleType, setCompatibleType] = useState(existing?.compatible_type ?? '');
  const [stockInput, setStockInput] = useState(
    existing ? String(existing.stock) : '0',
  );
  const [minStockInput, setMinStockInput] = useState(
    existing ? String(existing.min_stock) : '0',
  );
  const [buyPriceInput, setBuyPriceInput] = useState(
    existing?.buy_price ? existing.buy_price.toLocaleString('id-ID') : '',
  );
  const [sellPriceInput, setSellPriceInput] = useState(
    existing?.sell_price ? existing.sell_price.toLocaleString('id-ID') : '',
  );

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setErrorMsg(null);

    const stock = parseInt(stockInput, 10);
    const minStock = parseInt(minStockInput, 10);
    const buyPrice = parseRupiah(buyPriceInput);
    const sellPrice = parseRupiah(sellPriceInput);

    const input: SparepartInputCore = {
      name: name.trim(),
      compatibleType: compatibleType.trim(),
      stock: Number.isNaN(stock) ? -1 : stock,
      minStock: Number.isNaN(minStock) ? -1 : minStock,
      buyPrice,
      sellPrice,
    };

    // Validate via the pure core. On failure show the message and persist nothing.
    const result = validateSparepartInput(input);
    if (!result.ok) {
      setErrorMsg(result.message);
      return;
    }

    const payload: SparepartInsert = {
      name: input.name,
      compatible_type: input.compatibleType,
      stock: input.stock,
      min_stock: input.minStock,
      buy_price: input.buyPrice,
      sell_price: input.sellPrice,
    };

    setSaving(true);
    try {
      if (isEdit && existing) {
        await updateSparepart(existing.id, payload);
      } else {
        await createSparepart(payload);
      }
      onSaved();
    } catch (err) {
      setErrorMsg(errorMessage(err, 'Gagal menyimpan sparepart. Silakan coba lagi.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Sparepart' : 'Tambah Sparepart'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Ubah detail sparepart lalu simpan perubahan.'
              : 'Isi detail sparepart baru lalu simpan.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Name (required) */}
          <div className="sm:col-span-2">
            <label htmlFor="sp-name" className={labelClass}>
              Nama Sparepart *
            </label>
            <input
              id="sp-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Battery iPhone 11"
              className={inputClass}
            />
          </div>

          {/* Compatible type */}
          <div className="sm:col-span-2">
            <label htmlFor="sp-compatible" className={labelClass}>
              Tipe Kompatibel
            </label>
            <input
              id="sp-compatible"
              type="text"
              value={compatibleType}
              onChange={(e) => setCompatibleType(e.target.value)}
              placeholder="iPhone 11"
              className={inputClass}
            />
          </div>

          {/* Stock */}
          <div>
            <label htmlFor="sp-stock" className={labelClass}>
              Stok
            </label>
            <input
              id="sp-stock"
              type="number"
              min={0}
              step={1}
              value={stockInput}
              onChange={(e) => setStockInput(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Min stock */}
          <div>
            <label htmlFor="sp-min-stock" className={labelClass}>
              Stok Minimum
            </label>
            <input
              id="sp-min-stock"
              type="number"
              min={0}
              step={1}
              value={minStockInput}
              onChange={(e) => setMinStockInput(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Buy price */}
          <div>
            <label htmlFor="sp-buy-price" className={labelClass}>
              Harga Beli
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 font-mono">
                Rp
              </span>
              <input
                id="sp-buy-price"
                type="text"
                inputMode="numeric"
                value={buyPriceInput}
                onChange={(e) => setBuyPriceInput(formatRupiahInput(e.target.value))}
                placeholder="0"
                className="w-full h-11 rounded-xl border border-slate-300 pl-10 pr-4 text-[14px] text-slate-700 outline-none transition-all duration-200 font-mono focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
              />
            </div>
          </div>

          {/* Sell price */}
          <div>
            <label htmlFor="sp-sell-price" className={labelClass}>
              Harga Jual
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 font-mono">
                Rp
              </span>
              <input
                id="sp-sell-price"
                type="text"
                inputMode="numeric"
                value={sellPriceInput}
                onChange={(e) => setSellPriceInput(formatRupiahInput(e.target.value))}
                placeholder="0"
                className="w-full h-11 rounded-xl border border-slate-300 pl-10 pr-4 text-[14px] text-slate-700 outline-none transition-all duration-200 font-mono focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
              />
            </div>
          </div>
        </div>

        {/* Inline validation / submit error */}
        {errorMsg && (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-[12px] font-medium text-rose-600"
          >
            <AlertCircle size={13} className="mt-0.5 shrink-0" /> {errorMsg}
          </p>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-xl bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═════════════════════════════════════════════════════════
   DELETE CONFIRM DIALOG
   ═════════════════════════════════════════════════════════ */

function DeleteConfirmDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: Sparepart;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setErrorMsg(null);
    setDeleting(true);
    try {
      await deleteSparepart(target.id);
      onDeleted();
    } catch (err) {
      setErrorMsg(errorMessage(err, 'Gagal menghapus sparepart. Silakan coba lagi.'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Hapus Sparepart</DialogTitle>
          <DialogDescription>
            Yakin ingin menghapus{' '}
            <span className="font-semibold text-slate-700">{target.name}</span>? Tindakan ini
            tidak dapat dibatalkan.
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-[12px] font-medium text-rose-600"
          >
            <AlertCircle size={13} className="mt-0.5 shrink-0" /> {errorMsg}
          </p>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {deleting && <Loader2 size={14} className="animate-spin" />}
            {deleting ? 'Menghapus…' : 'Hapus'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT — Stok Sparepart (live backend)
   ═════════════════════════════════════════════════════════ */
export default function StokSparepart() {
  const navigate = useNavigate();

  const [items, setItems] = useState<Sparepart[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'Semua' | SparepartStatus>('Semua');

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Sparepart | null>(null);
  const [deleting, setDeleting] = useState<Sparepart | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getSpareparts();
      setItems(data);
    } catch (err) {
      setLoadError(errorMessage(err, 'Gagal memuat data sparepart.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  /* ──────── derived stats + filtering */
  const stats = useMemo(() => {
    let totalPcs = 0;
    let totalNilaiModal = 0;
    let habisCount = 0;
    let menipisCount = 0;
    let amanCount = 0;
    for (const it of items) {
      totalPcs += it.stock;
      totalNilaiModal += it.stock * it.buy_price;
      const status = deriveSparepartStatus(it.stock, it.min_stock);
      if (status === 'HABIS') habisCount++;
      else if (status === 'STOK RENDAH') menipisCount++;
      else amanCount++;
    }
    return {
      totalItem: items.length,
      totalPcs,
      totalNilaiModal,
      habisCount,
      menipisCount,
      amanCount,
    };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filterStatus !== 'Semua') {
        if (deriveSparepartStatus(it.stock, it.min_stock) !== filterStatus) return false;
      }
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        it.compatible_type.toLowerCase().includes(q)
      );
    });
  }, [items, search, filterStatus]);

  const statusOptions: { key: 'Semua' | SparepartStatus; label: string }[] = [
    { key: 'Semua', label: 'Semua status' },
    { key: 'HABIS', label: 'Habis' },
    { key: 'STOK RENDAH', label: 'Stok rendah' },
    { key: 'OK', label: 'Aman' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: easeOutExpo }}
      className="pb-8"
    >
      {/* ═══════ Page Header ═══════ */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => navigate('/stok')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-display text-[36px] text-slate-900 leading-tight tracking-tight">
            Stok Sparepart
          </h1>
          <span className="text-[13px] text-slate-400 font-mono">
            {stats.totalItem} jenis, {stats.totalPcs} pcs
          </span>
        </div>
        <p className="text-[14px] text-slate-500 ml-12">
          Kelola suku cadang untuk kebutuhan servis.
        </p>
      </div>

      {/* ═══════ Stats Header ═══════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: easeSmooth }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4"
      >
        {/* Total Item & Stok */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Cpu size={14} className="text-[#14B8A6]" />
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Total Item & Stok
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-[22px] font-bold text-slate-900">
              {stats.totalItem}
            </span>
            <span className="text-[13px] text-slate-400">jenis,</span>
            <span className="font-mono text-[22px] font-bold text-slate-900">
              {stats.totalPcs}
            </span>
            <span className="text-[13px] text-slate-400">pcs</span>
          </div>
        </div>

        {/* Total Nilai Modal */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Total Nilai Modal Stok
            </span>
          </div>
          <span className="font-mono text-[22px] font-bold text-slate-900">
            {formatPrice(stats.totalNilaiModal)}
          </span>
        </div>

        {/* Breakdown Badges */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Status Stok
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[#FFF1F2] text-[#F43F5E]">
              {stats.habisCount} habis
            </span>
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[#FFFBEB] text-[#B45309]">
              {stats.menipisCount} menipis
            </span>
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[#ECFDF5] text-[#10B981]">
              {stats.amanCount} aman
            </span>
          </div>
        </div>
      </motion.div>

      {/* ═══════ Controls ═══════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2, ease: easeSmooth }}
        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-8"
      >
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama sparepart, tipe HP..."
            className="w-full h-10 rounded-xl border border-slate-300 bg-white pl-9 pr-4 text-[14px] text-slate-700 transition-colors duration-200 focus:outline-none focus:ring-[3px] focus:ring-teal-500/10 focus:border-teal-500"
          />
        </div>

        {/* Filter Status */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as 'Semua' | SparepartStatus)}
          className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-[14px] text-slate-700 transition-colors focus:outline-none focus:ring-[3px] focus:ring-teal-500/10 focus:border-teal-500 shrink-0 cursor-pointer"
        >
          {statusOptions.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Add Button */}
        <button
          onClick={() => setShowCreate(true)}
          className="h-10 rounded-xl bg-[#14B8A6] text-white px-4 text-[14px] font-semibold hover:bg-[#0D9488] transition-colors active:scale-[0.98] shadow-md shadow-teal-500/20 shrink-0 flex items-center justify-center gap-1.5"
        >
          <Plus size={16} />
          Tambah Sparepart
        </button>
      </motion.div>

      {/* ═══════ Success toast ═══════ */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            role="status"
            className="mb-4 flex items-center gap-2 rounded-xl bg-teal-50 px-3 py-2.5 text-[13px] font-semibold text-teal-700"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500 text-white">
              <Check size={12} strokeWidth={3} />
            </div>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════ Content states ═══════ */}
      {loading ? (
        /* Loading */
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200 shadow-card">
          <Loader2 size={32} className="text-teal-500 animate-spin mb-4" />
          <p className="text-[14px] text-slate-500">Memuat data sparepart…</p>
        </div>
      ) : loadError ? (
        /* Error + retry */
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200 shadow-card">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 mb-4">
            <AlertCircle size={28} className="text-rose-500" />
          </div>
          <p className="text-[15px] font-semibold text-slate-700 mb-1">Gagal memuat data</p>
          <p className="text-[13px] text-slate-400 mb-5">{loadError}</p>
          <button
            onClick={() => void load()}
            className="flex items-center gap-2 rounded-xl bg-[#14B8A6] px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-[#0D9488] transition-colors shadow-md shadow-teal-500/20"
          >
            <RefreshCw size={16} />
            Coba Lagi
          </button>
        </div>
      ) : items.length === 0 ? (
        /* Empty (no data at all) */
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1, ease: easeSmooth }}
          className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200 shadow-card"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 mb-5">
            <Cpu size={36} className="text-slate-400" />
          </div>
          <p className="text-[16px] font-semibold text-slate-600 mb-2">
            Belum ada stok sparepart.
          </p>
          <p className="text-[13px] text-slate-400 mb-6">
            Tambahkan sparepart pertama untuk mulai mengelola stok.
          </p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl bg-[#14B8A6] px-6 py-3 text-[14px] font-semibold text-white hover:bg-[#0D9488] transition-colors shadow-md shadow-teal-500/20"
          >
            <Plus size={18} />
            Tambah Sparepart Pertama
          </motion.button>
        </motion.div>
      ) : filtered.length === 0 ? (
        /* No matches for current filter/search */
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200 shadow-card">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 mb-4">
            <Search size={26} className="text-slate-400" />
          </div>
          <p className="text-[15px] font-semibold text-slate-600 mb-1">
            Tidak ada sparepart yang cocok.
          </p>
          <p className="text-[13px] text-slate-400">
            Coba ubah kata kunci pencarian atau filter status.
          </p>
        </div>
      ) : (
        /* Data table */
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: easeSmooth }}
          className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Nama
                  </th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Tipe Kompatibel
                  </th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Stok
                  </th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 text-right">
                    Harga Beli
                  </th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 text-right">
                    Harga Jual
                  </th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 text-right">
                    Min. Stok
                  </th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 text-right">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => {
                  const status = deriveSparepartStatus(it.stock, it.min_stock);
                  return (
                    <tr
                      key={it.id}
                      className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                            <Cpu size={15} className="text-slate-400" />
                          </div>
                          <span className="text-[14px] font-medium text-slate-800">
                            {it.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-slate-600">
                        {it.compatible_type || '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[14px] font-semibold text-slate-800">
                            {it.stock}
                          </span>
                          <StatusBadge status={status} />
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-[13px] text-slate-700">
                        {formatPrice(it.buy_price)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-[13px] text-slate-700">
                        {formatPrice(it.sell_price)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-[13px] text-slate-500">
                        {it.min_stock}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setEditing(it)}
                            aria-label={`Edit ${it.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-teal-50 hover:text-teal-600 transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setDeleting(it)}
                            aria-label={`Hapus ${it.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* ═══════ Dialogs ═══════ */}
      {showCreate && (
        <SparepartFormDialog
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            showToast('Sparepart berhasil ditambahkan');
            void load();
          }}
        />
      )}

      {editing && (
        <SparepartFormDialog
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            showToast('Perubahan sparepart berhasil disimpan');
            void load();
          }}
        />
      )}

      {deleting && (
        <DeleteConfirmDialog
          target={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            showToast('Sparepart berhasil dihapus');
            void load();
          }}
        />
      )}
    </motion.div>
  );
}
