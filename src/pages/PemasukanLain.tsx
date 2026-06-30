import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  AlertCircle,
  RotateCcw,
  Wallet,
  Banknote,
  Landmark,
  Save,
  Plus,
  X,
} from 'lucide-react';
import AccountPicker from '@/components/AccountPicker';
import {
  getAccountPickerData,
  type AccountWithBalance,
} from '@/services/accounts';
import {
  deriveDirection,
  buildPostings,
  validatePaymentSelection,
} from '@/services/paymentPosting';
import { recordTransactionWithPostings } from '@/services/postings';

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
/* ------------------------------------------------------------------ */

const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];
const easeOutExpo = [0.19, 1, 0.22, 1] as [number, number, number, number];

const sectionStagger = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.1, delayChildren: 0.3 },
  },
};

const sectionItem = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: easeSmooth },
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatRupiahInput(value: string): string {
  const numeric = value.replace(/\D/g, '');
  if (!numeric) return '';
  return parseInt(numeric, 10).toLocaleString('id-ID');
}

function parseRupiah(value: string): number {
  return parseInt(value.replace(/\./g, '').replace(/,/g, '') || '0', 10) || 0;
}

function getTodayInputValue(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SALDO_CASH = 122723000;
const SALDO_TRANSFER = 138511870;

const jenisPemasukanOptions = [
  { value: 'Tambahan Modal', label: 'Tambahan Modal' },
  { value: 'Bunga Bank', label: 'Bunga Bank' },
  { value: 'Jual Etalase Bekas', label: 'Jual Etalase Bekas' },
  { value: 'Lainnya', label: 'Lainnya' },
];

/* ------------------------------------------------------------------ */
/*  Custom Select                                                      */
/* ------------------------------------------------------------------ */

function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; desc?: string }[];
  placeholder: string;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full h-11 rounded-xl border px-4 text-left text-[14px] outline-none transition-all duration-200 font-body bg-white flex items-center justify-between ${
          error
            ? 'border-rose-400 ring-2 ring-rose-100'
            : 'border-slate-300 hover:border-slate-400 focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10'
        }`}
      >
        <span className={selected ? 'text-slate-900' : 'text-slate-400'}>
          {selected ? selected.label : placeholder}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-slate-400"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute z-20 mt-1.5 w-full rounded-xl border border-slate-200 bg-white shadow-card-elevated overflow-hidden"
              style={{ originY: 0 }}
            >
              <div className="max-h-[240px] overflow-y-auto py-1">
                {options.map((opt, i) => (
                  <motion.button
                    key={opt.value}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-[14px] transition-colors flex items-center justify-between ${
                      value === opt.value
                        ? 'bg-teal-50 text-teal-700 font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div>{opt.label}</div>
                      {opt.desc && <div className="text-[12px] text-slate-400 mt-0.5">{opt.desc}</div>}
                    </div>
                    {value === opt.value && <Check size={14} className="text-teal-600" />}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Rupiah Input                                                       */
/* ------------------------------------------------------------------ */

function RupiahInput({
  value,
  onChange,
  placeholder = '0',
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: boolean;
}) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 font-mono">
        Rp
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(formatRupiahInput(e.target.value))}
        placeholder={placeholder}
        className={`w-full h-11 rounded-xl border pl-10 pr-4 text-[14px] outline-none transition-all duration-200 font-mono ${
          error
            ? 'border-rose-400 ring-2 ring-rose-100'
            : 'border-slate-300 focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10'
        }`}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main PemasukanLain Page                                            */
/* ------------------------------------------------------------------ */

interface AccessoryItem {
  id: string;
  name: string;
  price: number;
}

export default function PemasukanLain() {
  const navigate = useNavigate();

  /* ── form state ── */
  const [jenis, setJenis] = useState('');
  const [tanggal, setTanggal] = useState(getTodayInputValue());
  const [keterangan, setKeterangan] = useState('');
  const [referensi, setReferensi] = useState('');
  const [cashMasuk, setCashMasuk] = useState('');
  const [transferMasuk, setTransferMasuk] = useState('');
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [shaking, setShaking] = useState(false);

  /* ── account selection / persistence state ── */
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [cashAccount, setCashAccount] = useState<AccountWithBalance | null>(null);
  const [transferAccount, setTransferAccount] =
    useState<AccountWithBalance | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    getAccountPickerData()
      .then((data) => {
        if (active) setAccounts(data);
      })
      .catch(() => {
        if (active) setAccounts([]);
      });
    return () => {
      active = false;
    };
  }, []);

  /* ── accessory items ── */
  const [accessoryItems, setAccessoryItems] = useState<AccessoryItem[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');

  /* ── derived values ── */
  const cashNum = parseRupiah(cashMasuk);
  const transferNum = parseRupiah(transferMasuk);
  const totalMasuk = cashNum + transferNum;
  const isTotalValid = totalMasuk > 0;
  const isJenisValid = jenis !== '';

  const cashSetelah = SALDO_CASH + cashNum;
  const transferSetelah = SALDO_TRANSFER + transferNum;

  const totalItemsPrice = accessoryItems.reduce((sum, item) => sum + item.price, 0);

  const validationStatus = useMemo(() => {
    if (cashMasuk === '' && transferMasuk === '') return 'neutral';
    return isTotalValid ? 'valid' : 'invalid';
  }, [cashMasuk, transferMasuk, isTotalValid]);

  function shakeForm() {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  }

  function handleReset() {
    setJenis('');
    setTanggal(getTodayInputValue());
    setKeterangan('');
    setReferensi('');
    setCashMasuk('');
    setTransferMasuk('');
    setAccessoryItems([]);
    setErrors({});
    setNewItemName('');
    setNewItemPrice('');
    setShowAddItem(false);
    setCashAccount(null);
    setTransferAccount(null);
    setSubmitError(null);
  }

  async function handleSimpan() {
    setSubmitError(null);

    const e: Record<string, boolean> = {};
    if (!jenis) e.jenis = true;
    if (!isTotalValid) e.pemasukan = true;
    setErrors(e);
    if (Object.keys(e).length > 0) {
      shakeForm();
      return;
    }

    // Validate the account selection before persisting anything (Req 4).
    const selection = {
      cashPortion: cashNum,
      cashAccountId: cashAccount?.id ?? null,
      transferPortion: transferNum,
      transferAccountId: transferAccount?.id ?? null,
    };

    const validation = validatePaymentSelection({
      cashPortion: cashNum,
      cashAccountType: cashAccount?.type ?? null,
      transferPortion: transferNum,
      transferAccountType: transferAccount?.type ?? null,
      requiresPayment: true,
    });

    if (!validation.ok) {
      setSubmitError(validation.message);
      shakeForm();
      return;
    }

    // Income flow → money_in; build the 1–2 postings for the non-zero portions.
    const direction = deriveDirection('income');
    const postings = buildPostings(direction, selection);

    const detailPayload = {
      jenis,
      tanggal,
      keterangan,
      referensi,
      cashMasuk: cashNum,
      transferMasuk: transferNum,
      items: accessoryItems.map(({ name, price }) => ({ name, price })),
    };
    const description = keterangan.trim() ? `${jenis} - ${keterangan.trim()}` : jenis;

    setSaving(true);
    try {
      await recordTransactionWithPostings({
        type: 'Pemasukan Lain',
        description,
        detail: JSON.stringify(detailPayload),
        amount: totalMasuk,
        postings,
      });
      // Success — reset form and show confirmation.
      handleReset();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch {
      setSubmitError('Transaksi tidak dapat disimpan. Silakan coba lagi.');
      shakeForm();
    } finally {
      setSaving(false);
    }
  }

  function handleAddItem() {
    const price = parseRupiah(newItemPrice);
    if (!newItemName.trim() || price <= 0) return;
    setAccessoryItems((prev) => [
      ...prev,
      { id: `item-${Date.now()}`, name: newItemName.trim(), price },
    ]);
    setNewItemName('');
    setNewItemPrice('');
    setShowAddItem(false);
  }

  function handleRemoveItem(id: string) {
    setAccessoryItems((prev) => prev.filter((item) => item.id !== id));
  }

  return (
    <div className="pb-24">
      {/* Success toast */}
      <AnimatePresence>
        {saveSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-card-elevated"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
              <Check size={12} strokeWidth={3} />
            </div>
            Pemasukan tersimpan
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: easeOutExpo }}
        className="mb-6"
      >
        <div className="flex items-center gap-3 mb-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft size={18} />
          </motion.button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-[36px] text-slate-900 leading-tight">Pemasukan Lain</h1>
              <span className="font-mono text-[13px] text-slate-500">0 / 2</span>
            </div>
          </div>
        </div>
        <div className="ml-12 h-[3px] rounded-full bg-slate-200 overflow-hidden max-w-[200px]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '0%' }}
            transition={{ duration: 0.8, ease: easeOutExpo }}
            className="h-full bg-slate-700 rounded-full"
          />
        </div>
        <p className="text-[14px] text-slate-500 ml-12 mt-2">
          Uang masuk di luar penjualan & servis.
        </p>
      </motion.div>

      {/* Form Content */}
      <motion.div
        variants={sectionStagger}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-4"
      >
        {/* Section 1: Jenis Pemasukan */}
        <motion.div
          variants={sectionItem}
          animate={shaking ? { x: [0, -8, 8, -8, 8, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="rounded-2xl bg-white border border-slate-200 p-6 shadow-card"
        >
          <h3 className="text-[18px] font-semibold text-slate-900 mb-1">Jenis Pemasukan</h3>
          <p className="text-[13px] text-slate-500 mb-4">Uang masuk di luar penjualan & servis.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                JENIS *
              </label>
              <CustomSelect
                value={jenis}
                onChange={(v) => {
                  setJenis(v);
                  if (errors.jenis) setErrors((p) => ({ ...p, jenis: false }));
                }}
                options={jenisPemasukanOptions}
                placeholder="Pilih jenis pemasukan"
                error={errors.jenis}
              />
              {errors.jenis && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-1 text-[12px] text-rose-500 flex items-center gap-1"
                >
                  <AlertCircle size={11} /> Pilih jenis pemasukan
                </motion.p>
              )}
            </div>
            <div>
              <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                TANGGAL *
              </label>
              <input
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="w-full h-11 rounded-xl border border-slate-300 px-4 text-[14px] outline-none transition-all duration-200 font-body focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
              />
            </div>
          </div>
        </motion.div>

        {/* Section 2: Detail */}
        <motion.div variants={sectionItem} className="rounded-2xl bg-white border border-slate-200 p-6 shadow-card">
          <h3 className="text-[18px] font-semibold text-slate-900 mb-4">Detail</h3>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                KETERANGAN
              </label>
              <textarea
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value.slice(0, 200))}
                placeholder="Tambahan modal, bunga bank, jual etalase bekas, dll"
                rows={3}
                className="w-full min-h-[80px] resize-y rounded-xl border border-slate-300 px-4 py-3 text-[14px] outline-none transition-all duration-200 font-body focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
              />
              <div className="flex justify-end mt-1">
                <span className="text-[11px] text-slate-400">{keterangan.length}/200</span>
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                REFERENSI (OPSIONAL)
              </label>
              <input
                type="text"
                value={referensi}
                onChange={(e) => setReferensi(e.target.value)}
                placeholder="Nomor slip, bukti transfer, dll"
                className="w-full h-11 rounded-xl border border-slate-300 px-4 text-[14px] outline-none transition-all duration-200 font-body focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
              />
            </div>
          </div>
        </motion.div>

        {/* Section 3: Nominal Masuk */}
        <motion.div
          variants={sectionItem}
          animate={shaking ? { x: [0, -8, 8, -8, 8, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="rounded-2xl bg-white border border-slate-200 p-6 shadow-card"
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[18px] font-semibold text-slate-900">Nominal Masuk</h3>
          </div>
          <p className="text-[13px] text-slate-500 mb-4">Cash + Transfer harus total &gt; 0.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                MASUK CASH
              </label>
              <RupiahInput
                value={cashMasuk}
                onChange={setCashMasuk}
                error={errors.pemasukan && !isTotalValid}
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                MASUK TRANSFER
              </label>
              <RupiahInput
                value={transferMasuk}
                onChange={setTransferMasuk}
                error={errors.pemasukan && !isTotalValid}
              />
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] text-slate-500 flex items-center gap-2">
                <Banknote size={14} />
                Cash
              </span>
              <span className="font-mono text-[14px] font-semibold text-slate-700">
                Rp {cashNum.toLocaleString('id-ID')}
              </span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] text-slate-500 flex items-center gap-2">
                <Landmark size={14} />
                Transfer
              </span>
              <span className="font-mono text-[14px] font-semibold text-slate-700">
                Rp {transferNum.toLocaleString('id-ID')}
              </span>
            </div>
            <div className="h-px bg-slate-200 my-2" />
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-slate-700">Total Masuk</span>
              <span className="font-mono text-[18px] font-bold text-slate-900">
                Rp {totalMasuk.toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          {/* Validation indicator */}
          <div className="flex items-center gap-2">
            {validationStatus === 'valid' ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-2 text-teal-600"
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500 text-white">
                  <Check size={12} strokeWidth={3} />
                </div>
                <span className="text-[13px] font-medium">Total valid</span>
              </motion.div>
            ) : validationStatus === 'invalid' ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-2 text-rose-500"
              >
                <AlertCircle size={16} />
                <span className="text-[13px] font-medium">Masukkan jumlah pemasukan</span>
              </motion.div>
            ) : (
              <div className="flex items-center gap-2 text-slate-400">
                <Wallet size={14} />
                <span className="text-[13px]">Masukkan jumlah pemasukan</span>
              </div>
            )}
          </div>

          {errors.pemasukan && !isTotalValid && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 text-[12px] text-rose-500 flex items-center gap-1"
            >
              <AlertCircle size={11} /> Total pemasukan harus lebih dari 0
            </motion.p>
          )}

          {/* Account selection — one picker per non-zero portion */}
          <AnimatePresence>
            {(cashNum > 0 || transferNum > 0) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 space-y-4"
              >
                {cashNum > 0 && (
                  <AccountPicker
                    label="Akun tujuan (porsi cash)"
                    filterType="Cash"
                    accounts={accounts}
                    value={cashAccount?.id ?? null}
                    onChange={(_, account) => {
                      setCashAccount(account);
                      setSubmitError(null);
                    }}
                  />
                )}
                {transferNum > 0 && (
                  <AccountPicker
                    label="Akun tujuan (porsi transfer)"
                    filterType="Bank"
                    accounts={accounts}
                    value={transferAccount?.id ?? null}
                    onChange={(_, account) => {
                      setTransferAccount(account);
                      setSubmitError(null);
                    }}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit / persistence error */}
          {submitError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700"
            >
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </motion.div>
          )}

          {/* Aksesoris / Item Berbayar */}
          <div className="mt-6 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500">
                AKSESORIS / ITEM BERBAYAR
              </label>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowAddItem(true)}
                className="flex items-center gap-1 rounded-lg bg-teal-50 px-3 py-1.5 text-[12px] font-semibold text-teal-700 hover:bg-teal-100 transition-colors"
              >
                <Plus size={14} />
                Tambah Item
              </motion.button>
            </div>

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
              {showAddItem && (
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
                        className="w-full h-11 rounded-xl border border-slate-300 px-4 text-[14px] outline-none transition-all duration-200 font-body focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                        HARGA
                      </label>
                      <RupiahInput
                        value={newItemPrice}
                        onChange={setNewItemPrice}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={handleAddItem}
                      disabled={!newItemName.trim() || parseRupiah(newItemPrice) <= 0}
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
              )}
            </AnimatePresence>

            {accessoryItems.length > 0 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200">
                <span className="text-[13px] text-slate-500">Subtotal Item</span>
                <span className="font-mono text-[14px] font-semibold text-slate-700">
                  Rp {totalItemsPrice.toLocaleString('id-ID')}
                </span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Section 4: Saldo Preview Card */}
        <motion.div variants={sectionItem} className="rounded-2xl bg-white border border-slate-200 p-6 shadow-card">
          <h3 className="text-[18px] font-semibold text-slate-900 mb-4">Preview Saldo</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Banknote size={14} className="text-slate-500" />
                  <span className="text-[12px] text-slate-500">Saldo Cash sekarang</span>
                </div>
                <p className="font-mono text-[16px] font-semibold text-slate-900">
                  Rp {SALDO_CASH.toLocaleString('id-ID')}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Landmark size={14} className="text-slate-500" />
                  <span className="text-[12px] text-slate-500">Saldo Transfer sekarang</span>
                </div>
                <p className="font-mono text-[16px] font-semibold text-slate-900">
                  Rp {SALDO_TRANSFER.toLocaleString('id-ID')}
                </p>
              </div>
            </div>
            <div className="h-px bg-slate-200" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <motion.div
                className="rounded-xl border p-4"
                animate={{
                  backgroundColor: cashNum > 0 ? '#F0FDFA' : '#F8FAFC',
                  borderColor: cashNum > 0 ? '#99F6E4' : '#E2E8F0',
                }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Banknote size={14} className={cashNum > 0 ? 'text-teal-600' : 'text-slate-500'} />
                  <span className={`text-[12px] ${cashNum > 0 ? 'text-teal-600' : 'text-slate-500'}`}>
                    Cash setelah
                  </span>
                </div>
                <p className="font-mono text-[16px] font-semibold text-slate-900">
                  Rp {cashSetelah.toLocaleString('id-ID')}
                </p>
              </motion.div>
              <motion.div
                className="rounded-xl border p-4"
                animate={{
                  backgroundColor: transferNum > 0 ? '#F0FDFA' : '#F8FAFC',
                  borderColor: transferNum > 0 ? '#99F6E4' : '#E2E8F0',
                }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Landmark size={14} className={transferNum > 0 ? 'text-teal-600' : 'text-slate-500'} />
                  <span className={`text-[12px] ${transferNum > 0 ? 'text-teal-600' : 'text-slate-500'}`}>
                    Transfer setelah
                  </span>
                </div>
                <p className="font-mono text-[16px] font-semibold text-slate-900">
                  Rp {transferSetelah.toLocaleString('id-ID')}
                </p>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Bottom Action Bar */}
      <motion.div
        initial={{ y: 72, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5, ease: easeSmooth }}
        className="fixed bottom-0 left-0 right-0 z-50 h-[72px] border-t border-slate-200 bg-white"
        style={{ boxShadow: '0 -4px 20px rgba(15, 23, 42, 0.04)' }}
      >
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-4 sm:px-6">
          {/* Left: Total */}
          <div>
            <p className="text-[13px] text-slate-500">Total Masuk</p>
            <motion.p
              key={totalMasuk}
              initial={{ scale: 1.05 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className={`font-mono text-[20px] font-semibold ${
                totalMasuk > 0 ? 'text-slate-900' : 'text-slate-400'
              }`}
            >
              Rp {formatRupiahInput(totalMasuk.toString()) || '0'}
            </motion.p>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleReset}
              className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-[14px] font-semibold text-slate-700 transition-colors hover:bg-slate-200 active:scale-[0.98]"
            >
              <RotateCcw size={14} />
              <span className="hidden sm:inline">Reset</span>
            </motion.button>
            <motion.button
              whileHover={isJenisValid && isTotalValid && !saving ? { scale: 1.02 } : {}}
              whileTap={{ scale: 0.98 }}
              onClick={handleSimpan}
              disabled={saving}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-semibold transition-all duration-200 ${
                isJenisValid && isTotalValid && !saving
                  ? 'bg-teal-500 text-white hover:bg-teal-600 cursor-pointer'
                  : 'bg-teal-500/40 text-white cursor-not-allowed'
              }`}
            >
              <Save size={16} />
              {saving ? 'Menyimpan...' : 'Simpan Pemasukan'}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
