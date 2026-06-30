import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  AlertCircle,
  RotateCcw,
  Wallet,
  ArrowRightLeft,
  Receipt,
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
  type PaymentSelection,
} from '@/services/paymentPosting';
import {
  validateAccountTransfer,
  type TransferSelection,
} from '@/services/depositCore';
import {
  recordTransactionWithPostings,
  recordAccountTransfer,
} from '@/services/postings';

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

const categories = [
  { value: 'Operasional Toko', label: 'Operasional Toko', desc: 'sewa, listrik, air, internet' },
  { value: 'Pembelian Barang', label: 'Pembelian Barang', desc: 'ATK, packing, galon' },
  { value: 'Sparepart & Servis', label: 'Sparepart & Servis', desc: 'battery, LCD, tool' },
  { value: 'Konsumsi', label: 'Konsumsi', desc: 'makan siang, kopi, snack' },
  { value: 'Transportasi', label: 'Transportasi', desc: 'bensin, parkir, gojek' },
  { value: 'Lainnya', label: 'Lainnya', desc: 'bebas' },
];

/* ------------------------------------------------------------------ */
/*  Custom Select Component                                            */
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
/*  Number Input with Rp prefix                                        */
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
/*  Main Pengeluaran Page                                              */
/* ------------------------------------------------------------------ */

type TabType = 'pengeluaran' | 'transfer';

export default function Pengeluaran() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('pengeluaran');

  /* Pengeluaran form state */
  const [kategori, setKategori] = useState('');
  const [tanggal, setTanggal] = useState(getTodayInputValue());
  const [keterangan, setKeterangan] = useState('');
  const [referensi, setReferensi] = useState('');
  const [cash, setCash] = useState('');
  const [transfer, setTransfer] = useState('');
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [shaking, setShaking] = useState(false);

  /* Account selection state (expense tab only) */
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [cashAccount, setCashAccount] = useState<AccountWithBalance | null>(null);
  const [transferAccount, setTransferAccount] = useState<AccountWithBalance | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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

  /* Transfer form state */
  const [transferFromAccount, setTransferFromAccount] = useState<AccountWithBalance | null>(null);
  const [transferToAccount, setTransferToAccount] = useState<AccountWithBalance | null>(null);
  const [jumlahTransfer, setJumlahTransfer] = useState('');
  const [keteranganTransfer, setKeteranganTransfer] = useState('');
  const [transferErrors, setTransferErrors] = useState<Record<string, boolean>>({});
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSaved, setTransferSaved] = useState(false);

  const totalPengeluaran = parseRupiah(cash) + parseRupiah(transfer);
  const isTotalValid = totalPengeluaran > 0;
  const isKategoriValid = kategori !== '';

  const cashPortion = parseRupiah(cash);
  const transferPortion = parseRupiah(transfer);

  const transferJumlahNum = parseRupiah(jumlahTransfer);
  const isTransferJumlahValid = transferJumlahNum > 0;
  const isTransferValid =
    isTransferJumlahValid &&
    transferFromAccount !== null &&
    transferToAccount !== null &&
    transferFromAccount.id !== transferToAccount.id;

  const validationStatus = useMemo(() => {
    if (cash === '' && transfer === '') return 'neutral';
    return isTotalValid ? 'valid' : 'invalid';
  }, [cash, transfer, isTotalValid]);

  function shakeForm() {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  }

  function handleReset() {
    setKategori('');
    setTanggal(getTodayInputValue());
    setKeterangan('');
    setReferensi('');
    setCash('');
    setTransfer('');
    setErrors({});
    setCashAccount(null);
    setTransferAccount(null);
    setSaveError(null);
    setTransferFromAccount(null);
    setTransferToAccount(null);
    setJumlahTransfer('');
    setKeteranganTransfer('');
    setTransferErrors({});
    setTransferError(null);
  }

  async function handleSimpan() {
    if (activeTab === 'pengeluaran') {
      setSaveError(null);
      const e: Record<string, boolean> = {};
      if (!kategori) e.kategori = true;
      if (!isTotalValid) e.pembayaran = true;
      setErrors(e);
      if (Object.keys(e).length > 0) {
        shakeForm();
        return;
      }

      // Build the normalized payment selection from the two portions.
      const selection: PaymentSelection = {
        cashPortion,
        cashAccountId: cashAccount?.id ?? null,
        transferPortion,
        transferAccountId: transferAccount?.id ?? null,
      };

      // Validate account selection + amounts before any persistence.
      const validation = validatePaymentSelection({
        cashPortion,
        cashAccountType: cashAccount?.type ?? null,
        transferPortion,
        transferAccountType: transferAccount?.type ?? null,
        requiresPayment: true,
      });
      if (!validation.ok) {
        setSaveError(validation.message);
        shakeForm();
        return;
      }

      // Expense flow → money_out; build 1–2 postings for the non-zero portions.
      const direction = deriveDirection('expense');
      const postings = buildPostings(direction, selection);

      const detail = JSON.stringify({
        kategori,
        tanggal,
        keterangan,
        referensi,
        cash: cashPortion,
        transfer: transferPortion,
      });
      const description = keterangan.trim()
        ? `${kategori} — ${keterangan.trim()}`
        : kategori;

      setSaving(true);
      try {
        await recordTransactionWithPostings({
          type: 'Pengeluaran',
          description,
          detail,
          amount: totalPengeluaran,
          postings,
        });
        setSaved(true);
        handleReset();
        setTimeout(() => setSaved(false), 4000);
      } catch {
        setSaveError('Transaksi tidak dapat disimpan. Silakan coba lagi.');
        shakeForm();
      } finally {
        setSaving(false);
      }
    } else {
      setTransferError(null);
      const e: Record<string, boolean> = {};
      if (!isTransferJumlahValid) e.jumlah = true;
      setTransferErrors(e);

      // Normalized transfer selection from the two pickers + amount.
      const selection: TransferSelection = {
        amount: transferJumlahNum,
        fromAccountId: transferFromAccount?.id ?? null,
        toAccountId: transferToAccount?.id ?? null,
      };

      // Validate before any persistence; show the first unmet rule inline.
      const validation = validateAccountTransfer(selection);
      if (!validation.ok) {
        setTransferError(validation.message);
        shakeForm();
        return;
      }

      // Atomic two-posting move (money_out source, money_in destination).
      setTransferSaving(true);
      try {
        await recordAccountTransfer({
          amount: transferJumlahNum,
          fromAccountId: transferFromAccount!.id,
          toAccountId: transferToAccount!.id,
          note: keteranganTransfer,
        });
        setTransferSaved(true);
        handleReset();
        setTimeout(() => setTransferSaved(false), 4000);
      } catch {
        setTransferError('Transfer tidak dapat disimpan. Silakan coba lagi.');
        shakeForm();
      } finally {
        setTransferSaving(false);
      }
    }
  }

  return (
    <div className="pb-24">
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
              <h1 className="font-display text-[36px] text-slate-900 leading-tight">Pengeluaran</h1>
              <span className="font-mono text-[13px] text-slate-500">1 / 3</span>
            </div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="ml-12 h-[3px] rounded-full bg-slate-200 overflow-hidden max-w-[200px]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '33%' }}
            transition={{ duration: 0.8, ease: easeOutExpo }}
            className="h-full bg-slate-700 rounded-full"
          />
        </div>
        <p className="text-[14px] text-slate-500 ml-12 mt-2">Catat semua pengeluaran toko.</p>
      </motion.div>

      {/* Tab Toggle */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15, ease: easeSmooth }}
        className="mb-6"
      >
        <div className="relative flex rounded-[14px] bg-surface-sunk p-1">
          {/* Sliding indicator */}
          <motion.div
            className="absolute top-1 bottom-1 rounded-[12px] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
            layoutId="pengeluaran-tab-indicator"
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            style={{
              width: 'calc(50% - 4px)',
              left: activeTab === 'pengeluaran' ? '4px' : 'calc(50%)',
            }}
          />
          <button
            onClick={() => setActiveTab('pengeluaran')}
            className={`relative z-10 flex-1 flex items-center justify-center gap-2 rounded-[12px] py-2.5 text-[14px] font-medium transition-colors duration-200 ${
              activeTab === 'pengeluaran' ? 'text-slate-900 font-semibold' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Receipt size={15} />
            Pengeluaran
          </button>
          <button
            onClick={() => setActiveTab('transfer')}
            className={`relative z-10 flex-1 flex items-center justify-center gap-2 rounded-[12px] py-2.5 text-[14px] font-medium transition-colors duration-200 ${
              activeTab === 'transfer' ? 'text-slate-900 font-semibold' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ArrowRightLeft size={15} />
            Transfer Uang
          </button>
        </div>
      </motion.div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'pengeluaran' ? (
          <motion.div
            key="pengeluaran"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.25, ease: easeSmooth }}
          >
            <motion.div
              variants={sectionStagger}
              initial="hidden"
              animate="show"
              className="flex flex-col gap-4"
            >
              {/* Card 1: Kategori */}
              <motion.div
                variants={sectionItem}
                animate={shaking ? { x: [0, -8, 8, -8, 8, 0] } : {}}
                transition={{ duration: 0.4 }}
                className="rounded-2xl bg-white border border-slate-200 p-6 shadow-card"
              >
                <h3 className="text-[18px] font-semibold text-slate-900 mb-4">Kategori Pengeluaran</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                      KATEGORI *
                    </label>
                    <CustomSelect
                      value={kategori}
                      onChange={(v) => {
                        setKategori(v);
                        if (errors.kategori) setErrors((p) => ({ ...p, kategori: false }));
                      }}
                      options={categories}
                      placeholder="Pilih kategori"
                      error={errors.kategori}
                    />
                    {errors.kategori && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-1 text-[12px] text-rose-500 flex items-center gap-1"
                      >
                        <AlertCircle size={11} /> Pilih kategori
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

              {/* Card 2: Detail */}
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
                      placeholder="Beli galon, bayar tukang, dll"
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
                      placeholder="Nomor nota, link, dll"
                      className="w-full h-11 rounded-xl border border-slate-300 px-4 text-[14px] outline-none transition-all duration-200 font-body focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">Opsional — untuk arsip internal</p>
                  </div>
                </div>
              </motion.div>

              {/* Card 3: Pembayaran */}
              <motion.div
                variants={sectionItem}
                animate={shaking ? { x: [0, -8, 8, -8, 8, 0] } : {}}
                transition={{ duration: 0.4 }}
                className="rounded-2xl bg-white border border-slate-200 p-6 shadow-card"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[18px] font-semibold text-slate-900">Pembayaran</h3>
                  <span className="text-[12px] text-slate-400">Cash + Transfer harus total &gt; 0</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                      BAYAR CASH
                    </label>
                    <RupiahInput
                      value={cash}
                      onChange={setCash}
                      error={errors.pembayaran && !isTotalValid}
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                      BAYAR TRANSFER
                    </label>
                    <RupiahInput
                      value={transfer}
                      onChange={setTransfer}
                      error={errors.pembayaran && !isTotalValid}
                    />
                  </div>
                </div>

                {/* Validation indicator */}
                <div className="mt-4 flex items-center gap-2">
                  {validationStatus === 'valid' ? (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex items-center gap-2 text-teal-600"
                    >
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500 text-white">
                        <Check size={12} strokeWidth={3} />
                      </div>
                      <span className="text-[13px] font-medium">
                        Total: {formatRupiahInput(totalPengeluaran.toString())}
                      </span>
                    </motion.div>
                  ) : validationStatus === 'invalid' ? (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex items-center gap-2 text-rose-500"
                    >
                      <AlertCircle size={16} />
                      <span className="text-[13px] font-medium">Masukkan jumlah pembayaran</span>
                    </motion.div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Wallet size={14} />
                      <span className="text-[13px]">Masukkan jumlah pembayaran</span>
                    </div>
                  )}
                </div>

                {errors.pembayaran && !isTotalValid && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 text-[12px] text-rose-500 flex items-center gap-1"
                  >
                    <AlertCircle size={11} /> Total pembayaran harus lebih dari 0
                  </motion.p>
                )}
              </motion.div>

              {/* Card 4: Akun Pengeluaran */}
              {(cashPortion >= 1 || transferPortion >= 1) && (
                <motion.div
                  variants={sectionItem}
                  animate={shaking ? { x: [0, -8, 8, -8, 8, 0] } : {}}
                  transition={{ duration: 0.4 }}
                  className="rounded-2xl bg-white border border-slate-200 p-6 shadow-card"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[18px] font-semibold text-slate-900">Akun Sumber Dana</h3>
                    <span className="text-[12px] text-slate-400">Pilih akun untuk tiap porsi</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {cashPortion >= 1 && (
                      <AccountPicker
                        label={`Akun Cash · Rp ${cashPortion.toLocaleString('id-ID')}`}
                        filterType="Cash"
                        accounts={accounts}
                        value={cashAccount?.id ?? null}
                        onChange={(_, account) => {
                          setCashAccount(account);
                          setSaveError(null);
                        }}
                      />
                    )}
                    {transferPortion >= 1 && (
                      <AccountPicker
                        label={`Akun Transfer · Rp ${transferPortion.toLocaleString('id-ID')}`}
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
                </motion.div>
              )}

              {/* Save feedback */}
              <AnimatePresence>
                {saveError && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-[13px] font-medium text-rose-700"
                  >
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{saveError}</span>
                  </motion.div>
                )}
                {saved && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex items-start gap-2 rounded-xl bg-teal-50 border border-teal-200 px-4 py-3 text-[13px] font-medium text-teal-700"
                  >
                    <div className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-teal-500 text-white shrink-0">
                      <Check size={11} strokeWidth={3} />
                    </div>
                    <span>Pengeluaran berhasil disimpan.</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="transfer"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.25, ease: easeSmooth }}
          >
            <motion.div
              variants={sectionStagger}
              initial="hidden"
              animate="show"
              className="flex flex-col gap-4"
            >
              {/* Rekening sumber & tujuan */}
              <motion.div
                variants={sectionItem}
                animate={shaking ? { x: [0, -8, 8, -8, 8, 0] } : {}}
                transition={{ duration: 0.4 }}
                className="rounded-2xl bg-white border border-slate-200 p-6 shadow-card"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[18px] font-semibold text-slate-900">Rekening / Kas</h3>
                  <span className="text-[12px] text-slate-400">Pindahkan saldo antar akun</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <AccountPicker
                    label="Dari Rekening/Kas"
                    accounts={accounts}
                    value={transferFromAccount?.id ?? null}
                    onChange={(_, account) => {
                      setTransferFromAccount(account);
                      setTransferError(null);
                    }}
                  />
                  <AccountPicker
                    label="Ke Rekening/Kas"
                    accounts={accounts}
                    value={transferToAccount?.id ?? null}
                    onChange={(_, account) => {
                      setTransferToAccount(account);
                      setTransferError(null);
                    }}
                  />
                </div>
              </motion.div>

              {/* Detail Transfer */}
              <motion.div
                variants={sectionItem}
                animate={shaking ? { x: [0, -8, 8, -8, 8, 0] } : {}}
                transition={{ duration: 0.4 }}
                className="rounded-2xl bg-white border border-slate-200 p-6 shadow-card"
              >
                <h3 className="text-[18px] font-semibold text-slate-900 mb-4">Detail Transfer</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                      JUMLAH *
                    </label>
                    <RupiahInput
                      value={jumlahTransfer}
                      onChange={setJumlahTransfer}
                      error={transferErrors.jumlah}
                    />
                    {transferErrors.jumlah && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-1 text-[12px] text-rose-500 flex items-center gap-1"
                      >
                        <AlertCircle size={11} /> Masukkan jumlah transfer
                      </motion.p>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                      KETERANGAN (OPSIONAL)
                    </label>
                    <textarea
                      value={keteranganTransfer}
                      onChange={(e) => setKeteranganTransfer(e.target.value)}
                      placeholder="Setor ke BCA, tarik untuk operasional, dll"
                      rows={2}
                      className="w-full min-h-[60px] resize-y rounded-xl border border-slate-300 px-4 py-3 text-[14px] outline-none transition-all duration-200 font-body focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                    />
                  </div>
                </div>
              </motion.div>

              {/* Validation / persistence feedback */}
              <AnimatePresence>
                {transferError && (
                  <motion.div
                    key="transfer-error"
                    role="alert"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-[13px] font-medium text-rose-700"
                  >
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{transferError}</span>
                  </motion.div>
                )}
                {transferSaved && (
                  <motion.div
                    key="transfer-saved"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex items-start gap-2 rounded-xl bg-teal-50 border border-teal-200 px-4 py-3 text-[13px] font-medium text-teal-700"
                  >
                    <div className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-teal-500 text-white shrink-0">
                      <Check size={11} strokeWidth={3} />
                    </div>
                    <span>Transfer berhasil disimpan.</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
            <p className="text-[13px] text-slate-500">
              {activeTab === 'pengeluaran' ? 'Total Pengeluaran' : 'Transfer Uang'}
            </p>
            <motion.p
              key={activeTab === 'pengeluaran' ? totalPengeluaran : transferJumlahNum}
              initial={{ scale: 1.05 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className={`font-mono text-[20px] font-semibold ${
                (activeTab === 'pengeluaran' ? totalPengeluaran > 0 : transferJumlahNum > 0)
                  ? 'text-slate-900'
                  : 'text-slate-400'
              }`}
            >
              Rp{' '}
              {activeTab === 'pengeluaran'
                ? formatRupiahInput(totalPengeluaran.toString()) || '0'
                : formatRupiahInput(transferJumlahNum.toString()) || '0'}
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
              whileHover={
                activeTab === 'pengeluaran'
                  ? isTotalValid && isKategoriValid
                    ? { scale: 1.02 }
                    : {}
                  : isTransferValid
                    ? { scale: 1.02 }
                    : {}
              }
              whileTap={{ scale: 0.98 }}
              onClick={handleSimpan}
              disabled={saving || transferSaving}
              className={`rounded-xl px-5 py-2.5 text-[14px] font-semibold transition-all duration-200 ${
                activeTab === 'pengeluaran'
                  ? isTotalValid && isKategoriValid && !saving
                    ? 'bg-teal-500 text-white hover:bg-teal-600 cursor-pointer'
                    : 'bg-teal-500/40 text-white cursor-not-allowed'
                  : isTransferValid && !transferSaving
                    ? 'bg-teal-500 text-white hover:bg-teal-600 cursor-pointer'
                    : 'bg-teal-500/40 text-white cursor-not-allowed'
              }`}
            >
              {activeTab === 'pengeluaran'
                ? saving
                  ? 'Menyimpan…'
                  : 'Simpan Pengeluaran'
                : transferSaving
                  ? 'Menyimpan…'
                  : 'Simpan Transfer'}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
