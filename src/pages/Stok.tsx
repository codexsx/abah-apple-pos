// Feature: stock-source-of-truth + stock-integrity
// Stock management page for DR HTM POS. Loads live stock items from Supabase,
// groups them by lifecycle status, and lets staff edit status inline. The
// Cek Integritas tab runs pure client-side anomaly checks over the catalog.

import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  Smartphone,
  Plug,
  Cpu,
  ShieldCheck,
  ChevronDown,
  Loader2,
  RotateCcw,
  Play,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Copy,
} from 'lucide-react';
import {
  getStockItems,
  updateStockStatus,
  moveStockUnitStatus,
  type StockItem,
} from '@/services/stock';
import { getAccessories, type Accessory } from '@/services/accessories';
import { getSpareparts, type Sparepart } from '@/services/spareparts';
import { STOCK_STATUSES, type StockStatus } from '@/services/stockCore';
import {
  runStockIntegrityCheck,
  type IntegrityResult,
} from '@/services/stockIntegrity';
import StatusEditor from '@/components/StatusEditor';

/* ──────────────────────────────── easing */
const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];
const easeOutExpo = [0.19, 1, 0.22, 1] as [number, number, number, number];

/* ──────────────────────────────── stagger variants */
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easeSmooth } },
};

/* ──────────────────────────────── types */
type TabId = 'hp' | 'pelengkap' | 'sparepart' | 'integritas';

/* ──────────────────────────────── helpers */
function formatPrice(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID');
}

function ColorDot({ color, size = 8 }: { color: string; size?: number }) {
  const colorMap: Record<string, string> = {
    Black: '#1a1a1a',
    'Space Black': '#1c1c1e',
    Graphite: '#333333',
    Midnight: '#1a1a2e',
    White: '#f5f5f5',
    Starlight: '#f0ece6',
    Silver: '#c0c0c0',
    Gold: '#d4af37',
    Yellow: '#f5d547',
    Blue: '#4a90d9',
    'Pacific Blue': '#2e5c8a',
    'Sierra Blue': '#a8c8ec',
    'Alpine Green': '#4a7c59',
    Green: '#4a7c59',
    'Midnight Green': '#2d3a2e',
    Purple: '#b19cd9',
    'Deep Purple': '#6b4c8a',
    Pink: '#f8c8dc',
    Red: '#dc2626',
    Coral: '#ff7f50',
    PRODUCTRED: '#dc2626',
    'Natural Titanium': '#c4b5a0',
    'Blue Titanium': '#5b7d9a',
    'White Titanium': '#e8e3d9',
    'Black Titanium': '#3a3a3a',
    'Space Gray': '#535b62',
    Orange: '#f97316',
  };
  return (
    <span
      className="inline-block rounded-full border border-slate-300 shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: colorMap[color] || '#94A3B8',
      }}
    />
  );
}

function StatusBadge({ status }: { status: StockStatus }) {
  const config: Record<string, { bg: string; text: string }> = {
    READY: { bg: 'bg-[#F0FDFA]', text: 'text-[#0D9488]' },
    SERVIS: { bg: 'bg-[#F5F3FF]', text: 'text-[#8B5CF6]' },
    KANIBAL: { bg: 'bg-[#FFF1F2]', text: 'text-[#F43F5E]' },
    RUSAK: { bg: 'bg-[#FFFBEB]', text: 'text-[#B45309]' },
    TERJUAL: { bg: 'bg-slate-100', text: 'text-slate-500' },
  };
  const c = config[status] ?? { bg: 'bg-slate-100', text: 'text-slate-500' };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.04em] ${c.bg} ${c.text}`}
    >
      {status}
    </span>
  );
}

function LevelBadge({ status }: { status: 'AMAN' | 'MENIPIS' | 'HABIS' }) {
  const config = {
    AMAN: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    MENIPIS: 'bg-amber-50 text-amber-700 border-amber-100',
    HABIS: 'bg-rose-50 text-rose-700 border-rose-100',
  }[status];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${config}`}>
      {status}
    </span>
  );
}

function deriveLevelStatus(stock: number, minStock: number): 'AMAN' | 'MENIPIS' | 'HABIS' {
  if (stock <= 0) return 'HABIS';
  if (stock <= minStock) return 'MENIPIS';
  return 'AMAN';
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 font-mono text-[20px] font-bold text-slate-900">{value}</p>
    </div>
  );
}

/* ──────────────────────────────── TAB: Stok HP */
function TabStokHP({ searchQuery }: { searchQuery: string }) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateErrors, setUpdateErrors] = useState<Record<string, string>>({});

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStockItems();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat stok');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.model.toLowerCase().includes(q) ||
        item.capacity.toLowerCase().includes(q) ||
        item.color.toLowerCase().includes(q) ||
        item.condition.toLowerCase().includes(q) ||
        (item.imei ?? '').toLowerCase().includes(q),
    );
  }, [items, searchQuery]);

  const grouped = useMemo(() => {
    const map = new Map<StockStatus, StockItem[]>();
    for (const status of STOCK_STATUSES) {
      map.set(status, []);
    }
    for (const item of filteredItems) {
      const bucket = map.get(item.status);
      if (bucket) bucket.push(item);
      else {
        // Defensive: an unknown status still gets a bucket.
        map.set(item.status, [item]);
      }
    }
    return map;
  }, [filteredItems]);

  const handleStatusChange = useCallback(
    async (id: string, target: StockStatus) => {
      setUpdatingId(id);
      setUpdateErrors((prev) => ({ ...prev, [id]: '' }));
      try {
        const current = items.find((item) => item.id === id);
        if (current && !current.has_imei && current.count > 1 && target !== current.status) {
          const affected = await moveStockUnitStatus(id, target);
          setItems((prev) => {
            const byId = new Map(prev.map((item) => [item.id, item]));
            for (const row of affected) byId.set(row.id, row);
            return Array.from(byId.values()).filter((item) => item.count > 0);
          });
        } else {
          const updated = await updateStockStatus(id, target);
          setItems((prev) =>
            prev.map((item) => (item.id === id ? updated : item)),
          );
        }
      } catch {
        setUpdateErrors((prev) => ({
          ...prev,
          [id]: 'Gagal memperbarui status. Silakan coba lagi.',
        }));
      } finally {
        setUpdatingId(null);
      }
    },
    [items],
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 size={36} className="text-teal-500 animate-spin" />
        <p className="text-[14px] text-slate-500 mt-4">Memuat stok...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="text-center py-16">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 mb-4 mx-auto">
          <AlertCircle size={28} />
        </div>
        <p className="text-[15px] font-medium text-slate-700">Gagal memuat stok</p>
        <p className="text-[12px] text-slate-400 mt-1 max-w-sm mx-auto">{error}</p>
        <button
          onClick={fetchItems}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-semibold text-[13px] h-10 px-5"
        >
          <RotateCcw size={14} />
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries())
        .filter(([, bucket]) => bucket.length > 0)
        .map(([status, bucket]) => (
          <StatusSection
            key={status}
            status={status}
            items={bucket}
            defaultOpen={status === 'READY'}
            searchQuery={searchQuery}
            updatingId={updatingId}
            updateErrors={updateErrors}
            onStatusChange={handleStatusChange}
          />
        ))}

      {items.length === 0 && (
        <div className="text-center py-16">
          <Smartphone size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-[15px] font-medium text-slate-500">Belum ada unit stok</p>
        </div>
      )}
    </div>
  );
}

interface StatusSectionProps {
  status: StockStatus;
  items: StockItem[];
  defaultOpen?: boolean;
  searchQuery: string;
  updatingId: string | null;
  updateErrors: Record<string, string>;
  onStatusChange: (id: string, target: StockStatus) => void;
}

function StatusSection({
  status,
  items,
  defaultOpen = true,
  updatingId,
  updateErrors,
  onStatusChange,
}: StatusSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const filtered = useMemo(() => {
    // Parent already filters by search; keep this defensive.
    return items;
  }, [items]);

  const titleMap: Record<string, string> = {
    READY: 'READY - Siap Jual',
    SERVIS: 'Sedang Servis',
    KANIBAL: 'Donor Kanibal',
    RUSAK: 'Rusak',
    TERJUAL: 'Terjual',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: easeSmooth }}
      className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden mb-3"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-slate-900">
                {titleMap[status] ?? status}
              </span>
              <StatusBadge status={status} />
            </div>
            <span className="text-[12px] text-slate-500">{filtered.length} unit</span>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3, ease: easeSmooth }}
        >
          <ChevronDown size={18} className="text-slate-400" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: easeSmooth }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100">
              {filtered.map((item, idx) => (
                <motion.div
                  key={item.id}
                  role="listitem"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03, duration: 0.3, ease: easeSmooth }}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                      <Smartphone size={16} className="text-slate-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-slate-900 truncate">
                          {item.model}
                        </span>
                        <span className="text-[12px] text-slate-500">{item.capacity}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[12px] text-slate-500 flex-wrap">
                        <ColorDot color={item.color} size={7} />
                        <span>{item.color}</span>
                        <span className="text-slate-300">|</span>
                        <span>{item.condition}</span>
                        <span className="text-slate-300">|</span>
                        <span className="font-mono text-[11px]">
                          {item.has_imei && item.imei ? item.imei : 'Tanpa IMEI'}
                        </span>
                        {!item.has_imei && item.count > 1 && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span className="font-mono text-[11px]">{item.count} pcs</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 text-right shrink-0 ml-0 sm:ml-3">
                    <div className="flex items-center gap-4">
                      {item.cost_price > 0 && (
                        <div>
                          <p className="text-[10px] text-slate-400">Modal</p>
                          <p className="font-mono text-[12px] font-medium text-slate-700">
                            {formatPrice(item.cost_price)}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-slate-400">Jual</p>
                        <p className="font-mono text-[12px] font-medium text-slate-700">
                          {item.price > 0 ? formatPrice(item.price) : '—'}
                        </p>
                      </div>
                    </div>
                    <div className="min-w-[240px]">
                      {updatingId === item.id ? (
                        <div className="flex items-center justify-end gap-2 text-[12px] text-slate-500">
                          <Loader2 size={14} className="animate-spin" />
                          Memperbarui...
                        </div>
                      ) : (
                        <StatusEditor
                          value={item.status}
                          onSelect={(target) => onStatusChange(item.id, target)}
                        />
                      )}
                      {updateErrors[item.id] && (
                        <p className="text-[11px] text-rose-600 mt-1">{updateErrors[item.id]}</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
              {filtered.length === 0 && (
                <div className="text-center py-6 text-slate-400 text-[13px]">
                  Tidak ada unit dalam kategori ini.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ──────────────────────────────── TAB: Pelengkap (placeholder) */
function TabPelengkap() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Accessory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getAccessories());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat stok pelengkap.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const totalStock = items.reduce((sum, item) => sum + item.stock, 0);
    const totalValue = items.reduce((sum, item) => sum + item.stock * item.price, 0);
    return {
      totalStock,
      totalValue,
      habis: items.filter((item) => item.status === 'HABIS').length,
      menipis: items.filter((item) => item.status === 'MENIPIS').length,
      aman: items.filter((item) => item.status === 'AMAN').length,
      attention: items.filter((item) => item.status !== 'AMAN').slice(0, 6),
    };
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
              <Plug size={20} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold text-slate-900">Ringkasan Pelengkap</h2>
              <p className="text-[13px] text-slate-500">Charger, tempered glass, case, kotak, dan paperbag.</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/stok/pelengkap')}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700"
          >
            Buka Kelola Pelengkap
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-36 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-card">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-card">
          <AlertCircle size={28} className="mx-auto mb-2 text-rose-500" />
          <p className="text-[14px] font-semibold text-slate-800">Gagal memuat pelengkap</p>
          <p className="mt-1 text-[12px] text-slate-500">{error}</p>
          <button
            onClick={() => void load()}
            className="mt-4 rounded-xl bg-slate-100 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-200"
          >
            Coba Lagi
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryMetric label="Jenis Item" value={items.length.toLocaleString('id-ID')} />
            <SummaryMetric label="Total Stok" value={`${summary.totalStock.toLocaleString('id-ID')} pcs`} />
            <SummaryMetric label="Nilai Stok" value={formatPrice(summary.totalValue)} />
            <SummaryMetric label="Menipis" value={summary.menipis.toLocaleString('id-ID')} />
            <SummaryMetric label="Habis" value={summary.habis.toLocaleString('id-ID')} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-slate-900">Perlu Dicek</h3>
              <span className="text-[12px] text-emerald-600">{summary.aman} aman</span>
            </div>
            {summary.attention.length === 0 ? (
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-700">
                Semua pelengkap berada di level aman.
              </div>
            ) : (
              <div className="space-y-2">
                {summary.attention.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-[13px] font-semibold text-slate-800">{item.name}</p>
                      <p className="text-[11px] text-slate-500">Minimum {item.min_stock.toLocaleString('id-ID')} pcs</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[13px] font-bold text-slate-900">{item.stock.toLocaleString('id-ID')} pcs</span>
                      <LevelBadge status={item.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ──────────────────────────────── TAB: Sparepart (placeholder) */
function TabSparepart() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Sparepart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getSpareparts());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat stok sparepart.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const withStatus = items.map((item) => ({
      ...item,
      status: deriveLevelStatus(item.stock, item.min_stock),
    }));
    const totalStock = items.reduce((sum, item) => sum + item.stock, 0);
    const totalValue = items.reduce((sum, item) => sum + item.stock * item.buy_price, 0);
    return {
      totalStock,
      totalValue,
      habis: withStatus.filter((item) => item.status === 'HABIS').length,
      menipis: withStatus.filter((item) => item.status === 'MENIPIS').length,
      aman: withStatus.filter((item) => item.status === 'AMAN').length,
      attention: withStatus.filter((item) => item.status !== 'AMAN').slice(0, 6),
    };
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-purple-50 p-2.5 text-purple-600">
              <Cpu size={20} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold text-slate-900">Ringkasan Sparepart</h2>
              <p className="text-[13px] text-slate-500">Sparepart servis berdasarkan stok dan batas minimum.</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/stok/sparepart')}
            className="rounded-xl bg-purple-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-purple-700"
          >
            Buka Kelola Sparepart
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-36 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-card">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-card">
          <AlertCircle size={28} className="mx-auto mb-2 text-rose-500" />
          <p className="text-[14px] font-semibold text-slate-800">Gagal memuat sparepart</p>
          <p className="mt-1 text-[12px] text-slate-500">{error}</p>
          <button
            onClick={() => void load()}
            className="mt-4 rounded-xl bg-slate-100 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-200"
          >
            Coba Lagi
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryMetric label="Jenis Item" value={items.length.toLocaleString('id-ID')} />
            <SummaryMetric label="Total Stok" value={`${summary.totalStock.toLocaleString('id-ID')} pcs`} />
            <SummaryMetric label="Nilai Modal" value={formatPrice(summary.totalValue)} />
            <SummaryMetric label="Menipis" value={summary.menipis.toLocaleString('id-ID')} />
            <SummaryMetric label="Habis" value={summary.habis.toLocaleString('id-ID')} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-slate-900">Perlu Dicek</h3>
              <span className="text-[12px] text-emerald-600">{summary.aman} aman</span>
            </div>
            {summary.attention.length === 0 ? (
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-700">
                Semua sparepart berada di level aman.
              </div>
            ) : (
              <div className="space-y-2">
                {summary.attention.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-[13px] font-semibold text-slate-800">{item.name}</p>
                      <p className="text-[11px] text-slate-500">{item.compatible_type || 'Universal'} · minimum {item.min_stock.toLocaleString('id-ID')} pcs</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[13px] font-bold text-slate-900">{item.stock.toLocaleString('id-ID')} pcs</span>
                      <LevelBadge status={item.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ──────────────────────────────── TAB: Cek Integritas */
function TabIntegritas() {
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanComplete, setScanComplete] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IntegrityResult | null>(null);

  const steps = [
    'Memuat data stok...',
    'Mengecek duplikat IMEI...',
    'Mengecek anomali unit...',
    'Selesai',
  ];

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  const clearScanInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const finalizeScan = useCallback(
    (nextResult: IntegrityResult | null, errMessage?: string) => {
      clearScanInterval();
      if (!isMountedRef.current) return;
      setProgress(100);
      setCurrentStep(3);
      setIsScanning(false);
      setScanComplete(true);
      if (errMessage) {
        setError(errMessage);
        setResult(null);
      } else {
        setError(null);
        setResult(nextResult);
      }
    },
    [clearScanInterval],
  );

  const startScan = useCallback(async () => {
    clearScanInterval();
    setIsScanning(true);
    setProgress(0);
    setScanComplete(false);
    setCurrentStep(0);
    setError(null);
    setResult(null);

    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        const next = prev + 2;
        if (next < 30) setCurrentStep(0);
        else if (next < 60) setCurrentStep(1);
        else setCurrentStep(2);
        return next;
      });
    }, 80);

    try {
      const items = await getStockItems();
      const checkResult = runStockIntegrityCheck(items, STOCK_STATUSES);
      finalizeScan(checkResult);
    } catch (err) {
      finalizeScan(
        null,
        err instanceof Error ? err.message : 'Gagal memeriksa integritas stok',
      );
    }
  }, [clearScanInterval, finalizeScan]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearScanInterval();
    };
  }, [clearScanInterval]);

  const issuesFound = result
    ? result.duplicateImeis.length + result.problematicUnits.length
    : 0;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-4"
    >
      <motion.div
        variants={itemVariants}
        className="bg-white rounded-2xl border border-slate-200 shadow-card p-6"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[18px] font-semibold text-slate-900">Cek Integritas Stok</h2>
            <p className="text-[13px] text-slate-500 mt-0.5">
              Deteksi anomali: IMEI ganda, status tidak valid, IMEI hilang, dan count negatif.
            </p>
          </div>
          {!isScanning && !scanComplete && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={startScan}
              className="flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-teal-600 transition-colors shadow-md shadow-teal-500/20"
            >
              <Play size={16} />
              Jalankan Pemeriksaan
            </motion.button>
          )}
        </div>

        <AnimatePresence>
          {isScanning && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 space-y-4"
            >
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-teal-500 rounded-full"
                  style={{ width: `${progress}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-slate-600 font-medium">
                  {steps[currentStep]}
                </span>
                <span className="font-mono text-[13px] text-teal-600 font-semibold">
                  {progress}%
                </span>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                {steps.map((step, i) => (
                  <div key={step} className="flex items-center gap-1.5">
                    <motion.div
                      animate={{
                        scale: i === currentStep && i < 3 ? [1, 1.2, 1] : 1,
                        backgroundColor: i <= currentStep ? '#14B8A6' : '#E2E8F0',
                      }}
                      transition={{
                        repeat: i === currentStep && i < 3 ? Infinity : 0,
                        duration: 1,
                      }}
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                    >
                      {i < currentStep || (i === 3 && progress >= 100) ? (
                        <CheckCircle2 size={12} className="text-white" />
                      ) : (
                        <span className="text-[9px] text-white font-bold">{i + 1}</span>
                      )}
                    </motion.div>
                    <span
                      className={`text-[11px] ${
                        i <= currentStep ? 'text-teal-700 font-medium' : 'text-slate-400'
                      }`}
                    >
                      {step}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex justify-center py-4">
                <div className="relative w-28 h-28">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#E2E8F0" strokeWidth="6" />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#14B8A6"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 40}
                      strokeDashoffset={2 * Math.PI * 40 * (1 - progress / 100)}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-mono text-[20px] font-bold text-teal-600">
                      {progress}%
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && !isScanning && (
          <div className="mt-4 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 p-4 text-[13px]">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle size={16} />
              Gagal memeriksa integritas
            </div>
            <p className="mt-1 text-rose-500">{error}</p>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {scanComplete && result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3"
          >
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 border-l-4"
              style={{ borderLeftColor: issuesFound > 0 ? '#F59E0B' : '#10B981' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] text-slate-500">Hasil Pemeriksaan</p>
                  <p className="font-mono text-[28px] font-bold text-slate-900">
                    {result.totalScanned}{' '}
                    <span className="text-[14px] text-slate-400 font-normal">unit discan</span>
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold ${
                      issuesFound > 0
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {issuesFound > 0 ? (
                      <>
                        <AlertTriangle size={13} /> Perlu perhatian
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={13} /> Stok bersih
                      </>
                    )}
                  </span>
                  <p className="text-[12px] text-slate-400 mt-1">{issuesFound} masalah ditemukan</p>
                </div>
              </div>
            </motion.div>

            {result.problematicUnits.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 15, x: 0 }}
                animate={{ opacity: 1, y: 0, x: [0, -2, 2, -2, 2, 0] }}
                transition={{ delay: 0.2, x: { duration: 0.3 } }}
                className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 border-l-4 border-l-rose-500"
              >
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle size={16} className="text-rose-500" />
                  <h3 className="text-[16px] font-semibold text-slate-900">Unit Bermasalah</h3>
                  <span className="ml-auto font-mono text-[22px] font-bold text-rose-500">
                    {result.problematicUnits.length}
                  </span>
                </div>
                <p className="text-[12px] text-slate-500 mb-3">
                  Status tidak valid, IMEI hilang, atau count negatif
                </p>
                {result.problematicUnits.map((issue, idx) => {
                  const item = issue.item;
                  const label =
                    issue.type === 'invalid-status'
                      ? 'Status tidak valid'
                      : issue.type === 'missing-imei'
                      ? 'IMEI hilang'
                      : 'Count negatif';
                  return (
                    <div
                      key={`${item.id}-${idx}`}
                      className="flex items-center justify-between p-3 rounded-xl bg-rose-50 border border-rose-100 mb-2 last:mb-0"
                    >
                      <div>
                        <p className="text-[13px] font-medium text-slate-800">
                          {item.model} {item.capacity}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {item.color} • {item.condition} • {item.imei ?? 'Tanpa IMEI'}
                        </p>
                        <p className="text-[11px] text-rose-600 font-medium mt-0.5">{label}</p>
                      </div>
                      <span className="text-[11px] px-2.5 py-1 rounded-lg bg-white text-slate-600 border border-slate-200 font-mono">
                        {item.status} • {item.count}
                      </span>
                    </div>
                  );
                })}
              </motion.div>
            )}

            {result.duplicateImeis.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 15, x: 0 }}
                animate={{ opacity: 1, y: 0, x: [0, -2, 2, -2, 2, 0] }}
                transition={{ delay: 0.3, x: { duration: 0.3 } }}
                className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 border-l-4 border-l-amber-500"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Copy size={16} className="text-amber-500" />
                  <h3 className="text-[16px] font-semibold text-slate-900">IMEI Ganda</h3>
                  <span className="ml-auto font-mono text-[22px] font-bold text-amber-500">
                    {result.duplicateImeis.length}
                  </span>
                </div>
                <p className="text-[12px] text-slate-500 mb-3">IMEI yang terdaftar lebih dari sekali</p>
                {result.duplicateImeis.map((issue) => (
                  <div
                    key={issue.imei}
                    className="p-3 rounded-xl bg-amber-50 border border-amber-100 mb-2 last:mb-0"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="font-mono text-[12px] text-slate-700 tracking-wider">
                        {issue.imei}
                      </p>
                      <span className="text-[11px] px-2 py-0.5 rounded-lg bg-white text-amber-700 border border-amber-200 font-medium">
                        {issue.count} record
                      </span>
                    </div>
                    <div className="space-y-1">
                      {issue.items.map((item) => (
                        <div key={item.id} className="text-[11px] text-slate-600">
                          • {item.model} {item.capacity} — {item.color} — {item.status}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {issuesFound === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 text-center"
              >
                <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-3" />
                <p className="text-[15px] font-medium text-slate-700">Tidak ditemukan anomali stok</p>
                <p className="text-[12px] text-slate-400 mt-1">
                  Semua unit memiliki IMEI unik, status valid, dan count non-negatif.
                </p>
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex justify-center pt-2"
            >
              <button
                onClick={startScan}
                className="flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-teal-600 transition-colors shadow-md shadow-teal-500/20"
              >
                <Play size={16} />
                Jalankan Ulang
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ═════════════════════════════════════════════════════════
   MAIN PAGE
   ═════════════════════════════════════════════════════════ */
export default function Stok() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('hp');
  const [search, setSearch] = useState('');

  const tabs: {
    id: TabId;
    label: string;
    icon: React.ComponentType<{ size?: number }>;
  }[] = [
    { id: 'hp', label: 'Stok HP', icon: Smartphone },
    { id: 'pelengkap', label: 'Pelengkap', icon: Plug },
    { id: 'sparepart', label: 'Sparepart', icon: Cpu },
    { id: 'integritas', label: 'Cek Integritas', icon: ShieldCheck },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: easeOutExpo }}
      className="pb-8"
    >
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => navigate('/')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-display text-[36px] text-slate-900 leading-tight tracking-tight">
            Stok & Inventaris
          </h1>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between ml-12 gap-3">
          <p className="text-[14px] text-slate-500">Kelola semua aset toko.</p>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari IMEI, model, atau kategori..."
              className="h-10 w-full sm:w-[280px] rounded-xl border border-slate-300 bg-white pl-9 pr-4 text-[14px] text-slate-700 transition-colors duration-200 focus:outline-none focus:ring-[3px] focus:ring-teal-500/10 focus:border-teal-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-1 mb-6">
        <div className="flex overflow-x-auto">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-5 py-3 rounded-xl text-[14px] font-medium transition-colors shrink-0 whitespace-nowrap ${
                  active ? 'text-white' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="stok-tab-pill"
                    className="absolute inset-0 bg-teal-500 rounded-xl shadow-md shadow-teal-500/25"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10">
                  <Icon size={15} />
                </span>
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'hp' && <TabStokHP searchQuery={search} />}
          {activeTab === 'pelengkap' && <TabPelengkap />}
          {activeTab === 'sparepart' && <TabSparepart />}
          {activeTab === 'integritas' && <TabIntegritas />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
