import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';
import {
  ArrowLeft,
  Search,
  Zap,
  GlassWater,
  Box,
  Package,
  ShoppingBag,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  PackagePlus,
  PackageX,
  AlertCircle,
  RefreshCw,
  Loader2,
  Check,
} from 'lucide-react';
import {
  getAccessories,
  createAccessory,
  updateAccessory,
  deleteAccessory,
  restockAccessory,
  type Accessory,
} from '@/services/accessories';
import {
  ACCESSORY_CATEGORIES,
  validateAccessoryInput,
  type AccessoryCategory,
  type AccessoryInputCore,
} from '@/services/accessoryCore';
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

/* ──────────────────────────────── price formatter (integer IDR) */
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

/* ──────────────────────────────── category metadata */
interface CategoryDef {
  key: AccessoryCategory;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
}

const CATEGORIES: CategoryDef[] = [
  { key: 'charger', label: 'Charger', icon: Zap, color: '#F59E0B' },
  { key: 'tempered_glass', label: 'Tempered Glass', icon: GlassWater, color: '#14B8A6' },
  { key: 'case', label: 'Case', icon: Box, color: '#8B5CF6' },
  { key: 'kotak', label: 'Kotak', icon: Package, color: '#D4A574' },
  { key: 'paperbag', label: 'Paperbag', icon: ShoppingBag, color: '#64748B' },
];

const CATEGORY_LABELS: Record<AccessoryCategory, string> = {
  charger: 'Charger',
  tempered_glass: 'Tempered Glass',
  case: 'Case',
  kotak: 'Kotak',
  paperbag: 'Paperbag',
};

/* ═════════════════════════════════════════════════════════
   STATUS BADGE — AMAN emerald, MENIPIS amber, HABIS rose
   ═════════════════════════════════════════════════════════ */
function ItemStatusBadge({ status }: { status: Accessory['status'] }) {
  const config: Record<Accessory['status'], { bg: string; text: string; label: string }> = {
    AMAN: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'AMAN' },
    MENIPIS: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'MENIPIS' },
    HABIS: { bg: 'bg-rose-50', text: 'text-rose-600', label: 'HABIS' },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.04em] ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

const inputClass =
  'w-full h-11 rounded-xl border border-slate-300 px-4 text-[14px] text-slate-700 outline-none transition-all duration-200 font-body focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10';
const labelClass =
  'block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5';

/* ═════════════════════════════════════════════════════════
   ACCESSORY FORM DIALOG — create / edit shared shell
   ═════════════════════════════════════════════════════════ */
interface AccessoryFormDialogProps {
  mode: 'create' | 'edit';
  initial?: Accessory;
  onClose: () => void;
  onSaved: (msg: string) => void;
}

function AccessoryFormDialog({ mode, initial, onClose, onSaved }: AccessoryFormDialogProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<AccessoryCategory>(
    initial?.category ?? 'charger',
  );
  const [stockInput, setStockInput] = useState(
    initial ? String(initial.stock) : '0',
  );
  const [minStockInput, setMinStockInput] = useState(
    initial ? String(initial.min_stock) : '0',
  );
  const [priceInput, setPriceInput] = useState(
    initial?.price ? initial.price.toLocaleString('id-ID') : '',
  );

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setErrorMsg(null);

    const stock = parseInt(stockInput, 10);
    const minStock = parseInt(minStockInput, 10);
    const price = parseRupiah(priceInput);

    const core: AccessoryInputCore = {
      name: name.trim(),
      category,
      stock: Number.isNaN(stock) ? -1 : stock,
      minStock: Number.isNaN(minStock) ? -1 : minStock,
      price,
    };

    const result = validateAccessoryInput(core);
    if (!result.ok) {
      setErrorMsg(result.message);
      return;
    }

    setSaving(true);
    try {
      if (mode === 'create') {
        await createAccessory({
          name: core.name,
          category: core.category as Accessory['category'],
          stock: core.stock,
          min_stock: core.minStock,
          price: core.price,
        });
        onSaved('Pelengkap berhasil ditambahkan');
      } else if (initial) {
        await updateAccessory(initial.id, {
          name: core.name,
          category: core.category as Accessory['category'],
          stock: core.stock,
          min_stock: core.minStock,
          price: core.price,
        });
        onSaved('Perubahan berhasil disimpan');
      }
    } catch {
      setErrorMsg('Gagal menyimpan pelengkap. Silakan coba lagi.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Tambah Pelengkap' : 'Edit Pelengkap'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Tambahkan aksesoris atau pelengkap baru ke stok.'
              : 'Ubah detail pelengkap lalu simpan perubahan.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Name */}
          <div className="sm:col-span-2">
            <label htmlFor="acc-name" className={labelClass}>
              Nama Pelengkap *
            </label>
            <input
              id="acc-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Charger 20W Original"
              className={inputClass}
            />
          </div>

          {/* Category */}
          <div className="sm:col-span-2">
            <label htmlFor="acc-category" className={labelClass}>
              Kategori *
            </label>
            <select
              id="acc-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as AccessoryCategory)}
              className={inputClass}
            >
              {ACCESSORY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          {/* Stock */}
          <div>
            <label htmlFor="acc-stock" className={labelClass}>
              Stok
            </label>
            <input
              id="acc-stock"
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
            <label htmlFor="acc-min-stock" className={labelClass}>
              Stok Minimum
            </label>
            <input
              id="acc-min-stock"
              type="number"
              min={0}
              step={1}
              value={minStockInput}
              onChange={(e) => setMinStockInput(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Price */}
          <div className="sm:col-span-2">
            <label htmlFor="acc-price" className={labelClass}>
              Harga
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 font-mono">
                Rp
              </span>
              <input
                id="acc-price"
                type="text"
                inputMode="numeric"
                value={priceInput}
                onChange={(e) => setPriceInput(formatRupiahInput(e.target.value))}
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
            className="rounded-xl bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═════════════════════════════════════════════════════════
   RESTOCK DIALOG — prompt a quantity, then restockAccessory
   ═════════════════════════════════════════════════════════ */
function RestockDialog({
  item,
  onClose,
  onSaved,
}: {
  item: Accessory;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [qtyInput, setQtyInput] = useState('1');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setErrorMsg(null);
    const qty = parseInt(qtyInput, 10);
    if (Number.isNaN(qty) || qty < 1) {
      setErrorMsg('Jumlah restock minimal 1');
      return;
    }

    setSaving(true);
    try {
      await restockAccessory(item.id, qty);
      onSaved(`Stok ${item.name} bertambah ${qty} pcs`);
    } catch {
      setErrorMsg('Gagal menambah stok. Silakan coba lagi.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Tambah Stok</DialogTitle>
          <DialogDescription>
            Tambah stok untuk <span className="font-semibold text-slate-700">{item.name}</span>{' '}
            (saat ini {item.stock} pcs).
          </DialogDescription>
        </DialogHeader>

        <div>
          <label htmlFor="restock-qty" className={labelClass}>
            Jumlah Tambah (pcs)
          </label>
          <input
            id="restock-qty"
            type="number"
            min={1}
            step={1}
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            className={inputClass}
            autoFocus
          />
        </div>

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
            className="rounded-xl bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <PackagePlus size={14} />}
            {saving ? 'Menyimpan…' : 'Tambah'}
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
  item,
  onClose,
  onDeleted,
}: {
  item: Accessory;
  onClose: () => void;
  onDeleted: (msg: string) => void;
}) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setErrorMsg(null);
    setDeleting(true);
    try {
      await deleteAccessory(item.id);
      onDeleted(`${item.name} berhasil dihapus`);
    } catch {
      setErrorMsg('Gagal menghapus pelengkap. Silakan coba lagi.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Hapus Pelengkap</DialogTitle>
          <DialogDescription>
            Yakin ingin menghapus{' '}
            <span className="font-semibold text-slate-700">{item.name}</span>? Tindakan ini
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
            className="rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {deleting ? 'Menghapus…' : 'Hapus'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═════════════════════════════════════════════════════════
   ACCESSORY CARD
   ═════════════════════════════════════════════════════════ */
function AccessoryCard({
  item,
  index,
  onEdit,
  onDelete,
  onRestock,
}: {
  item: Accessory;
  index: number;
  onEdit: (item: Accessory) => void;
  onDelete: (item: Accessory) => void;
  onRestock: (item: Accessory) => void;
}) {
  const stockColor =
    item.status === 'HABIS'
      ? 'text-rose-500'
      : item.status === 'MENIPIS'
        ? 'text-amber-500'
        : 'text-slate-700';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.3, ease: easeSmooth }}
      className="rounded-xl border border-slate-200 bg-white p-4 hover:shadow-card transition-shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold text-slate-900">{item.name}</span>
            <ItemStatusBadge status={item.status} />
          </div>
          <span className="text-[12px] text-slate-500">{CATEGORY_LABELS[item.category]}</span>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Stok</p>
          <p className={`font-mono text-[18px] font-bold ${stockColor}`}>
            {item.stock}
            <span className="text-[10px] font-normal text-slate-400 ml-1">pcs</span>
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-slate-500">
        <span>Min: {item.min_stock} pcs</span>
        <span className="font-mono text-slate-700">{formatPrice(item.price)}</span>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onRestock(item)}
          className="flex items-center gap-1 rounded-lg bg-[#F0FDFA] text-[#0D9488] px-2.5 py-1.5 text-[12px] font-semibold hover:bg-[#CCFBF1] transition-colors active:scale-[0.98]"
        >
          <PackagePlus size={13} />
          Stok
        </button>
        <button
          type="button"
          onClick={() => onEdit(item)}
          className="flex items-center gap-1 rounded-lg bg-slate-100 text-slate-600 px-2.5 py-1.5 text-[12px] font-semibold hover:bg-slate-200 transition-colors active:scale-[0.98]"
        >
          <Pencil size={13} />
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDelete(item)}
          className="flex items-center gap-1 rounded-lg bg-rose-50 text-rose-600 px-2.5 py-1.5 text-[12px] font-semibold hover:bg-rose-100 transition-colors active:scale-[0.98]"
        >
          <Trash2 size={13} />
          Hapus
        </button>
      </div>
    </motion.div>
  );
}

/* ═════════════════════════════════════════════════════════
   CATEGORY SECTION (collapsible)
   ═════════════════════════════════════════════════════════ */
function CategorySection({
  category,
  items,
  onEdit,
  onDelete,
  onRestock,
}: {
  category: CategoryDef;
  items: Accessory[];
  onEdit: (item: Accessory) => void;
  onDelete: (item: Accessory) => void;
  onRestock: (item: Accessory) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const Icon = category.icon;

  const totalPcs = items.reduce((sum, i) => sum + i.stock, 0);
  const jenisCount = items.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: easeSmooth }}
      className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden mb-3"
    >
      {/* Section Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: category.color + '15' }}
          >
            <span style={{ color: category.color }}>
              <Icon size={18} />
            </span>
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-slate-900">{category.label}</span>
              <span className="text-[12px] text-slate-500">
                {jenisCount} jenis, {totalPcs} pcs
              </span>
            </div>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3, ease: easeSmooth }}
        >
          <ChevronDown size={18} className="text-slate-400" />
        </motion.div>
      </button>

      {/* Section Content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: easeSmooth }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 p-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                  <PackageX size={32} className="mb-2" />
                  <p className="text-[13px]">Tidak ada item dalam kategori ini.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((item, idx) => (
                    <AccessoryCard
                      key={item.id}
                      item={item}
                      index={idx}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onRestock={onRestock}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ═════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═════════════════════════════════════════════════════════ */
export default function StokPelengkap() {
  const navigate = useNavigate();

  const [items, setItems] = useState<Accessory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | AccessoryCategory>('all');
  const [filterStatus, setFilterStatus] = useState('Semua');

  // Dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<Accessory | null>(null);
  const [restockItem, setRestockItem] = useState<Accessory | null>(null);
  const [deleteItem, setDeleteItem] = useState<Accessory | null>(null);

  // Transient success feedback
  const [toast, setToast] = useState<string | null>(null);

  const openPelengkapPurchase = useCallback(() => {
    navigate('/pembelian?pelengkap=1');
  }, [navigate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getAccessories();
      setItems(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function handleSaved(msg: string) {
    setShowCreate(false);
    setEditItem(null);
    setRestockItem(null);
    setDeleteItem(null);
    showToast(msg);
    loadData();
  }

  /* Filtering */
  const filteredItems = useMemo(() => {
    let data = [...items];
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((d) => d.name.toLowerCase().includes(q));
    }
    if (filterCategory !== 'all') {
      data = data.filter((d) => d.category === filterCategory);
    }
    if (filterStatus !== 'Semua') {
      data = data.filter((d) => {
        if (filterStatus === 'habis') return d.status === 'HABIS';
        if (filterStatus === 'menipis') return d.status === 'MENIPIS';
        if (filterStatus === 'aman') return d.status === 'AMAN';
        return true;
      });
    }
    return data;
  }, [items, search, filterCategory, filterStatus]);

  /* Stats (driven by live data) */
  const totalItem = items.length;
  const totalPcs = items.reduce((sum, i) => sum + i.stock, 0);
  const totalNilaiModal = items.reduce((sum, i) => sum + i.stock * i.price, 0);
  const habisCount = items.filter((i) => i.status === 'HABIS').length;
  const menipisCount = items.filter((i) => i.status === 'MENIPIS').length;
  const amanCount = items.filter((i) => i.status === 'AMAN').length;

  const statusOptions = [
    { key: 'Semua', label: 'Semua status' },
    { key: 'habis', label: 'Habis' },
    { key: 'menipis', label: 'Menipis' },
    { key: 'aman', label: 'Aman' },
  ];

  /* Visible categories to render, honoring the category filter. */
  const visibleCategories =
    filterCategory === 'all'
      ? CATEGORIES
      : CATEGORIES.filter((c) => c.key === filterCategory);

  const hasAnyVisible = visibleCategories.some(
    (cat) => filteredItems.some((i) => i.category === cat.key),
  );

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
            Stok Pelengkap
          </h1>
        </div>
        <p className="text-[14px] text-slate-500 ml-12">Kelola aksesoris dan pelengkap penjualan.</p>
      </div>

      {/* ═══════ Success toast ═══════ */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
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
            <Package size={14} className="text-[#14B8A6]" />
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Item & Stok</span>
          </div>
          <div className="flex items-baseline gap-1">
            <CountUp end={totalItem} duration={1.2} className="font-mono text-[22px] font-bold text-slate-900" />
            <span className="text-[13px] text-slate-400">item,</span>
            <CountUp end={totalPcs} duration={1.2} className="font-mono text-[22px] font-bold text-slate-900" />
            <span className="text-[13px] text-slate-400">pcs</span>
          </div>
        </div>

        {/* Total Nilai Modal */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <ShoppingBag size={14} className="text-[#D4A574]" />
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Nilai Modal Stok</span>
          </div>
          <CountUp
            end={totalNilaiModal}
            duration={1.2}
            prefix="Rp "
            separator="."
            className="font-mono text-[22px] font-bold text-slate-900"
          />
        </div>

        {/* Breakdown Badges */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap size={14} className="text-[#8B5CF6]" />
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Status Stok</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-rose-50 text-rose-600">
              {habisCount} habis
            </span>
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-amber-50 text-amber-600">
              {menipisCount} menipis
            </span>
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 text-emerald-600">
              {amanCount} aman
            </span>
          </div>
        </div>
      </motion.div>

      {/* ═══════ Controls ═══════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2, ease: easeSmooth }}
        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4"
      >
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama pelengkap..."
            className="w-full h-10 rounded-xl border border-slate-300 bg-white pl-9 pr-4 text-[14px] text-slate-700 transition-colors duration-200 focus:outline-none focus:ring-[3px] focus:ring-teal-500/10 focus:border-teal-500"
          />
        </div>

        {/* Filter Category */}
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as 'all' | AccessoryCategory)}
          className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-[14px] text-slate-700 transition-colors focus:outline-none focus:ring-[3px] focus:ring-teal-500/10 focus:border-teal-500 shrink-0 cursor-pointer"
        >
          <option value="all">Semua kategori</option>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>

        {/* Filter Status */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
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
          type="button"
          onClick={openPelengkapPurchase}
          className="h-10 rounded-xl bg-[#14B8A6] text-white px-4 text-[14px] font-semibold hover:bg-[#0D9488] transition-colors active:scale-[0.98] shadow-md shadow-teal-500/20 shrink-0 flex items-center justify-center gap-1.5"
        >
          <Plus size={16} />
          Tambah Pelengkap
        </button>
      </motion.div>

      {/* ═══════ Body: loading / error / empty / data ═══════ */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 size={32} className="animate-spin mb-3 text-teal-500" />
          <p className="text-[14px]">Memuat data pelengkap…</p>
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500 mb-3">
            <AlertCircle size={24} />
          </div>
          <p className="text-[14px] font-medium text-slate-700 mb-1">Gagal memuat data pelengkap</p>
          <p className="text-[13px] text-slate-500 mb-4">Periksa koneksi lalu coba lagi.</p>
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors"
          >
            <RefreshCw size={14} />
            Coba lagi
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
            <PackageX size={24} />
          </div>
          <p className="text-[14px] font-medium text-slate-700 mb-1">Belum ada pelengkap</p>
          <p className="text-[13px] text-slate-500 mb-4">Tambahkan aksesoris pertama untuk mulai mengelola stok.</p>
          <button
            type="button"
            onClick={openPelengkapPurchase}
            className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors"
          >
            <Plus size={14} />
            Tambah Pelengkap
          </button>
        </div>
      ) : !hasAnyVisible ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <PackageX size={32} className="mb-2" />
          <p className="text-[13px]">Tidak ada pelengkap yang cocok dengan filter.</p>
        </div>
      ) : (
        visibleCategories.map((cat) => (
          <CategorySection
            key={cat.key}
            category={cat}
            items={filteredItems.filter((i) => i.category === cat.key)}
            onEdit={setEditItem}
            onDelete={setDeleteItem}
            onRestock={openPelengkapPurchase}
          />
        ))
      )}

      {/* ═══════ Dialogs ═══════ */}
      {showCreate && (
        <AccessoryFormDialog
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={handleSaved}
        />
      )}
      {editItem && (
        <AccessoryFormDialog
          mode="edit"
          initial={editItem}
          onClose={() => setEditItem(null)}
          onSaved={handleSaved}
        />
      )}
      {restockItem && (
        <RestockDialog
          item={restockItem}
          onClose={() => setRestockItem(null)}
          onSaved={handleSaved}
        />
      )}
      {deleteItem && (
        <DeleteConfirmDialog
          item={deleteItem}
          onClose={() => setDeleteItem(null)}
          onDeleted={handleSaved}
        />
      )}
    </motion.div>
  );
}
