import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  User,
  Phone,
  Calendar,
  Smartphone,
  HardDrive,
  Tag,
  Palette,
  Hash,
  BatteryMedium,
  Search,
  X,
  RotateCcw,
  Save,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Store,
  Shield,
  Package,
  Plug,
  ShoppingBag,
  SmartphoneIcon,
  Plus,
  Banknote,
} from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { getStockItems, type StockItem } from '@/services/stock';
import AccountPicker from '@/components/AccountPicker';
import PresetOrCustomSelect from '@/components/PresetOrCustomSelect';
import {
  getAccountPickerData,
  type AccountWithBalance,
} from '@/services/accounts';
import {
  deriveTukarTambahDirectionAndAmount,
  buildPostings,
  validatePaymentSelection,
} from '@/services/paymentPosting';
import { recordTukarTambahWithPostings } from '@/services/postings';
import { UNIT_CONDITION_OPTIONS } from '@/services/unitConditions';

/* ──────────────────────────────── easing tokens */
const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];
const easeOutExpo = [0.19, 1, 0.22, 1] as [number, number, number, number];

/* ──────────────────────────────── stagger variants */
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easeSmooth } },
};

const fieldVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeSmooth } },
};

/* ──────────────────────────────── types */
interface HPMasuk {
  tipe: string;
  kapasitas: string;
  kondisi: string;
  warna: string;
  imei: string;
  batteryHealth: number;
  appraisal: number;
}

interface HPKeluar {
  id: string;
  model: string;
  capacity: string;
  condition: string;
  color: string;
  imei: string;
  price: number;
}

interface AccessoryItem {
  id: string;
  name: string;
  price: number;
}

type SupabaseErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

function getTukarTambahSaveErrorMessage(error: unknown): string {
  const dbError = (error ?? {}) as SupabaseErrorLike;
  const code = typeof dbError.code === 'string' ? dbError.code : '';
  const message = [
    typeof dbError.message === 'string' ? dbError.message : '',
    typeof dbError.details === 'string' ? dbError.details : '',
  ].join(' ').toLowerCase();

  if (
    code === '23505' &&
    (
      message.includes('stock_items_active_imei_unique') ||
      message.includes('stock_items_imei_unique') ||
      message.includes('(imei)')
    )
  ) {
    return 'IMEI HP masuk sudah tercatat sebagai stok aktif. Periksa IMEI atau status unit di menu Stok.';
  }

  if (code === '42501') {
    return 'Akun ini tidak memiliki izin untuk menyimpan Tukar Tambah.';
  }

  if (
    (code === 'P0001' || code === 'P0002') &&
    message.includes('stock item') &&
    message.includes('not found')
  ) {
    return 'Unit HP keluar sudah tidak tersedia. Muat ulang stok lalu pilih unit kembali.';
  }

  if (code === '23503') {
    return 'Akun kas/bank atau unit stok sudah tidak tersedia. Muat ulang halaman lalu coba kembali.';
  }

  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Koneksi ke server terputus. Periksa internet lalu coba kembali.';
  }

  return 'Transaksi tidak dapat disimpan. Silakan coba lagi.';
}

/* ──────────────────────────────── constants */
const TIPE_OPTIONS = [
  'iPhone 8 Plus', 'iPhone SE Gen 2', 'iPhone SE Gen 3',
  'iPhone X', 'iPhone XS', 'iPhone XS Max', 'iPhone XR',
  'iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max',
  'iPhone 12 Mini',
  'iPhone 12', 'iPhone 12 Pro', 'iPhone 12 Pro Max',
  'iPhone 13', 'iPhone 13 Pro', 'iPhone 13 Pro Max',
  'iPhone 14', 'iPhone 14 Pro', 'iPhone 14 Pro Max',
  'iPhone 15', 'iPhone 15 Pro', 'iPhone 15 Pro Max',
  'iPhone 16', 'iPhone 16 Pro', 'iPhone 16 Pro Max',
  'iPhone 17', 'iPhone 17 Pro', 'iPhone 17 Pro Max',
];

const KAPASITAS_OPTIONS = ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB'];

const KONDISI_OPTIONS = UNIT_CONDITION_OPTIONS;

const WARNA_MAP: Record<string, string[]> = {
  'iPhone 11': ['Black', 'White', 'Green', 'Yellow', 'Purple', 'Red'],
  'iPhone 11 Pro': ['Space Gray', 'Silver', 'Gold', 'Midnight Green'],
  'iPhone 11 Pro Max': ['Space Gray', 'Silver', 'Gold', 'Midnight Green'],
  'iPhone 12 Mini': ['Black', 'White', 'Blue', 'Green', 'Purple', 'Red'],
  'iPhone 12': ['Black', 'White', 'Blue', 'Green', 'Purple', 'Red'],
  'iPhone 12 Pro': ['Graphite', 'Silver', 'Gold', 'Pacific Blue'],
  'iPhone 12 Pro Max': ['Graphite', 'Silver', 'Gold', 'Pacific Blue'],
  'iPhone 13': ['Midnight', 'Starlight', 'Blue', 'Pink', 'Green', 'Red'],
  'iPhone 13 Pro': ['Graphite', 'Gold', 'Silver', 'Sierra Blue', 'Alpine Green'],
  'iPhone 13 Pro Max': ['Graphite', 'Gold', 'Silver', 'Sierra Blue', 'Alpine Green'],
  'iPhone 14': ['Midnight', 'Starlight', 'Blue', 'Purple', 'Yellow', 'Red'],
  'iPhone 14 Pro': ['Space Black', 'Silver', 'Gold', 'Deep Purple'],
  'iPhone 14 Pro Max': ['Space Black', 'Silver', 'Gold', 'Deep Purple'],
  'iPhone 15': ['Black', 'Blue', 'Green', 'Yellow', 'Pink'],
  'iPhone 15 Pro': ['Natural Titanium', 'Blue Titanium', 'White Titanium', 'Black Titanium'],
  'iPhone 15 Pro Max': ['Natural Titanium', 'Blue Titanium', 'White Titanium', 'Black Titanium'],
  'iPhone X': ['Space Gray', 'Silver'],
  'iPhone XS': ['Space Gray', 'Silver', 'Gold'],
  'iPhone XS Max': ['Space Gray', 'Silver', 'Gold'],
  'iPhone XR': ['Black', 'White', 'Red', 'Blue', 'Coral', 'Yellow'],
  'iPhone 8 Plus': ['Space Gray', 'Silver', 'Gold', 'Red'],
  'iPhone SE Gen 2': ['Black', 'White', 'Red'],
  'iPhone SE Gen 3': ['Midnight', 'Starlight', 'Red'],
};

const GARANSI_OPTIONS = [
  '7 Hari',
  '30 Hari',
  '60 Hari',
  '90 Hari',
  '6 Bulan',
  '1 Tahun',
];

/* ──────────────────────────────── color dot helper */
function ColorDot({ color, size = 8 }: { color: string; size?: number }) {
  const colorMap: Record<string, string> = {
    'Black': '#1a1a1a', 'Space Black': '#1c1c1e', 'Graphite': '#333333', 'Midnight': '#1a1a2e',
    'White': '#f5f5f5', 'Starlight': '#f0ece6', 'Silver': '#c0c0c0',
    'Gold': '#d4af37', 'Yellow': '#f5d547',
    'Blue': '#4a90d9', 'Pacific Blue': '#2e5c8a', 'Sierra Blue': '#a8c8ec', 'Alpine Green': '#4a7c59',
    'Green': '#4a7c59', 'Midnight Green': '#2d3a2e',
    'Purple': '#b19cd9', 'Deep Purple': '#6b4c8a', 'Pink': '#f8c8dc',
    'Red': '#dc2626', 'Coral': '#ff7f50',
    'Natural Titanium': '#c4b5a0', 'Blue Titanium': '#5b7d9a', 'White Titanium': '#e8e3d9', 'Black Titanium': '#3a3a3a',
    'Space Gray': '#535b62', 'Orange': '#f97316',
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

/* ──────────────────────────────── price formatter */
function formatPrice(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID');
}

function parseRupiahInput(value: string): number {
  return parseInt(value.replace(/\./g, '').replace(/,/g, '') || '0', 10) || 0;
}

function formatRupiahInput(value: string): string {
  const numeric = value.replace(/\D/g, '');
  if (!numeric) return '';
  return parseInt(numeric, 10).toLocaleString('id-ID');
}

/* ──────────────────────────────── Visual Flow Indicator */
function FlowIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: easeSmooth }}
      className="flex flex-col items-center gap-1 py-2"
    >
      <svg width="320" height="80" viewBox="0 0 320 80" className="max-w-full">
        {/* HP Masuk: Customer → Toko */}
        <rect x="10" y="10" width="100" height="32" rx="8" fill="#F1F5F9" stroke="#334155" strokeWidth="1.5" />
        <text x="60" y="31" textAnchor="middle" fill="#334155" fontSize="11" fontWeight="600" fontFamily="Inter, sans-serif">CUSTOMER</text>

        <motion.line
          x1="120" y1="26" x2="190" y2="26"
          stroke="#14B8A6" strokeWidth="2" strokeDasharray="6 4"
          animate={{ strokeDashoffset: [0, -20] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        />
        <polygon points="188,21 198,26 188,31" fill="#14B8A6" />

        <text x="159" y="20" textAnchor="middle" fill="#0F766E" fontSize="9" fontWeight="600" fontFamily="Inter, sans-serif">HP Lama</text>

        <rect x="210" y="10" width="100" height="32" rx="8" fill="#F0FDFA" stroke="#14B8A6" strokeWidth="1.5" />
        <text x="260" y="31" textAnchor="middle" fill="#0F766E" fontSize="11" fontWeight="600" fontFamily="Inter, sans-serif">TOKO</text>

        {/* HP Keluar: Toko → Customer */}
        <line x1="260" y1="42" x2="260" y2="52" stroke="#CBD5E1" strokeWidth="1" />
        <line x1="60" y1="52" x2="60" y2="42" stroke="#CBD5E1" strokeWidth="1" />
        <line x1="60" y1="52" x2="260" y2="52" stroke="#CBD5E1" strokeWidth="1" />

        <rect x="210" y="56" width="100" height="32" rx="8" fill="#F0FDFA" stroke="#14B8A6" strokeWidth="1.5" />
        <text x="260" y="77" textAnchor="middle" fill="#0F766E" fontSize="11" fontWeight="600" fontFamily="Inter, sans-serif">TOKO</text>

        <motion.line
          x1="120" y1="72" x2="190" y2="72"
          stroke="#D4A574" strokeWidth="2" strokeDasharray="6 4"
          animate={{ strokeDashoffset: [0, 20] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        />
        <polygon points="112,67 122,72 112,77" fill="#D4A574" />

        <text x="159" y="84" textAnchor="middle" fill="#B45309" fontSize="9" fontWeight="600" fontFamily="Inter, sans-serif">HP Baru</text>

        <rect x="10" y="56" width="100" height="32" rx="8" fill="#F1F5F9" stroke="#334155" strokeWidth="1.5" />
        <text x="60" y="77" textAnchor="middle" fill="#334155" fontSize="11" fontWeight="600" fontFamily="Inter, sans-serif">CUSTOMER</text>
      </svg>
    </motion.div>
  );
}

/* ──────────────────────────────── Battery Health Slider */
function BatterySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const getTrackColor = (v: number) => {
    if (v < 30) return { bg: '#FFF1F2', fill: '#F43F5E' };
    if (v < 70) return { bg: '#FFFBEB', fill: '#F59E0B' };
    return { bg: '#ECFDF5', fill: '#10B981' };
  };
  const colors = getTrackColor(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ColorDot color={value < 30 ? '#F43F5E' : value < 70 ? '#F59E0B' : '#10B981'} size={10} />
          <span className="font-mono text-[14px] font-semibold" style={{ color: colors.fill }}>
            {value}%
          </span>
        </div>
        <span className="text-[11px] text-slate-400">
          {value < 30 ? 'Buruk' : value < 70 ? 'Cukup' : 'Baik'}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${colors.fill} 0%, ${colors.fill} ${value}%, ${colors.bg} ${value}%, ${colors.bg} 100%)`,
          accentColor: colors.fill,
        }}
      />
    </div>
  );
}

/* ──────────────────────────────── IMEI Input with Validation */
function IMEIInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [touched, setTouched] = useState(false);
  const isValid = /^\d{15}$/.test(value);

  const getBorderColor = () => {
    if (!touched && !value) return 'border-slate-300';
    if (isValid) return 'border-emerald-500';
    if (value.length > 0) return 'border-amber-400';
    return 'border-slate-300';
  };

  const getIcon = () => {
    if (isValid) return <CheckCircle2 size={16} className="text-emerald-500" />;
    if (value.length > 0 && value.length < 15) return <AlertCircle size={16} className="text-amber-400" />;
    return null;
  };

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em]">
        <Hash size={13} strokeWidth={2} />
        IMEI (15 DIGIT) <span className="text-rose-500">*</span>
      </label>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          maxLength={15}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
          onBlur={() => setTouched(true)}
          placeholder="123456789012345"
          className={`w-full h-11 rounded-xl border ${getBorderColor()} bg-white px-3 pr-16 font-mono text-[14px] tracking-[0.04em] transition-colors duration-200 focus:outline-none focus:ring-[3px] focus:ring-teal-500/10 focus:border-teal-500`}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          <span className="text-[11px] font-mono text-slate-400">{value.length}/15</span>
          {getIcon()}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────── Dropdown Select */
function FormSelect({
  label,
  icon: Icon,
  value,
  onChange,
  options,
  required,
  placeholder = 'Pilih...',
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em]">
        <Icon size={13} strokeWidth={2} />
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 pr-8 text-[14px] text-slate-700 appearance-none cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-[3px] focus:ring-teal-500/10 focus:border-teal-500"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );
}

/* ──────────────────────────────── Price Input */
function PriceInput({
  label,
  icon: Icon,
  value,
  onChange,
  required,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  value: number;
  onChange: (v: number) => void;
  required?: boolean;
}) {
  const formatRupiah = (n: number) => {
    if (!n) return '';
    return 'Rp ' + n.toLocaleString('id-ID');
  };

  const parseRupiah = (s: string) => {
    const num = Number(s.replace(/[^0-9]/g, ''));
    return isNaN(num) ? 0 : num;
  };

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em]">
        <Icon size={13} strokeWidth={2} />
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <input
        type="text"
        inputMode="numeric"
        value={formatRupiah(value)}
        onChange={(e) => onChange(parseRupiah(e.target.value))}
        placeholder="Rp 0"
        className="w-full h-11 rounded-xl border border-slate-300 bg-white px-4 font-mono text-[14px] text-slate-700 transition-colors duration-200 focus:outline-none focus:ring-[3px] focus:ring-teal-500/10 focus:border-teal-500"
      />
    </div>
  );
}

/* ──────────────────────────────── Checkbox Item */
function CheckboxItem({
  label,
  checked,
  onChange,
  icon: Icon,
  count,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2.5 rounded-xl border-2 px-4 py-3 text-left transition-all duration-200 ${
        checked
          ? 'border-teal-500 bg-teal-50/50'
          : 'border-slate-200 hover:border-slate-300 bg-white'
      }`}
    >
      <div
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-200 ${
          checked
            ? 'border-teal-500 bg-teal-500 text-white'
            : 'border-slate-300'
        }`}
      >
        {checked && (
          <motion.svg
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </motion.svg>
        )}
      </div>
      <span style={{ color: checked ? '#0D9488' : '#64748B' }}><Icon size={16} /></span>
      <span className={`text-[14px] ${checked ? 'font-medium text-slate-900' : 'text-slate-600'}`}>
        {label}
      </span>
      {count !== undefined && (
        <span className={`ml-auto text-[12px] font-mono ${checked ? 'text-teal-600' : 'text-slate-400'}`}>
          ({count})
        </span>
      )}
    </button>
  );
}

/* ═════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═════════════════════════════════════════════════════════ */
export default function TukarTambah() {
  const navigate = useNavigate();

  /* ── form state ── */
  const [namaKonsumen, setNamaKonsumen] = useState('');
  const [noWhatsapp, setNoWhatsapp] = useState('');
  const [tanggalTransaksi, setTanggalTransaksi] = useState(() => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  });

  /* ── HP Masuk state ── */
  const [hpMasuk, setHpMasuk] = useState<HPMasuk>({
    tipe: '',
    kapasitas: '',
    kondisi: '',
    warna: '',
    imei: '',
    batteryHealth: 85,
    appraisal: 0,
  });

  /* ── HP Keluar state ── */
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHpKeluar, setSelectedHpKeluar] = useState<HPKeluar | null>(null);

  /* ── live READY stock for HP Keluar (replaces the old mock list) ── */
  const [stockRows, setStockRows] = useState<StockItem[]>([]);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockReloadKey, setStockReloadKey] = useState(0);

  /* ── Garansi & Box state ── */
  const [garansi, setGaransi] = useState('');
  const [charger, setCharger] = useState(false);
  const [paperbag, setPaperbag] = useState(true);
  const [temperedGlass, setTemperedGlass] = useState(false);
  const [phoneCase, setPhoneCase] = useState(false);
  const [kotak, setKotak] = useState(false);
  const [klaimGaransiServis, setKlaimGaransiServis] = useState(false);

  /* ── Aktivasi IMEI & Aksesoris state ── */
  const [aktivasiImei, setAktivasiImei] = useState('');
  const [accessoryItems, setAccessoryItems] = useState<AccessoryItem[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');

  /* ── Perhitungan state ── */
  const [cash, setCash] = useState(0);
  const [transfer, setTransfer] = useState(0);

  /* ── Account selection (Phase 2 ledger wiring) ── */
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [cashAccount, setCashAccount] = useState<AccountWithBalance | null>(null);
  const [transferAccount, setTransferAccount] = useState<AccountWithBalance | null>(null);

  /* ── Save lifecycle ── */
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    getAccountPickerData()
      .then((data) => {
        if (active) setAccounts(data);
      })
      .catch(() => {
        // Picker simply shows its empty-state if accounts can't be loaded.
      });
    return () => {
      active = false;
    };
  }, []);

  /* ── load REAL READY stock for HP Keluar (and on retry/after save) ── */
  useEffect(() => {
    let cancelled = false;
    setStockLoading(true);
    setStockError(null);
    getStockItems()
      .then((rows) => {
        if (cancelled) return;
        setStockRows(rows.filter((r) => r.status === 'READY'));
        setStockLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setStockRows([]);
        setStockError('Gagal memuat stok. Silakan coba lagi.');
        setStockLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stockReloadKey]);

  /* ── reset ── */
  const handleReset = () => {
    setNamaKonsumen('');
    setNoWhatsapp('');
    setTanggalTransaksi(new Date().toISOString().split('T')[0]);
    setHpMasuk({ tipe: '', kapasitas: '', kondisi: '', warna: '', imei: '', batteryHealth: 85, appraisal: 0 });
    setSelectedHpKeluar(null);
    setSearchQuery('');
    setCash(0);
    setTransfer(0);
    setCashAccount(null);
    setTransferAccount(null);
    setSaveError(null);
    setGaransi('');
    setCharger(false);
    setPaperbag(true);
    setTemperedGlass(false);
    setPhoneCase(false);
    setKotak(false);
    setKlaimGaransiServis(false);
    setAktivasiImei('');
    setAccessoryItems([]);
    setNewItemName('');
    setNewItemPrice('');
    setShowAddItem(false);
  };

  /* ── accessory items handlers ── */
  const handleAddItem = () => {
    const price = parseRupiahInput(newItemPrice);
    if (!newItemName.trim() || price <= 0) return;
    setAccessoryItems((prev) => [
      ...prev,
      { id: `item-${Date.now()}`, name: newItemName.trim(), price },
    ]);
    setNewItemName('');
    setNewItemPrice('');
    setShowAddItem(false);
  };

  const handleRemoveItem = (id: string) => {
    setAccessoryItems((prev) => prev.filter((item) => item.id !== id));
  };

  /* ── derived values ── */
  const aktivasiImeiNum = parseRupiahInput(aktivasiImei);
  const hpKeluarTotal = (selectedHpKeluar?.price || 0) + aktivasiImeiNum;
  const selisih = hpKeluarTotal - hpMasuk.appraisal;
  const absSelisih = Math.abs(selisih);
  const totalBayar = cash + transfer;
  // Selisih === 0 → no money moves, no payment/account required (Req 6.6, 7.8).
  const paymentRequired = selisih !== 0;
  // Portions must sum to |Selisih| when payment is required; otherwise no
  // payment is expected (Req 2.6, 5.4, 7.9).
  const isPaymentMatch = paymentRequired ? totalBayar === absSelisih : true;
  // A non-zero portion needs its matching account chosen (Req 1.1, 1.2).
  const cashNeedsAccount = paymentRequired && cash > 0 && !cashAccount;
  const transferNeedsAccount = paymentRequired && transfer > 0 && !transferAccount;
  const isFormValid =
    namaKonsumen.trim() !== '' &&
    tanggalTransaksi !== '' &&
    hpMasuk.tipe !== '' &&
    hpMasuk.kapasitas !== '' &&
    hpMasuk.kondisi !== '' &&
    hpMasuk.warna !== '' &&
    hpMasuk.imei.length === 15 &&
    hpMasuk.appraisal > 0 &&
    selectedHpKeluar !== null &&
    garansi !== '' &&
    isPaymentMatch &&
    !cashNeedsAccount &&
    !transferNeedsAccount;

  /* ── persist transaction + ledger postings (Phase 2) ── */
  const handleSave = async () => {
    if (!isFormValid || saving) return;
    setSaveError(null);
    setSaveSuccess(false);

    // Direction/amount derive from the sign of Selisih; null when Selisih === 0
    // (no posting, but the transaction is still recorded — Req 6.6, 7.8).
    const derived = deriveTukarTambahDirectionAndAmount(selisih);

    let postings: ReturnType<typeof buildPostings> = [];
    if (derived !== null) {
      // Validate the payment selection before any persistence (Req 4.x).
      const validation = validatePaymentSelection({
        cashPortion: cash,
        cashAccountType: cashAccount?.type ?? null,
        transferPortion: transfer,
        transferAccountType: transferAccount?.type ?? null,
        requiresPayment: true,
      });
      if (!validation.ok) {
        setSaveError(validation.message);
        return;
      }
      // The split portions must settle exactly the |Selisih| amount.
      if (cash + transfer !== derived.amount) {
        setSaveError('Jumlah pembayaran harus sama dengan selisih.');
        return;
      }
      postings = buildPostings(derived.direction, {
        cashPortion: cash,
        cashAccountId: cashAccount?.id ?? null,
        transferPortion: transfer,
        transferAccountId: transferAccount?.id ?? null,
      });
    }

    const payload = {
      konsumen: { nama: namaKonsumen, whatsapp: noWhatsapp },
      tanggal: tanggalTransaksi,
      hpMasuk,
      hpKeluar: selectedHpKeluar,
      garansi,
      kelengkapan: kelengkapanItems,
      klaimGaransiServis,
      aktivasiImei: aktivasiImeiNum,
      accessoryItems,
      payment: { cash, transfer },
      selisih,
    };

    const description =
      `${hpMasuk.tipe} ${hpMasuk.kapasitas} → ` +
      `${selectedHpKeluar?.model ?? ''} ${selectedHpKeluar?.capacity ?? ''}`.trim();

    setSaving(true);
    try {
      await recordTukarTambahWithPostings({
        type: 'Tukar Tambah',
        description,
        detail: JSON.stringify(payload),
        amount: absSelisih,
        postings,
        // HP Keluar unit sold to the customer -> TERJUAL (count>1 decrements).
        sellStockId: selectedHpKeluar!.id,
        // HP Masuk trade-in becomes a new READY stock row; appraisal is its
        // initial cost basis (editable later via Stok HP).
        newItem: {
          model: hpMasuk.tipe,
          capacity: hpMasuk.kapasitas,
          condition: hpMasuk.kondisi,
          color: hpMasuk.warna,
          imei: hpMasuk.imei,
          price: hpMasuk.appraisal,
          count: 1,
        },
      });
      setSaveSuccess(true);
      handleReset();
      // Reload READY stock so the just-sold HP Keluar (now TERJUAL) drops out
      // and the new trade-in unit appears.
      setStockReloadKey((k) => k + 1);
    } catch (error) {
      setSaveError(getTukarTambahSaveErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  /* ── kelengkapan status ── */
  const kelengkapanItems: string[] = [];
  if (charger) kelengkapanItems.push('Charger');
  if (paperbag) kelengkapanItems.push('Paperbag');
  if (temperedGlass) kelengkapanItems.push('Tempered Glass');
  if (phoneCase) kelengkapanItems.push('Case');
  if (kotak) kelengkapanItems.push('Kotak');

  /* ── available stock for HP Keluar (live READY rows) ── */
  const availableStock = stockRows.filter((s) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const searchable = [
      s.model,
      s.capacity,
      s.color,
      s.condition,
      s.imei ?? '',
    ].join(' ').toLowerCase();
    return searchable.includes(q);
  });

  /* ── warna options ── */
  const warnaOptions = hpMasuk.tipe ? (WARNA_MAP[hpMasuk.tipe] || []) : [];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="pb-8"
    >
      {/* ═══════ Page Header ═══════ */}
      <motion.div variants={itemVariants} className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => navigate('/')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-display text-[36px] text-slate-900 leading-tight tracking-tight">
            Tukar Tambah
          </h1>
        </div>
        <div className="flex items-center gap-3 ml-12">
          <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden max-w-[200px]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '20%' }}
              transition={{ duration: 0.8, ease: easeOutExpo, delay: 0.3 }}
              className="h-full bg-teal-500 rounded-full"
            />
          </div>
          <span className="font-mono text-[13px] text-slate-500">1 / 5</span>
        </div>
        <p className="mt-2 ml-12 text-[14px] text-slate-500">
          Transaksi tukar tambah HP — customer ke toko.
        </p>
      </motion.div>

      {/* ═══════ Visual Flow Indicator ═══════ */}
      <FlowIndicator />

      {/* ═══════ Section 1: Detail Konsumen ═══════ */}
      <motion.div
        variants={itemVariants}
        className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 mb-4"
      >
        <h2 className="text-[18px] font-semibold text-slate-900 mb-4">Detail Konsumen</h2>
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <motion.div variants={fieldVariants}>
            <label className="flex items-center gap-1 text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
              <User size={13} strokeWidth={2} />
              Nama Konsumen <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={namaKonsumen}
              onChange={(e) => setNamaKonsumen(e.target.value)}
              placeholder="Pak Bambang"
              className="w-full h-11 rounded-xl border border-slate-300 bg-white px-4 text-[14px] text-slate-700 transition-colors duration-200 focus:outline-none focus:ring-[3px] focus:ring-teal-500/10 focus:border-teal-500"
            />
          </motion.div>

          <motion.div variants={fieldVariants}>
            <label className="flex items-center gap-1 text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
              <Phone size={13} strokeWidth={2} />
              No. WhatsApp
            </label>
            <input
              type="tel"
              inputMode="tel"
              value={noWhatsapp}
              onChange={(e) => setNoWhatsapp(e.target.value.replace(/\D/g, ''))}
              placeholder="6281234567890"
              className="w-full h-11 rounded-xl border border-slate-300 bg-white px-4 text-[14px] text-slate-700 transition-colors duration-200 focus:outline-none focus:ring-[3px] focus:ring-teal-500/10 focus:border-teal-500"
            />
          </motion.div>

          <motion.div variants={fieldVariants}>
            <label className="flex items-center gap-1 text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
              <Calendar size={13} strokeWidth={2} />
              Tanggal Transaksi <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              value={tanggalTransaksi}
              onChange={(e) => setTanggalTransaksi(e.target.value)}
              className="w-full h-11 rounded-xl border border-slate-300 bg-white px-4 text-[14px] text-slate-700 transition-colors duration-200 focus:outline-none focus:ring-[3px] focus:ring-teal-500/10 focus:border-teal-500"
            />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* ═══════ Section 2: HP Masuk ═══════ */}
      <motion.div
        variants={itemVariants}
        className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 mb-4"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-[11px] font-semibold text-teal-700">
            CUSTOMER <ArrowRight size={11} strokeWidth={2.5} /> TOKO
          </span>
        </div>
        <h2 className="text-[18px] font-semibold text-slate-900 mt-2">HP Masuk (dari Customer)</h2>
        <p className="text-[13px] text-slate-500 mt-0.5 mb-4">
          Spesifikasi HP yang diberikan customer + harga appraisal toko. IMEI wajib 15 digit.
        </p>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <motion.div variants={fieldVariants}>
            <PresetOrCustomSelect
              label="Tipe HP"
              icon={Smartphone}
              value={hpMasuk.tipe}
              onChange={(v) => setHpMasuk((p) => ({ ...p, tipe: v, warna: '' }))}
              options={TIPE_OPTIONS}
              placeholder="Pilih tipe HP"
              customLabel="Tipe custom / seri baru"
              customPlaceholder="Contoh: iPhone 17 Pro, Samsung S24 Ultra"
              inputAriaLabel="Tipe HP masuk custom"
              required
            />
          </motion.div>

          <motion.div variants={fieldVariants}>
            <PresetOrCustomSelect
              label="Kapasitas"
              icon={HardDrive}
              value={hpMasuk.kapasitas}
              onChange={(v) => setHpMasuk((p) => ({ ...p, kapasitas: v }))}
              options={KAPASITAS_OPTIONS}
              placeholder="Pilih kapasitas"
              customLabel="Kapasitas custom"
              customPlaceholder="Contoh: 32GB, 2TB, WiFi Only"
              inputAriaLabel="Kapasitas HP masuk custom"
              required
            />
          </motion.div>

          <motion.div variants={fieldVariants}>
            <FormSelect
              label="Kondisi"
              icon={Tag}
              value={hpMasuk.kondisi}
              onChange={(v) => setHpMasuk((p) => ({ ...p, kondisi: v }))}
              options={KONDISI_OPTIONS}
              required
            />
          </motion.div>

          <motion.div variants={fieldVariants}>
            <PresetOrCustomSelect
              label="Warna"
              icon={Palette}
              value={hpMasuk.warna}
              onChange={(v) => setHpMasuk((p) => ({ ...p, warna: v }))}
              options={warnaOptions}
              required
              placeholder={hpMasuk.tipe ? 'Pilih warna...' : 'Pilih tipe HP dulu'}
              customLabel="Warna custom"
              customPlaceholder="Contoh: Desert Titanium, Navy, Black"
              inputAriaLabel="Warna HP masuk custom"
              disabled={!hpMasuk.tipe}
            />
          </motion.div>

          <motion.div variants={fieldVariants} className="md:col-span-2">
            <IMEIInput
              value={hpMasuk.imei}
              onChange={(v) => setHpMasuk((p) => ({ ...p, imei: v }))}
            />
          </motion.div>

          <motion.div variants={fieldVariants}>
            <label className="flex items-center gap-1 text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-2">
              <BatteryMedium size={13} strokeWidth={2} />
              Battery Health (0-100) <span className="text-rose-500">*</span>
            </label>
            <BatterySlider
              value={hpMasuk.batteryHealth}
              onChange={(v) => setHpMasuk((p) => ({ ...p, batteryHealth: v }))}
            />
          </motion.div>

          <motion.div variants={fieldVariants}>
            <PriceInput
              label="Appraisal Toko"
              icon={Tag}
              value={hpMasuk.appraisal}
              onChange={(v) => setHpMasuk((p) => ({ ...p, appraisal: v }))}
              required
            />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* ═══════ Section 3: HP Keluar ═══════ */}
      <motion.div
        variants={itemVariants}
        className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 mb-4"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-light px-3 py-1 text-[11px] font-semibold text-gold border border-gold/20">
            TOKO <ArrowRight size={11} strokeWidth={2.5} /> CUSTOMER
          </span>
        </div>
        <h2 className="text-[18px] font-semibold text-slate-900 mt-2">HP Keluar (ke Customer)</h2>
        <p className="text-[13px] text-slate-500 mt-0.5 mb-4">
          Pilih unit dari stok toko untuk customer.
        </p>

        {/* Search bar */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari tipe / kapasitas / warna / IMEI..."
            className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-9 pr-4 text-[14px] text-slate-700 transition-colors duration-200 focus:outline-none focus:ring-[3px] focus:ring-teal-500/10 focus:border-teal-500"
          />
        </div>

        {/* Selected unit */}
        <AnimatePresence>
          {selectedHpKeluar && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 overflow-hidden"
            >
              <div className="flex items-center gap-2 p-3 rounded-xl bg-teal-50 border border-teal-200">
                <CheckCircle2 size={16} className="text-teal-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-teal-800 truncate">
                    {selectedHpKeluar.model} {selectedHpKeluar.capacity} — {selectedHpKeluar.condition}
                  </p>
                  <p className="text-[12px] text-teal-600 font-mono">{selectedHpKeluar.imei}</p>
                </div>
                <span className="font-mono text-[14px] font-semibold text-teal-700">
                  {formatPrice(selectedHpKeluar.price)}
                </span>
                <button
                  onClick={() => setSelectedHpKeluar(null)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-100 text-teal-600 hover:bg-teal-200 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stock list */}
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {stockLoading ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
              <Loader2 size={28} className="text-teal-500 animate-spin mb-2" />
              <p className="text-[14px] text-slate-500">Memuat stok…</p>
            </div>
          ) : stockError ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 p-8 text-center">
              <AlertCircle size={28} className="text-red-500 mb-2" />
              <p className="text-[14px] text-red-700 mb-3">{stockError}</p>
              <button
                onClick={() => setStockReloadKey((k) => k + 1)}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-red-600 transition-colors"
              >
                <RotateCcw size={14} /> Coba Lagi
              </button>
            </div>
          ) : (
            <>
              <AnimatePresence mode="popLayout">
                {availableStock.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ delay: idx * 0.04, duration: 0.3, ease: easeSmooth }}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                  selectedHpKeluar?.id === item.id
                    ? 'border-teal-300 bg-teal-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
                onClick={() =>
                  setSelectedHpKeluar({
                    id: item.id,
                    model: item.model,
                    capacity: item.capacity,
                    condition: item.condition,
                    color: item.color,
                    imei: item.imei ?? '',
                    price: item.price,
                  })
                }
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                  <Smartphone size={18} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-900 truncate">
                    {item.model} {item.capacity}
                  </p>
                  <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
                    <ColorDot color={item.color} size={7} />
                    <span>{item.color}</span>
                    <span className="text-slate-300 mx-1">|</span>
                    <span>{item.condition}</span>
                  </div>
                  {item.imei && (
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                      IMEI: {item.imei}
                    </p>
                  )}
                </div>
                <span className="font-mono text-[13px] font-semibold text-slate-700 shrink-0">
                  {formatPrice(item.price)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedHpKeluar({
                      id: item.id,
                      model: item.model,
                      capacity: item.capacity,
                      condition: item.condition,
                      color: item.color,
                      imei: item.imei ?? '',
                      price: item.price,
                    });
                  }}
                  className="shrink-0 rounded-lg bg-teal-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-teal-600 transition-colors"
                >
                  Pilih
                </button>
              </motion.div>
                ))}
              </AnimatePresence>
              {availableStock.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-[13px]">
                  Tidak ada stok yang cocok dengan pencarian.
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>

      {/* ═══════ Section 4: Garansi & Box ═══════ */}
      <motion.div
        variants={itemVariants}
        className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 mb-4"
      >
        <h2 className="text-[18px] font-semibold text-slate-900 mb-1">Garansi & Box</h2>
        <p className="text-[13px] text-slate-500 mb-4">
          Tier garansi yang diberikan ke customer + status kotak/aksesoris untuk HP Keluar.
        </p>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-4"
        >
          {/* Garansi dropdown */}
          <motion.div variants={fieldVariants}>
            <FormSelect
              label="Garansi"
              icon={Shield}
              value={garansi}
              onChange={setGaransi}
              options={GARANSI_OPTIONS}
              required
              placeholder="Pilih tier garansi..."
            />
          </motion.div>

          {/* Status Kotak & Aksesoris */}
          <motion.div variants={fieldVariants}>
            <label className="flex items-center gap-1 text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-3">
              <Package size={13} strokeWidth={2} />
              STATUS KOTAK & AKSESORIS (HP KELUAR) <span className="text-rose-500">*</span>
            </label>

            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-slate-400 mb-2">
                Aksesoris
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <CheckboxItem
                  label="Charger"
                  checked={charger}
                  onChange={setCharger}
                  icon={Plug}
                  count={24}
                />
                <CheckboxItem
                  label="Paperbag"
                  checked={paperbag}
                  onChange={setPaperbag}
                  icon={ShoppingBag}
                  count={316}
                />
                <CheckboxItem
                  label="Tempered Glass"
                  checked={temperedGlass}
                  onChange={setTemperedGlass}
                  icon={SmartphoneIcon}
                  count={666}
                />
                <CheckboxItem
                  label="Case"
                  checked={phoneCase}
                  onChange={setPhoneCase}
                  icon={Package}
                />
              </div>

              <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-slate-400 mt-3 mb-2">
                Kotak
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <CheckboxItem
                  label="Kotak"
                  checked={kotak}
                  onChange={setKotak}
                  icon={Package}
                  count={686}
                />
              </div>
            </div>

            {/* Kelengkapan status */}
            <AnimatePresence mode="wait">
              <motion.div
                key={kelengkapanItems.join(',')}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className={`mt-3 px-4 py-2.5 rounded-xl text-[13px] font-medium ${
                  kelengkapanItems.length > 0
                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                    : 'bg-amber-light text-amber border border-amber/20'
                }`}
              >
                Kelengkapan: {kelengkapanItems.length > 0 ? kelengkapanItems.join(', ') : 'Belum ada yang dipilih'}
              </motion.div>
            </AnimatePresence>
          </motion.div>

          {/* Klaim garansi servis checkbox */}
          <motion.div variants={fieldVariants} className="pt-2">
            <button
              type="button"
              onClick={() => setKlaimGaransiServis((v) => !v)}
              className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50 transition-colors w-full text-left"
            >
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-200 ${
                  klaimGaransiServis
                    ? 'border-teal-500 bg-teal-500 text-white'
                    : 'border-slate-300'
                }`}
              >
                {klaimGaransiServis && (
                  <motion.svg
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </motion.svg>
                )}
              </div>
              <div>
                <p className="text-[14px] font-medium text-slate-700">
                  Customer klaim garansi servis
                </p>
                <p className="text-[12px] text-slate-500">Subsidi diterapkan</p>
              </div>
            </button>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* ═══════ Section 5: Aktivasi IMEI & Aksesoris ═══════ */}
      <motion.div
        variants={itemVariants}
        className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 mb-4"
      >
        <h2 className="text-[18px] font-semibold text-slate-900 mb-1">Aktivasi IMEI & Aksesoris</h2>
        <p className="text-[13px] text-slate-500 mb-4">
          Aktivasi IMEI ikut total selisih, tetapi laporan keuangan memisahkannya dari penjualan HP.
        </p>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-4"
        >
          {/* Aktivasi IMEI */}
          <motion.div variants={fieldVariants}>
            <label className="flex items-center gap-1 text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
              <Banknote size={13} strokeWidth={2} />
              AKTIVASI IMEI (OPSIONAL)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 font-mono">
                Rp
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={aktivasiImei ? formatRupiahInput(aktivasiImei) : ''}
                onChange={(e) => setAktivasiImei(formatRupiahInput(e.target.value))}
                placeholder="0"
                className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-10 pr-4 font-mono text-[14px] text-slate-700 transition-colors duration-200 focus:outline-none focus:ring-[3px] focus:ring-teal-500/10 focus:border-teal-500"
              />
            </div>
          </motion.div>

          {/* Aksesoris / Item Berbayar */}
          <motion.div variants={fieldVariants}>
            <label className="flex items-center gap-1 text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-3">
              <Package size={13} strokeWidth={2} />
              AKSESORIS / ITEM BERBAYAR
            </label>

            <AnimatePresence>
              {accessoryItems.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 mb-3"
                >
                  {accessoryItems.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200"
                    >
                      <span className="text-[14px] text-slate-700">{item.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[14px] font-semibold text-slate-700">
                          Rp {item.price.toLocaleString('id-ID')}
                        </span>
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-500 hover:bg-rose-200 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showAddItem ? (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="rounded-xl border border-slate-200 p-4 bg-slate-50/50"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                        NAMA ITEM
                      </label>
                      <input
                        type="text"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        placeholder="Nama aksesoris / item"
                        className="w-full h-11 rounded-xl border border-slate-300 bg-white px-4 text-[14px] outline-none transition-all duration-200 font-body focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                        HARGA
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 font-mono">
                          Rp
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={newItemPrice ? formatRupiahInput(newItemPrice) : ''}
                          onChange={(e) => setNewItemPrice(formatRupiahInput(e.target.value))}
                          placeholder="0"
                          className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-10 pr-4 font-mono text-[14px] text-slate-700 transition-colors duration-200 focus:outline-none focus:ring-[3px] focus:ring-teal-500/10 focus:border-teal-500"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={handleAddItem}
                      disabled={!newItemName.trim() || parseRupiahInput(newItemPrice) <= 0}
                      className="rounded-lg bg-teal-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-teal-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Tambah
                    </button>
                    <button
                      onClick={() => {
                        setShowAddItem(false);
                        setNewItemName('');
                        setNewItemPrice('');
                      }}
                      className="rounded-lg bg-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-300 transition-colors"
                    >
                      Batal
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  type="button"
                  onClick={() => setShowAddItem(true)}
                  className="flex items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-[14px] font-medium text-slate-500 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50/30 transition-all w-full justify-center"
                >
                  <Plus size={16} />
                  Tambah Item
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* ═══════ Section 6: Perhitungan ═══════ */}
      <motion.div
        variants={itemVariants}
        className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 mb-4"
      >
        <h2 className="text-[18px] font-semibold text-slate-900 mb-4">Perhitungan</h2>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <span className="text-[14px] text-slate-500 flex items-center gap-2">
              <Store size={14} />
              HP Masuk (Appraisal)
            </span>
            <span className="font-mono text-[16px] font-semibold text-slate-700">
              {formatPrice(hpMasuk.appraisal)}
            </span>
          </div>

          <div className="flex items-center justify-between py-2">
            <span className="text-[14px] text-slate-500 flex items-center gap-2">
              <Smartphone size={14} />
              HP Keluar (Harga Jual)
            </span>
            <span className="font-mono text-[16px] font-semibold text-slate-700">
              {formatPrice(selectedHpKeluar?.price || 0)}
            </span>
          </div>

          {aktivasiImeiNum > 0 && (
            <div className="flex items-center justify-between py-2">
              <span className="text-[14px] text-slate-500 flex items-center gap-2">
                <Banknote size={14} />
                Aktivasi IMEI
              </span>
              <span className="font-mono text-[16px] font-semibold text-cyan-700">
                {formatPrice(aktivasiImeiNum)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between py-2">
            <span className="text-[14px] font-semibold text-slate-600">
              Total Keluar
            </span>
            <span className="font-mono text-[16px] font-bold text-slate-900">
              {formatPrice(hpKeluarTotal)}
            </span>
          </div>

          <div className="h-px bg-slate-200" />

          <motion.div
            className="flex items-center justify-between py-3 px-4 rounded-xl bg-slate-50 border border-slate-200"
            animate={{
              backgroundColor: selisih > 0 ? '#F0FDFA' : selisih < 0 ? '#FFF1F2' : '#F8FAFC',
              borderColor: selisih > 0 ? '#99F6E4' : selisih < 0 ? '#FECDD3' : '#E2E8F0',
            }}
            transition={{ duration: 0.3 }}
          >
            <span className="text-[14px] font-semibold text-slate-700">
              {selisih >= 0 ? 'Selisih (Bayar Customer)' : 'Selisih (Toko Bayar Customer)'}
            </span>
            <motion.span
              className={`font-mono text-[20px] font-bold ${selisih < 0 ? 'text-rose-600' : 'text-teal-600'}`}
              key={selisih}
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3, ease: easeSmooth }}
            >
              {formatPrice(Math.abs(selisih))}
            </motion.span>
          </motion.div>

          {/* Payment section */}
          <div className="pt-4 space-y-3">
            <h3 className="text-[14px] font-semibold text-slate-700">Pembayaran</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <PriceInput label="Cash" icon={Tag} value={cash} onChange={setCash} />
              <PriceInput label="Transfer" icon={Tag} value={transfer} onChange={setTransfer} />
            </div>

            {/* Payment match indicator */}
            <AnimatePresence mode="wait">
              {paymentRequired && (
                <motion.div
                  key={isPaymentMatch ? 'lunas' : totalBayar < absSelisih ? 'kurang' : 'lebih'}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className={`flex items-center gap-2 text-[13px] font-medium px-3 py-2 rounded-lg ${
                    isPaymentMatch
                      ? 'bg-emerald-light text-emerald'
                      : totalBayar < absSelisih
                        ? 'bg-amber-light text-amber'
                        : 'bg-rose-light text-rose'
                  }`}
                >
                  {isPaymentMatch ? (
                    <>
                      <CheckCircle2 size={15} />
                      {selisih > 0
                        ? 'Lunas — Pembayaran sesuai selisih'
                        : 'Sesuai — Pembayaran toko sesuai selisih'}
                    </>
                  ) : totalBayar < absSelisih ? (
                    <>
                      <AlertCircle size={15} />
                      Kurang: {formatPrice(absSelisih - totalBayar)}
                    </>
                  ) : (
                    <>
                      <AlertCircle size={15} />
                      Lebih: {formatPrice(totalBayar - absSelisih)}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Account selection for non-zero payment portions (Req 8.4, 8.5) */}
            {paymentRequired && (cash > 0 || transfer > 0) && (
              <div className="mt-4 space-y-4">
                {cash > 0 && (
                  <AccountPicker
                    label={selisih > 0 ? 'Akun Kas (porsi cash diterima)' : 'Akun Kas (porsi cash dibayar)'}
                    filterType="Cash"
                    accounts={accounts}
                    value={cashAccount?.id ?? null}
                    onChange={(_, account) => {
                      setCashAccount(account);
                      setSaveError(null);
                    }}
                  />
                )}
                {transfer > 0 && (
                  <AccountPicker
                    label={selisih > 0 ? 'Akun Bank (porsi transfer diterima)' : 'Akun Bank (porsi transfer dibayar)'}
                    filterType="Bank"
                    accounts={accounts}
                    value={transferAccount?.id ?? null}
                    onChange={(_, account) => {
                      setTransferAccount(account);
                      setSaveError(null);
                    }}
                  />
                )}
              </div>
            )}

            {saveError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-500" />
                <span>{saveError}</span>
              </motion.div>
            )}

            {saveSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-700"
              >
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                <span>Tukar Tambah berhasil disimpan.</span>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ═══════ Bottom Action Bar (custom, not using shared Footer) ═══════ */}
      <motion.div
        initial={{ y: 72, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3, ease: easeSmooth }}
        className="fixed bottom-0 left-0 right-0 z-50 h-[72px] border-t border-slate-200 bg-white shadow-bottom-bar"
      >
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <div>
            <p className="text-[12px] text-slate-500">Tukar Tambah</p>
            <motion.p
              className={`font-mono text-[18px] font-bold ${selisih < 0 ? 'text-rose-600' : 'text-teal-600'}`}
              key={selisih}
              initial={{ scale: 1.05 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              {selisih < 0 ? 'Toko bayar: ' : 'Customer bayar: '}
              {formatPrice(Math.abs(selisih))}
            </motion.p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-200 active:scale-[0.98]"
            >
              <RotateCcw size={14} />
              Reset
            </button>
            <button
              disabled={!isFormValid || saving}
              onClick={handleSave}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-semibold transition-all active:scale-[0.98] ${
                isFormValid && !saving
                  ? 'bg-teal-500 text-white hover:bg-teal-600 shadow-md shadow-teal-500/20'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Save size={16} />
              {saving ? 'Menyimpan...' : 'Simpan Tukar Tambah'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
