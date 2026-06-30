import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  RefreshCw,
  Plus,
  Wallet,
  Landmark,
  Banknote,
  ChevronDown,
  AlertCircle,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Trash2,
  Pencil,
  Scale,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Inbox,
  X,
} from 'lucide-react';
import {
  getAccounts,
  getLedgerEntries,
  createAccount,
  updateAccount,
  archiveAccount,
  reactivateAccount,
  deleteAccount,
  recordManualAdjustment,
  AccountHasHistoryError,
  type AccountWithBalance,
  type LedgerEntry,
} from '@/services/accounts';
import { isOverdraft, validateAccountInput } from '@/services/accountsCore';
import type { AccountType, Direction } from '@/services/accountsCore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
/* ------------------------------------------------------------------ */

const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];
const easeOutExpo = [0.19, 1, 0.22, 1] as [number, number, number, number];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatRupiah(n: number) {
  const sign = n < 0 ? '-' : '';
  return sign + 'Rp ' + Math.abs(n).toLocaleString('id-ID');
}

function formatDateTime(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('id-ID', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Strip everything but digits and parse to an integer (0 when empty). */
function digitsToNumber(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return 0;
  return Number(digits);
}

/** Format a digit string with thousands separators for display in an input. */
function formatDigitsForInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return '';
  return Number(digits).toLocaleString('id-ID');
}

const DIRECTION_LABEL: Record<Direction, string> = {
  money_in: 'Masuk',
  money_out: 'Keluar',
};

/* ------------------------------------------------------------------ */
/*  Rupiah input                                                       */
/* ------------------------------------------------------------------ */

function RupiahInput({
  id,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  id?: string;
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex items-center rounded-xl border border-slate-200 bg-white focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100 transition-colors">
      <span className="pl-3 pr-1 text-[13px] font-medium text-slate-400 select-none">Rp</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoFocus={autoFocus}
        value={formatDigitsForInput(value)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        placeholder={placeholder}
        className="w-full bg-transparent py-2.5 pr-3 text-[14px] font-mono text-slate-900 outline-none placeholder:text-slate-300"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Confirmation dialog                                                */
/* ------------------------------------------------------------------ */

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'default',
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition-colors disabled:opacity-50 ${
              tone === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {busy ? 'Memproses…' : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Add / Edit account dialog                                          */
/* ------------------------------------------------------------------ */

function AccountFormDialog({
  open,
  mode,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: AccountWithBalance | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('Cash');
  const [openingRaw, setOpeningRaw] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset fields whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setType(initial?.type ?? 'Cash');
      setOpeningRaw(initial ? String(initial.opening_balance) : '');
      setNote(initial?.note ?? '');
      setError('');
      setSubmitting(false);
    }
  }, [open, initial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const openingBalance = digitsToNumber(openingRaw);

    // Client-side validation mirroring validateAccountInput.
    const result = validateAccountInput({
      name,
      type,
      openingBalance: mode === 'create' ? openingBalance : undefined,
      note,
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'create') {
        await createAccount({
          name: name.trim(),
          type,
          opening_balance: openingBalance,
          note: note.trim(),
        });
        onSaved('Akun berhasil dibuat');
      } else if (initial) {
        await updateAccount(initial.id, { name: name.trim(), note: note.trim() });
        onSaved('Akun berhasil diperbarui');
      }
    } catch (err: any) {
      console.error('[AkunKas] save account error:', err);
      setError(err?.message || 'Gagal menyimpan akun');
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Tambah Akun' : 'Edit Akun'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Buat akun Cash atau Bank dengan saldo awal opsional.'
              : 'Ubah nama dan catatan akun. Saldo awal tidak dapat diubah.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="acc-name" className="mb-1.5 block text-[12px] font-semibold text-slate-600">
              Nama Akun
            </label>
            <input
              id="acc-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="contoh: BCA, Kas Toko"
              maxLength={120}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-slate-900 outline-none transition-colors placeholder:text-slate-300 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          {mode === 'create' && (
            <>
              <div>
                <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">Tipe Akun</span>
                <div className="grid grid-cols-2 gap-2">
                  {(['Cash', 'Bank'] as AccountType[]).map((t) => {
                    const Icon = t === 'Cash' ? Banknote : Landmark;
                    const active = type === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setType(t)}
                        aria-pressed={active}
                        className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                          active
                            ? 'border-teal-500 bg-teal-50 text-teal-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon size={15} />
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label htmlFor="acc-opening" className="mb-1.5 block text-[12px] font-semibold text-slate-600">
                  Saldo Awal
                </label>
                <RupiahInput id="acc-opening" value={openingRaw} onChange={setOpeningRaw} placeholder="0" />
              </div>
            </>
          )}

          <div>
            <label htmlFor="acc-note" className="mb-1.5 block text-[12px] font-semibold text-slate-600">
              Catatan <span className="font-normal text-slate-400">(opsional)</span>
            </label>
            <textarea
              id="acc-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={520}
              placeholder="catatan tambahan"
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-slate-900 outline-none transition-colors placeholder:text-slate-300 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[12px] font-medium text-rose-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Menyimpan…' : mode === 'create' ? 'Tambah Akun' : 'Simpan'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Manual adjustment dialog                                           */
/* ------------------------------------------------------------------ */

function AdjustmentDialog({
  open,
  account,
  onClose,
  onSaved,
}: {
  open: boolean;
  account: AccountWithBalance | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [direction, setDirection] = useState<Direction>('money_in');
  const [amountRaw, setAmountRaw] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setDirection('money_in');
      setAmountRaw('');
      setNote('');
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    setError('');

    const amount = digitsToNumber(amountRaw);
    if (amount < 1) {
      setError('Jumlah harus lebih dari 0');
      return;
    }
    if (note.trim().length === 0) {
      setError('Catatan wajib diisi untuk penyesuaian manual');
      return;
    }

    setSubmitting(true);
    try {
      await recordManualAdjustment({
        account_id: account.id,
        direction,
        amount,
        note: note.trim(),
      });
      onSaved('Penyesuaian berhasil dicatat');
    } catch (err: any) {
      console.error('[AkunKas] adjustment error:', err);
      setError(err?.message || 'Gagal mencatat penyesuaian');
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Penyesuaian Manual</DialogTitle>
          <DialogDescription>
            {account ? `Catat pemasukan atau pengeluaran untuk ${account.name}.` : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">Arah</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection('money_in')}
                aria-pressed={direction === 'money_in'}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                  direction === 'money_in'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ArrowDownLeft size={15} />
                Masuk
              </button>
              <button
                type="button"
                onClick={() => setDirection('money_out')}
                aria-pressed={direction === 'money_out'}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                  direction === 'money_out'
                    ? 'border-rose-500 bg-rose-50 text-rose-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ArrowUpRight size={15} />
                Keluar
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="adj-amount" className="mb-1.5 block text-[12px] font-semibold text-slate-600">
              Jumlah
            </label>
            <RupiahInput id="adj-amount" value={amountRaw} onChange={setAmountRaw} placeholder="0" autoFocus />
          </div>

          <div>
            <label htmlFor="adj-note" className="mb-1.5 block text-[12px] font-semibold text-slate-600">
              Catatan <span className="font-normal text-rose-400">(wajib)</span>
            </label>
            <textarea
              id="adj-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={520}
              placeholder="alasan penyesuaian"
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-slate-900 outline-none transition-colors placeholder:text-slate-300 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[12px] font-medium text-rose-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Menyimpan…' : 'Catat Penyesuaian'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Ledger entry row                                                   */
/* ------------------------------------------------------------------ */

function LedgerEntryRow({ entry }: { entry: LedgerEntry }) {
  const isIn = entry.direction === 'money_in';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
    >
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            isIn ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
          }`}
        >
          {isIn ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[12px] font-semibold ${isIn ? 'text-emerald-700' : 'text-rose-700'}`}
            >
              {DIRECTION_LABEL[entry.direction]}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {entry.source_reference}
            </span>
          </div>
          {entry.note && <p className="mt-0.5 truncate text-[12px] text-slate-500">{entry.note}</p>}
          <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
            <Clock size={10} />
            {formatDateTime(entry.created_at)}
          </p>
        </div>
      </div>
      <span
        className={`shrink-0 font-mono text-[14px] font-semibold ${
          isIn ? 'text-emerald-600' : 'text-rose-600'
        }`}
      >
        {isIn ? '+' : '−'}
        {formatRupiah(entry.amount)}
      </span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Account card                                                       */
/* ------------------------------------------------------------------ */

function AccountCard({
  account,
  index,
  expanded,
  onToggle,
  ledger,
  ledgerLoading,
  ledgerError,
  onReloadLedger,
  onEdit,
  onArchiveToggle,
  onDelete,
  onAdjust,
}: {
  account: AccountWithBalance;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  ledger: LedgerEntry[] | undefined;
  ledgerLoading: boolean;
  ledgerError: string;
  onReloadLedger: () => void;
  onEdit: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
  onAdjust: () => void;
}) {
  const TypeIcon = account.type === 'Cash' ? Banknote : Landmark;
  const overdraft = account.is_overdraft ?? isOverdraft(account.current_balance);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: easeSmooth }}
      className={`rounded-2xl border bg-white shadow-card overflow-hidden ${
        account.is_archived ? 'border-slate-200 opacity-90' : 'border-slate-200'
      }`}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50/50"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              account.type === 'Cash' ? 'bg-amber-50 text-amber-600' : 'bg-teal-50 text-teal-600'
            }`}
          >
            <TypeIcon size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[16px] font-semibold text-slate-900 font-body truncate">{account.name}</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  account.type === 'Cash'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-teal-50 text-teal-700'
                }`}
              >
                {account.type}
              </span>
              {account.is_archived && (
                <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  <Archive size={10} />
                  Diarsipkan
                </span>
              )}
              {overdraft && (
                <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
                  <AlertTriangle size={10} />
                  Overdraft
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">Saldo</p>
            <span
              className={`font-mono text-[15px] font-semibold ${
                overdraft ? 'text-rose-600' : 'text-slate-900'
              }`}
            >
              {formatRupiah(account.current_balance)}
            </span>
          </div>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.3 }}>
            <ChevronDown size={18} className="text-slate-400" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: easeSmooth }}
            className="overflow-hidden border-t border-slate-100"
          >
            <div className="p-5 space-y-4">
              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={onAdjust}
                  className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-teal-700 transition-colors"
                >
                  <Scale size={13} />
                  Penyesuaian
                </button>
                <button
                  onClick={onEdit}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Pencil size={13} />
                  Edit
                </button>
                {account.is_archived ? (
                  <button
                    onClick={onArchiveToggle}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <ArchiveRestore size={13} />
                    Aktifkan
                  </button>
                ) : (
                  <button
                    onClick={onArchiveToggle}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Archive size={13} />
                    Arsipkan
                  </button>
                )}
                <button
                  onClick={onDelete}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[12px] font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 size={13} />
                  Hapus
                </button>
              </div>

              {/* Ledger */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Riwayat Terakhir
                  </p>
                  <button
                    onClick={onReloadLedger}
                    className="text-[11px] font-medium text-teal-600 hover:text-teal-700 transition-colors"
                  >
                    Muat ulang
                  </button>
                </div>

                {ledgerLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-200 border-t-teal-600" />
                  </div>
                ) : ledgerError ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-rose-100 bg-rose-50/50 py-6">
                    <AlertCircle size={20} className="text-rose-500" />
                    <p className="text-[12px] font-medium text-rose-700">{ledgerError}</p>
                    <button
                      onClick={onReloadLedger}
                      className="text-[12px] font-semibold text-teal-600 hover:text-teal-700"
                    >
                      Coba lagi
                    </button>
                  </div>
                ) : !ledger || ledger.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 py-8">
                    <Inbox size={24} className="text-slate-300" />
                    <p className="text-[12px] font-medium text-slate-500">Belum ada transaksi di akun ini</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ledger.map((entry) => (
                      <LedgerEntryRow key={entry.id} entry={entry} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toast                                                              */
/* ------------------------------------------------------------------ */

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-[13px] font-medium text-white shadow-lg"
    >
      <span>{message}</span>
      <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
        <X size={14} />
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function AkunKas() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Expansion + ledger cache (per account id).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ledgerMap, setLedgerMap] = useState<Record<string, LedgerEntry[]>>({});
  const [ledgerLoadingId, setLedgerLoadingId] = useState<string | null>(null);
  const [ledgerErrorMap, setLedgerErrorMap] = useState<Record<string, string>>({});

  // Dialog state.
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<AccountWithBalance | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<AccountWithBalance | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AccountWithBalance | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AccountWithBalance | null>(null);
  const [historyBlock, setHistoryBlock] = useState<AccountWithBalance | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAccounts();
      setAccounts(data);
    } catch (err: any) {
      console.error('[AkunKas] load error:', err);
      setError(err?.message || 'Gagal memuat data akun');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const loadLedger = useCallback(async (accountId: string) => {
    setLedgerLoadingId(accountId);
    setLedgerErrorMap((m) => ({ ...m, [accountId]: '' }));
    try {
      const entries = await getLedgerEntries(accountId, 50);
      setLedgerMap((m) => ({ ...m, [accountId]: entries }));
    } catch (err: any) {
      console.error('[AkunKas] ledger error:', err);
      setLedgerErrorMap((m) => ({ ...m, [accountId]: err?.message || 'Gagal memuat riwayat' }));
    } finally {
      setLedgerLoadingId((cur) => (cur === accountId ? null : cur));
    }
  }, []);

  function toggleExpand(account: AccountWithBalance) {
    if (expandedId === account.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(account.id);
    if (!ledgerMap[account.id]) {
      loadLedger(account.id);
    }
  }

  const totalBalance = useMemo(
    () => accounts.reduce((sum, a) => sum + a.current_balance, 0),
    [accounts]
  );

  // Refresh accounts and any open ledger after a mutating action.
  const refreshAfterMutation = useCallback(async () => {
    await loadAccounts();
    if (expandedId) {
      await loadLedger(expandedId);
    }
  }, [loadAccounts, loadLedger, expandedId]);

  async function handleArchiveConfirm() {
    if (!archiveTarget) return;
    setActionBusy(true);
    try {
      if (archiveTarget.is_archived) {
        await reactivateAccount(archiveTarget.id);
        setToast(`${archiveTarget.name} diaktifkan kembali`);
      } else {
        await archiveAccount(archiveTarget.id);
        setToast(`${archiveTarget.name} diarsipkan`);
      }
      setArchiveTarget(null);
      await refreshAfterMutation();
    } catch (err: any) {
      console.error('[AkunKas] archive error:', err);
      setToast(err?.message || 'Operasi gagal');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setActionBusy(true);
    try {
      await deleteAccount(deleteTarget.id);
      setToast(`${deleteTarget.name} dihapus`);
      setDeleteTarget(null);
      await refreshAfterMutation();
    } catch (err: any) {
      if (err instanceof AccountHasHistoryError) {
        const blocked = deleteTarget;
        setDeleteTarget(null);
        setHistoryBlock(blocked);
      } else {
        console.error('[AkunKas] delete error:', err);
        setToast(err?.message || 'Gagal menghapus akun');
        setDeleteTarget(null);
      }
    } finally {
      setActionBusy(false);
    }
  }

  /* ----- Loading / error states (mirror Agen.tsx) ----- */

  if (loading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-teal-200 border-t-teal-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8">
        <AlertCircle size={48} className="text-rose-500 mb-4" />
        <p className="text-[16px] font-medium text-slate-700 text-center">{error}</p>
        <button
          onClick={loadAccounts}
          className="mt-4 rounded-xl bg-teal-600 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="pb-12">
      {/* Header */}
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
            aria-label="Kembali"
          >
            <ArrowLeft size={18} />
          </motion.button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-[36px] text-slate-900 leading-tight">Akun &amp; Kas</h1>
              <span className="font-mono text-[13px] text-slate-500">
                {accounts.length} akun · Total saldo {formatRupiah(totalBalance)}
              </span>
            </div>
          </div>
          <motion.button
            whileHover={{ rotate: 180 }}
            whileTap={{ scale: 0.95 }}
            onClick={loadAccounts}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            title="Refresh"
            aria-label="Muat ulang"
          >
            <RefreshCw size={16} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors"
          >
            <Plus size={16} />
            Tambah Akun
          </motion.button>
        </div>
        <div className="ml-12 h-[3px] rounded-full bg-slate-200 overflow-hidden max-w-[200px]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: 0.8, ease: easeOutExpo }}
            className="h-full bg-teal-500 rounded-full"
          />
        </div>
      </motion.div>

      {/* Account list / empty state */}
      {accounts.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 px-6 text-center shadow-card"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-500 mb-4">
            <Wallet size={28} />
          </div>
          <p className="text-[16px] font-semibold text-slate-700">Belum ada akun</p>
          <p className="mt-1 text-[13px] text-slate-500 max-w-sm">
            Tambahkan akun Cash atau Bank untuk mulai mencatat kas dan saldo rekening.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-5 flex items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors"
          >
            <Plus size={16} />
            Tambah Akun
          </button>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-4">
          {accounts.map((account, index) => (
            <AccountCard
              key={account.id}
              account={account}
              index={index}
              expanded={expandedId === account.id}
              onToggle={() => toggleExpand(account)}
              ledger={ledgerMap[account.id]}
              ledgerLoading={ledgerLoadingId === account.id}
              ledgerError={ledgerErrorMap[account.id] || ''}
              onReloadLedger={() => loadLedger(account.id)}
              onEdit={() => setEditTarget(account)}
              onArchiveToggle={() => setArchiveTarget(account)}
              onDelete={() => setDeleteTarget(account)}
              onAdjust={() => setAdjustTarget(account)}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <AccountFormDialog
        open={showCreate}
        mode="create"
        onClose={() => setShowCreate(false)}
        onSaved={(msg) => {
          setShowCreate(false);
          setToast(msg);
          loadAccounts();
        }}
      />

      {/* Edit dialog */}
      <AccountFormDialog
        open={!!editTarget}
        mode="edit"
        initial={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={(msg) => {
          setEditTarget(null);
          setToast(msg);
          refreshAfterMutation();
        }}
      />

      {/* Adjustment dialog */}
      <AdjustmentDialog
        open={!!adjustTarget}
        account={adjustTarget}
        onClose={() => setAdjustTarget(null)}
        onSaved={(msg) => {
          setAdjustTarget(null);
          setToast(msg);
          refreshAfterMutation();
        }}
      />

      {/* Archive / reactivate confirm */}
      <ConfirmDialog
        open={!!archiveTarget}
        title={archiveTarget?.is_archived ? 'Aktifkan akun?' : 'Arsipkan akun?'}
        description={
          archiveTarget?.is_archived
            ? `${archiveTarget?.name} akan muncul kembali di daftar akun aktif.`
            : `${archiveTarget?.name} akan disembunyikan dari daftar aktif. Riwayatnya tetap tersimpan.`
        }
        confirmLabel={archiveTarget?.is_archived ? 'Aktifkan' : 'Arsipkan'}
        busy={actionBusy}
        onConfirm={handleArchiveConfirm}
        onCancel={() => setArchiveTarget(null)}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Hapus akun?"
        description={
          <>
            <strong>{deleteTarget?.name}</strong> akan dihapus permanen. Tindakan ini tidak dapat
            dibatalkan. Akun yang memiliki riwayat transaksi tidak dapat dihapus.
          </>
        }
        confirmLabel="Hapus"
        tone="danger"
        busy={actionBusy}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* History-blocked delete: suggest archiving */}
      <ConfirmDialog
        open={!!historyBlock}
        title="Tidak bisa dihapus"
        description="Akun dengan riwayat tidak bisa dihapus, arsipkan saja."
        confirmLabel="Arsipkan"
        busy={actionBusy}
        onConfirm={async () => {
          if (!historyBlock) return;
          setActionBusy(true);
          try {
            await archiveAccount(historyBlock.id);
            setToast(`${historyBlock.name} diarsipkan`);
            setHistoryBlock(null);
            await refreshAfterMutation();
          } catch (err: any) {
            setToast(err?.message || 'Operasi gagal');
          } finally {
            setActionBusy(false);
          }
        }}
        onCancel={() => setHistoryBlock(null)}
      />

      <AnimatePresence>
        {toast && <Toast key={toast} message={toast} onClose={() => setToast('')} />}
      </AnimatePresence>
    </div>
  );
}
