import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Users,
  Store,
  ShieldCheck,
  Monitor,
  Banknote,
  ChevronDown,
  User,
  Search,
  X,
  Check,
  Wrench,
  Play,
  CheckCircle2,
  Package,
  Clock,
  AlertTriangle,
  Edit3,
} from 'lucide-react';
import {
  type ServiceStatus,
  type ServiceType,
  type Technician,
  type ServiceRecord as UiServiceRecord,
} from '@/data/mockData';
import {
  getServiceRecords,
  createServiceRecord,
  updateServiceRecord,
  recordServiceWithStockStatus,
  getServiceSparepartUsages,
  recordServiceSparepartUsage,
  updateServiceCostFields,
  type ServiceRecord as DbServiceRecord,
  type ServiceSparepartUsage,
} from '@/services/services';
import {
  getTechnicians,
  createTechnician,
  updateTechnician,
  type Technician as DbTechnician,
} from '@/services/technicians';
import {
  getStockItems,
  updateStockStatus,
  type StockItem,
} from '@/services/stock';
import AccountPicker from '@/components/AccountPicker';
import PresetOrCustomSelect from '@/components/PresetOrCustomSelect';
import {
  getAccountPickerData,
  type AccountWithBalance,
} from '@/services/accounts';
import {
  deriveDirection,
  buildPostings,
  validatePaymentSelection,
} from '@/services/paymentPosting';
import {
  recordTransactionWithPostings,
  recordWagePaymentWithPosting,
} from '@/services/postings';
import {
  getTransactionsWithStockDetailsByType,
  type TransactionWithStockDetails,
} from '@/services/transactions';
import { deserializeSaleDetail, type SaleDetail } from '@/services/finalization';
import { getSpareparts, type Sparepart } from '@/services/spareparts';
import { TransactionStaffBadge } from '@/components/TransactionStaffBadge';

/* ------------------------------------------------------------------ */
/*  DB -> UI service record mapper                                     */
/* ------------------------------------------------------------------ */

/**
 * UI service record. Extends the base mockData shape with the wage + pickup
 * fields now tracked on `service_records`. Defined locally (bukan di mockData)
 * supaya tidak perlu menyentuh file data.
 */
type ServiceRecordUi = UiServiceRecord & {
  workCost: number;
  wageAmount: number;
  wagePaid: boolean;
  pickedUp: boolean;
  pickedUpAt?: string;
  createdByStaff?: DbServiceRecord['created_by_staff'];
};

function dbToUiServiceRecord(r: DbServiceRecord): ServiceRecordUi {
  return {
    id: r.id,
    customerName: r.customer_name,
    phoneModel: r.phone_model,
    capacity: r.capacity,
    condition: r.condition,
    color: r.color,
    imei: r.imei,
    batteryHealth: r.battery_health ?? undefined,
    issue: r.issue,
    additionalNote: r.additional_note,
    status: r.status,
    estimatedCost: r.estimated_cost,
    dp: r.dp,
    createdAt: r.created_at,
    completedAt: r.completed_at ?? undefined,
    technician: (r.technician || undefined) as Technician | undefined,
    serviceType: r.service_type,
    stkId: r.stk_id,
    workCost: r.work_cost ?? r.estimated_cost ?? 0,
    wageAmount: r.wage_amount ?? 0,
    wagePaid: r.wage_paid ?? false,
    pickedUp: r.picked_up ?? false,
    pickedUpAt: r.picked_up_at ?? undefined,
    createdByStaff: r.created_by_staff ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
/* ------------------------------------------------------------------ */

const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];
const easeOutExpo = [0.19, 1, 0.22, 1] as [number, number, number, number];

const cardStagger = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.1, delayChildren: 0.5 },
  },
};

const cardItem = {
  hidden: { opacity: 0, y: 30 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: easeSmooth },
  },
};

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

const statusConfig: Record<
  ServiceStatus | 'SEMUA',
  { bg: string; text: string; border: string; label: string }
> = {
  SEMUA: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-400', label: 'SEMUA' },
  ANTRIAN: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-400', label: 'ANTRIAN' },
  PROSES: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-400', label: 'PROSES' },
  SELESAI: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400', label: 'SELESAI' },
  GAGAL: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-400', label: 'GAGAL' },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPrice(n: number) {
  return `Rp ${n.toLocaleString('id-ID')}`;
}

const DEFAULT_TECHNICIANS: Technician[] = ['Zaidan', 'Rendi', 'Fabio', 'Toko Lain'];
const SERVICE_TYPES: ServiceType[] = ['Customer', 'Toko Sendiri', 'Klaim Garansi'];

const phoneModels = [
  'iPhone 17 Pro Max', 'iPhone 17 Pro', 'iPhone 17',
  'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16',
  'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15',
  'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14',
  'iPhone 13 Pro Max', 'iPhone 13 Pro', 'iPhone 13',
  'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 12', 'iPhone 12 Mini',
  'iPhone 11 Pro Max', 'iPhone 11 Pro', 'iPhone 11',
  'iPhone XS Max', 'iPhone XS', 'iPhone XR', 'iPhone X',
  'iPhone SE Gen 3', 'iPhone SE Gen 2',
];
const capacities = ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB'];
const conditions = [
  'Second iBox',
  'Second Bea Cukai',
  'Second Inter',
  'Second Ex-Inter',
  'Second Bid',
  'Baru iBox',
  'Baru Inter',
];
const colors = ['Deep Purple', 'Space Black', 'Silver', 'Gold', 'Midnight', 'Starlight', 'Blue', 'Green', 'Red', 'Pink', 'Natural Titanium'];

/* ------------------------------------------------------------------ */
/*  Expand stock data for Toko Sendiri                                */
/* ------------------------------------------------------------------ */

interface ReadyUnit {
  realId: string;
  stkId: string;
  model: string;
  capacity: string;
  condition: string;
  color: string;
  imei: string;
  batteryHealth: number;
  entryDate: string;
  warnings: string[];
}

interface WarrantyClaimLookupRecord {
  transaction: TransactionWithStockDetails;
  unit: StockItem;
  customerName: string;
  customerPhone: string;
  purchaseDate: string;
  warranty: string;
  phoneModel: string;
  capacity: string;
  condition: string;
  color: string;
  imei: string;
  batteryHealth: number | null;
  salePrice: number;
}

function normalizeLookupText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPersistedStockUnit(unit: StockItem) {
  return uuidPattern.test(unit.id);
}

function findSaleDetailUnit(detail: SaleDetail, unit: StockItem, imei: string) {
  const normalizedImei = normalizeLookupText(imei);
  if (normalizedImei) {
    const byImei = detail.units.find((row) => normalizeLookupText(row.imei) === normalizedImei);
    if (byImei) return byImei;
  }

  return detail.units.find(
    (row) =>
      normalizeLookupText(row.model) === normalizeLookupText(unit.model) &&
      normalizeLookupText(row.capacity) === normalizeLookupText(unit.capacity) &&
      normalizeLookupText(row.condition) === normalizeLookupText(unit.condition) &&
      normalizeLookupText(row.color) === normalizeLookupText(unit.color),
  );
}

function buildWarrantyClaimLookupRecord(
  transaction: TransactionWithStockDetails,
  unit: StockItem,
  imei: string,
): WarrantyClaimLookupRecord {
  let detailUnit: ReturnType<typeof findSaleDetailUnit> | undefined;
  let customerName = '';
  let customerPhone = '';
  let warranty = '';

  try {
    const detail = deserializeSaleDetail(transaction.detail);
    detailUnit = findSaleDetailUnit(detail, unit, imei);
    customerName = detail.customer.name?.trim() || '';
    customerPhone = detail.customer.phone?.trim() || '';
    warranty = detail.warranty?.trim() || '';
  } catch {
    detailUnit = undefined;
  }

  return {
    transaction,
    unit,
    customerName,
    customerPhone,
    purchaseDate: transaction.created_at,
    warranty,
    phoneModel: detailUnit?.model || unit.model,
    capacity: detailUnit?.capacity || unit.capacity || '',
    condition: detailUnit?.condition || unit.condition || '',
    color: detailUnit?.color || unit.color || '',
    imei: detailUnit?.imei || unit.imei || imei,
    batteryHealth:
      typeof detailUnit?.batteryHealth === 'number'
        ? detailUnit.batteryHealth
        : unit.battery_health ?? null,
    salePrice: Number(detailUnit?.sellingPrice) || unit.price || Number(transaction.amount) || 0,
  };
}

function findSoldWarrantyClaim(
  transactions: TransactionWithStockDetails[],
  imei: string,
): WarrantyClaimLookupRecord | null {
  const normalizedImei = normalizeLookupText(imei);
  if (!normalizedImei) return null;

  for (const transaction of transactions) {
    const unit = transaction.stock_items.find(
      (item) =>
        isPersistedStockUnit(item) &&
        item.status === 'TERJUAL' &&
        normalizeLookupText(item.imei) === normalizedImei,
    );
    if (unit) return buildWarrantyClaimLookupRecord(transaction, unit, imei);
  }

  return null;
}

function getSoldWarrantyHints(transactions: TransactionWithStockDetails[]) {
  return transactions
    .flatMap((transaction) =>
      transaction.stock_items
        .filter(
          (item) =>
            isPersistedStockUnit(item) &&
            item.status === 'TERJUAL' &&
            Boolean(item.imei?.trim()),
        )
        .map((item) => ({
          id: `${transaction.id}:${item.id}`,
          imei: item.imei!.trim(),
          label: `${item.model} ${item.capacity}`.trim(),
        })),
    )
    .slice(0, 3);
}

/* ------------------------------------------------------------------ */
/*  Mode Card component                                                */
/* ------------------------------------------------------------------ */

interface ModeCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionText: string;
  accentColor: string;
  accentBg: string;
  accentText: string;
  tintBg: string;
  decorative?: React.ReactNode;
  fullWidth?: boolean;
  onClick: () => void;
}

function ModeCard({
  icon,
  title,
  description,
  actionText,
  accentColor,
  accentBg,
  accentText,
  tintBg,
  decorative,
  fullWidth = false,
  onClick,
}: ModeCardProps) {
  return (
    <motion.button
      variants={cardItem}
      whileHover={{ y: -4, transition: { duration: 0.25, ease: easeSmooth } }}
      whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
      onClick={onClick}
      className={
        'relative text-left rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-card ' +
        'transition-shadow duration-300 hover:shadow-card-hover cursor-pointer ' +
        (fullWidth ? 'col-span-1 sm:col-span-2' : 'col-span-1')
      }
      style={{ background: tintBg, minHeight: '164px' }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full mb-4"
            style={{ background: accentBg }}
          >
            <span style={{ color: accentColor }}>{icon}</span>
          </div>
          <h3 className="font-body text-[17px] sm:text-[18px] font-semibold text-slate-900">{title}</h3>
          <p className="mt-1.5 text-[12px] sm:text-[13px] leading-[1.5] text-slate-500 max-w-[280px]">{description}</p>
          <div className="mt-4 flex items-center gap-1 text-[14px] font-medium" style={{ color: accentText }}>
            <span>{actionText}</span>
            <motion.span
              className="inline-block"
              initial={{ x: 0 }}
              whileHover={{ x: 4 }}
              transition={{ duration: 0.2 }}
            >
              <ArrowRight size={14} strokeWidth={2.5} />
            </motion.span>
          </div>
        </div>
        {decorative && <div className="hidden sm:block">{decorative}</div>}
      </div>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/*  Monitor Servis view                                                */
/* ------------------------------------------------------------------ */

function MonitorServisView({
  onClose,
  technicians,
}: {
  onClose: () => void;
  technicians: Technician[];
}) {
  const [activeTechFilter, setActiveTechFilter] = useState<Technician | 'SEMUA'>('SEMUA');
  const [activeTypeFilter, setActiveTypeFilter] = useState<ServiceType | 'SEMUA'>('SEMUA');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [records, setRecords] = useState<ServiceRecordUi[]>([]);
  const [sparepartUsages, setSparepartUsages] = useState<Record<string, ServiceSparepartUsage[]>>({});
  const [spareparts, setSpareparts] = useState<Sparepart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline editor (Estimasi + Upah) state — id of the record being edited.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEstimasi, setEditEstimasi] = useState('');
  const [editUpah, setEditUpah] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [partTarget, setPartTarget] = useState<ServiceRecordUi | null>(null);
  const [partId, setPartId] = useState('');
  const [partQty, setPartQty] = useState('1');
  const [partUnitCost, setPartUnitCost] = useState('');
  const [partSaving, setPartSaving] = useState(false);
  const [partError, setPartError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([getServiceRecords(), getServiceSparepartUsages()])
      .then(([serviceData, usageData]) => {
        setRecords(serviceData.map(dbToUiServiceRecord));
        const grouped: Record<string, ServiceSparepartUsage[]> = {};
        for (const usage of usageData) {
          const list = grouped[usage.service_record_id] ?? [];
          list.push(usage);
          grouped[usage.service_record_id] = list;
        }
        setSparepartUsages(grouped);
        setLoading(false);
      })
      .catch(() => {
        setError('Gagal memuat data servis. Silakan coba lagi.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    getSpareparts()
      .then(setSpareparts)
      .catch(() => setSpareparts([]));
  }, []);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStatusChange = async (id: string, newStatus: ServiceStatus) => {
    const completedAt = newStatus === 'SELESAI' ? new Date().toISOString() : null;
    try {
      await updateServiceRecord(id, { status: newStatus, completed_at: completedAt });
      setRecords((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, status: newStatus, completedAt: completedAt ?? undefined } : r
        )
      );

      // When a "Toko Sendiri" unit finishes service, return it to sellable
      // stock: flip the held stock_items row from SERVIS back to READY. The
      // unit was set to SERVIS when the service was created (ServisTokoForm).
      // Non-fatal: a stock-status failure must not block the status update.
      if (newStatus === 'SELESAI') {
        const rec = records.find((r) => r.id === id);
        if (rec && rec.serviceType === 'Toko Sendiri' && rec.stkId) {
          try {
            await updateStockStatus(rec.stkId, 'READY');
          } catch (stockErr) {
            console.warn(
              'Servis selesai tapi gagal mengembalikan stok ke READY:',
              stockErr,
            );
          }
        }
      }
    } catch (err) {
      console.error('Gagal memperbarui status servis:', err);
      setError('Gagal memperbarui status servis. Silakan coba lagi.');
    }
  };

  // Open the inline editor for a record, prefilling current estimasi & upah.
  const openEdit = (rec: ServiceRecordUi) => {
    setEditingId(rec.id);
    setEditEstimasi(String(rec.workCost || ''));
    setEditUpah(String(rec.wageAmount || ''));
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  // Persist the edited estimasi + upah, then patch local state in place.
  const saveEdit = async (id: string) => {
    const workCost = Number(editEstimasi) || 0;
    const wageAmount = Number(editUpah) || 0;
    const partsTotal = (sparepartUsages[id] ?? []).reduce(
      (sum, usage) => sum + usage.total_cost,
      0,
    );
    setEditSaving(true);
    setEditError(null);
    try {
      await updateServiceCostFields({
        serviceRecordId: id,
        workCost,
        wageAmount,
      });
      setRecords((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, workCost, estimatedCost: workCost + partsTotal, wageAmount }
            : r,
        ),
      );
      setEditingId(null);
    } catch (err) {
      console.error('Gagal memperbarui estimasi servis:', err);
      setEditError('Gagal menyimpan perubahan. Silakan coba lagi.');
    } finally {
      setEditSaving(false);
    }
  };

  const openPartDialog = (record: ServiceRecordUi) => {
    const firstPart = spareparts[0];
    setPartTarget(record);
    setPartId(firstPart?.id ?? '');
    setPartQty('1');
    setPartUnitCost(firstPart ? String(firstPart.buy_price || 0) : '');
    setPartError(null);
  };

  const selectedPart = spareparts.find((part) => part.id === partId) ?? null;

  const handlePartChange = (id: string) => {
    const part = spareparts.find((item) => item.id === id);
    setPartId(id);
    setPartUnitCost(part ? String(part.buy_price || 0) : '');
    setPartError(null);
  };

  const closePartDialog = () => {
    setPartTarget(null);
    setPartId('');
    setPartQty('1');
    setPartUnitCost('');
    setPartError(null);
    setPartSaving(false);
  };

  const savePartUsage = async () => {
    if (!partTarget || partSaving) return;
    const quantity = Number(partQty) || 0;
    const unitCost = Number(partUnitCost) || 0;

    if (!selectedPart) {
      setPartError('Pilih sparepart terlebih dahulu.');
      return;
    }
    if (quantity <= 0) {
      setPartError('Jumlah part minimal 1.');
      return;
    }
    if (quantity > selectedPart.stock) {
      setPartError(`Stok ${selectedPart.name} tidak cukup. Sisa ${selectedPart.stock} pcs.`);
      return;
    }
    if (unitCost < 0) {
      setPartError('Modal part tidak boleh negatif.');
      return;
    }

    setPartSaving(true);
    setPartError(null);
    try {
      await recordServiceSparepartUsage({
        serviceRecordId: partTarget.id,
        sparepartId: selectedPart.id,
        quantity,
        unitCost,
      });
      closePartDialog();
      reload();
      getSpareparts()
        .then(setSpareparts)
        .catch(() => setSpareparts([]));
    } catch (err) {
      setPartError(
        err instanceof Error && err.message
          ? err.message
          : 'Pemakaian sparepart tidak dapat disimpan.',
      );
      setPartSaving(false);
    }
  };

  // Mark a finished unit as collected by the customer.
  const handlePickup = async (id: string) => {
    const pickedUpAt = new Date().toISOString();
    try {
      await updateServiceRecord(id, { picked_up: true, picked_up_at: pickedUpAt });
      setRecords((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, pickedUp: true, pickedUpAt } : r,
        ),
      );
    } catch (err) {
      console.error('Gagal memperbarui status ambil HP:', err);
      setError('Gagal memperbarui status ambil HP. Silakan coba lagi.');
    }
  };

  const filtered = useMemo(() => {
    let result = records;
    if (activeTechFilter !== 'SEMUA') {
      result = result.filter((r) => r.technician === activeTechFilter);
    }
    if (activeTypeFilter !== 'SEMUA') {
      result = result.filter((r) => r.serviceType === activeTypeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.phoneModel.toLowerCase().includes(q) ||
          (r.imei || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [records, activeTechFilter, activeTypeFilter, searchQuery]);

  const groupedByStatus = useMemo(() => {
    const g: Record<ServiceStatus, typeof records> = { ANTRIAN: [], PROSES: [], SELESAI: [], GAGAL: [] };
    for (const r of filtered) {
      g[r.status].push(r);
    }
    return g;
  }, [filtered]);

  const techCounts = useMemo(() => {
    const c: Record<string, number> = { SEMUA: records.length };
    for (const t of technicians) c[t] = records.filter((r) => r.technician === t).length;
    return c;
  }, [records, technicians]);

  const ServiceCard = ({ record }: { record: (typeof records)[0] }) => {
    const cfg = statusConfig[record.status];
    const isExpanded = expandedIds.has(record.id);
    const usages = sparepartUsages[record.id] ?? [];
    const partsTotal = usages.reduce((sum, usage) => sum + usage.total_cost, 0);
    const serviceTypeColors: Record<ServiceType, string> = {
      Customer: 'bg-teal-50 text-teal-700',
      'Toko Sendiri': 'bg-amber-50 text-amber-700',
      'Klaim Garansi': 'bg-purple-50 text-purple-700',
    };

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.35, ease: easeSmooth }}
        className="rounded-xl bg-white border border-slate-200 shadow-card overflow-hidden"
        style={{
          borderLeftWidth: '4px',
          borderLeftColor:
            record.status === 'ANTRIAN' ? '#F59E0B' : record.status === 'PROSES' ? '#14B8A6' : record.status === 'SELESAI' ? '#10B981' : '#F43F5E',
        }}
      >
        <button
          onClick={() => toggleExpanded(record.id)}
          className="w-full flex items-start justify-between gap-3 p-4 sm:p-5 text-left hover:bg-slate-50/50 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${cfg.bg} ${cfg.text}`}>
                {record.status}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${serviceTypeColors[record.serviceType]}`}>
                {record.serviceType}
              </span>
              {record.pickedUp && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  <Check size={10} /> Sudah Diambil
                </span>
              )}
            </div>
            <p className="break-words text-[14px] font-semibold text-slate-900">
              {record.phoneModel} {record.capacity && `\u00B7 ${record.capacity}`} {record.condition && `\u00B7 ${record.condition}`}
            </p>
            <div className="mt-1.5 flex items-center gap-3 text-[12px] text-slate-500 flex-wrap">
              <span className="flex items-center gap-1"><User size={12} /> {record.customerName}</span>
              {record.stkId && <span className="break-all font-mono text-[11px]">STK: {record.stkId}</span>}
              {record.imei && <span className="break-all font-mono text-[11px]">{record.imei}</span>}
              {record.batteryHealth && <span>BH: {record.batteryHealth}%</span>}
            </div>
            <div className="mt-2">
              <TransactionStaffBadge staff={record.createdByStaff ?? null} />
            </div>
          </div>
          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.3 }} className="ml-3 text-slate-400">
            <ChevronDown size={20} />
          </motion.div>
        </button>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: easeSmooth }}
              className="overflow-hidden"
            >
              <div className="px-4 sm:px-5 pb-4 pt-1 border-t border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">ID Servis</p>
                    <p className="mt-1 break-all font-mono text-[13px] text-slate-700">{record.id}</p>
                  </div>
                  {record.color && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Warna</p>
                      <p className="mt-1 text-[13px] text-slate-700">{record.color}</p>
                    </div>
                  )}
                  <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2">
                    <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Keluhan</p>
                    <p className="mt-1 text-[13px] text-slate-700">{record.issue}</p>
                  </div>
                  {record.additionalNote && (
                    <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Catatan</p>
                      <p className="mt-1 text-[13px] text-slate-700">{record.additionalNote}</p>
                    </div>
                  )}
                  {record.technician && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Tukang</p>
                      <p className="mt-1 text-[13px] text-slate-700">{record.technician}</p>
                    </div>
                  )}
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Biaya Pengerjaan</p>
                    <p className="mt-1 font-mono text-[13px] text-slate-700">{formatPrice(record.workCost)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Modal Part</p>
                    <p className="mt-1 font-mono text-[13px] text-slate-700">{formatPrice(partsTotal)}</p>
                  </div>
                  <div className="rounded-lg bg-teal-50 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-teal-600 font-medium">Biaya Total</p>
                    <p className="mt-1 font-mono text-[13px] font-semibold text-teal-700">{formatPrice(record.estimatedCost)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Upah Tukang</p>
                    <p className="mt-1 font-mono text-[13px] text-slate-700">
                      {formatPrice(record.wageAmount)}
                      {record.wageAmount > 0 && (
                        <span className={`ml-2 text-[11px] font-semibold ${record.wagePaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {record.wagePaid ? '(Lunas)' : '(Belum dibayar)'}
                        </span>
                      )}
                    </p>
                  </div>
                  {record.dp !== undefined && record.dp > 0 && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">DP</p>
                      <p className="mt-1 font-mono text-[13px] text-slate-700">{formatPrice(record.dp)}</p>
                    </div>
                  )}
                  <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2">
                    <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Sparepart Dipakai</p>
                    {usages.length > 0 ? (
                      <div className="mt-2 space-y-1.5">
                        {usages.map((usage) => (
                          <div
                            key={usage.id}
                            className="flex flex-col items-start gap-1 rounded-lg bg-white px-3 py-2 text-[12px] text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                          >
                            <span className="font-medium text-slate-800">
                              {usage.sparepart_name} x{usage.quantity}
                            </span>
                            <span className="font-mono text-slate-700">
                              {formatPrice(usage.unit_cost)}/pcs - {formatPrice(usage.total_cost)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-[13px] text-slate-400">Belum ada part dipakai.</p>
                    )}
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Masuk</p>
                    <p className="mt-1 text-[13px] text-slate-700">{formatDate(record.createdAt)}</p>
                  </div>
                  {record.completedAt && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Selesai</p>
                      <p className="mt-1 text-[13px] text-slate-700">{formatDate(record.completedAt)}</p>
                    </div>
                  )}
                  {record.pickedUp && record.pickedUpAt && (
                    <div className="rounded-lg bg-emerald-50 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-emerald-500 font-medium">Diambil</p>
                      <p className="mt-1 text-[13px] text-emerald-700">{formatDate(record.pickedUpAt)}</p>
                    </div>
                  )}
                </div>

                {/* Inline editor: ubah estimasi & upah */}
                {editingId === record.id ? (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <p className="text-[12px] font-semibold text-slate-600 mb-3">Edit Biaya Pengerjaan &amp; Upah</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                          Biaya Pengerjaan
                        </label>
                        <RpInput value={editEstimasi} onChange={setEditEstimasi} />
                        <p className="mt-1 text-[11px] text-slate-400">
                          Total akan menjadi {formatPrice((Number(editEstimasi) || 0) + partsTotal)} termasuk modal part.
                        </p>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                          Upah Tukang
                        </label>
                        <RpInput value={editUpah} onChange={setEditUpah} />
                      </div>
                    </div>
                    {editError && <p className="mt-2 text-[12px] text-rose-500">{editError}</p>}
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <button
                        onClick={cancelEdit}
                        className="rounded-lg bg-slate-100 px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-200 transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => saveEdit(record.id)}
                        disabled={editSaving}
                        className="rounded-lg bg-teal-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-teal-600 transition-colors disabled:opacity-60"
                      >
                        {editSaving ? 'Menyimpan...' : 'Simpan'}
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Action buttons */}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    onClick={() => (editingId === record.id ? cancelEdit() : openEdit(record))}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    <Edit3 size={14} /> Edit Biaya
                  </button>
                  {(record.status === 'ANTRIAN' || record.status === 'PROSES') && (
                    <button
                      onClick={() => openPartDialog(record)}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-50 px-4 py-2 text-[13px] font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
                    >
                      <Package size={14} /> Tambah Part
                    </button>
                  )}
                  {record.status === 'ANTRIAN' && (
                    <button
                      onClick={() => handleStatusChange(record.id, 'PROSES')}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-teal-600 transition-colors"
                    >
                      <Play size={14} /> Mulai
                    </button>
                  )}
                  {record.status === 'PROSES' && (
                    <button
                      onClick={() => handleStatusChange(record.id, 'SELESAI')}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-600 transition-colors"
                    >
                      <CheckCircle2 size={14} /> Selesai
                    </button>
                  )}
                  {record.status === 'SELESAI' && (
                    record.pickedUp ? (
                      <span className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-4 py-2 text-[13px] font-medium text-emerald-700">
                        <Check size={14} /> Sudah Diambil
                      </span>
                    ) : (
                      <button
                        onClick={() => handlePickup(record.id)}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-200 transition-colors"
                      >
                        <Package size={14} /> Ambil HP
                      </button>
                    )
                  )}
                  {record.status === 'GAGAL' && (
                    <button className="flex items-center justify-center gap-1.5 rounded-lg bg-rose-50 px-4 py-2 text-[13px] font-medium text-rose-700 hover:bg-rose-100 transition-colors">
                      <Banknote size={14} /> Refund DP
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-40 overflow-hidden bg-off-white pb-20 pt-[76px] sm:pb-24 sm:pt-[88px]"
    >
      <div className="mx-auto h-full max-w-[1200px] overflow-y-auto px-4 pb-8 sm:px-6">
        {/* Header */}
        <div className="mb-5 flex items-start gap-3 sm:mb-6 sm:items-center sm:gap-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft size={18} />
          </motion.button>
          <div className="min-w-0">
            <h2 className="font-display text-[28px] text-slate-900 leading-tight sm:text-[32px]">Monitor Servis</h2>
            <p className="text-[14px] text-slate-500 mt-0.5">{filtered.length} servis ditemukan</p>
          </div>
        </div>

        {/* Technician Filter Tabs */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(['SEMUA', ...technicians] as const).map((tech) => {
            const isActive = activeTechFilter === tech;
            return (
              <button
                key={tech}
                onClick={() => setActiveTechFilter(tech)}
                className={
                  'rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all duration-200 ' +
                  (isActive ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                }
              >
                {tech === 'SEMUA' ? 'Semua' : tech.toUpperCase()}
                <span className="ml-1 opacity-70">({techCounts[tech] || 0})</span>
              </button>
            );
          })}
        </div>

        {/* Type filter + Search */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <select
            value={activeTypeFilter}
            onChange={(e) => setActiveTypeFilter(e.target.value as ServiceType | 'SEMUA')}
            className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-[13px] text-slate-700 outline-none focus:border-teal-500 sm:w-auto"
          >
            <option value="SEMUA">Semua jenis</option>
            {SERVICE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari ID / nama / tipe / IMEI..."
              className="w-full h-10 rounded-xl border border-slate-300 bg-white pl-9 pr-9 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-teal-500 animate-spin" />
            <p className="text-[13px] text-slate-500 mt-3">Memuat data servis...</p>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 mb-4">
              <AlertTriangle size={28} />
            </div>
            <p className="text-[15px] font-medium text-slate-700">{error}</p>
            <button
              onClick={reload}
              className="mt-4 rounded-lg bg-teal-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-teal-600 transition-colors"
            >
              Coba lagi
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
        {/* Sections by Status */}
        <div className="flex flex-col gap-6 pb-6">
          {/* ANTRI */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-amber-500" />
              <h3 className="text-[16px] font-semibold text-slate-900">Antri</h3>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                {groupedByStatus.ANTRIAN.length} unit
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <AnimatePresence mode="popLayout">
                {groupedByStatus.ANTRIAN.map((record) => (
                  <ServiceCard key={record.id} record={record} />
                ))}
              </AnimatePresence>
              {groupedByStatus.ANTRIAN.length === 0 && (
                <p className="text-[13px] text-slate-400 italic pl-2">Tidak ada servis dalam antrian.</p>
              )}
            </div>
          </div>

          {/* PROSES */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Wrench size={16} className="text-teal-500" />
              <h3 className="text-[16px] font-semibold text-slate-900">Proses</h3>
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                {groupedByStatus.PROSES.length} unit
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <AnimatePresence mode="popLayout">
                {groupedByStatus.PROSES.map((record) => (
                  <ServiceCard key={record.id} record={record} />
                ))}
              </AnimatePresence>
              {groupedByStatus.PROSES.length === 0 && (
                <p className="text-[13px] text-slate-400 italic pl-2">Tidak ada servis dalam proses.</p>
              )}
            </div>
          </div>

          {/* SELESAI */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <h3 className="text-[16px] font-semibold text-slate-900">Selesai (aktif)</h3>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                {groupedByStatus.SELESAI.length} unit
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <AnimatePresence mode="popLayout">
                {groupedByStatus.SELESAI.map((record) => (
                  <ServiceCard key={record.id} record={record} />
                ))}
              </AnimatePresence>
              {groupedByStatus.SELESAI.length === 0 && (
                <p className="text-[13px] text-slate-400 italic pl-2">Tidak ada servis selesai menunggu diambil.</p>
              )}
            </div>
          </div>

          {/* GAGAL / Riwayat */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-rose-500" />
              <h3 className="text-[16px] font-semibold text-slate-900">Riwayat Gagal</h3>
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                {groupedByStatus.GAGAL.length} unit
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <AnimatePresence mode="popLayout">
                {groupedByStatus.GAGAL.map((record) => (
                  <ServiceCard key={record.id} record={record} />
                ))}
              </AnimatePresence>
              {groupedByStatus.GAGAL.length === 0 && (
                <p className="text-[13px] text-slate-400 italic pl-2">Tidak ada servis gagal.</p>
              )}
            </div>
          </div>
        </div>

        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
              <Monitor size={28} />
            </div>
            <p className="text-[15px] font-medium text-slate-700">Tidak ada servis</p>
            <p className="text-[13px] text-slate-500 mt-1">Tidak ada servis yang cocok dengan filter.</p>
          </motion.div>
        )}
          </>
        )}

        <AnimatePresence>
          {partTarget && (
            <motion.div
              className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center sm:p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="service-part-title"
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 24, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="max-h-[calc(100dvh-24px)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-card-elevated"
              >
                <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                  <div>
                    <h2 id="service-part-title" className="text-[18px] font-semibold text-slate-900">
                      Tambah Sparepart Servis
                    </h2>
                    <p className="mt-0.5 text-[13px] text-slate-500">
                      Stok part berkurang dan modalnya masuk ke biaya total servis.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closePartDialog}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                    aria-label="Tutup tambah sparepart servis"
                  >
                    <X size={17} />
                  </button>
                </div>

                <div className="space-y-4 p-5">
                  <div className="rounded-xl bg-slate-50 p-3 text-[13px] text-slate-600">
                    <p className="font-semibold text-slate-900">
                      {partTarget.customerName} - {partTarget.phoneModel}
                    </p>
                    <p className="mt-0.5">{partTarget.issue}</p>
                  </div>

                  <div>
                    <label
                      htmlFor="service-part-select"
                      className="mb-1.5 block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500"
                    >
                      Sparepart *
                    </label>
                    <select
                      id="service-part-select"
                      value={partId}
                      onChange={(event) => handlePartChange(event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-[14px] outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                    >
                      <option value="">Pilih sparepart</option>
                      {spareparts.map((part) => (
                        <option key={part.id} value={part.id}>
                          {part.name} - stok {part.stock} pcs - modal {formatPrice(part.buy_price)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="service-part-qty"
                        className="mb-1.5 block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500"
                      >
                        Jumlah *
                      </label>
                      <input
                        id="service-part-qty"
                        type="number"
                        min={1}
                        step={1}
                        value={partQty}
                        onChange={(event) => {
                          setPartQty(event.target.value);
                          setPartError(null);
                        }}
                        className="h-11 w-full rounded-xl border border-slate-300 px-4 text-[14px] outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="service-part-unit-cost"
                        className="mb-1.5 block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500"
                      >
                        Modal / PCS
                      </label>
                      <RpInput
                        value={partUnitCost}
                        onChange={(value) => {
                          setPartUnitCost(value);
                          setPartError(null);
                        }}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-700">
                    Modal part: {formatPrice((Number(partQty) || 0) * (Number(partUnitCost) || 0))}
                  </div>

                  {partError && (
                    <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-600">
                      {partError}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:gap-3">
                  <button
                    type="button"
                    onClick={closePartDialog}
                    className="flex-1 rounded-xl bg-slate-100 py-3 text-[14px] font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={partSaving}
                    onClick={savePartUsage}
                    className="flex-1 rounded-xl bg-amber-500 py-3 text-[14px] font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                  >
                    {partSaving ? 'Menyimpan...' : 'Simpan Part'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}


/* ------------------------------------------------------------------ */
/*  Utang Upah view                                                    */
/* ------------------------------------------------------------------ */

function UtangUpahView({ onClose }: { onClose: () => void }) {
  const [records, setRecords] = useState<DbServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Account loading for the pay panel.
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);

  // Pay panel state — which technician's panel is open + its selection.
  const [payingTech, setPayingTech] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<'Cash' | 'Bank'>('Cash');
  const [payAccount, setPayAccount] = useState<AccountWithBalance | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    getServiceRecords()
      .then((data) => {
        setRecords(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Gagal memuat data upah. Silakan coba lagi.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    getAccountPickerData()
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);

  // Unpaid wages: wage_amount > 0 && !wage_paid, grouped by technician.
  const grouped = useMemo(() => {
    const g: Record<string, DbServiceRecord[]> = {};
    for (const r of records) {
      if (r.wage_amount > 0 && r.wage_paid === false) {
        const tech = r.technician || 'Tanpa Tukang';
        if (!g[tech]) g[tech] = [];
        g[tech].push(r);
      }
    }
    return g;
  }, [records]);

  const technicians = Object.keys(grouped);

  const openPay = (tech: string) => {
    setPayingTech(tech);
    setPayMethod('Cash');
    setPayAccount(null);
    setPayError(null);
  };

  const cancelPay = () => {
    setPayingTech(null);
    setPayError(null);
  };

  const handleMethodChange = (method: 'Cash' | 'Bank') => {
    setPayMethod(method);
    setPayAccount(null);
    setPayError(null);
  };

  const handlePay = async (tech: string) => {
    const items = grouped[tech] || [];
    const amount = items.reduce((s, r) => s + r.wage_amount, 0);
    const serviceIds = items.map((r) => r.id);
    if (!payAccount) {
      setPayError('Pilih akun pembayaran terlebih dahulu.');
      return;
    }
    setPaying(true);
    setPayError(null);
    try {
      await recordWagePaymentWithPosting({
        technician: tech,
        amount,
        accountId: payAccount.id,
        note: `Upah servis ${tech}`,
        serviceIds,
      });
      setPayingTech(null);
      reload();
    } catch {
      setPayError('Pembayaran upah gagal. Silakan coba lagi.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-40 overflow-y-auto bg-off-white pb-20 pt-[76px] sm:pb-24 sm:pt-[88px]"
    >
      <div className="mx-auto max-w-[1200px] px-4 pb-8 sm:px-6">
        <div className="mb-5 flex items-start gap-3 sm:mb-6 sm:items-center sm:gap-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft size={18} />
          </motion.button>
          <div className="min-w-0">
            <h2 className="font-display text-[28px] text-slate-900 leading-tight sm:text-[32px]">Utang Upah</h2>
            <p className="text-[14px] text-slate-500 mt-0.5">Upah servis yang belum dibayar ke tukang</p>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-teal-500 animate-spin" />
            <p className="text-[13px] text-slate-500 mt-3">Memuat data upah...</p>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 mb-4">
              <AlertTriangle size={28} />
            </div>
            <p className="text-[15px] font-medium text-slate-700">{error}</p>
            <button
              onClick={reload}
              className="mt-4 rounded-lg bg-teal-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-teal-600 transition-colors"
            >
              Coba lagi
            </button>
          </div>
        )}

        {!loading && !error && (
        <div className="flex flex-col gap-4">
          {technicians.map((tech, i) => {
            const items = grouped[tech];
            const total = items.reduce((s, r) => s + r.wage_amount, 0);
            const isPaying = payingTech === tech;
            return (
              <motion.div
                key={tech}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1, ease: easeSmooth }}
                className="rounded-xl bg-white border border-slate-200 shadow-card overflow-hidden"
              >
                <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                      <User size={16} />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-slate-900">{tech}</span>
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                      {items.length} upah
                    </span>
                  </div>
                  <span className="font-mono text-[16px] font-semibold text-slate-900">{formatPrice(total)}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {items.map((r) => (
                    <div key={r.id} className="flex flex-col gap-2 px-4 py-3 hover:bg-slate-50/50 transition-colors sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-slate-700">
                          {r.phone_model} — {r.issue}
                        </p>
                        <p className="mt-0.5 break-all text-[12px] text-slate-500">
                          {r.customer_name} · {r.id} · {formatDate(r.created_at)}
                        </p>
                      </div>
                      <span className="font-mono text-[14px] font-medium text-slate-900">{formatPrice(r.wage_amount)}</span>
                    </div>
                  ))}
                </div>

                {/* Pay panel */}
                {isPaying ? (
                  <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/40">
                    <p className="text-[12px] font-semibold text-slate-600 mb-2">BAYAR UPAH — {formatPrice(total)}</p>
                    <div className="flex gap-2 mb-3">
                      {(['Cash', 'Bank'] as const).map((m) => {
                        const active = payMethod === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => handleMethodChange(m)}
                            className={`flex-1 rounded-xl border px-4 py-2 text-[13px] font-semibold transition-colors ${
                              active
                                ? 'border-teal-500 bg-teal-50 text-teal-700'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {m === 'Cash' ? 'Cash' : 'Transfer'}
                          </button>
                        );
                      })}
                    </div>
                    <AccountPicker
                      label={payMethod === 'Cash' ? 'Akun Kas' : 'Akun Bank'}
                      filterType={payMethod === 'Cash' ? 'Cash' : 'Bank'}
                      accounts={accounts}
                      value={payAccount?.id ?? null}
                      onChange={(_id, account) => {
                        setPayAccount(account);
                        setPayError(null);
                      }}
                      error={payError}
                    />
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <button
                        onClick={cancelPay}
                        className="rounded-lg bg-slate-100 px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-200 transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => handlePay(tech)}
                        disabled={paying}
                        className="rounded-lg bg-teal-500 px-5 py-2 text-[13px] font-semibold text-white hover:bg-teal-600 transition-colors active:scale-[0.98] disabled:opacity-60"
                      >
                        {paying ? 'Memproses...' : 'Konfirmasi Bayar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex border-t border-slate-100 px-5 py-3 sm:justify-end">
                    <button
                      onClick={() => openPay(tech)}
                      className="w-full rounded-lg bg-teal-500 px-5 py-2 text-[13px] font-semibold text-white hover:bg-teal-600 transition-colors active:scale-[0.98] sm:w-auto"
                    >
                      Bayar Upah
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}

          {technicians.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
                <Banknote size={28} />
              </div>
              <p className="text-[15px] font-medium text-slate-700">Tidak ada utang upah</p>
              <p className="text-[13px] text-slate-500 mt-1">Semua upah sudah dibayar.</p>
            </div>
          )}
        </div>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared: Tukang Selection Grid                                      */
/* ------------------------------------------------------------------ */

function TukangGrid({
  technicians,
  selected,
  onSelect,
}: {
  technicians: Technician[];
  selected: Technician | '';
  onSelect: (t: Technician) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
      {technicians.map((tech) => {
        const isSelected = selected === tech;
        return (
          <motion.button
            key={tech}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(tech)}
            className={
              'flex items-center gap-3 rounded-xl border-2 px-3 py-3 text-left transition-all duration-200 sm:px-4 ' +
              (isSelected
                ? 'border-teal-500 bg-teal-50 text-teal-800'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50')
            }
          >
            <User size={18} className={isSelected ? 'text-teal-600' : 'text-slate-400'} />
            <span className="text-[14px] font-medium">{tech}</span>
            {isSelected && <Check size={16} className="text-teal-600 ml-auto" />}
          </motion.button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared: Rp Input                                                   */
/* ------------------------------------------------------------------ */

function RpInput({
  value,
  onChange,
  placeholder = '0',
  icon,
  error,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div className="relative">
      {icon && <span className="absolute left-3.5 top-1/2 -translate-y-1/2">{icon}</span>}
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 font-mono">Rp</span>
      <input
        type="text"
        value={value ? 'Rp ' + value.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        placeholder={'Rp ' + placeholder}
        className={
          'w-full h-11 rounded-xl border bg-white pl-12 pr-4 font-mono text-[14px] outline-none transition-all duration-200 ' +
          (error
            ? 'border-rose-400 ring-2 ring-rose-100'
            : 'border-slate-300 focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10')
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Servis Customer Form                                               */
/* ------------------------------------------------------------------ */

function ServisCustomerForm({
  onClose,
  technicians,
}: {
  onClose: () => void;
  technicians: Technician[];
}) {
  const [formData, setFormData] = useState({
    nama: '',
    wa: '',
    model: '',
    capacity: '',
    condition: '',
    color: '',
    imei: '',
    batteryHealth: '',
    keluhan: '',
    catatan: '',
    tukang: '' as Technician | '',
    estimasi: '',
    upah: '',
    dp: '',
  });
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [shaking, setShaking] = useState(false);

  // Payment posting state (DP money_in via a single method-routed picker).
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [payMethod, setPayMethod] = useState<'Cash' | 'Transfer'>('Cash');
  const [payAccount, setPayAccount] = useState<AccountWithBalance | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAccountPickerData()
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);

  // Reset the selected account whenever the method toggles so a stale
  // (wrong-type) account can't be carried across the Cash/Transfer switch.
  const handleMethodChange = (method: 'Cash' | 'Transfer') => {
    setPayMethod(method);
    setPayAccount(null);
    setPaymentError(null);
  };

  const handleChange = (field: string, value: string) => {
    setFormData((p) => ({ ...p, [field]: value }));
    if (errors[field]) setErrors((p) => ({ ...p, [field]: false }));
  };

  const validate = () => {
    const e: Record<string, boolean> = {};
    if (!formData.nama.trim()) e.nama = true;
    if (!formData.wa.trim()) e.wa = true;
    if (!formData.model) e.model = true;
    if (!formData.capacity) e.capacity = true;
    if (!formData.condition) e.condition = true;
    if (!formData.color) e.color = true;
    if (!formData.imei.trim() || formData.imei.length < 10) e.imei = true;
    if (!formData.keluhan.trim() || formData.keluhan.length < 3) e.keluhan = true;
    if (!formData.tukang) e.tukang = true;
    if (!formData.estimasi || Number(formData.estimasi) <= 0) e.estimasi = true;
    const dpNum = Number(formData.dp) || 0;
    const estNum = Number(formData.estimasi) || 0;
    if (dpNum > estNum) e.dp = true;
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setPaymentError(null);
    if (!validate()) return;

    const dpNum = Number(formData.dp) || 0;

    // Persist the service record FIRST so it shows up in the monitor list.
    setSaving(true);
    try {
      await createServiceRecord({
        customer_name: formData.nama,
        phone_model: formData.model,
        capacity: formData.capacity || '',
        condition: formData.condition || '',
        color: formData.color || '',
        imei: formData.imei || '',
        battery_health: null,
        issue: formData.keluhan,
        additional_note: formData.wa ? `WA: ${formData.wa}` : '',
        status: 'ANTRIAN',
        estimated_cost: Number(formData.estimasi) || 0,
        work_cost: Number(formData.estimasi) || 0,
        dp: dpNum,
        completed_at: null,
        technician: formData.tukang || '',
        service_type: 'Customer',
        stk_id: '',
        wage_amount: Number(formData.upah) || 0,
        wage_paid: false,
        picked_up: false,
        picked_up_at: null,
      });
    } catch {
      setSaving(false);
      setPaymentError('Servis tidak dapat disimpan. Silakan coba lagi.');
      return;
    }
    setSaving(false);

    // When a DP is recorded, post it to the ledger as a money_in transaction.
    // The Cash/Transfer method routes the whole amount to a single portion.
    if (dpNum > 0) {
      const isCash = payMethod === 'Cash';
      const selection = {
        cashPortion: isCash ? dpNum : 0,
        cashAccountId: isCash ? (payAccount?.id ?? null) : null,
        transferPortion: isCash ? 0 : dpNum,
        transferAccountId: isCash ? null : (payAccount?.id ?? null),
      };

      const result = validatePaymentSelection({
        cashPortion: selection.cashPortion,
        cashAccountType: isCash ? (payAccount?.type ?? null) : null,
        transferPortion: selection.transferPortion,
        transferAccountType: isCash ? null : (payAccount?.type ?? null),
        requiresPayment: true,
      });
      if (!result.ok) {
        setPaymentError(result.message);
        return;
      }

      const direction = deriveDirection('income');
      const postings = buildPostings(direction, selection);

      const description = `${formData.nama} - ${formData.model} (${formData.keluhan.slice(0, 60)})`;
      const detail = JSON.stringify({
        kind: 'servis',
        customer: formData.nama,
        wa: formData.wa,
        model: formData.model,
        capacity: formData.capacity,
        condition: formData.condition,
        color: formData.color,
        imei: formData.imei,
        issue: formData.keluhan,
        technician: formData.tukang,
        estimatedCost: Number(formData.estimasi) || 0,
        dp: dpNum,
        method: payMethod,
      });

      setSaving(true);
      try {
        await recordTransactionWithPostings({
          type: 'Servis',
          description,
          detail,
          amount: dpNum,
          postings,
        });
      } catch {
        setSaving(false);
        setPaymentError('Transaksi tidak dapat disimpan. Silakan coba lagi.');
        return;
      }
      setSaving(false);
    }

    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-40 overflow-y-auto bg-off-white pb-20 pt-[76px] sm:pb-24 sm:pt-[88px]"
    >
      <div className="mx-auto max-w-[720px] px-4 pb-8 sm:px-6">
        <div className="mb-5 flex items-start gap-3 sm:mb-6 sm:items-center sm:gap-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft size={18} />
          </motion.button>
          <h2 className="font-display text-[28px] text-slate-900 leading-tight sm:text-[32px]">Servis Customer</h2>
        </div>

        <motion.div
          animate={shaking ? { x: [0, -8, 8, -8, 8, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-4"
        >
          {/* Section 1: Data Pemilik HP */}
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-card sm:p-6">
            <h3 className="text-[18px] font-semibold text-slate-900 mb-4">Data Pemilik HP</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                  NAMA CUSTOMER *
                </label>
                <input
                  type="text"
                  value={formData.nama}
                  onChange={(e) => handleChange('nama', e.target.value)}
                  placeholder="Nama lengkap customer"
                  className={`w-full h-11 rounded-xl border px-4 text-[14px] outline-none transition-all duration-200 font-body ${
                    errors.nama ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-300 focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10'
                  }`}
                />
                {errors.nama && <p className="mt-1 text-[12px] text-rose-500">Nama wajib diisi</p>}
              </div>
              <div>
                <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                  NO. WHATSAPP *
                </label>
                <input
                  type="tel"
                  value={formData.wa}
                  onChange={(e) => handleChange('wa', e.target.value.replace(/\D/g, ''))}
                  placeholder="08123456789"
                  className={`w-full h-11 rounded-xl border px-4 text-[14px] outline-none transition-all duration-200 font-body ${
                    errors.wa ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-300 focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10'
                  }`}
                />
                {errors.wa && <p className="mt-1 text-[12px] text-rose-500">Nomor WA wajib diisi</p>}
              </div>
            </div>
          </div>

          {/* Section 2: Detail HP */}
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-card sm:p-6">
            <h3 className="text-[18px] font-semibold text-slate-900 mb-4">Detail HP</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <PresetOrCustomSelect
                  label="TIPE HP"
                  value={formData.model}
                  onChange={(value) => handleChange('model', value)}
                  options={phoneModels}
                  placeholder="Pilih model"
                  customLabel="Tipe custom / seri baru"
                  customPlaceholder="Contoh: iPhone 17 Pro, Samsung S24 Ultra"
                  inputAriaLabel="Tipe HP service custom"
                  error={errors.model}
                  required
                />
                {errors.model && <p className="mt-1 text-[12px] text-rose-500">Pilih tipe HP</p>}
              </div>
              <div>
                <PresetOrCustomSelect
                  label="KAPASITAS"
                  value={formData.capacity}
                  onChange={(value) => handleChange('capacity', value)}
                  options={capacities}
                  placeholder="Pilih kapasitas"
                  customLabel="Kapasitas custom"
                  customPlaceholder="Contoh: 32GB, 2TB, WiFi Only"
                  inputAriaLabel="Kapasitas service custom"
                  error={errors.capacity}
                  required
                />
                {errors.capacity && <p className="mt-1 text-[12px] text-rose-500">Pilih kapasitas</p>}
              </div>
              <div>
                <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">KONDISI *</label>
                <select
                  value={formData.condition}
                  onChange={(e) => handleChange('condition', e.target.value)}
                  className={`w-full h-11 rounded-xl border px-4 text-[14px] outline-none transition-all duration-200 font-body bg-white ${
                    errors.condition ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-300 focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10'
                  }`}
                >
                  <option value="">Pilih kondisi</option>
                  {conditions.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
                {errors.condition && <p className="mt-1 text-[12px] text-rose-500">Pilih kondisi</p>}
              </div>
              <div>
                <PresetOrCustomSelect
                  label="WARNA"
                  value={formData.color}
                  onChange={(value) => handleChange('color', value)}
                  options={colors}
                  placeholder="Pilih warna"
                  customLabel="Warna custom"
                  customPlaceholder="Contoh: Desert Titanium, Navy, Black"
                  inputAriaLabel="Warna service custom"
                  error={errors.color}
                  required
                />
                {errors.color && <p className="mt-1 text-[12px] text-rose-500">Pilih warna</p>}
              </div>
              <div>
                <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">IMEI (10-20 DIGIT) *</label>
                <input
                  type="text"
                  value={formData.imei}
                  onChange={(e) => handleChange('imei', e.target.value.replace(/\D/g, '').slice(0, 20))}
                  placeholder="352345678901234"
                  maxLength={20}
                  className={`w-full h-11 rounded-xl border px-4 text-[14px] outline-none transition-all duration-200 font-mono tracking-wide ${
                    errors.imei ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-300 focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10'
                  }`}
                />
                {errors.imei && <p className="mt-1 text-[12px] text-rose-500">IMEI minimal 10 digit</p>}
                <p className="text-[11px] text-slate-400 mt-0.5 text-right">{formData.imei.length}/20</p>
              </div>
              <div>
                <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">BATTERY HEALTH</label>
                <input
                  type="text"
                  value={formData.batteryHealth}
                  onChange={(e) => handleChange('batteryHealth', e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="85"
                  className="w-full h-11 rounded-xl border border-slate-300 px-4 text-[14px] outline-none transition-all duration-200 font-mono focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Keluhan & Diagnosa */}
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-card sm:p-6">
            <h3 className="text-[18px] font-semibold text-slate-900 mb-4">Keluhan &amp; Diagnosa</h3>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                  KELUHAN *
                </label>
                <textarea
                  value={formData.keluhan}
                  onChange={(e) => handleChange('keluhan', e.target.value)}
                  placeholder="Misal: Layar pecah, tidak bisa di-touch di sudut kanan atas. Suara speaker pecah."
                  rows={3}
                  className={`w-full min-h-[80px] resize-y rounded-xl border px-4 py-3 text-[14px] outline-none transition-all duration-200 font-body ${
                    errors.keluhan ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-300 focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10'
                  }`}
                />
                {errors.keluhan && <p className="mt-1 text-[12px] text-rose-500">Keluhan minimal 3 karakter</p>}
                <p className="text-[11px] text-slate-400 mt-1">Minimal 3 karakter, jelaskan keluhan customer.</p>
              </div>
              <div>
                <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                  CATATAN TAMBAHAN (OPSIONAL)
                </label>
                <textarea
                  value={formData.catatan}
                  onChange={(e) => handleChange('catatan', e.target.value)}
                  placeholder="Misal: HP sudah pernah diservis di tempat lain."
                  rows={2}
                  className="w-full min-h-[60px] resize-y rounded-xl border border-slate-300 px-4 py-3 text-[14px] outline-none transition-all duration-200 font-body focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Tukang & Biaya */}
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-card sm:p-6">
            <h3 className="text-[18px] font-semibold text-slate-900 mb-4">Tukang &amp; Biaya</h3>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-2">
                  TUKANG *
                </label>
                <TukangGrid
                  technicians={technicians}
                  selected={formData.tukang}
                  onSelect={(t) => handleChange('tukang', t)}
                />
                {errors.tukang && <p className="mt-1 text-[12px] text-rose-500">Pilih tukang</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                    ESTIMASI BIAYA *
                  </label>
                  <RpInput
                    value={formData.estimasi}
                    onChange={(v) => handleChange('estimasi', v)}
                    error={errors.estimasi}
                  />
                  {errors.estimasi && <p className="mt-1 text-[12px] text-rose-500">Estimasi wajib diisi</p>}
                </div>
                <div>
                  <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                    UPAH TUKANG (OPSIONAL)
                  </label>
                  <RpInput
                    value={formData.upah}
                    onChange={(v) => handleChange('upah', v)}
                  />
                  <p className="text-[11px] text-slate-400 mt-0.5">Upah untuk tukang, terpisah dari estimasi customer.</p>
                </div>
                <div>
                  <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                    DP (OPSIONAL)
                  </label>
                  <RpInput
                    value={formData.dp}
                    onChange={(v) => handleChange('dp', v)}
                  />
                  {errors.dp && <p className="mt-1 text-[12px] text-rose-500">DP tidak boleh melebihi estimasi</p>}
                </div>
              </div>
              <p className="text-[11px] text-slate-400">DP tidak boleh &gt; Estimasi. Kosongkan jika tidak ada DP.</p>

              {/* Payment posting: shown only when a DP is entered. The
                  Cash/Transfer method routes the whole DP to one account. */}
              {(Number(formData.dp) || 0) > 0 && (
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <p className="text-[12px] font-semibold text-slate-600 mb-2">
                    PEMBAYARAN DP
                  </p>
                  <div className="flex gap-2 mb-3">
                    {(['Cash', 'Transfer'] as const).map((m) => {
                      const active = payMethod === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => handleMethodChange(m)}
                          className={`flex-1 rounded-xl border px-4 py-2 text-[13px] font-semibold transition-colors ${
                            active
                              ? 'border-teal-500 bg-teal-50 text-teal-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                  <AccountPicker
                    label={payMethod === 'Cash' ? 'Akun Kas' : 'Akun Bank'}
                    filterType={payMethod === 'Cash' ? 'Cash' : 'Bank'}
                    accounts={accounts}
                    value={payAccount?.id ?? null}
                    onChange={(_id, account) => {
                      setPayAccount(account);
                      setPaymentError(null);
                    }}
                    error={paymentError}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl bg-slate-100 py-3 text-[14px] font-semibold text-slate-700 hover:bg-slate-200 transition-colors active:scale-[0.98]"
            >
              Batal
            </button>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 rounded-xl bg-teal-500 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-teal-600 active:scale-[0.98] disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Simpan Servis'}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}


/* ------------------------------------------------------------------ */
/*  Servis Toko Sendiri Form                                           */
/* ------------------------------------------------------------------ */

function ServisTokoForm({
  onClose,
  technicians,
}: {
  onClose: () => void;
  technicians: Technician[];
}) {
  const [selectedUnit, setSelectedUnit] = useState<ReadyUnit | null>(null);
  const [formData, setFormData] = useState({
    keluhan: '',
    catatan: '',
    tukang: '' as Technician | '',
    estimasi: '',
    upah: '',
  });
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [shaking, setShaking] = useState(false);
  const [unitSearch, setUnitSearch] = useState('');
  const [browseTab, setBrowseTab] = useState<'cari' | 'browse'>('browse');
  const [imeiSearch, setImeiSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Live READY stock units (real DB rows), replacing the old mock readyUnits.
  const [readyUnits, setReadyUnits] = useState<ReadyUnit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [unitsError, setUnitsError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getStockItems()
      .then((items) => {
        if (!active) return;
        const ready = items
          .filter((it) => it.status === 'READY')
          .map<ReadyUnit>((it) => ({
            realId: it.id,
            stkId: it.id,
            model: it.model,
            capacity: it.capacity,
            condition: it.condition,
            color: it.color,
            imei: it.imei ?? '',
            batteryHealth: 0,
            entryDate: it.created_at,
            warnings: [],
          }));
        setReadyUnits(ready);
        setUnitsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setUnitsError('Gagal memuat unit stok. Silakan coba lagi.');
        setUnitsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredUnits = useMemo(() => {
    const q = unitSearch.toLowerCase().trim();
    if (!q) return readyUnits;
    return readyUnits.filter(
      (u) =>
        u.model.toLowerCase().includes(q) ||
        u.imei.includes(q) ||
        u.stkId.toLowerCase().includes(q)
    );
  }, [unitSearch, readyUnits]);

  const handleChange = (field: string, value: string) => {
    setFormData((p) => ({ ...p, [field]: value }));
    if (errors[field]) setErrors((p) => ({ ...p, [field]: false }));
  };

  const validate = () => {
    const e: Record<string, boolean> = {};
    if (!selectedUnit) e.unit = true;
    if (!formData.keluhan.trim() || formData.keluhan.length < 3) e.keluhan = true;
    if (!formData.tukang) e.tukang = true;
    if (!formData.estimasi || Number(formData.estimasi) <= 0) e.estimasi = true;
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!validate() || !selectedUnit) return;
    setSaving(true);
    try {
      await recordServiceWithStockStatus({
        stockId: selectedUnit.realId,
        targetStatus: 'SERVIS',
        record: {
          customer_name: 'Toko Sendiri',
          phone_model: selectedUnit.model,
          capacity: selectedUnit.capacity || '',
          condition: selectedUnit.condition || '',
          color: selectedUnit.color || '',
          imei: selectedUnit.imei ?? '',
          battery_health: null,
          issue: formData.keluhan,
          additional_note: formData.catatan || '',
          status: 'ANTRIAN',
          estimated_cost: Number(formData.estimasi) || 0,
          work_cost: Number(formData.estimasi) || 0,
          dp: 0,
          completed_at: null,
          technician: formData.tukang || '',
          service_type: 'Toko Sendiri',
          stk_id: '',
          wage_amount: Number(formData.upah) || 0,
          wage_paid: false,
          picked_up: false,
          picked_up_at: null,
        },
      });
    } catch {
      setSaving(false);
      setSubmitError('Servis tidak dapat disimpan. Silakan coba lagi.');
      return;
    }
    setSaving(false);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-40 overflow-y-auto bg-off-white pb-20 pt-[76px] sm:pb-24 sm:pt-[88px]"
    >
      <div className="mx-auto max-w-[720px] px-4 pb-8 sm:px-6">
        <div className="mb-5 flex items-start gap-3 sm:mb-6 sm:items-center sm:gap-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft size={18} />
          </motion.button>
          <h2 className="font-display text-[28px] text-slate-900 leading-tight sm:text-[32px]">Servis Toko Sendiri</h2>
        </div>

        <motion.div
          animate={shaking ? { x: [0, -8, 8, -8, 8, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-4"
        >
          {/* Section 1: Pilih Unit HP */}
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-card sm:p-6">
            <h3 className="text-[18px] font-semibold text-slate-900 mb-1">Pilih Unit HP</h3>
            <p className="text-[13px] text-slate-500 mb-4">Pilih unit READY dari stok toko.</p>

            {errors.unit && (
              <p className="text-[12px] text-rose-500 mb-3">Pilih unit HP terlebih dahulu</p>
            )}

            {/* Selected unit chip */}
            <AnimatePresence>
              {selectedUnit && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-slate-900">{selectedUnit.model} &middot; {selectedUnit.capacity}</p>
                    <p className="text-[12px] text-slate-500">{selectedUnit.condition} &middot; {selectedUnit.color || '—'} &middot; BH: {selectedUnit.batteryHealth}%</p>
                    <p className="break-all font-mono text-[11px] text-slate-400">{selectedUnit.imei} &middot; {selectedUnit.stkId}</p>
                  </div>
                  <button
                    onClick={() => setSelectedUnit(null)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center self-end rounded-full bg-amber-200/60 text-amber-700 hover:bg-amber-200 sm:self-auto"
                  >
                    <X size={14} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tab Toggle */}
            <div className="relative flex bg-surface-sunk rounded-xl p-1 mb-4">
              <motion.div
                layoutId="toko-tab-indicator"
                className="absolute top-1 bottom-1 rounded-[10px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                style={{ left: browseTab === 'cari' ? 4 : '50%', width: 'calc(50% - 4px)' }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
              <button
                onClick={() => setBrowseTab('cari')}
                className={`relative z-10 flex-1 rounded-[10px] py-2 text-[13px] font-medium text-center transition-colors ${browseTab === 'cari' ? 'text-slate-900' : 'text-slate-500'}`}
              >
                Cari IMEI
              </button>
              <button
                onClick={() => setBrowseTab('browse')}
                className={`relative z-10 flex-1 rounded-[10px] py-2 text-[13px] font-medium text-center transition-colors ${browseTab === 'browse' ? 'text-slate-900' : 'text-slate-500'}`}
              >
                Browse Stok
              </button>
            </div>

            {browseTab === 'cari' ? (
              <div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={imeiSearch}
                    onChange={(e) => setImeiSearch(e.target.value.replace(/\D/g, '').slice(0, 20))}
                    placeholder="Masukkan IMEI..."
                    className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 px-4 text-[14px] font-mono focus:outline-none focus:border-teal-500"
                  />
                  <button
                    onClick={() => {
                      const found = readyUnits.find((u) => u.imei === imeiSearch);
                      if (found) setSelectedUnit(found);
                    }}
                    className="h-10 rounded-xl bg-teal-500 px-4 text-[13px] font-semibold text-white hover:bg-teal-600"
                  >
                    Cari
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* Search */}
                <div className="relative mb-3">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={unitSearch}
                    onChange={(e) => setUnitSearch(e.target.value)}
                    placeholder="Cari tipe / IMEI / STK-ID..."
                    className="w-full h-10 rounded-xl border border-slate-300 bg-white pl-9 pr-9 text-[13px] focus:outline-none focus:border-teal-500"
                  />
                  {unitSearch && (
                    <button onClick={() => setUnitSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Unit List */}
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {unitsLoading ? (
                    <p className="text-[13px] text-slate-400 text-center py-4">Memuat unit stok...</p>
                  ) : unitsError ? (
                    <p className="text-[13px] text-rose-500 text-center py-4">{unitsError}</p>
                  ) : readyUnits.length === 0 ? (
                    <p className="text-[13px] text-slate-400 text-center py-4">Tidak ada unit READY di stok</p>
                  ) : (
                    <>
                  {filteredUnits.map((unit) => (
                    <div
                      key={unit.stkId}
                      className={`rounded-xl border p-3 transition-all ${
                        selectedUnit?.stkId === unit.stkId
                          ? 'border-amber-300 bg-amber-50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[13px] font-semibold text-slate-900">{unit.model} &middot; {unit.capacity}</p>
                            {unit.warnings.map((w) => (
                              <span key={w} className="flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                <AlertTriangle size={10} /> {w}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500 flex-wrap">
                            <span className="break-all font-mono">{unit.stkId}</span>
                            <span>{unit.color || '—'}</span>
                            <span className="break-all font-mono">{unit.imei}</span>
                            <span>BH: {unit.batteryHealth}%</span>
                            <span>Masuk: {formatDate(unit.entryDate)}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:ml-2 sm:flex-row sm:items-center">
                          {unit.warnings.length > 0 && (
                            <button
                              onClick={() => {
                                // Simulate enrich: remove warnings
                                const enriched = { ...unit, warnings: [] as string[], color: unit.color || 'Black' };
                                setSelectedUnit(enriched);
                              }}
                              className="flex items-center justify-center gap-1 rounded-lg bg-purple-50 px-2.5 py-1.5 text-[11px] font-medium text-purple-700 hover:bg-purple-100 transition-colors"
                            >
                              <Edit3 size={11} /> Enrich
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedUnit(unit)}
                            className={`flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all ${
                              selectedUnit?.stkId === unit.stkId
                                ? 'bg-amber-500 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {selectedUnit?.stkId === unit.stkId ? <><Check size={13} /> Dipilih</> : 'Pilih'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredUnits.length === 0 && (
                    <p className="text-[13px] text-slate-400 text-center py-4">Tidak ada unit yang cocok.</p>
                  )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Keluhan & Diagnosa */}
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-card sm:p-6">
            <h3 className="text-[18px] font-semibold text-slate-900 mb-4">Keluhan &amp; Diagnosa</h3>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                  KELUHAN *
                </label>
                <textarea
                  value={formData.keluhan}
                  onChange={(e) => handleChange('keluhan', e.target.value)}
                  placeholder="Misal: Battery health turun, perlu ganti battery."
                  rows={3}
                  className={`w-full min-h-[80px] resize-y rounded-xl border px-4 py-3 text-[14px] outline-none transition-all duration-200 font-body ${
                    errors.keluhan ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-300 focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10'
                  }`}
                />
                {errors.keluhan && <p className="mt-1 text-[12px] text-rose-500">Keluhan minimal 3 karakter</p>}
                <p className="text-[11px] text-slate-400 mt-1">Minimal 3 karakter. Jelaskan apa yang mau diservis di unit ini.</p>
              </div>
              <div>
                <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                  CATATAN TAMBAHAN (OPSIONAL)
                </label>
                <textarea
                  value={formData.catatan}
                  onChange={(e) => handleChange('catatan', e.target.value)}
                  placeholder="Catatan untuk tukang"
                  rows={2}
                  className="w-full min-h-[60px] resize-y rounded-xl border border-slate-300 px-4 py-3 text-[14px] outline-none transition-all duration-200 font-body focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Tukang & Biaya */}
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-card sm:p-6">
            <h3 className="text-[18px] font-semibold text-slate-900 mb-4">Tukang &amp; Biaya</h3>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-2">
                  TUKANG *
                </label>
                <TukangGrid
                  technicians={technicians}
                  selected={formData.tukang}
                  onSelect={(t) => handleChange('tukang', t)}
                />
                {errors.tukang && <p className="mt-1 text-[12px] text-rose-500">Pilih tukang</p>}
              </div>
              <div>
                <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                  ESTIMASI BIAYA *
                </label>
                <RpInput
                  value={formData.estimasi}
                  onChange={(v) => handleChange('estimasi', v)}
                  error={errors.estimasi}
                />
                {errors.estimasi && <p className="mt-1 text-[12px] text-rose-500">Estimasi wajib diisi</p>}
                <p className="text-[11px] text-slate-400 mt-1">Modal toko sendiri — biaya yang dikeluarkan untuk servis ini.</p>
              </div>
              <div>
                <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                  UPAH TUKANG (OPSIONAL)
                </label>
                <RpInput
                  value={formData.upah}
                  onChange={(v) => handleChange('upah', v)}
                />
                <p className="text-[11px] text-slate-400 mt-1">Upah untuk tukang, terpisah dari estimasi biaya.</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            {submitError && (
              <p className="text-[12px] text-rose-500">{submitError}</p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl bg-slate-100 py-3 text-[14px] font-semibold text-slate-700 hover:bg-slate-200 transition-colors active:scale-[0.98]"
            >
              Batal
            </button>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 rounded-xl bg-amber-500 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-amber-600 active:scale-[0.98] disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Simpan Servis'}
            </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}


/* ------------------------------------------------------------------ */
/*  Klaim Garansi Form                                                 */
/* ------------------------------------------------------------------ */

function KlaimGaransiForm({
  onClose,
  technicians,
}: {
  onClose: () => void;
  technicians: Technician[];
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [imeiInput, setImeiInput] = useState('');
  const [foundRecord, setFoundRecord] = useState<WarrantyClaimLookupRecord | null>(null);
  const [imeiError, setImeiError] = useState(false);
  const [sales, setSales] = useState<TransactionWithStockDetails[]>([]);
  const [lookupLoading, setLookupLoading] = useState(true);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    keluhan: '',
    catatan: '',
    tukang: '' as Technician | '',
  });
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [shaking, setShaking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getTransactionsWithStockDetailsByType('Penjualan')
      .then((rows) => {
        if (!active) return;
        setSales(rows);
        setLookupLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLookupError('Gagal memuat riwayat penjualan. Silakan coba lagi.');
        setLookupLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const soldHints = useMemo(() => getSoldWarrantyHints(sales), [sales]);

  const handleCheckImei = () => {
    const imei = imeiInput.trim();
    if (imei.length < 10 || imei.length > 20) {
      setImeiError(true);
      return;
    }
    if (lookupLoading) {
      setLookupError('Riwayat penjualan masih dimuat. Tunggu sebentar lalu cek lagi.');
      return;
    }
    if (lookupError) {
      setImeiError(true);
      return;
    }
    setImeiError(false);
    const found = findSoldWarrantyClaim(sales, imei);
    if (found) {
      setFoundRecord(found);
      setStep(2);
    } else {
      setImeiError(true);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((p) => ({ ...p, [field]: value }));
    if (errors[field]) setErrors((p) => ({ ...p, [field]: false }));
  };

  const validate = () => {
    const e: Record<string, boolean> = {};
    if (!formData.keluhan.trim() || formData.keluhan.length < 3) e.keluhan = true;
    if (!formData.tukang) e.tukang = true;
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!validate() || !foundRecord) return;
    setSaving(true);
    try {
      const noteParts = [
        `Penjualan: ${foundRecord.transaction.id}`,
        foundRecord.warranty ? `Garansi: ${foundRecord.warranty}` : '',
        foundRecord.customerPhone ? `WA customer: ${foundRecord.customerPhone}` : '',
        formData.catatan.trim() ? `Catatan: ${formData.catatan.trim()}` : '',
      ].filter(Boolean);

      await recordServiceWithStockStatus({
        stockId: foundRecord.unit.id,
        targetStatus: 'SERVIS',
        record: {
          customer_name: foundRecord.customerName || 'Customer Garansi',
          phone_model: foundRecord.phoneModel,
          capacity: foundRecord.capacity || '',
          condition: foundRecord.condition || '',
          color: foundRecord.color || '',
          imei: foundRecord.imei || '',
          battery_health: foundRecord.batteryHealth ?? null,
          issue: formData.keluhan,
          additional_note: noteParts.join(' - '),
          status: 'ANTRIAN',
          estimated_cost: 0,
          dp: 0,
          completed_at: null,
          technician: formData.tukang || '',
          service_type: 'Klaim Garansi',
          stk_id: '',
          wage_amount: 0,
          wage_paid: false,
          picked_up: false,
          picked_up_at: null,
        },
      });
    } catch {
      setSaving(false);
      setSubmitError('Klaim garansi tidak dapat disimpan. Silakan coba lagi.');
      return;
    }
    setSaving(false);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-40 overflow-y-auto bg-off-white pb-20 pt-[76px] sm:pb-24 sm:pt-[88px]"
    >
      <div className="mx-auto max-w-[720px] px-4 pb-8 sm:px-6">
        <div className="mb-5 flex items-start gap-3 sm:mb-6 sm:items-center sm:gap-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              if (step === 2) { setStep(1); setFoundRecord(null); setImeiInput(''); }
              else onClose();
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft size={18} />
          </motion.button>
          <h2 className="font-display text-[28px] text-slate-900 leading-tight sm:text-[32px]">Klaim Garansi</h2>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          <div className={`flex items-center justify-center h-7 w-7 rounded-full text-[12px] font-semibold ${step === 1 ? 'bg-purple-500 text-white' : 'bg-purple-100 text-purple-600'}`}>
            1
          </div>
          <div className={`h-0.5 flex-1 ${step === 2 ? 'bg-purple-300' : 'bg-slate-200'}`} />
          <div className={`flex items-center justify-center h-7 w-7 rounded-full text-[12px] font-semibold ${step === 2 ? 'bg-purple-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
            2
          </div>
        </div>

        <motion.div
          animate={shaking ? { x: [0, -8, 8, -8, 8, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-4"
        >
          {step === 1 ? (
            /* Step 1: Cek IMEI */
            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-card sm:p-6">
              <h3 className="text-[18px] font-semibold text-slate-900 mb-1">Cek IMEI</h3>
              <p className="text-[13px] text-slate-500 mb-4">
                Masukkan IMEI unit toko yang sudah terjual.
              </p>

              <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                IMEI (10-20 DIGIT) *
              </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={imeiInput}
                  onChange={(e) => {
                    setImeiInput(e.target.value.replace(/\D/g, '').slice(0, 20));
                    setImeiError(false);
                  }}
                  placeholder="352345678901234"
                  className={`h-11 min-w-0 flex-1 rounded-xl border px-4 text-[14px] font-mono outline-none transition-all duration-200 ${
                    imeiError ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-300 focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10'
                  }`}
                />
                <button
                  onClick={handleCheckImei}
                  disabled={lookupLoading}
                  className="h-11 rounded-xl bg-purple-500 px-6 text-[14px] font-semibold text-white hover:bg-purple-600 transition-colors disabled:opacity-60"
                >
                  {lookupLoading ? 'Memuat...' : 'Cek'}
                </button>
              </div>
              {lookupError && (
                <p className="mt-1 text-[12px] text-rose-500">{lookupError}</p>
              )}
              {imeiError && (
                <p className="mt-1 text-[12px] text-rose-500">
                  {imeiInput.length < 10
                    ? 'IMEI minimal 10 digit'
                    : 'Unit TERJUAL dari penjualan toko tidak ditemukan untuk IMEI ini.'}
                </p>
              )}
              <p className="text-[11px] text-slate-400 mt-2">IMEI bisa dilihat di belakang HP atau dial *#06#</p>

              <div className="mt-5 rounded-lg bg-slate-50 border border-slate-200 p-3">
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-2">Unit terjual ber-IMEI:</p>
                {lookupLoading ? (
                  <p className="text-[12px] text-slate-400">Memuat riwayat penjualan...</p>
                ) : soldHints.length === 0 ? (
                  <p className="text-[12px] text-slate-400">Belum ada unit TERJUAL ber-IMEI.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {soldHints.map((hint) => (
                      <button
                        key={hint.id}
                        onClick={() => { setImeiInput(hint.imei); setImeiError(false); }}
                        className="rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-left text-[11px] text-slate-600 hover:border-purple-300 hover:text-purple-600 transition-colors"
                      >
                        <span className="block font-mono">{hint.imei}</span>
                        <span className="block text-[10px] text-slate-400">{hint.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Step 2: Form Klaim */
            <>
              {/* Data Konsumen (auto-populated) */}
              {foundRecord && (
                <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-card sm:p-6">
                  <h3 className="text-[18px] font-semibold text-slate-900 mb-4">Data Konsumen</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Nama</p>
                      <p className="mt-1 text-[13px] text-slate-700">{foundRecord.customerName}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">WhatsApp</p>
                      <p className="mt-1 text-[13px] text-slate-700">{foundRecord.customerPhone}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Tanggal Beli</p>
                      <p className="mt-1 text-[13px] text-slate-700">{formatDate(foundRecord.purchaseDate)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Garansi</p>
                      <p className="mt-1 text-[13px] text-slate-700">{foundRecord.warranty}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Detail HP (auto-populated) */}
              {foundRecord && (
                <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-card sm:p-6">
                  <h3 className="text-[18px] font-semibold text-slate-900 mb-4">Detail HP</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Model</p>
                      <p className="mt-1 text-[13px] text-slate-700">{foundRecord.phoneModel} &middot; {foundRecord.capacity}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Kondisi</p>
                      <p className="mt-1 text-[13px] text-slate-700">{foundRecord.condition}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Warna</p>
                      <p className="mt-1 text-[13px] text-slate-700">{foundRecord.color}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">IMEI</p>
                      <p className="mt-1 font-mono text-[12px] text-slate-700">{foundRecord.imei}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Battery Health</p>
                      <p className="mt-1 text-[13px] text-slate-700">
                        {foundRecord.batteryHealth !== null ? `${foundRecord.batteryHealth}%` : 'Tidak tercatat'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Harga Beli</p>
                      <p className="mt-1 font-mono text-[13px] text-slate-700">{formatPrice(foundRecord.salePrice)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Keluhan & Diagnosa */}
              <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-card sm:p-6">
                <h3 className="text-[18px] font-semibold text-slate-900 mb-4">Keluhan &amp; Diagnosa</h3>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                      KELUHAN *
                    </label>
                    <textarea
                      value={formData.keluhan}
                      onChange={(e) => handleChange('keluhan', e.target.value)}
                      placeholder="Jelaskan masalah yang di klaim..."
                      rows={3}
                      className={`w-full min-h-[80px] resize-y rounded-xl border px-4 py-3 text-[14px] outline-none transition-all duration-200 font-body ${
                        errors.keluhan ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-300 focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10'
                      }`}
                    />
                    {errors.keluhan && <p className="mt-1 text-[12px] text-rose-500">Keluhan minimal 3 karakter</p>}
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                      CATATAN TAMBAHAN (OPSIONAL)
                    </label>
                    <textarea
                      value={formData.catatan}
                      onChange={(e) => handleChange('catatan', e.target.value)}
                      placeholder="Catatan tambahan..."
                      rows={2}
                      className="w-full min-h-[60px] resize-y rounded-xl border border-slate-300 px-4 py-3 text-[14px] outline-none transition-all duration-200 font-body focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                    />
                  </div>
                </div>
              </div>

              {/* Tukang & Biaya */}
              <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-card sm:p-6">
                <h3 className="text-[18px] font-semibold text-slate-900 mb-4">Tukang &amp; Biaya</h3>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-2">
                      TUKANG *
                    </label>
                    <TukangGrid
                      technicians={technicians}
                      selected={formData.tukang}
                      onSelect={(t) => handleChange('tukang', t)}
                    />
                    {errors.tukang && <p className="mt-1 text-[12px] text-rose-500">Pilih tukang</p>}
                  </div>
                  <div className="rounded-lg bg-purple-50 border border-purple-200 p-3">
                    <p className="text-[13px] text-purple-800">
                      <span className="font-semibold">Estimasi Biaya: Ditanggung Toko</span> — Servis ini adalah klaim garansi, biaya ditanggung penuh oleh toko.
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-2">
                {submitError && (
                  <p className="text-[12px] text-rose-500">{submitError}</p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 rounded-xl bg-slate-100 py-3 text-[14px] font-semibold text-slate-700 hover:bg-slate-200 transition-colors active:scale-[0.98]"
                >
                  Kembali
                </button>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-purple-500 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-purple-600 active:scale-[0.98] disabled:opacity-60"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Klaim'}
                </motion.button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}


/* ------------------------------------------------------------------ */
/*  Technician Manager view                                            */
/* ------------------------------------------------------------------ */

function TechnicianManagerView({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: (rows: DbTechnician[]) => void;
}) {
  const [rows, setRows] = useState<DbTechnician[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftName, setDraftName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getTechnicians()
      .then((data) => {
        setRows(data);
        onChanged(data);
      })
      .catch(() => setError('Gagal memuat teknisi.'))
      .finally(() => setLoading(false));
  }, [onChanged]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    const name = draftName.trim();
    if (!name) {
      setError('Nama teknisi wajib diisi.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createTechnician({ name });
      const next = [...rows, created].sort((a, b) => a.name.localeCompare(b.name, 'id'));
      setRows(next);
      onChanged(next);
      setDraftName('');
    } catch {
      setError('Teknisi tidak dapat ditambahkan.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    const name = editingName.trim();
    if (!name) {
      setError('Nama teknisi wajib diisi.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateTechnician(id, { name });
      const next = rows
        .map((row) => (row.id === id ? updated : row))
        .sort((a, b) => a.name.localeCompare(b.name, 'id'));
      setRows(next);
      onChanged(next);
      setEditingId(null);
      setEditingName('');
    } catch {
      setError('Nama teknisi tidak dapat diperbarui.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-40 overflow-y-auto bg-off-white pb-20 pt-[76px] sm:pb-24 sm:pt-[88px]"
    >
      <div className="mx-auto max-w-[720px] px-4 pb-8 sm:px-6">
        <div className="mb-5 flex items-start gap-3 sm:mb-6 sm:items-center sm:gap-4">
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="font-display text-[28px] text-slate-900 leading-tight sm:text-[32px]">Kelola Teknisi</h2>
            <p className="text-[13px] text-slate-500">Tambah atau edit nama teknisi untuk form servis.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
          <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
            Nama Teknisi Baru
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={draftName}
              onChange={(event) => {
                setDraftName(event.target.value);
                setError(null);
              }}
              className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-4 text-[14px] outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
              placeholder="Nama teknisi"
            />
            <button
              onClick={handleAdd}
              disabled={saving}
              className="h-11 rounded-xl bg-teal-500 px-5 text-[14px] font-semibold text-white hover:bg-teal-600 disabled:opacity-60"
            >
              Tambah
            </button>
          </div>
          {error && (
            <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-600">
              {error}
            </p>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-[13px] text-slate-500 shadow-card">
              Memuat teknisi...
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-[13px] text-slate-500 shadow-card">
              Belum ada teknisi aktif.
            </div>
          ) : (
            rows.map((row) => {
              const editing = editingId === row.id;
              return (
                <div
                  key={row.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:flex-row sm:items-center"
                >
                  <User size={17} className="shrink-0 text-slate-400" />
                  {editing ? (
                    <input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-[14px] outline-none focus:border-teal-500"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 text-[14px] font-semibold text-slate-800">{row.name}</span>
                  )}
                  {editing ? (
                    <>
                      <button
                        onClick={() => handleSaveEdit(row.id)}
                        disabled={saving}
                        className="rounded-lg bg-teal-500 px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
                      >
                        Simpan
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setEditingName('');
                        }}
                        className="rounded-lg bg-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-600"
                      >
                        Batal
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingId(row.id);
                        setEditingName(row.name);
                        setError(null);
                      }}
                      className="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-600 hover:bg-slate-200"
                    >
                      <Edit3 size={12} />
                      Edit
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
}


/* ------------------------------------------------------------------ */
/*  Main Servis Page                                                   */
/* ------------------------------------------------------------------ */

type FormMode = 'customer' | 'toko' | 'garansi' | null;

export default function Servis() {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<'hub' | 'monitor' | 'utang' | 'teknisi' | 'form'>('hub');
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [technicians, setTechnicians] = useState<Technician[]>(DEFAULT_TECHNICIANS);

  const applyTechnicians = useCallback((rows: DbTechnician[]) => {
    const names = rows.map((row) => row.name).filter(Boolean);
    setTechnicians(names.length > 0 ? names : DEFAULT_TECHNICIANS);
  }, []);

  useEffect(() => {
    getTechnicians()
      .then(applyTechnicians)
      .catch(() => setTechnicians(DEFAULT_TECHNICIANS));
  }, [applyTechnicians]);

  const openForm = (mode: FormMode) => {
    setFormMode(mode);
    setActiveView('form');
  };

  const closeView = () => {
    setActiveView('hub');
    setFormMode(null);
  };

  return (
    <>
      {/* Hub View */}
      <AnimatePresence>
        {activeView === 'hub' && (
          <motion.div
            key="hub"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Page Header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: easeOutExpo }}
              className="mb-6 sm:mb-8"
            >
              <div className="mb-3 flex items-center gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate('/')}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  <ArrowLeft size={18} />
                </motion.button>
                <h1 className="font-display text-[34px] text-slate-900 leading-tight sm:text-[40px]">Servis</h1>
              </div>
              <p className="ml-12 text-[13px] text-slate-500 sm:text-[14px]">Pilih mode untuk lanjut</p>
            </motion.div>

            {/* Greeting */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: easeOutExpo }}
              className="mb-7 sm:mb-10"
            >
              <h2 className="font-display text-[27px] text-slate-900 leading-tight italic sm:text-[32px]">
                Mau ngapain hari ini?
              </h2>
              <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-slate-500 sm:text-[14px]">
                Pilih salah satu mode di bawah. Servis dari toko sendiri otomatis bareng cascade stok, klaim garansi pakai lookup IMEI.
              </p>
            </motion.div>

            {/* Mode Cards Grid */}
            <motion.div
              variants={cardStagger}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              <ModeCard
                icon={<Users size={28} />}
                title="Servis Customer"
                description="HP dari customer luar. Input nama, WA, dan detail HP manual + IMEI 15 digit."
                actionText="Buka form"
                accentColor="#14B8A6"
                accentBg="rgba(20, 184, 166, 0.1)"
                accentText="#0D9488"
                tintBg="rgba(20, 184, 166, 0.04)"
                onClick={() => openForm('customer')}
              />
              <ModeCard
                icon={<Store size={28} />}
                title="Servis Toko Sendiri"
                description="Unit dari stok toko (status READY). Pilih dari Unit Selector, stok auto jadi SERVIS."
                actionText="Buka form"
                accentColor="#D4A574"
                accentBg="rgba(212, 165, 116, 0.1)"
                accentText="#B8885A"
                tintBg="rgba(212, 165, 116, 0.04)"
                onClick={() => openForm('toko')}
              />
              <ModeCard
                icon={<ShieldCheck size={28} />}
                title="Klaim Garansi"
                description="Customer balik bawa unit yang dijual sini. Cek IMEI otomatis tarik data nota lama."
                actionText="Buka form"
                accentColor="#8B5CF6"
                accentBg="rgba(139, 92, 246, 0.1)"
                accentText="#7C3AED"
                tintBg="rgba(139, 92, 246, 0.04)"
                onClick={() => openForm('garansi')}
              />
              <ModeCard
                icon={<Monitor size={28} />}
                title="Monitor Servis"
                description="Lihat semua servis: ANTRIAN, PROSES, SELESAI, GAGAL. Update status, ambil HP, refund DP."
                actionText="Buka daftar"
                accentColor="#64748B"
                accentBg="rgba(71, 85, 105, 0.08)"
                accentText="#475569"
                tintBg="rgba(71, 85, 105, 0.03)"
                onClick={() => setActiveView('monitor')}
              />
              <ModeCard
                icon={<Banknote size={28} />}
                title="Utang Upah"
                description="Upah servis yang belum dibayar ke tukang. Lihat akrual per tukang & bayar (cash/transfer)."
                actionText="Buka daftar"
                accentColor="#0D9488"
                accentBg="rgba(13, 148, 136, 0.1)"
                accentText="#0F766E"
                tintBg="linear-gradient(135deg, rgba(13, 148, 136, 0.06), rgba(20, 184, 166, 0.03))"
                fullWidth
                decorative={
                  <span className="font-display text-[72px] sm:text-[80px] text-teal-600 leading-none select-none" style={{ opacity: 0.08 }}>
                    Up
                  </span>
                }
                onClick={() => setActiveView('utang')}
              />
              <ModeCard
                icon={<User size={28} />}
                title="Kelola Teknisi"
                description="Tambah atau edit nama teknisi yang dipakai di form servis dan klaim garansi."
                actionText="Buka menu"
                accentColor="#475569"
                accentBg="rgba(71, 85, 105, 0.08)"
                accentText="#334155"
                tintBg="rgba(71, 85, 105, 0.03)"
                fullWidth
                onClick={() => setActiveView('teknisi')}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay Views */}
      <AnimatePresence>
        {activeView === 'monitor' && <MonitorServisView onClose={closeView} technicians={technicians} />}
        {activeView === 'utang' && <UtangUpahView onClose={closeView} />}
        {activeView === 'teknisi' && <TechnicianManagerView onClose={closeView} onChanged={applyTechnicians} />}
        {activeView === 'form' && formMode === 'customer' && <ServisCustomerForm onClose={closeView} technicians={technicians} />}
        {activeView === 'form' && formMode === 'toko' && <ServisTokoForm onClose={closeView} technicians={technicians} />}
        {activeView === 'form' && formMode === 'garansi' && <KlaimGaransiForm onClose={closeView} technicians={technicians} />}
      </AnimatePresence>
    </>
  );
}
