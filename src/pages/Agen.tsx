import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  RefreshCw,
  Users,
  Wallet,
  Phone,
  Clock,
  FileText,
  ChevronDown,
  Banknote,
  History,
  Wrench,
  Scale,
  ArrowRight,
  AlertCircle,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  getAgents,
  getAgentTransactions,
  getAgentBalance,
  formatAgentPhone,
  updateAgent,
  deleteAgent,
  type Agent,
  type AgentUpdate,
  type AgentTransaction,
} from '@/services/agents';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
/* ------------------------------------------------------------------ */

const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];
const easeOutExpo = [0.19, 1, 0.22, 1] as [number, number, number, number];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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
    second: '2-digit',
  });
}

/* ------------------------------------------------------------------ */
/*  Components                                                         */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  accent: 'teal' | 'rose' | 'blue';
}) {
  const iconColor =
    accent === 'teal' ? 'text-teal-500' : accent === 'blue' ? 'text-blue-500' : 'text-rose-500';
  const valueColor =
    accent === 'teal' ? 'text-slate-900' : accent === 'blue' ? 'text-blue-600' : 'text-rose-600';
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: easeSmooth }}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className={iconColor} />
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {label}
        </p>
      </div>
      <p className={`font-mono text-[24px] sm:text-[28px] font-bold leading-none ${valueColor}`}>
        {value}
      </p>
    </motion.div>
  );
}

function TransactionItem({ tx, agentMap }: { tx: AgentTransaction; agentMap: Map<string, Agent> }) {
  const agent = agentMap.get(tx.agent_id);
  const typeIcons: Record<string, React.ElementType> = {
    'Stor/Bayar': Banknote,
    Koreksi: Wrench,
    Penyesuaian: Scale,
  };
  const typeColors: Record<string, { bg: string; text: string }> = {
    'Stor/Bayar': { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    Koreksi: { bg: 'bg-amber-50', text: 'text-amber-700' },
    Penyesuaian: { bg: 'bg-blue-50', text: 'text-blue-700' },
  };
  const Icon = typeIcons[tx.type] || FileText;
  const colors = typeColors[tx.type] || { bg: 'bg-slate-50', text: 'text-slate-700' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-card"
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors.bg} ${colors.text}`}>
          <Icon size={18} />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-medium text-slate-900">{tx.type}</span>
            {agent && (
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {agent.name}
              </span>
            )}
          </div>
          <p className="text-[12px] text-slate-500 mt-0.5">{tx.note}</p>
          <p className="text-[11px] text-slate-400 mt-1">{formatDateTime(tx.created_at)}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono text-[15px] font-semibold text-slate-900">{formatRupiah(tx.amount)}</p>
        <p className="text-[10px] text-slate-400">{tx.method}</p>
      </div>
    </motion.div>
  );
}

interface AgentEditDialogProps {
  agent: Agent | null;
  onClose: () => void;
  onSaved: (agent: Agent, payload: AgentUpdate) => Promise<void>;
}

function AgentEditDialog({ agent, onClose, onSaved }: AgentEditDialogProps) {
  const [form, setForm] = useState({ code: '', name: '', phone: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!agent) return;
    setForm({
      code: agent.code ?? '',
      name: agent.name ?? '',
      phone: agent.phone ?? '',
      note: agent.note ?? '',
    });
    setError('');
  }, [agent]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agent || saving) return;
    const payload: AgentUpdate = {
      code: form.code.trim(),
      name: form.name.trim(),
      phone: form.phone.trim(),
      note: form.note.trim(),
      updated_at: new Date().toISOString(),
    };
    if (!payload.code || !payload.name) {
      setError('Kode dan nama agen wajib diisi.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSaved(agent, payload);
      onClose();
    } catch (err: any) {
      console.error('[Agen] edit error:', err);
      setError(err?.message || 'Gagal menyimpan perubahan agen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(agent)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="border-slate-200 bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Agen</DialogTitle>
          <DialogDescription>
            Ubah data dasar agen. Riwayat transaksi agen tetap mengikuti agen ini.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="agent-code" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              Kode Agen
            </label>
            <Input
              id="agent-code"
              value={form.code}
              onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
              className="h-11 rounded-xl border-slate-300"
              required
            />
          </div>
          <div>
            <label htmlFor="agent-name" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              Nama Agen
            </label>
            <Input
              id="agent-name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="h-11 rounded-xl border-slate-300"
              required
            />
          </div>
          <div>
            <label htmlFor="agent-phone" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              No. HP
            </label>
            <Input
              id="agent-phone"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              className="h-11 rounded-xl border-slate-300"
            />
          </div>
          <div>
            <label htmlFor="agent-note" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              Catatan
            </label>
            <textarea
              id="agent-note"
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-[14px] outline-none transition-colors focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
            />
          </div>
          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
              {error}
            </p>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-teal-500 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-600 disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface AgentDeleteDialogProps {
  agent: Agent | null;
  onClose: () => void;
  onConfirm: (agent: Agent) => Promise<void>;
}

function AgentDeleteDialog({ agent, onClose, onConfirm }: AgentDeleteDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (agent) setError('');
  }, [agent]);

  async function handleDelete() {
    if (!agent || saving) return;
    setSaving(true);
    setError('');
    try {
      await onConfirm(agent);
      onClose();
    } catch (err: any) {
      console.error('[Agen] delete error:', err);
      setError(err?.message || 'Gagal menghapus agen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(agent)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="border-slate-200 bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hapus Agen</DialogTitle>
          <DialogDescription>
            Agen {agent?.name ?? ''} dan riwayat transaksi agennya akan dihapus dari Supabase.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
            {error}
          </p>
        )}
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {saving ? 'Menghapus...' : 'Hapus Agen'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AgentCard({
  agent,
  index,
  transactions,
  onEdit,
  onDelete,
}: {
  agent: Agent;
  index: number;
  transactions: AgentTransaction[];
  onEdit: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const balance = useMemo(() => getAgentBalance(transactions), [transactions]);
  const agentTransactionsSorted = useMemo(
    () => [...transactions].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [transactions]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: easeSmooth }}
      className="rounded-2xl border border-slate-200 bg-white shadow-card overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-slate-50/50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white text-[13px] font-semibold font-body">
            {agent.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] font-semibold text-slate-900 font-body">{agent.name}</h3>
              <span className="text-[12px] text-slate-400 font-mono">{agent.code}</span>
            </div>
            <p className="text-[12px] text-slate-500 flex items-center gap-1 mt-0.5">
              <Phone size={11} />
              {formatAgentPhone(agent.phone)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {balance > 0 ? (
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-rose-500">
                Sisa Hutang
              </p>
              <span className="font-mono text-[14px] font-semibold text-rose-600">
                {formatRupiah(balance)}
              </span>
            </div>
          ) : balance < 0 ? (
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-blue-500">
                Kelebihan Bayar
              </p>
              <span className="font-mono text-[14px] font-semibold text-blue-600">
                {formatRupiah(Math.abs(balance))}
              </span>
            </div>
          ) : (
            <span className="font-mono text-[14px] font-semibold text-emerald-600">
              LUNAS
            </span>
          )}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px] text-slate-600">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-slate-400" />
                  <span>Terakhir: {formatDateTime(agentTransactionsSorted[0]?.created_at || null)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-slate-400" />
                  <span className="italic">{agent.note}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/agen/${agent.id}?action=stor`);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-[12px] font-semibold text-white hover:bg-emerald-600 transition-colors"
                >
                  <Banknote size={13} />
                  Stor / Bayar
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/agen/${agent.id}?tab=riwayat`);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <History size={13} />
                  Riwayat
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/agen/${agent.id}?action=koreksi`);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Wrench size={13} />
                  Koreksi / Penyesuaian
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(agent);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Pencil size={13} />
                  Edit
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(agent);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[12px] font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 size={13} />
                  Hapus
                </button>
              </div>

              {agentTransactionsSorted.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Transaksi Terakhir
                  </p>
                  {agentTransactionsSorted.slice(0, 2).map((tx) => (
                    <TransactionItem key={tx.id} tx={tx} agentMap={new Map([[agent.id, agent]])} />
                  ))}
                  {agentTransactionsSorted.length > 2 && (
                    <button
                      onClick={() => navigate(`/agen/${agent.id}?tab=riwayat`)}
                      className="flex items-center gap-1 text-[12px] font-medium text-teal-600 hover:text-teal-700 transition-colors"
                    >
                      Lihat semua {agentTransactionsSorted.length} transaksi <ArrowRight size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function Agen() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'daftar' | 'riwayat'>('daftar');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [transactions, setTransactions] = useState<AgentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    agents.forEach((a) => map.set(a.id, a));
    return map;
  }, [agents]);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [agentsData, txData] = await Promise.all([getAgents(), getAgentTransactions()]);
      setAgents(agentsData);
      setTransactions(txData);
    } catch (err: any) {
      console.error('[Agen] load error:', err);
      setError(err?.message || 'Gagal memuat data agen');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSaveAgent(agent: Agent, payload: AgentUpdate) {
    await updateAgent(agent.id, payload);
    await loadData();
  }

  async function handleDeleteAgent(agent: Agent) {
    await deleteAgent(agent.id);
    await loadData();
  }

  const transactionsByAgent = useMemo(() => {
    const map = new Map<string, AgentTransaction[]>();
    agents.forEach((agent) => {
      map.set(agent.id, transactions.filter((tx) => tx.agent_id === agent.id));
    });
    return map;
  }, [agents, transactions]);

  const totalDebt = useMemo(() => {
    return agents.reduce(
      (sum, agent) => sum + getAgentBalance(transactionsByAgent.get(agent.id) || []),
      0
    );
  }, [agents, transactionsByAgent]);

  // Net agent balance is sign-aware: positive = agents still owe the shop
  // (hutang/piutang toko), negative = net overpayment held for agents (deposit).
  const isDeposit = totalDebt < 0;
  const balanceLabel = isDeposit ? 'Total Deposit Agen' : 'Total Hutang Toko';
  const balanceValue = formatRupiah(Math.abs(totalDebt));
  const balanceAccent: 'rose' | 'blue' = isDeposit ? 'blue' : 'rose';

  if (loading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8">
        <AlertCircle size={48} className="text-rose-500 mb-4" />
        <p className="text-[16px] font-medium text-slate-700 text-center">{error}</p>
        <button
          onClick={loadData}
          className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700 transition-colors"
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
          >
            <ArrowLeft size={18} />
          </motion.button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-[36px] text-slate-900 leading-tight">Agen</h1>
              <span className="font-mono text-[13px] text-slate-500">
                {agents.length} agen · {isDeposit ? 'Total deposit' : 'Total hutang'} {balanceValue}
              </span>
            </div>
          </div>
          <motion.button
            whileHover={{ rotate: 180 }}
            whileTap={{ scale: 0.95 }}
            onClick={loadData}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} />
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

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <StatCard
          label="Total Agen"
          value={String(agents.length)}
          icon={Users}
          accent="teal"
        />
        <StatCard
          label={balanceLabel}
          value={balanceValue}
          icon={Wallet}
          accent={balanceAccent}
        />
      </div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="mb-6"
      >
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setActiveTab('daftar')}
            className={`relative px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${
              activeTab === 'daftar' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {activeTab === 'daftar' && (
              <motion.div
                layoutId="agen-tab-pill"
                className="absolute inset-0 bg-white rounded-lg shadow-sm"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10">Daftar Agen</span>
          </button>
          <button
            onClick={() => setActiveTab('riwayat')}
            className={`relative px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${
              activeTab === 'riwayat' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {activeTab === 'riwayat' && (
              <motion.div
                layoutId="agen-tab-pill"
                className="absolute inset-0 bg-white rounded-lg shadow-sm"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10">Riwayat Transaksi</span>
          </button>
        </div>
      </motion.div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'daftar' ? (
          <motion.div
            key="daftar"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-4"
          >
            {agents.map((agent, index) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                index={index}
                transactions={transactionsByAgent.get(agent.id) || []}
                onEdit={setEditingAgent}
                onDelete={setDeletingAgent}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="riwayat"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-3"
          >
            {transactions.length === 0 ? (
              <div className="text-center py-16 rounded-2xl border border-slate-200 bg-white">
                <History size={48} className="mx-auto text-slate-300 mb-4" />
                <p className="text-[15px] font-medium text-slate-500">Belum ada transaksi</p>
              </div>
            ) : (
              transactions.map((tx) => <TransactionItem key={tx.id} tx={tx} agentMap={agentMap} />)
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <AgentEditDialog
        agent={editingAgent}
        onClose={() => setEditingAgent(null)}
        onSaved={handleSaveAgent}
      />
      <AgentDeleteDialog
        agent={deletingAgent}
        onClose={() => setDeletingAgent(null)}
        onConfirm={handleDeleteAgent}
      />
    </div>
  );
}
