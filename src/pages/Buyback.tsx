import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  BatteryMedium,
  CheckCircle2,
  Hash,
  Loader2,
  Palette,
  RotateCcw,
  Save,
  Search,
  Smartphone,
  Tag,
  User,
} from 'lucide-react';
import AccountPicker from '@/components/AccountPicker';
import PresetOrCustomSelect from '@/components/PresetOrCustomSelect';
import {
  getAccountPickerData,
  type AccountWithBalance,
} from '@/services/accounts';
import {
  buildPostings,
  deriveDirection,
  validatePaymentSelection,
} from '@/services/paymentPosting';
import { recordBuybackWithPostings } from '@/services/postings';
import { getStockItems, type StockItem } from '@/services/stock';
import {
  STOCK_STATUSES,
  type StockStatus,
} from '@/services/stockCore';
import { UNIT_CONDITION_OPTIONS } from '@/services/unitConditions';

const MODEL_OPTIONS = [
  'iPhone 8 Plus',
  'iPhone SE Gen 2',
  'iPhone SE Gen 3',
  'iPhone X',
  'iPhone XS',
  'iPhone XS Max',
  'iPhone XR',
  'iPhone 11',
  'iPhone 11 Pro',
  'iPhone 11 Pro Max',
  'iPhone 12 Mini',
  'iPhone 12',
  'iPhone 12 Pro',
  'iPhone 12 Pro Max',
  'iPhone 13',
  'iPhone 13 Pro',
  'iPhone 13 Pro Max',
  'iPhone 14',
  'iPhone 14 Pro',
  'iPhone 14 Pro Max',
  'iPhone 15',
  'iPhone 15 Pro',
  'iPhone 15 Pro Max',
  'iPhone 16',
  'iPhone 16 Pro',
  'iPhone 16 Pro Max',
  'iPhone 17',
  'iPhone 17 Pro',
  'iPhone 17 Pro Max',
];

const CAPACITY_OPTIONS = ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB'];

const COLOR_OPTIONS = [
  'Black',
  'White',
  'Midnight',
  'Starlight',
  'Silver',
  'Gold',
  'Space Gray',
  'Graphite',
  'Blue',
  'Purple',
  'Red',
  'Green',
  'Yellow',
  'Pink',
  'Natural Titanium',
  'White Titanium',
  'Black Titanium',
  'Blue Titanium',
];

const STOCK_STATUS_LABELS: Record<Exclude<StockStatus, 'TERJUAL'>, string> = {
  READY: 'Ready jual',
  SERVIS: 'Masuk servis',
  KANIBAL: 'Kanibal',
  RUSAK: 'Rusak',
};

const BUYBACK_STOCK_STATUSES = STOCK_STATUSES.filter(
  (status): status is Exclude<StockStatus, 'TERJUAL'> => status !== 'TERJUAL',
);

type SupabaseErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

function parseMoney(value: string): number {
  const digits = value.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function formatRupiah(value: number): string {
  return `Rp ${Math.max(0, Math.round(value)).toLocaleString('id-ID')}`;
}

function normalizeImei(value: string): string {
  return value.replace(/\D/g, '').slice(0, 15);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getBuybackSaveErrorMessage(error: unknown): string {
  const dbError = (error ?? {}) as SupabaseErrorLike;
  const code = typeof dbError.code === 'string' ? dbError.code : '';
  const message = [
    typeof dbError.message === 'string' ? dbError.message : '',
    typeof dbError.details === 'string' ? dbError.details : '',
  ].join(' ').toLowerCase();

  if (
    code === '23505' &&
    (message.includes('imei') || message.includes('stock_items_active_imei_unique'))
  ) {
    return 'IMEI ini masih tercatat sebagai stok aktif. Ubah status stok lama dulu sebelum buyback.';
  }

  if (code === '42501') {
    return 'Akun ini tidak memiliki izin untuk menyimpan buyback.';
  }

  if (code === '23503') {
    return 'Akun kas/bank sudah tidak tersedia. Muat ulang halaman lalu coba kembali.';
  }

  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Koneksi ke server terputus. Periksa internet lalu coba kembali.';
  }

  return 'Buyback tidak dapat disimpan. Silakan coba lagi.';
}

function StockHistoryCard({ item }: { item: StockItem }) {
  const active = item.status !== 'TERJUAL';
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        active
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold">
            {item.model} {item.capacity}
          </p>
          <p className="mt-0.5 text-[12px] opacity-80">
            {item.color || 'Tanpa warna'} - {item.condition || 'Tanpa kondisi'}
          </p>
        </div>
        <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-semibold">
          {item.status}
        </span>
      </div>
      <p className="mt-2 text-[11px] opacity-75">
        {active
          ? 'Masih aktif di stok, buyback akan diblok.'
          : `Riwayat terjual, boleh masuk buyback lagi. Update ${formatDateTime(item.updated_at)}`}
      </p>
    </div>
  );
}

export default function Buyback() {
  const navigate = useNavigate();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [imei, setImei] = useState('');
  const [model, setModel] = useState('');
  const [capacity, setCapacity] = useState('');
  const [condition, setCondition] = useState('');
  const [color, setColor] = useState('');
  const [batteryHealth, setBatteryHealth] = useState('85');
  const [defectDescription, setDefectDescription] = useState('');
  const [initialStatus, setInitialStatus] =
    useState<Exclude<StockStatus, 'TERJUAL'>>('READY');
  const [buybackPrice, setBuybackPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [cash, setCash] = useState('');
  const [transfer, setTransfer] = useState('');

  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [cashAccount, setCashAccount] = useState<AccountWithBalance | null>(null);
  const [transferAccount, setTransferAccount] = useState<AccountWithBalance | null>(null);
  const [stockRows, setStockRows] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const buybackPriceNum = useMemo(() => parseMoney(buybackPrice), [buybackPrice]);
  const sellingPriceNum = useMemo(() => parseMoney(sellingPrice), [sellingPrice]);
  const cashNum = useMemo(() => parseMoney(cash), [cash]);
  const transferNum = useMemo(() => parseMoney(transfer), [transfer]);
  const paymentTotal = cashNum + transferNum;
  const normalizedImei = normalizeImei(imei);

  const matchingHistory = useMemo(
    () => stockRows.filter((item) => item.imei === normalizedImei && normalizedImei.length === 15),
    [normalizedImei, stockRows],
  );
  const activeDuplicate = matchingHistory.find((item) => item.status !== 'TERJUAL') ?? null;

  const reloadData = useCallback(async () => {
    setLoading(true);
    setSaveError(null);
    try {
      const [accountData, stockData] = await Promise.all([
        getAccountPickerData(),
        getStockItems(),
      ]);
      setAccounts(accountData);
      setStockRows(stockData);
      setCashAccount((current) => current ?? accountData.find((a) => a.type === 'Cash') ?? null);
      setTransferAccount((current) => current ?? accountData.find((a) => a.type === 'Bank') ?? null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Data buyback tidak dapat dimuat.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadData();
  }, [reloadData]);

  const resetForm = useCallback(() => {
    setCustomerName('');
    setCustomerPhone('');
    setImei('');
    setModel('');
    setCapacity('');
    setCondition('');
    setColor('');
    setBatteryHealth('85');
    setDefectDescription('');
    setInitialStatus('READY');
    setBuybackPrice('');
    setSellingPrice('');
    setCash('');
    setTransfer('');
    setSaveError(null);
    setSaveSuccess(false);
  }, []);

  const canSubmit =
    normalizedImei.length === 15 &&
    model.trim() !== '' &&
    capacity.trim() !== '' &&
    condition.trim() !== '' &&
    color.trim() !== '' &&
    buybackPriceNum > 0 &&
    paymentTotal === buybackPriceNum &&
    !activeDuplicate &&
    (cashNum === 0 || cashAccount !== null) &&
    (transferNum === 0 || transferAccount !== null);

  const submitHint = useMemo(() => {
    if (normalizedImei.length !== 15) return 'IMEI wajib 15 digit.';
    if (activeDuplicate) return 'IMEI masih aktif di stok.';
    if (!model.trim()) return 'Model wajib diisi.';
    if (!capacity.trim()) return 'Kapasitas wajib diisi.';
    if (!condition.trim()) return 'Kondisi wajib diisi.';
    if (!color.trim()) return 'Warna wajib diisi.';
    if (buybackPriceNum <= 0) return 'Nominal buyback wajib diisi.';
    if (paymentTotal !== buybackPriceNum) return 'Cash + transfer harus sama dengan nominal buyback.';
    if (cashNum > 0 && !cashAccount) return 'Pilih akun kas untuk porsi cash.';
    if (transferNum > 0 && !transferAccount) return 'Pilih akun bank untuk porsi transfer.';
    return null;
  }, [
    activeDuplicate,
    buybackPriceNum,
    capacity,
    cashAccount,
    cashNum,
    color,
    condition,
    model,
    normalizedImei.length,
    paymentTotal,
    transferAccount,
    transferNum,
  ]);

  const handleSave = async () => {
    if (saving) return;
    if (!canSubmit) {
      setSaveError(submitHint ?? 'Lengkapi data buyback terlebih dahulu.');
      return;
    }

    const validation = validatePaymentSelection({
      cashPortion: cashNum,
      cashAccountType: cashAccount?.type ?? null,
      transferPortion: transferNum,
      transferAccountType: transferAccount?.type ?? null,
      requiresPayment: true,
    });
    if (!validation.ok) {
      setSaveError(validation.message);
      return;
    }

    const stockSellingPrice = sellingPriceNum > 0 ? sellingPriceNum : buybackPriceNum;
    const batteryHealthNum = Number.parseInt(batteryHealth, 10);
    const normalizedBatteryHealth = Number.isFinite(batteryHealthNum)
      ? Math.min(100, Math.max(0, batteryHealthNum))
      : null;
    const payload = {
      kind: 'buyback',
      customer: {
        name: customerName.trim(),
        phone: customerPhone.trim(),
      },
      unit: {
        model: model.trim(),
        capacity: capacity.trim(),
        condition: condition.trim(),
        color: color.trim(),
        imei: normalizedImei,
        batteryHealth: normalizedBatteryHealth,
        defectDescription: defectDescription.trim(),
        status: initialStatus,
        costPrice: buybackPriceNum,
        sellingPrice: stockSellingPrice,
      },
      payment: {
        cash: cashNum,
        transfer: transferNum,
      },
      buybackPrice: buybackPriceNum,
      historicalStockIds: matchingHistory.map((item) => item.id),
    };

    const postings = buildPostings(deriveDirection('expense'), {
      cashPortion: cashNum,
      cashAccountId: cashAccount?.id ?? null,
      transferPortion: transferNum,
      transferAccountId: transferAccount?.id ?? null,
    });

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await recordBuybackWithPostings({
        type: 'Buyback',
        description: `Buyback - 1 unit ${model.trim()}`,
        detail: JSON.stringify(payload),
        amount: buybackPriceNum,
        postings,
        item: {
          model: model.trim(),
          capacity: capacity.trim(),
          condition: condition.trim(),
          color: color.trim(),
          imei: normalizedImei,
          status: initialStatus,
          cost_price: buybackPriceNum,
          price: stockSellingPrice,
          battery_health: normalizedBatteryHealth,
          defect_description: defectDescription.trim(),
          count: 1,
        },
      });
      resetForm();
      setSaveSuccess(true);
      await reloadData();
    } catch (error) {
      setSaveError(getBuybackSaveErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pb-32">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200"
            aria-label="Kembali"
          >
            <ArrowLeft size={18} />
          </button>
          <p className="mb-2 inline-flex rounded-full bg-teal-50 px-3 py-1 text-[12px] font-semibold text-teal-700">
            Customer jual kembali
          </p>
          <h1 className="font-display text-[36px] leading-tight text-slate-950 sm:text-[42px]">
            Buyback HP
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] text-slate-500">
            Input unit yang dibeli kembali dari customer. IMEI yang sudah pernah terjual bisa masuk lagi, IMEI aktif akan diblok.
          </p>
        </div>
        <button
          type="button"
          onClick={reloadData}
          disabled={loading}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
          Muat ulang data
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <h2 className="text-[18px] font-semibold text-slate-950">Customer & IMEI</h2>
            <p className="mt-1 text-[13px] text-slate-500">
              Masukkan data customer dan IMEI unit yang dibeli kembali.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="flex items-center gap-1 text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500">
                  <User size={13} /> Nama Customer
                </span>
                <input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-[14px] outline-none transition-all focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                  placeholder="Nama customer"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500">
                  WhatsApp
                </span>
                <input
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-[14px] outline-none transition-all focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                  placeholder="08..."
                />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="flex items-center gap-1 text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500">
                  <Hash size={13} /> IMEI *
                </span>
                <input
                  value={imei}
                  onChange={(event) => setImei(normalizeImei(event.target.value))}
                  inputMode="numeric"
                  maxLength={15}
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-mono text-[15px] tracking-[0.06em] outline-none transition-all focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                  placeholder="15 digit IMEI"
                />
              </label>
            </div>

            {normalizedImei.length === 15 && (
              <div className="mt-4 space-y-2">
                {matchingHistory.length === 0 ? (
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] font-medium text-sky-700">
                    IMEI belum pernah tercatat. Tetap bisa buyback sebagai unit baru.
                  </div>
                ) : (
                  matchingHistory.map((item) => (
                    <StockHistoryCard key={item.id} item={item} />
                  ))
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <h2 className="text-[18px] font-semibold text-slate-950">Detail Unit Masuk</h2>
            <p className="mt-1 text-[13px] text-slate-500">
              Data ini akan menjadi stok baru setelah buyback tersimpan.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <PresetOrCustomSelect
                label="Tipe HP"
                value={model}
                options={MODEL_OPTIONS}
                onChange={setModel}
                placeholder="Pilih tipe HP"
                customLabel="Tipe custom / seri baru"
                customPlaceholder="Contoh: Samsung S24 Ultra"
                required
                icon={Smartphone}
              />
              <PresetOrCustomSelect
                label="Kapasitas"
                value={capacity}
                options={CAPACITY_OPTIONS}
                onChange={setCapacity}
                placeholder="Pilih kapasitas"
                customLabel="Kapasitas custom"
                customPlaceholder="Contoh: 2TB, WiFi Only"
                required
                icon={BatteryMedium}
              />
              <PresetOrCustomSelect
                label="Kondisi"
                value={condition}
                options={UNIT_CONDITION_OPTIONS}
                onChange={setCondition}
                placeholder="Pilih kondisi"
                customLabel="Kondisi custom"
                customPlaceholder="Contoh: Second Inter Minus ringan"
                required
                icon={Tag}
              />
              <PresetOrCustomSelect
                label="Warna"
                value={color}
                options={COLOR_OPTIONS}
                onChange={setColor}
                placeholder="Pilih warna"
                customLabel="Warna custom"
                customPlaceholder="Contoh: Desert Titanium"
                required
                icon={Palette}
              />
              <label className="space-y-1.5">
                <span className="flex items-center gap-1 text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500">
                  <BatteryMedium size={13} /> Battery Health
                </span>
                <input
                  value={batteryHealth}
                  onChange={(event) => setBatteryHealth(event.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                  inputMode="numeric"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 font-mono text-[14px] outline-none transition-all focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                  placeholder="85"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500">
                  Status awal stok *
                </span>
                <select
                  value={initialStatus}
                  onChange={(event) => setInitialStatus(event.target.value as Exclude<StockStatus, 'TERJUAL'>)}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-[14px] outline-none transition-all focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                >
                  {BUYBACK_STOCK_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STOCK_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500">
                  Minus / catatan unit
                </span>
                <textarea
                  value={defectDescription}
                  onChange={(event) => setDefectDescription(event.target.value)}
                  rows={3}
                  className="min-h-[92px] w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-[14px] outline-none transition-all focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                  placeholder="Contoh: Kamera jamur, LCD gantian, Face ID off"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <h2 className="text-[18px] font-semibold text-slate-950">Nominal & Pembayaran</h2>
            <p className="mt-1 text-[13px] text-slate-500">
              Buyback adalah uang keluar dari toko. Nominal ini masuk sebagai modal unit.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="flex items-center gap-1 text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500">
                  <Banknote size={13} /> Harga Buyback / Modal *
                </span>
                <input
                  value={buybackPrice}
                  onChange={(event) => setBuybackPrice(event.target.value)}
                  inputMode="numeric"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 font-mono text-[14px] outline-none transition-all focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                  placeholder="Rp 0"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500">
                  Harga jual estimasi
                </span>
                <input
                  value={sellingPrice}
                  onChange={(event) => setSellingPrice(event.target.value)}
                  inputMode="numeric"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 font-mono text-[14px] outline-none transition-all focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                  placeholder={buybackPriceNum > 0 ? formatRupiah(buybackPriceNum) : 'Rp 0'}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500">
                  Cash
                </span>
                <input
                  value={cash}
                  onChange={(event) => setCash(event.target.value)}
                  inputMode="numeric"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 font-mono text-[14px] outline-none transition-all focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                  placeholder="Rp 0"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500">
                  Transfer
                </span>
                <input
                  value={transfer}
                  onChange={(event) => setTransfer(event.target.value)}
                  inputMode="numeric"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 font-mono text-[14px] outline-none transition-all focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                  placeholder="Rp 0"
                />
              </label>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <AccountPicker
                label="Akun kas"
                accounts={accounts}
                filterType="Cash"
                value={cashAccount?.id ?? null}
                onChange={(_, account) => setCashAccount(account)}
                error={cashNum > 0 && !cashAccount ? 'Pilih akun kas' : null}
              />
              <AccountPicker
                label="Akun bank"
                accounts={accounts}
                filterType="Bank"
                value={transferAccount?.id ?? null}
                onChange={(_, account) => setTransferAccount(account)}
                error={transferNum > 0 && !transferAccount ? 'Pilih akun bank' : null}
              />
            </div>
          </section>
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <h2 className="text-[16px] font-semibold text-slate-950">Ringkasan</h2>
            <div className="mt-4 space-y-3 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Nominal buyback</span>
                <span className="font-mono font-semibold text-slate-950">{formatRupiah(buybackPriceNum)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Pembayaran</span>
                <span className="font-mono font-semibold text-slate-950">{formatRupiah(paymentTotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Selisih input</span>
                <span className={`font-mono font-semibold ${paymentTotal === buybackPriceNum ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatRupiah(Math.abs(paymentTotal - buybackPriceNum))}
                </span>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="font-semibold text-slate-900">
                  {model || 'Model belum diisi'} {capacity}
                </p>
                <p className="mt-1 text-slate-500">
                  {color || 'Warna'} - {condition || 'Kondisi'} - {initialStatus}
                </p>
                <p className="mt-1 font-mono text-[12px] text-slate-500">
                  {normalizedImei || 'IMEI belum diisi'}
                </p>
              </div>
            </div>

            {saveError && (
              <div className="mt-4 flex items-start gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            {saveSuccess && (
              <div className="mt-4 flex items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-700">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                <span>Buyback berhasil disimpan.</span>
              </div>
            )}

            {!saveError && submitHint && (
              <div className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-700">
                <Search size={16} className="mt-0.5 shrink-0" />
                <span>{submitHint}</span>
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-100 text-[14px] font-semibold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50"
              >
                <RotateCcw size={16} />
                Reset
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-teal-600 text-[14px] font-semibold text-white shadow-md shadow-teal-500/20 transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Simpan
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
