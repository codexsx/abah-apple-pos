import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { motion, useInView } from 'framer-motion';
import CountUp from 'react-countup';
import {
  ShoppingCart,
  ShoppingBag,
  Wrench,
  Receipt,
  ArrowLeftRight,
  Package,
  TrendingUp,
  CheckCircle,
  HandCoins,
  ClipboardList,
  FileText,
  Users,
  ArrowUpRight,
  PanelLeft,
  Calendar,
  Clock,
  Smartphone,
  Loader2,
  Camera,
  Store,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyProfile } from '@/contexts/useCompanyProfile';
import DashboardProfilePhotoCard from '@/components/DashboardProfilePhotoCard';
import NominalGuard from '@/components/NominalGuard';
import ProfilePhotoDialog from '@/components/ProfilePhotoDialog';
import StaffPerformanceBadge from '@/components/StaffPerformanceBadge';
import StoreStories from '@/components/StoreStories';
import { TransactionStaffBadge } from '@/components/TransactionStaffBadge';
import { type MiniStat, type DailyStat } from '@/data/mockData';
import { getAgents, getAgentTransactions, getAgentBalance, type Agent, type AgentTransaction } from '@/services/agents';
import { getAccessories, type Accessory } from '@/services/accessories';
import { buildDashboardInventorySummary } from '@/services/dashboardInventory';
import { getSpareparts, type Sparepart } from '@/services/spareparts';
import { getStockItems, type StockItem } from '@/services/stock';
import { getServiceRecords, type ServiceRecord } from '@/services/services';
import { getTransactions, getTransactionDisplayDetail, type Transaction } from '@/services/transactions';
import { getAccountPickerData, type AccountWithBalance } from '@/services/accounts';
import { canAccessPath } from '@/services/routePermissions';
import { getOwnStaffPerformance, type StaffPerformance } from '@/services/staffPerformance';
import { useCanViewAgentMoney } from '@/hooks/useCanViewAgentMoney';

/* ──────────────────────────────── easing tokens */
const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];
const easeOutExpo = [0.19, 1, 0.22, 1] as [number, number, number, number];

/* ──────────────────────────────── Helpers */
function formatRupiah(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID');
}

function formatCompact(n: number) {
  return n.toLocaleString('id-ID');
}

/* ──────────────────────────────── Profile Card */
function ProfileCard({
  date,
  performance,
  performanceLoading,
}: {
  date: string;
  performance: StaffPerformance | null;
  performanceLoading: boolean;
}) {
  const { profile } = useAuth();
  const { companyProfile } = useCompanyProfile();
  const initials = profile?.initials || profile?.name?.slice(0, 2).toUpperCase() || 'US';
  const displayName = profile?.name || profile?.email?.split('@')[0] || 'Pengguna';
  const role = profile?.role || 'USER';
  const avatarUrl = profile?.avatar_url || '';
  const companyName = companyProfile.name || 'Sixcode Smart OS';
  const [photoOpen, setPhotoOpen] = useState(false);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: easeOutExpo }}
        className="relative"
      >
        <div className="relative">
          {/* Clickable avatar — shows the uploaded photo or initials, opens the
              photo dialog on click (camera overlay hints at editability). */}
          <DashboardProfilePhotoCard
            variant="hero"
            avatarUrl={avatarUrl}
            avatarCrop={profile ?? undefined}
            displayName={displayName}
            initials={initials}
            role={role}
            metaLabel={`${companyName} - ${date}`}
            onEditPhoto={() => setPhotoOpen(true)}
          />
          <StaffPerformanceBadge performance={performance} loading={performanceLoading} />
          <div className="hidden">
            <p className="text-[13px] font-medium text-blue-900/55">Welcome in,</p>
            <h2 className="text-[28px] font-semibold leading-tight tracking-tight font-body">{displayName}</h2>
            <p className="text-[14px] text-blue-900/60 flex items-center gap-2 mt-1">
              <Calendar size={14} />
              {date}
            </p>
            <div className="mt-4 flex items-center gap-3 rounded-[24px] border border-white/70 bg-white/55 p-3 shadow-lg shadow-blue-900/10 backdrop-blur-xl">
              {companyProfile.logo_url ? (
                <img
                  src={companyProfile.logo_url}
                  alt={companyName}
                  className="h-10 w-10 shrink-0 rounded-2xl object-cover ring-1 ring-white/70"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-blue-700 ring-1 ring-white/70">
                  <Store size={18} />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-slate-950">{companyName}</p>
                <p className="text-[11px] font-medium text-blue-900/50">Smart Retail OS</p>
              </div>
            </div>
          </div>
        </div>
        <div className="hidden">
          <span className="rounded-full border border-white/70 bg-white/65 px-3 py-1 text-[12px] font-semibold text-blue-950 shadow-sm backdrop-blur-xl">
            {role}
          </span>
          <button
            type="button"
            onClick={() => setPhotoOpen(true)}
            className="rounded-full border border-white/70 bg-white/65 px-3 py-1 text-[12px] font-semibold text-blue-950 shadow-sm backdrop-blur-xl flex items-center gap-1 hover:bg-white/80 transition-colors"
          >
            <Camera size={12} /> Ubah Foto
          </button>
        </div>
      </motion.div>

      <ProfilePhotoDialog open={photoOpen} onClose={() => setPhotoOpen(false)} />
    </>
  );
}

/* ──────────────────────────────── Stat Pill */
const miniStatIcons: Record<string, React.ElementType> = {
  TrendingUp,
  ShoppingBag,
  Wrench,
  Package,
};

function StatPill({ stat, index }: { stat: MiniStat; index: number }) {
  const Icon = miniStatIcons[stat.icon] || Package;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 + index * 0.08, ease: easeSmooth }}
      className="flex flex-col rounded-2xl bg-white p-4 shadow-card border border-slate-100"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <Icon size={16} strokeWidth={2} />
        </div>
        <span className="text-[12px] font-medium text-slate-500">{stat.label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[26px] font-bold text-slate-900">
          <CountUp end={stat.value} duration={1.2} separator="." />
        </span>
        <span className="text-[12px] text-slate-400">{stat.unit}</span>
      </div>
    </motion.div>
  );
}

/* ──────────────────────────────── Daily Stats Cards */
const dailyStatIcons: Record<string, React.ElementType> = {
  TrendingUp,
  ShoppingBag,
  CheckCircle,
  Receipt,
};

function DailyStatsSection({ stats, loading }: { stats: DailyStat[]; loading: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: easeSmooth }}
      className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-card"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[16px] font-semibold text-slate-900 font-body">Ringkasan Hari Ini</h3>
        <span className="text-[12px] text-slate-400">Live</span>
      </div>
      {loading ? (
        <div className="flex h-[140px] items-center justify-center">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {stats.map((stat) => {
            const Icon = dailyStatIcons[stat.icon] || TrendingUp;
            // Money totals (prefix "Rp ") are aggregate Nominal figures; counts are not.
            const isNominal = stat.prefix.trim() === 'Rp';
            const figure = `${stat.prefix}${stat.value.toLocaleString('id-ID')}${stat.suffix}`;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="flex flex-col gap-1 rounded-2xl bg-slate-50 p-4"
              >
                <div className="flex items-center gap-2">
                  <Icon size={16} style={{ color: stat.color }} strokeWidth={2} />
                  <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-slate-500">
                    {stat.label}
                  </span>
                </div>
                <span className="font-mono text-[22px] font-bold text-slate-900">
                  {isNominal ? <NominalGuard>{figure}</NominalGuard> : figure}
                </span>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

/* ──────────────────────────────── Widget Card Base */
interface WidgetProps {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  iconBg?: string;
  iconColor?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  delay?: number;
  className?: string;
}

function WidgetCard({
  title,
  subtitle,
  icon: Icon,
  iconBg = 'bg-blue-50',
  iconColor = 'text-blue-600',
  children,
  footer,
  delay = 0,
  className = '',
}: WidgetProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: easeSmooth }}
      className={`rounded-[32px] border border-slate-100 bg-white p-6 shadow-card ${className}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${iconBg} ${iconColor}`}>
            <Icon size={22} strokeWidth={2} />
          </div>
          <div>
            <h3 className="text-[16px] font-semibold text-slate-900 font-body">{title}</h3>
            {subtitle && <p className="text-[12px] text-slate-500">{subtitle}</p>}
          </div>
        </div>
      </div>
      {children}
      {footer && <div className="mt-4 pt-4 border-t border-slate-100">{footer}</div>}
    </motion.div>
  );
}

/* ──────────────────────────────── Quick Action Widget Card */
interface ActionWidgetData {
  title: string;
  description: string;
  icon: React.ElementType;
  accent: string;
  bgTint: string;
  iconBg: string;
  route: string;
}

interface RouteMenuItem {
  label: string;
  route: string;
  icon?: React.ElementType;
}

const actionWidgets: ActionWidgetData[] = [
  {
    title: 'Penjualan',
    description: 'Jual HP ke customer',
    icon: ShoppingCart,
    accent: '#2563EB',
    bgTint: 'rgba(37, 99, 235, 0.06)',
    iconBg: 'rgba(37, 99, 235, 0.12)',
    route: '/penjualan',
  },
  {
    title: 'Pembelian',
    description: 'Input HP masuk ke stok',
    icon: ShoppingBag,
    accent: '#0EA5E9',
    bgTint: 'rgba(14, 165, 233, 0.06)',
    iconBg: 'rgba(14, 165, 233, 0.12)',
    route: '/pembelian',
  },
  {
    title: 'Servis Baru',
    description: 'Input servis HP',
    icon: Wrench,
    accent: '#8B5CF6',
    bgTint: 'rgba(139, 92, 246, 0.06)',
    iconBg: 'rgba(139, 92, 246, 0.12)',
    route: '/servis',
  },
  {
    title: 'Pengeluaran',
    description: 'Catat keluar kas',
    icon: Receipt,
    accent: '#334155',
    bgTint: 'rgba(51, 65, 85, 0.04)',
    iconBg: 'rgba(51, 65, 85, 0.08)',
    route: '/pengeluaran',
  },
  {
    title: 'Tukar Tambah',
    description: 'TT bidirectional',
    icon: ArrowLeftRight,
    accent: '#06B6D4',
    bgTint: 'rgba(6, 182, 212, 0.06)',
    iconBg: 'rgba(6, 182, 212, 0.12)',
    route: '/tukar-tambah',
  },
];

const operasiItems: RouteMenuItem[] = [
  { label: 'Ambil Pelengkap', route: '/ambil-pelengkap', icon: PanelLeft },
  { label: 'Pemasukan Lain', route: '/pemasukan-lain', icon: HandCoins },
  { label: 'Utang Upah', route: '/servis', icon: Wrench },
];

const riwayatItems: RouteMenuItem[] = [
  { label: 'Riwayat Pembelian', route: '/riwayat/pembelian' },
  { label: 'Riwayat Penjualan', route: '/riwayat/penjualan' },
  { label: 'Riwayat Kas', route: '/riwayat/pengeluaran' },
  { label: 'Riwayat Tukar Tambah', route: '/riwayat/tukar-tambah' },
];

function ActionWidget({ card, index }: { card: ActionWidgetData; index: number }) {
  const navigate = useNavigate();
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const Icon = card.icon;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const id = Date.now();
        setRipples((prev) => [...prev, { id, x, y }]);
        setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 500);
      }
      setTimeout(() => navigate(card.route), 200);
    },
    [navigate, card.route]
  );

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 + index * 0.08, ease: easeSmooth }}
      whileHover={{ y: -6, transition: { duration: 0.3, ease: easeSmooth } }}
      whileTap={{ scale: 0.97 }}
      onClick={handleClick}
      className="group relative cursor-pointer overflow-hidden rounded-[28px] border border-slate-100 p-5 shadow-card transition-shadow hover:shadow-card-hover"
      style={{ backgroundColor: card.bgTint }}
    >
      {ripples.map((ripple) => (
        <motion.span
          key={ripple.id}
          initial={{ width: 0, height: 0, opacity: 0.35 }}
          animate={{ width: 400, height: 400, opacity: 0 }}
          transition={{ duration: 0.5, ease: easeSmooth }}
          className="pointer-events-none absolute rounded-full"
          style={{
            left: ripple.x,
            top: ripple.y,
            marginLeft: -200,
            marginTop: -200,
            backgroundColor: card.accent,
          }}
        />
      ))}

      <div className="flex items-start justify-between mb-4">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110"
          style={{ backgroundColor: card.iconBg }}
        >
          <Icon size={24} style={{ color: card.accent }} strokeWidth={2} />
        </div>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full opacity-0 transition-all duration-300 group-hover:opacity-100"
          style={{ backgroundColor: card.iconBg }}
        >
          <ArrowUpRight size={16} style={{ color: card.accent }} />
        </div>
      </div>

      <h3 className="text-[17px] font-semibold text-slate-900 font-body">{card.title}</h3>
      <p className="mt-1 text-[13px] text-slate-500 font-body">{card.description}</p>

      <div className="mt-4 h-1.5 w-full rounded-full bg-white/60 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${60 + index * 8}%` }}
          transition={{ duration: 1, delay: 0.5 + index * 0.1, ease: easeOutExpo }}
          className="h-full rounded-full"
          style={{ backgroundColor: card.accent }}
        />
      </div>
    </motion.div>
  );
}

/* ──────────────────────────────── Agen Widget */
function AgenWidget() {
  const navigate = useNavigate();
  const canViewAgentMoney = useCanViewAgentMoney();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [transactions, setTransactions] = useState<AgentTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      getAgents(),
      canViewAgentMoney ? getAgentTransactions() : Promise.resolve([]),
    ])
      .then(([agentsData, txData]) => {
        if (!mounted) return;
        setAgents(agentsData);
        setTransactions(txData);
      })
      .catch((err) => console.error('[AgenWidget] load error:', err))
      .finally(() => setLoading(false));
    return () => { mounted = false; };
  }, [canViewAgentMoney]);

  const totalDebt = getAgentBalance(transactions);
  const isDeposit = totalDebt < 0;

  return (
    <WidgetCard
      title="Agen"
      subtitle="Saldo, STOR & nota agen"
      icon={Users}
      delay={0.45}
      footer={
        <button
          onClick={() => navigate('/agen')}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Buka Manajemen Agen <ArrowUpRight size={14} />
        </button>
      }
    >
      {loading ? (
        <div className="flex h-[140px] items-center justify-center">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Total Agen</p>
              <p className="font-mono text-[28px] font-bold text-slate-900">{agents.length}</p>
            </div>
            <div className={`rounded-2xl p-4 ${canViewAgentMoney ? (isDeposit ? 'bg-blue-50' : 'bg-rose-50') : 'bg-slate-50'}`}>
              <p className={`text-[11px] font-medium uppercase tracking-wide ${canViewAgentMoney ? (isDeposit ? 'text-blue-500' : 'text-rose-500') : 'text-slate-500'}`}>
                {canViewAgentMoney ? (isDeposit ? 'Total Deposit' : 'Total Hutang') : 'Nominal Agen'}
              </p>
              <p className={`font-mono text-[18px] font-bold ${canViewAgentMoney ? (isDeposit ? 'text-blue-600' : 'text-rose-600') : 'text-slate-500'}`}>
                {canViewAgentMoney ? formatRupiah(Math.abs(totalDebt)) : 'Dikunci'}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {agents.slice(0, 2).map((agent) => (
              <div key={agent.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-[11px] font-bold">
                    {agent.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-[13px] font-medium text-slate-700">{agent.name}</span>
                </div>
                <span className="font-mono text-[12px] text-slate-400">{agent.code}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </WidgetCard>
  );
}

/* ──────────────────────────────── Stok Widget */
function StokWidget() {
  const navigate = useNavigate();
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [spareparts, setSpareparts] = useState<Sparepart[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([getStockItems(), getAccessories(), getSpareparts()])
      .then(([stockData, accessoryData, sparepartData]) => {
        if (!mounted) return;
        setStockItems(stockData);
        setAccessories(accessoryData);
        setSpareparts(sparepartData);
      })
      .catch((err) => console.error('[StokWidget] load error:', err))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const inventorySummary = useMemo(
    () => buildDashboardInventorySummary(stockItems, accessories, spareparts),
    [stockItems, accessories, spareparts],
  );

  return (
    <WidgetCard
      title="Stok & Inventaris"
      subtitle="HP, pelengkap, sparepart"
      icon={Package}
      delay={0.5}
      footer={
        <button
          onClick={() => navigate('/stok')}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Kelola Stok <ArrowUpRight size={14} />
        </button>
      }
    >
      {loading ? (
        <div className="flex h-[140px] items-center justify-center">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Smartphone size={26} strokeWidth={2} />
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">HP Ready</p>
              <p className="font-mono text-[32px] font-bold text-slate-900">
                {formatCompact(inventorySummary.readyHpTotal)}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {inventorySummary.readyConditionRows.length > 0 ? (
              inventorySummary.readyConditionRows.map(([condition, count]) => (
                <div key={condition} className="flex items-center justify-between text-[13px]">
                  <span className="text-slate-600">{condition}</span>
                  <span className="font-mono font-semibold text-slate-900">{count} unit</span>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-500">Tidak ada HP ready</span>
                <span className="font-mono font-semibold text-slate-400">0 unit</span>
              </div>
            )}
            <div className="border-t border-slate-100 pt-2 space-y-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-600">Pelengkap</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatCompact(inventorySummary.accessoryTotal)} pcs
                </span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-600">Sparepart</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatCompact(inventorySummary.sparepartTotal)} pcs
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </WidgetCard>
  );
}

/* ──────────────────────────────── Servis Widget */
function ServisWidget() {
  const navigate = useNavigate();
  const [serviceRecords, setServiceRecords] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getServiceRecords()
      .then((data) => { if (mounted) setServiceRecords(data); })
      .catch((err) => console.error('[ServisWidget] load error:', err))
      .finally(() => setLoading(false));
    return () => { mounted = false; };
  }, []);

  const activeCount = serviceRecords.filter((s) => s.status === 'ANTRIAN' || s.status === 'PROSES').length;
  const doneCount = serviceRecords.filter((s) => s.status === 'SELESAI').length;

  return (
    <WidgetCard
      title="Servis"
      subtitle="Customer, toko, garansi & monitoring"
      icon={Wrench}
      iconBg="bg-purple-50"
      iconColor="text-purple-600"
      delay={0.55}
      footer={
        <button
          onClick={() => navigate('/servis')}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Lihat Servis <ArrowUpRight size={14} />
        </button>
      }
    >
      {loading ? (
        <div className="flex h-[140px] items-center justify-center">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-purple-50 p-4 text-center">
            <p className="text-[11px] font-medium text-purple-500 uppercase tracking-wide">Aktif</p>
            <p className="font-mono text-[28px] font-bold text-purple-700">{activeCount}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 text-center">
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Selesai</p>
            <p className="font-mono text-[28px] font-bold text-slate-900">{doneCount}</p>
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

/* ──────────────────────────────── Operasi Widget */
function OperasiWidget({ items }: { items: RouteMenuItem[] }) {
  const navigate = useNavigate();

  return (
    <WidgetCard
      title="Operasi"
      subtitle="Operasi lain-lain"
      icon={HandCoins}
      iconBg="bg-amber-50"
      iconColor="text-amber-600"
      delay={0.6}
    >
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.label}
            onClick={() => navigate(item.route)}
            className="flex w-full items-center justify-between rounded-xl bg-slate-50 p-3 text-left hover:bg-slate-100 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm">
                {item.icon && <item.icon size={16} />}
              </div>
              <span className="text-[13px] font-medium text-slate-700">{item.label}</span>
            </div>
            <ArrowUpRight size={14} className="text-slate-300 group-hover:text-blue-600 transition-colors" />
          </button>
        ))}
      </div>
    </WidgetCard>
  );
}

/* ──────────────────────────────── Riwayat Widget */
function RiwayatWidget({ items }: { items: RouteMenuItem[] }) {
  const navigate = useNavigate();

  return (
    <WidgetCard
      title="Riwayat & Edit"
      subtitle="Lihat & edit transaksi lalu"
      icon={ClipboardList}
      iconBg="bg-cyan-50"
      iconColor="text-cyan-600"
      delay={0.65}
    >
      <div className="space-y-1.5">
        {items.map((item) => (
          <button
            key={item.label}
            onClick={() => navigate(item.route)}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-slate-50 transition-colors group"
          >
            <span className="text-[13px] font-medium text-slate-700">{item.label}</span>
            <ArrowUpRight size={14} className="text-slate-300 group-hover:text-blue-600 transition-colors" />
          </button>
        ))}
      </div>
    </WidgetCard>
  );
}

/* ──────────────────────────────── Laporan Widget */
function LaporanWidget() {
  const navigate = useNavigate();

  return (
    <WidgetCard
      title="Laporan Keuangan"
      subtitle="Tutup harian, rekap & snapshot aset"
      icon={FileText}
      iconBg="bg-indigo-50"
      iconColor="text-indigo-600"
      delay={0.7}
      footer={
        <button
          onClick={() => navigate('/laporan/tutup-harian')}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          Tutup Harian <ArrowUpRight size={14} />
        </button>
      }
    >
      <div className="rounded-2xl bg-indigo-50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Clock size={16} className="text-indigo-600" />
          <span className="text-[12px] font-medium text-indigo-700">Audit Harian</span>
        </div>
        <p className="text-[13px] text-indigo-600/80">
          Catat fisik kas + stok harian untuk closing toko.
        </p>
      </div>
    </WidgetCard>
  );
}

/* ──────────────────────────────── Activity Timeline */
const activityTypeStyles: Record<string, { bg: string; text: string }> = {
  'Penjualan': { bg: '#EFF6FF', text: '#2563EB' },
  'Pembelian': { bg: '#F0F9FF', text: '#0EA5E9' },
  'Servis': { bg: '#F5F3FF', text: '#7C3AED' },
  'Pengeluaran': { bg: '#F1F5F9', text: '#475569' },
  'Tukar Tambah': { bg: '#ECFEFF', text: '#0891B2' },
};

function formatActivityTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  });
}

function ActivityTimeline() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.15 });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getTransactions()
      .then((data) => { if (mounted) setTransactions(data.slice(0, 8)); })
      .catch((err) => console.error('[ActivityTimeline] load error:', err))
      .finally(() => setLoading(false));
    return () => { mounted = false; };
  }, []);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: 0.2, ease: easeSmooth }}
      className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-card"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[16px] font-semibold text-slate-900 font-body">Aktivitas Terbaru</h3>
        <span className="text-[12px] text-slate-400">Live</span>
      </div>
      <div className="relative max-h-[360px] overflow-y-auto overflow-x-hidden pr-1">
        <div className="absolute left-[15px] top-2 bottom-2 w-[2px] bg-slate-100" />
        {loading ? (
          <div className="flex h-[200px] items-center justify-center">
            <Loader2 size={24} className="animate-spin text-slate-300" />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {transactions.map((tx, i) => {
              const styles = activityTypeStyles[tx.type] || { bg: '#F1F5F9', text: '#334155' };
              const detail = getTransactionDisplayDetail(tx);
              return (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, x: -15 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.4, delay: 0.2 + i * 0.08, ease: easeSmooth }}
                  className="relative flex items-start gap-4 py-3 pl-8"
                >
                  <div
                    className="absolute left-[11px] top-[22px] h-2 w-2 rounded-full"
                    style={{ backgroundColor: styles.text }}
                  />
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.04em]"
                          style={{ backgroundColor: styles.bg, color: styles.text }}
                        >
                          {tx.description}
                        </span>
                      </div>
                      <p className="max-w-full break-words text-[14px] font-medium text-slate-900 font-body">
                        {detail}
                      </p>
                      <span className="text-[12px] text-slate-400 font-body">{formatActivityTime(tx.created_at)}</span>
                      <div className="mt-1">
                        <TransactionStaffBadge transaction={tx} />
                      </div>
                    </div>
                    {tx.amount !== null ? (
                      <span
                        className="shrink-0 font-mono text-[14px] font-semibold"
                        style={{ color: styles.text }}
                      >
                        <NominalGuard>Rp {tx.amount.toLocaleString('id-ID')}</NominalGuard>
                      </span>
                    ) : (
                      <span className="shrink-0 font-mono text-[14px] font-semibold text-slate-300">&mdash;</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ──────────────────────────────── Home Page */
function isSameLocalDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

export default function Home() {
  const [currentDate, setCurrentDate] = useState('');

  // Live dashboard data (replaces the old miniStats/dailyStats mock arrays).
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [staffPerformance, setStaffPerformance] = useState<StaffPerformance | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [staffPerformanceLoading, setStaffPerformanceLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    setCurrentDate(`${dayNames[now.getDay()]}, ${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()}`);
  }, []);

  useEffect(() => {
    let mounted = true;
    setStaffPerformanceLoading(true);
    getOwnStaffPerformance()
      .then((performance) => {
        if (mounted) setStaffPerformance(performance);
      })
      .catch((err) => console.error('[Home] staff performance load error:', err))
      .finally(() => {
        if (mounted) setStaffPerformanceLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setStatsLoading(true);
    Promise.all([
      getTransactions(),
      getAccountPickerData(),
      getStockItems(),
      getServiceRecords(),
    ])
      .then(([tx, accts, stk, svc]) => {
        if (!mounted) return;
        setTransactions(tx);
        setAccounts(accts);
        setStock(stk);
        setServices(svc);
      })
      .catch((err) => console.error('[Home] stats load error:', err))
      .finally(() => {
        if (mounted) setStatsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Derived live figures. `today` is recomputed once per load.
  const { miniStatsLive, dailyStatsLive } = useMemo(() => {
    const today = new Date();
    const sum = (type: Transaction['type']) =>
      transactions
        .filter((t) => t.type === type && isSameLocalDay(t.created_at, today))
        .reduce((acc, t) => acc + (t.amount ?? 0), 0);
    const countToday = (type: Transaction['type']) =>
      transactions.filter((t) => t.type === type && isSameLocalDay(t.created_at, today)).length;

    const penjualanToday = sum('Penjualan');
    const pembelianToday = sum('Pembelian');
    const pengeluaranToday = sum('Pengeluaran') + sum('Upah Servis');

    const readyUnits = stock
      .filter((s) => s.status === 'READY')
      .reduce((acc, s) => acc + (s.count || 0), 0);
    const servisAktif = services.filter((s) => s.status === 'ANTRIAN' || s.status === 'PROSES').length;
    const servisSelesaiToday = services.filter(
      (s) => s.status === 'SELESAI' && s.completed_at && isSameLocalDay(s.completed_at, today),
    ).length;

    const totalSaldo = accounts.reduce((acc, a) => acc + (a.current_balance ?? 0), 0);

    const miniStatsLive: MiniStat[] = [
      { label: 'Penjualan', icon: 'TrendingUp', value: countToday('Penjualan'), unit: 'Hari Ini', color: '#14B8A6' },
      { label: 'Pembelian', icon: 'ShoppingBag', value: countToday('Pembelian'), unit: 'Hari Ini', color: '#D4A574' },
      { label: 'Servis Aktif', icon: 'Wrench', value: servisAktif, unit: 'Dalam Proses', color: '#8B5CF6' },
      { label: 'Stok Ready', icon: 'Package', value: readyUnits, unit: 'Unit', color: '#10B981' },
    ];

    const dailyStatsLive: DailyStat[] = [
      { label: 'Total Penjualan', icon: 'TrendingUp', value: penjualanToday, prefix: 'Rp ', suffix: '', color: '#14B8A6' },
      { label: 'Total Pembelian', icon: 'ShoppingBag', value: pembelianToday, prefix: 'Rp ', suffix: '', color: '#D4A574' },
      { label: 'Total Pengeluaran', icon: 'Receipt', value: pengeluaranToday, prefix: 'Rp ', suffix: '', color: '#334155' },
      { label: 'Servis Selesai', icon: 'CheckCircle', value: servisSelesaiToday, prefix: '', suffix: '', color: '#10B981' },
      { label: 'Saldo Kas & Bank', icon: 'TrendingUp', value: totalSaldo, prefix: 'Rp ', suffix: '', color: '#2563EB' },
    ];

    return { miniStatsLive, dailyStatsLive };
  }, [transactions, accounts, stock, services]);

  // Gate Home links by the same route-permission mapping used by Navbar and
  // direct routes. Route guards still enforce access when URLs are opened
  // directly; this keeps the dashboard from advertising hidden features.
  const { profile } = useAuth();
  const visibleActions = actionWidgets.filter((card) => canAccessPath(profile, card.route));
  const visibleOperasiItems = operasiItems.filter((item) => canAccessPath(profile, item.route));
  const visibleRiwayatItems = riwayatItems.filter((item) => canAccessPath(profile, item.route));
  const canSeeAgen = canAccessPath(profile, '/agen');
  const canSeeStok = canAccessPath(profile, '/stok');
  const canSeeServis = canAccessPath(profile, '/servis');
  const canSeeLaporan = canAccessPath(profile, '/laporan/tutup-harian');

  return (
    <div className="pb-8">
      {/* Soft blue-gray background */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100" />

      {/* ── Top Section: Profile + Stats ── */}
      <section className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-1">
          <ProfileCard
            date={currentDate}
            performance={staffPerformance}
            performanceLoading={staffPerformanceLoading}
          />
        </div>
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {miniStatsLive.map((stat, i) => (
            <StatPill key={stat.label} stat={stat} index={i} />
          ))}
        </div>
      </section>

      <StoreStories />

      {/* ── Quick Actions ── */}
      <section className="relative z-10 mb-6">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="mb-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-400 font-body"
        >
          Aksi Cepat
        </motion.p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {visibleActions.map((card, i) => (
            <ActionWidget key={card.route} card={card} index={i} />
          ))}
        </div>
      </section>

      {/* ── Widget Dashboard Grid ── */}
      <section className="relative z-10 mb-6">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="mb-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-400 font-body"
        >
          Menu Utama
        </motion.p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {canSeeAgen && <AgenWidget />}
          {canSeeStok && <StokWidget />}
          {canSeeServis && <ServisWidget />}
          {visibleOperasiItems.length > 0 && <OperasiWidget items={visibleOperasiItems} />}
          {visibleRiwayatItems.length > 0 && <RiwayatWidget items={visibleRiwayatItems} />}
          {canSeeLaporan && <LaporanWidget />}
        </div>
      </section>

      {/* ── Daily Stats + Activity ── */}
      <section className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DailyStatsSection stats={dailyStatsLive} loading={statsLoading} />
        <ActivityTimeline />
      </section>
    </div>
  );
}
