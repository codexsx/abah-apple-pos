import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  Package,
  Calendar,
  Smartphone,
  Box,
  ShoppingCart,
  Loader2,
  AlertCircle,
  RefreshCw,
  Check,
  Minus,
  Plus,
  PackageX,
  PackageMinus,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getAccessories, takeAccessory, type Accessory } from '@/services/accessories';
import { validateTakeQuantity } from '@/services/accessoryCore';

/* ──────────────────────────────── easing tokens */
const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];
const easeOutExpo = [0.19, 1, 0.22, 1] as [number, number, number, number];

/* ═════════════════════════════════════════════════════════
   MOCK DATA - Pending Box Menyusul
   ═════════════════════════════════════════════════════════ */

interface PendingItem {
  id: string;
  model: string;
  capacity: string;
  condition: string;
  color: string;
  saleDate: string;
  buyerName: string;
  badge: 'ALL' | 'KOTAK';
}

const PENDING_ITEMS: PendingItem[] = [
  { id: 'JUAL-20260624-0001', model: 'iPhone 12', capacity: '128GB', condition: 'Second iBox', color: 'Blue', saleDate: '2026-06-24', buyerName: 'Budi Santoso', badge: 'ALL' },
  { id: 'JUAL-20260624-0002', model: 'iPhone 15 Pro', capacity: '256GB', condition: 'Baru iBox', color: 'Natural Titanium', saleDate: '2026-06-24', buyerName: 'Ani Wijaya', badge: 'ALL' },
  { id: 'JUAL-20260624-0003', model: 'iPhone 15', capacity: '128GB', condition: 'Baru Inter', color: 'Pink', saleDate: '2026-06-24', buyerName: 'Citra Lestari', badge: 'ALL' },
  { id: 'JUAL-20260624-0004', model: 'iPhone 15', capacity: '256GB', condition: 'Baru iBox', color: 'Blue', saleDate: '2026-06-24', buyerName: 'Doni Pratama', badge: 'KOTAK' },
  { id: 'JUAL-20260624-0005', model: 'iPhone 13', capacity: '128GB', condition: 'Second iBox', color: 'Midnight', saleDate: '2026-06-24', buyerName: 'Eka Rahman', badge: 'ALL' },
  { id: 'JUAL-20260624-0006', model: 'iPhone 14', capacity: '128GB', condition: 'Second iBox', color: 'Purple', saleDate: '2026-06-24', buyerName: 'Fajar Nugroho', badge: 'ALL' },
  { id: 'JUAL-20260624-0007', model: 'iPhone 13', capacity: '256GB', condition: 'Second Inter', color: 'Pink', saleDate: '2026-06-24', buyerName: 'Gita Amanda', badge: 'KOTAK' },
  { id: 'JUAL-20260624-0008', model: 'iPhone 13', capacity: '128GB', condition: 'Second iBox', color: 'Blue', saleDate: '2026-06-23', buyerName: 'Hadi Sucipto', badge: 'ALL' },
  { id: 'JUAL-20260624-0009', model: 'iPhone 15 Pro', capacity: '128GB', condition: 'Second iBox', color: 'Natural Titanium', saleDate: '2026-06-23', buyerName: 'Indah Permata', badge: 'ALL' },
  { id: 'JUAL-20260624-0010', model: 'iPhone 13', capacity: '128GB', condition: 'Second iBox', color: 'Green', saleDate: '2026-06-23', buyerName: 'Joko Widodo', badge: 'ALL' },
  { id: 'JUAL-20260624-0011', model: 'iPhone 13', capacity: '128GB', condition: 'Inter Unlock', color: 'Black', saleDate: '2026-06-23', buyerName: 'Kartika Sari', badge: 'KOTAK' },
  { id: 'JUAL-20260624-0012', model: 'iPhone 13', capacity: '256GB', condition: 'Second iBox', color: 'Alpine Green', saleDate: '2026-06-23', buyerName: 'Lukman Hakim', badge: 'ALL' },
  { id: 'JUAL-20260624-0013', model: 'iPhone 13', capacity: '128GB', condition: 'Second iBox', color: 'Midnight', saleDate: '2026-06-23', buyerName: 'Maya Anggraini', badge: 'ALL' },
  { id: 'JUAL-20260624-0014', model: 'iPhone 15 Plus', capacity: '256GB', condition: 'Baru iBox', color: 'Pink', saleDate: '2026-06-23', buyerName: 'Nadia Putri', badge: 'ALL' },
  { id: 'JUAL-20260624-0015', model: 'iPhone 13', capacity: '128GB', condition: 'Second Inter', color: 'White', saleDate: '2026-06-23', buyerName: 'Oscar Wijaya', badge: 'KOTAK' },
];

/* ═════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═════════════════════════════════════════════════════════ */

/* ─── Badge Component (pending box) ─── */
function Badge({ type }: { type: 'ALL' | 'KOTAK' }) {
  const config = {
    ALL: { bg: 'bg-[#F5F3FF]', text: 'text-[#8B5CF6]', label: 'ALL' },
    KOTAK: { bg: 'bg-[#F0FDFA]', text: 'text-[#0D9488]', label: 'KOTAK' },
  };
  const c = config[type];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.04em] ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

/* ─── Accessory status badge (AMAN=emerald, MENIPIS=amber, HABIS=rose) ─── */
const ACCESSORY_STATUS_STYLES: Record<Accessory['status'], string> = {
  AMAN: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
  MENIPIS: 'bg-amber-50 text-amber-600 border border-amber-200',
  HABIS: 'bg-rose-50 text-rose-600 border border-rose-200',
};

function AccessoryStatusBadge({ status }: { status: Accessory['status'] }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.04em] ${ACCESSORY_STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

const ACCESSORY_CATEGORY_LABELS: Record<Accessory['category'], string> = {
  charger: 'Charger',
  tempered_glass: 'Tempered Glass',
  case: 'Case',
  kotak: 'Kotak',
  paperbag: 'Paper Bag',
};

/* ═════════════════════════════════════════════════════════
   AMBIL AKSESORIS TAB — wired to the real accessories backend.
   Taking an accessory DECREMENTS its stock via the atomic RPC
   (takeAccessory → adjust_accessory_stock). The very same rows
   power Stok Pelengkap, so there is no separate store.
   ═════════════════════════════════════════════════════════ */
function AmbilAksesorisTab() {
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  /* Dialog state for the item currently being taken. */
  const [dialogItem, setDialogItem] = useState<Accessory | null>(null);
  const [qty, setQty] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /* Inline success toast. */
  const [toast, setToast] = useState<string | null>(null);

  const loadAccessories = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getAccessories();
      setAccessories(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Gagal memuat data aksesoris.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccessories();
  }, [loadAccessories]);

  /* Auto-dismiss the success toast. */
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accessories;
    return accessories.filter((a) => a.name.toLowerCase().includes(q));
  }, [accessories, search]);

  const openDialog = useCallback((item: Accessory) => {
    setDialogItem(item);
    setQty(1);
    setFormError(null);
  }, []);

  const closeDialog = useCallback(() => {
    if (submitting) return;
    setDialogItem(null);
    setFormError(null);
  }, [submitting]);

  const handleConfirm = useCallback(async () => {
    if (!dialogItem || submitting) return;
    const check = validateTakeQuantity(dialogItem.stock, qty);
    if (!check.ok) {
      setFormError(check.message);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const updated = await takeAccessory(dialogItem.id, qty);
      // Reflect the decrement immediately from the returned row.
      setAccessories((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setToast(`Ambil ${qty} ${dialogItem.name}`);
      setDialogItem(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal mengambil aksesoris. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }, [dialogItem, qty, submitting]);

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-12 flex flex-col items-center justify-center gap-3">
        <Loader2 size={28} className="text-teal-500 animate-spin" />
        <p className="text-[14px] text-slate-500">Memuat data aksesoris…</p>
      </div>
    );
  }

  /* ─── Error + retry ─── */
  if (loadError) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-12 flex flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50">
          <AlertCircle size={24} className="text-rose-500" />
        </div>
        <div>
          <p className="text-[15px] font-semibold text-slate-900">Gagal memuat aksesoris</p>
          <p className="text-[13px] text-slate-500 mt-1">{loadError}</p>
        </div>
        <button
          onClick={() => void loadAccessories()}
          className="inline-flex items-center gap-2 h-10 rounded-xl bg-teal-500 text-white px-5 text-[14px] font-semibold hover:bg-teal-600 transition-colors active:scale-[0.98] shadow-md shadow-teal-500/20"
        >
          <RefreshCw size={15} />
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama aksesoris…"
            className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-[14px] text-slate-700 transition-colors duration-200 focus:outline-none focus:ring-[3px] focus:ring-teal-500/10 focus:border-teal-500"
          />
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-slate-900">Daftar Aksesoris</h3>
          <span className="text-[12px] text-slate-400">{filtered.length} item</span>
        </div>

        {filtered.length === 0 ? (
          /* ─── Empty state ─── */
          <div className="p-12 flex flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <PackageX size={24} className="text-slate-400" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-slate-900">
                {search.trim() ? 'Aksesoris tidak ditemukan' : 'Belum ada aksesoris'}
              </p>
              <p className="text-[13px] text-slate-500 mt-1">
                {search.trim()
                  ? 'Coba kata kunci lain.'
                  : 'Tambahkan aksesoris terlebih dahulu di Stok Pelengkap.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            <AnimatePresence mode="popLayout">
              {filtered.map((item, idx) => {
                const isHabis = item.stock <= 0;
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ delay: idx * 0.015, duration: 0.25, ease: easeSmooth }}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                        <Package size={16} className="text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-semibold text-slate-900 truncate">
                            {item.name}
                          </span>
                          <AccessoryStatusBadge status={item.status} />
                        </div>
                        <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
                          <span>{ACCESSORY_CATEGORY_LABELS[item.category]}</span>
                          <span className="text-slate-300">|</span>
                          <span>
                            Stok: <span className="font-mono font-semibold text-slate-700">{item.stock}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => openDialog(item)}
                      disabled={isHabis}
                      className={`inline-flex items-center gap-1.5 h-9 rounded-xl px-4 text-[13px] font-semibold transition-colors active:scale-[0.98] shrink-0 ${
                        isHabis
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-teal-500 text-white hover:bg-teal-600 shadow-md shadow-teal-500/20'
                      }`}
                    >
                      <PackageMinus size={15} />
                      Ambil
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ─── Ambil dialog (quantity stepper) ─── */}
      <Dialog open={dialogItem !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-sm">
          {dialogItem && (
            <>
              <DialogHeader>
                <DialogTitle>Ambil {dialogItem.name}</DialogTitle>
                <DialogDescription>
                  {ACCESSORY_CATEGORY_LABELS[dialogItem.category]} · Stok tersedia{' '}
                  <span className="font-mono font-semibold text-slate-700">{dialogItem.stock}</span>
                </DialogDescription>
              </DialogHeader>

              <div className="py-2">
                <label className="block text-[13px] font-medium text-slate-600 mb-2">
                  Jumlah yang diambil
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setQty((q) => Math.max(1, q - 1));
                    }}
                    disabled={submitting || qty <= 1}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={dialogItem.stock}
                    value={qty}
                    onChange={(e) => {
                      setFormError(null);
                      const n = Math.floor(Number(e.target.value));
                      setQty(Number.isFinite(n) ? n : 1);
                    }}
                    className="h-10 w-20 rounded-xl border border-slate-300 bg-white text-center font-mono text-[15px] font-semibold text-slate-800 focus:outline-none focus:ring-[3px] focus:ring-teal-500/10 focus:border-teal-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setQty((q) => Math.min(dialogItem.stock, q + 1));
                    }}
                    disabled={submitting || qty >= dialogItem.stock}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                {formError && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-[13px] text-rose-600">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}
              </div>

              <DialogFooter>
                <button
                  type="button"
                  onClick={closeDialog}
                  disabled={submitting}
                  className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-[14px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirm()}
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 h-10 rounded-xl bg-teal-500 px-5 text-[14px] font-semibold text-white transition-colors hover:bg-teal-600 active:scale-[0.98] shadow-md shadow-teal-500/20 disabled:opacity-60"
                >
                  {submitting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  {submitting ? 'Memproses…' : 'Konfirmasi Ambil'}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Success toast ─── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25, ease: easeSmooth }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 rounded-xl bg-slate-900 px-4 py-3 text-[14px] font-medium text-white shadow-xl"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500">
              <Check size={14} />
            </span>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═════════════════════════════════════════════════════════ */
export default function AmbilPelengkap() {
  const navigate = useNavigate();
  const [activeMainTab, setActiveMainTab] = useState<'cari' | 'list' | 'ambil'>('cari');
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'kotak'>('all');
  const [searchImei, setSearchImei] = useState('');
  const [dateFilter, setDateFilter] = useState('hari-ini');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  /* Stats */
  const totalPending = PENDING_ITEMS.length;
  const allCount = PENDING_ITEMS.filter((p) => p.badge === 'ALL').length;
  const kotakCount = PENDING_ITEMS.filter((p) => p.badge === 'KOTAK').length;

  const displayedItems = useMemo(() => {
    if (activeSubTab === 'all') {
      return PENDING_ITEMS.filter((p) => p.badge === 'ALL');
    }
    return PENDING_ITEMS.filter((p) => p.badge === 'KOTAK');
  }, [activeSubTab]);

  const dateFilterOptions = [
    { key: 'hari-ini', label: 'Hari Ini' },
    { key: '7-hari', label: '7 Hari' },
    { key: '30-hari', label: '30 Hari' },
    { key: 'bulan-ini', label: 'Bulan Ini' },
    { key: 'bulan-lalu', label: 'Bulan Lalu' },
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
            onClick={() => navigate('/')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-display text-[36px] text-slate-900 leading-tight tracking-tight">
            Ambil Pelengkap
          </h1>
        </div>
        <p className="text-[13px] text-slate-500 ml-12 max-w-2xl">
          Catat pengambilan kotak / aksesoris yang menyusul. Mengambil aksesoris akan mengurangi stok di Stok Pelengkap.
        </p>
      </div>

      {/* ═══════ Main Tabs ═══════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: easeSmooth }}
        className="bg-white rounded-2xl border border-slate-200 shadow-card p-1 mb-6"
      >
        <div className="flex overflow-x-auto">
          {[
            { key: 'cari' as const, label: 'Cari IMEI / ID Penjualan', icon: Search },
            { key: 'list' as const, label: 'List Pending Box Menyusul', icon: Package },
            { key: 'ambil' as const, label: 'Ambil Aksesoris', icon: ShoppingCart },
          ].map((tab) => {
            const isActive = activeMainTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveMainTab(tab.key)}
                className={`relative flex items-center gap-2 px-5 py-3 rounded-xl text-[14px] font-medium transition-colors shrink-0 whitespace-nowrap ${
                  isActive ? 'text-white' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="ambil-main-tab-indicator"
                    className="absolute inset-0 bg-teal-500 rounded-xl shadow-md shadow-teal-500/25"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10"><tab.icon size={15} /></span>
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* ═══════ Tab Content ═══════ */}
      <AnimatePresence mode="wait">
        {activeMainTab === 'cari' ? (
          <motion.div
            key="cari"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15, ease: easeSmooth }}
              className="bg-white rounded-2xl border border-slate-200 shadow-card p-6"
            >
              <h2 className="text-[16px] font-semibold text-slate-900 mb-4">
                Cari berdasarkan IMEI atau ID Penjualan
              </h2>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
                <div className="relative flex-1">
                  <Smartphone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchImei}
                    onChange={(e) => setSearchImei(e.target.value)}
                    placeholder="IMEI (10-20 digit) atau JUAL-YYYYMMDD-XXXXX"
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-[14px] text-slate-700 transition-colors duration-200 focus:outline-none focus:ring-[3px] focus:ring-teal-500/10 focus:border-teal-500"
                  />
                </div>
                <button className="h-11 rounded-xl bg-[#14B8A6] text-white px-6 text-[14px] font-semibold hover:bg-[#0D9488] transition-colors active:scale-[0.98] shadow-md shadow-teal-500/20 shrink-0">
                  Cari
                </button>
              </div>

              <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-xl p-3">
                <Box size={14} className="text-slate-400 mt-0.5 shrink-0" />
                <p>
                  Sistem akan cek apakah HP ini ada di sistem. Kotak kosong kemungkinan customer lama (sebelum sistem).
                </p>
              </div>
            </motion.div>
          </motion.div>
        ) : activeMainTab === 'list' ? (
          /* ═══════ Tab 2: List Pending ═══════ */
          <motion.div
            key="list"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
          >
            {/* Date Filters */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15, ease: easeSmooth }}
              className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 mb-4"
            >
              {/* Quick date filters */}
              <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
                {dateFilterOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setDateFilter(opt.key)}
                    className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium transition-all whitespace-nowrap ${
                      dateFilter === opt.key
                        ? 'bg-[#14B8A6] text-white shadow-md shadow-teal-500/20'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Date Range */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-[13px] text-slate-500 shrink-0">Dari</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="flex-1 h-9 rounded-lg border border-slate-300 bg-white px-3 text-[13px] text-slate-700 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-[13px] text-slate-500 shrink-0">Sampai</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="flex-1 h-9 rounded-lg border border-slate-300 bg-white px-3 text-[13px] text-slate-700 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <button className="h-9 rounded-lg bg-[#14B8A6] text-white px-4 text-[13px] font-semibold hover:bg-[#0D9488] transition-colors active:scale-[0.98] shrink-0">
                  Cari
                </button>
              </div>
            </motion.div>

            {/* Stats Summary */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: easeSmooth }}
              className="grid grid-cols-3 gap-3 mb-4"
            >
              <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className="text-[11px] text-slate-500 mb-1">Total Pending</p>
                <p className="font-mono text-[22px] font-bold text-slate-900">{totalPending}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className="text-[11px] text-slate-500 mb-1">MENYUSUL ALL</p>
                <p className="font-mono text-[22px] font-bold text-[#8B5CF6]">{allCount}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className="text-[11px] text-slate-500 mb-1">MENYUSUL KOTAK</p>
                <p className="font-mono text-[22px] font-bold text-[#0D9488]">{kotakCount}</p>
              </div>
            </motion.div>

            {/* Sub Tabs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25, ease: easeSmooth }}
              className="bg-white rounded-2xl border border-slate-200 shadow-card p-1 mb-4"
            >
              <div className="flex">
                {[
                  { key: 'all' as const, label: 'MENYUSUL SEMUA', count: allCount },
                  { key: 'kotak' as const, label: 'MENYUSUL KOTAK SAJA', count: kotakCount },
                ].map((tab) => {
                  const isActive = activeSubTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveSubTab(tab.key)}
                      className={`relative flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[14px] font-medium transition-colors ${
                        isActive ? 'text-white' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="ambil-sub-tab-indicator"
                          className="absolute inset-0 bg-teal-500 rounded-xl shadow-md shadow-teal-500/25"
                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                      <span className={`relative z-10 text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>

            {/* Pending Items List */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3, ease: easeSmooth }}
              className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-[14px] font-semibold text-slate-900">
                  {activeSubTab === 'all' ? 'Menyusul Semua' : 'Menyusul Kotak Saja'}
                </h3>
                <span className="text-[12px] text-slate-400">{displayedItems.length} item</span>
              </div>
              <div className="divide-y divide-slate-50">
                <AnimatePresence mode="popLayout">
                  {displayedItems.map((item, idx) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ delay: idx * 0.01, duration: 0.25, ease: easeSmooth }}
                      className="flex items-center justify-between px-5 py-3 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                          <Smartphone size={16} className="text-slate-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-slate-900 truncate">
                              {item.model} {item.capacity}
                            </span>
                            <Badge type={item.badge} />
                          </div>
                          <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
                            <span>{item.condition}</span>
                            <span className="text-slate-300">|</span>
                            <span>{item.color}</span>
                            <span className="text-slate-300">|</span>
                            <Calendar size={10} />
                            <span>{item.saleDate}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[13px] font-medium text-slate-700">{item.buyerName}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{item.id}</p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          /* ═══════ Tab 3: Ambil Aksesoris (wired to backend) ═══════ */
          <motion.div
            key="ambil"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
          >
            <AmbilAksesorisTab />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
