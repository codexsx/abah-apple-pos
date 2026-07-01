import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Phone,
  Clock,
  FileText,
  Wallet,
  Banknote,
  Wrench,
  Scale,
  History,
  AlertCircle,
} from 'lucide-react';
import {
  getAgentById,
  getAgentTransactions,
  getAgentBalanceBreakdown,
  createAgentTransaction,
  formatAgentPhone,
  type Agent,
  type AgentTransaction,
} from '@/services/agents';
import { deriveAgentPaymentBreakdown } from '@/services/depositCore';
import { getAccountPickerData, type AccountWithBalance } from '@/services/accounts';
import { recordAgentPaymentWithPosting } from '@/services/postings';
import AccountPicker from '@/components/AccountPicker';
import { Input } from '@/components/ui/input';
import { TransactionStaffBadge } from '@/components/TransactionStaffBadge';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];
const easeOutExpo = [0.19, 1, 0.22, 1] as [number, number, number, number];

/**
 * Maps URL action-param shortcuts and canonical values to the canonical
 * Agent_Transaction types accepted by the database CHECK constraint. The
 * previous Penyesuaian entry point now resolves to Koreksi because both flows
 * add agent debt with the same behavior.
 */
export const ACTION_PARAM_MAP: Record<string, 'Stor/Bayar' | 'Koreksi' | 'Penyesuaian'> = {
  stor: 'Stor/Bayar',
  koreksi: 'Koreksi',
  penyesuaian: 'Koreksi',
  // Also accept canonical values directly
  'Stor/Bayar': 'Stor/Bayar',
  Koreksi: 'Koreksi',
  Penyesuaian: 'Koreksi',
};

/**
 * Resolves a raw URL action param into a canonical transaction type.
 * Returns null for empty or unknown input so the detail view renders
 * without an active action form.
 */
export function resolveActionParam(
  param: string | null,
): 'Stor/Bayar' | 'Koreksi' | 'Penyesuaian' | null {
  if (!param) return null;
  // Use hasOwn so inherited Object.prototype keys (e.g. "valueOf",
  // "toString", "constructor") never resolve to an inherited member.
  return Object.hasOwn(ACTION_PARAM_MAP, param) ? ACTION_PARAM_MAP[param] : null;
}

function formatRupiah(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID');
}

function formatDateTime(iso: string | null) {
  if (!iso) return 'belum ada transaksi';
  const d = new Date(iso);
  return d.toLocaleString('id-ID', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseRupiahInput(value: string): number {
  return parseInt(value.replace(/\D/g, '') || '0', 10);
}

function formatRupiahInput(value: string): string {
  const numeric = value.replace(/\D/g, '');
  if (!numeric) return '';
  return parseInt(numeric, 10).toLocaleString('id-ID');
}

/* ------------------------------------------------------------------ */
/*  Components                                                         */
/* ------------------------------------------------------------------ */

function TransactionRow({ tx }: { tx: AgentTransaction }) {
  const typeIcons: Record<string, React.ElementType> = {
    'Stor/Bayar': Banknote,
    Koreksi: Wrench,
    Penyesuaian: Scale,
  };
  const typeColors: Record<string, { bg: string; text: string; border: string }> = {
    'Stor/Bayar': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    Koreksi: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    Penyesuaian: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  };
  const Icon = typeIcons[tx.type] || FileText;
  const colors = typeColors[tx.type] || { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 sm:p-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors.bg} ${colors.text}`}>
            <Icon size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-medium text-slate-900">{tx.type}</span>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}
              >
                {tx.method}
              </span>
            </div>
            <p className="text-[13px] text-slate-500 mt-1">{tx.note}</p>
            <p className="text-[11px] text-slate-400 mt-1.5">{formatDateTime(tx.created_at)}</p>
            <div className="mt-2">
              <TransactionStaffBadge transaction={tx} />
            </div>
          </div>
        </div>
        <div className="text-right sm:text-right">
          <p className="font-mono text-[16px] font-semibold text-slate-900">{formatRupiah(tx.amount)}</p>
          <p className="text-[10px] font-mono text-slate-400">{tx.id.slice(0, 8)}</p>
        </div>
      </div>
    </motion.div>
  );
}

function ActionForm({
  type,
  agent,
  outstandingDebt,
  onCancel,
  onSaved,
}: {
  type: 'Stor/Bayar' | 'Koreksi' | 'Penyesuaian';
  agent: Agent;
  outstandingDebt: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'Cash' | 'Transfer'>('Cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Stor/Bayar posts to a financial account; Koreksi/Penyesuaian do not.
  const isStorBayar = type === 'Stor/Bayar';
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Informational split of the entered payment into the part that clears the
  // current debt vs the surplus that becomes deposit credit (Req 3.x). Display
  // only — the submit still posts the full amount.
  const paymentBreakdown = useMemo(() => {
    if (!isStorBayar) return null;
    const numeric = parseRupiahInput(amount);
    if (numeric <= 0) return null;
    const result = deriveAgentPaymentBreakdown(outstandingDebt, numeric);
    return result.ok ? result.breakdown : null;
  }, [isStorBayar, amount, outstandingDebt]);

  // Load active accounts only when posting is needed (Stor/Bayar).
  useEffect(() => {
    if (!isStorBayar) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getAccountPickerData();
        if (!cancelled) setAccounts(data);
      } catch (err) {
        console.error('[AgenDetail] account load error:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isStorBayar]);

  // The Cash/Transfer method routes the whole amount to a single account type,
  // so switching method clears any account picked for the previous type.
  function handleMethodChange(m: 'Cash' | 'Transfer') {
    setMethod(m);
    setSelectedAccountId(null);
    setAccountError(null);
  }

  const colors = {
    'Stor/Bayar': 'bg-emerald-500 hover:bg-emerald-600',
    Koreksi: 'bg-amber-500 hover:bg-amber-600',
    Penyesuaian: 'bg-blue-500 hover:bg-blue-600',
  };
  const actionLabel = type === 'Koreksi' ? 'Koreksi / Penyesuaian' : type;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numeric = parseRupiahInput(amount);
    if (numeric <= 0) return;

    if (isStorBayar) {
      // Require a selected account when there is money to post; reject and
      // persist nothing otherwise (Req 9.1, 9.5).
      if (!selectedAccountId) {
        setAccountError(
          method === 'Cash'
            ? 'Pilih akun kas untuk pembayaran ini'
            : 'Pilih akun bank untuk pembayaran ini',
        );
        return;
      }
      setSaving(true);
      try {
        await recordAgentPaymentWithPosting({
          agentId: agent.id,
          amount: numeric,
          method,
          note,
          accountId: selectedAccountId,
        });
        setAmount('');
        setNote('');
        setSelectedAccountId(null);
        setAccountError(null);
        onSaved();
        onCancel();
      } catch (err) {
        console.error('[AgenDetail] submit error:', err);
        alert('Transaksi tidak dapat disimpan. Silakan coba lagi.');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Koreksi / Penyesuaian: no posting, existing path (Req 9.4).
    setSaving(true);
    try {
      await createAgentTransaction({
        agent_id: agent.id,
        type,
        amount: numeric,
        method,
        note,
      });
      setAmount('');
      setNote('');
      onSaved();
      onCancel();
    } catch (err) {
      console.error('[AgenDetail] submit error:', err);
      alert('Gagal menyimpan transaksi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card overflow-hidden"
    >
      <h3 className="text-[16px] font-semibold text-slate-900 mb-1">
        {actionLabel} - {agent.name}
      </h3>
      <p className="text-[13px] text-slate-500 mb-4">
        Transaksi akan langsung tersimpan di Supabase.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
            Nominal
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 font-mono">Rp</span>
            <Input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(formatRupiahInput(e.target.value))}
              placeholder="0"
              required
              className="pl-10 h-11 rounded-xl border-slate-300 text-[14px] font-mono focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>
        </div>

        {isStorBayar && paymentBreakdown && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <p className="text-[12px] text-slate-600">
              Sisa hutang saat ini: <span className="font-mono font-semibold text-slate-900">{formatRupiah(outstandingDebt)}</span>
            </p>
            <p className="text-[13px] text-slate-700">
              Melunasi hutang: <span className="font-mono font-semibold text-emerald-700">{formatRupiah(paymentBreakdown.owed)}</span>
            </p>
            {paymentBreakdown.surplus > 0 && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-[13px] text-teal-800">
                Kelebihan jadi deposit: <span className="font-mono font-semibold">{formatRupiah(paymentBreakdown.surplus)}</span>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
            Metode
          </label>
          <div className="flex gap-2">
            {(['Cash', 'Transfer'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleMethodChange(m)}
                className={`px-4 py-2 rounded-xl text-[13px] font-medium transition-colors ${
                  method === m
                    ? 'bg-teal-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {isStorBayar && (
          <AccountPicker
            label={method === 'Cash' ? 'Akun Kas Tujuan' : 'Akun Bank Tujuan'}
            value={selectedAccountId}
            filterType={method === 'Cash' ? 'Cash' : 'Bank'}
            accounts={accounts}
            error={accountError}
            onChange={(accountId) => {
              setSelectedAccountId(accountId);
              setAccountError(null);
            }}
          />
        )}

        <div>
          <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
            Keterangan
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-[14px] outline-none transition-all focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 resize-y"
            placeholder="Catatan transaksi..."
          />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className={`rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white transition-colors disabled:opacity-60 ${colors[type]}`}
          >
            {saving ? 'Menyimpan...' : `Simpan ${actionLabel}`}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl bg-slate-100 px-5 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Batal
          </button>
        </div>
      </form>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function AgenDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const actionParam = resolveActionParam(searchParams.get('action'));

  const [activeAction, setActiveAction] = useState<'Stor/Bayar' | 'Koreksi' | 'Penyesuaian' | null>(actionParam);

  const [agent, setAgent] = useState<Agent | null>(null);
  const [transactions, setTransactions] = useState<AgentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const breakdown = useMemo(() => getAgentBalanceBreakdown(transactions), [transactions]);

  const balanceDisplay = useMemo(() => {
    if (breakdown.outstandingDebt > 0) {
      return {
        label: 'Sisa Hutang',
        value: formatRupiah(breakdown.outstandingDebt),
        valueColor: 'text-rose-600',
        iconColor: 'text-rose-500',
        subtext: 'Sisa hutang yang belum dibayar oleh agen ke toko.',
      };
    }
    if (breakdown.depositCredit > 0) {
      return {
        label: 'Saldo Deposit',
        value: formatRupiah(breakdown.depositCredit),
        valueColor: 'text-blue-600',
        iconColor: 'text-blue-500',
        subtext: 'Saldo deposit/titipan agen yang bisa mengurangi hutang berikutnya.',
      };
    }
    return {
      label: 'LUNAS',
      value: formatRupiah(0),
      valueColor: 'text-emerald-600',
      iconColor: 'text-emerald-500',
      subtext: 'Tidak ada sisa hutang. Pembayaran agen sudah lunas.',
    };
  }, [breakdown]);

  async function loadData() {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [agentData, txData] = await Promise.all([getAgentById(id), getAgentTransactions(id)]);
      if (!agentData) {
        setError('Agen tidak ditemukan');
      } else {
        setAgent(agentData);
        setTransactions(txData);
      }
    } catch (err: any) {
      console.error('[AgenDetail] load error:', err);
      setError(err?.message || 'Gagal memuat data agen');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [id]);

  function handleAction(type: 'Stor/Bayar' | 'Koreksi' | 'Penyesuaian') {
    setActiveAction(type);
    setSearchParams({ action: type === 'Stor/Bayar' ? 'stor' : 'koreksi' });
  }

  function handleCancelAction() {
    setActiveAction(null);
    setSearchParams({});
  }

  if (loading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="pb-12">
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-slate-200 bg-white">
          <AlertCircle size={48} className="text-rose-500 mb-4" />
          <p className="text-[18px] font-semibold text-slate-900">{error || 'Agen tidak ditemukan'}</p>
          <button
            onClick={() => navigate('/agen')}
            className="mt-4 rounded-xl bg-teal-500 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-600 transition-colors"
          >
            Kembali ke Agen
          </button>
        </div>
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
            onClick={() => navigate('/agen')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft size={18} />
          </motion.button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-[36px] text-slate-900 leading-tight">{agent.name}</h1>
              <span className="font-mono text-[13px] text-slate-500">{agent.code}</span>
            </div>
          </div>
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

      {/* Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05, ease: easeSmooth }}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card mb-6"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white text-[18px] font-semibold font-body">
            {agent.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[18px] font-semibold text-slate-900 font-body">{agent.name}</h2>
            <p className="text-[13px] text-slate-500 mt-0.5 italic">{agent.note}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-[13px] text-slate-600">
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-slate-400" />
                <span>{formatAgentPhone(agent.phone)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-slate-400" />
                <span>Terakhir: {formatDateTime(transactions[0]?.created_at || null)}</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: easeSmooth }}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card mb-6"
      >
        <div className="flex items-center gap-2 mb-2">
          <Wallet size={16} className={balanceDisplay.iconColor} />
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            {balanceDisplay.label}
          </p>
        </div>
        <p className={`font-mono text-[32px] font-bold ${balanceDisplay.valueColor} leading-none`}>
          {balanceDisplay.value}
        </p>
        <p className="text-[13px] text-slate-500 mt-2">
          {balanceDisplay.subtext}
        </p>
      </motion.div>

      {/* Action Buttons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15, ease: easeSmooth }}
        className="flex flex-wrap gap-2 mb-6"
      >
        <button
          onClick={() => handleAction('Stor/Bayar')}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-colors ${
            activeAction === 'Stor/Bayar'
              ? 'bg-emerald-600 text-white'
              : 'bg-emerald-500 text-white hover:bg-emerald-600'
          }`}
        >
          <Banknote size={15} />
          Stor / Bayar
        </button>
        <button
          onClick={() => handleAction('Koreksi')}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-colors ${
            activeAction === 'Koreksi'
              ? 'bg-amber-600 text-white'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Wrench size={15} />
          Koreksi / Penyesuaian
        </button>
      </motion.div>

      {/* Action Form */}
      <AnimatePresence>
        {activeAction && agent && (
          <div className="mb-6">
            <ActionForm
              type={activeAction}
              agent={agent}
              outstandingDebt={breakdown.outstandingDebt}
              onCancel={handleCancelAction}
              onSaved={loadData}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Transaction History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2, ease: easeSmooth }}
      >
        <div className="flex items-center gap-2 mb-4">
          <History size={16} className="text-teal-500" />
          <h3 className="text-[16px] font-semibold text-slate-900 font-body">Riwayat Transaksi</h3>
          <span className="text-[12px] text-slate-400">{transactions.length} transaksi</span>
        </div>

        {transactions.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-slate-200 bg-white">
            <History size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-[15px] font-medium text-slate-500">Belum ada transaksi</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
