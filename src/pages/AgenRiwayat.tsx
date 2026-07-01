import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  History,
  Search,
  Calendar,
  Users,
  Banknote,
  Wrench,
  Scale,
  FileText,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { getAgents, getAgentTransactions, type Agent, type AgentTransaction } from '@/services/agents';
import { TransactionStaffBadge } from '@/components/TransactionStaffBadge';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];
const easeOutExpo = [0.19, 1, 0.22, 1] as [number, number, number, number];

function formatRupiah(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID');
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('id-ID', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface DateGroup {
  date: string;
  dateLabel: string;
  items: AgentTransaction[];
}

/* ------------------------------------------------------------------ */
/*  Components                                                         */
/* ------------------------------------------------------------------ */

function TransactionRow({ tx, agentMap }: { tx: AgentTransaction; agentMap: Map<string, Agent> }) {
  const agent = agentMap.get(tx.agent_id);
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
      whileHover={{ y: -2 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 sm:p-5 cursor-pointer transition-shadow hover:shadow-card-elevated"
      onClick={() => {}}
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
              {agent && (
                <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {agent.name}
                </span>
              )}
            </div>
            <p className="text-[13px] text-slate-500 mt-1">{tx.note}</p>
            <p className="text-[11px] text-slate-400 mt-1.5">{formatDateTime(tx.created_at)}</p>
            <div className="mt-2">
              <TransactionStaffBadge transaction={tx} />
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[16px] font-semibold text-slate-900">{formatRupiah(tx.amount)}</p>
          <p className="text-[10px] font-mono text-slate-400">{tx.id.slice(0, 8)}</p>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function AgenRiwayat() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [transactions, setTransactions] = useState<AgentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      setTransactions(
        [...txData].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      );
    } catch (err: any) {
      console.error('[AgenRiwayat] load error:', err);
      setError(err?.message || 'Gagal memuat riwayat transaksi');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredTransactions = useMemo(() => {
    let result = transactions;
    if (selectedAgent !== 'all') {
      result = result.filter((tx) => tx.agent_id === selectedAgent);
    }
    if (selectedType !== 'all') {
      result = result.filter((tx) => tx.type === selectedType);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (tx) =>
          tx.id.toLowerCase().includes(q) ||
          tx.note.toLowerCase().includes(q) ||
          tx.type.toLowerCase().includes(q)
      );
    }
    return result;
  }, [transactions, selectedAgent, selectedType, search]);

  const dateGroups = useMemo(() => {
    const groups: Record<string, DateGroup> = {};
    filteredTransactions.forEach((tx) => {
      const date = tx.created_at.slice(0, 10);
      if (!groups[date]) {
        groups[date] = {
          date,
          dateLabel: formatDateLabel(tx.created_at),
          items: [],
        };
      }
      groups[date].items.push(tx);
    });
    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredTransactions]);

  const totalAmount = filteredTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);

  const typeOptions = ['all', 'Stor/Bayar', 'Koreksi', 'Penyesuaian'];

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
          <div className="flex-1">
            <h1 className="font-display text-[36px] text-slate-900 leading-tight">Riwayat Transaksi Agen</h1>
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
        <p className="text-[14px] text-slate-500 ml-12 mt-2">
          {filteredTransactions.length} transaksi · {formatRupiah(totalAmount)}
        </p>
      </motion.div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-slate-200 bg-white">
          <AlertCircle size={48} className="text-rose-500 mb-4" />
          <p className="text-[15px] font-medium text-slate-700 text-center">{error}</p>
          <button
            onClick={loadData}
            className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      ) : (
        <>
          {/* Filters */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: easeSmooth }}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card mb-6"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                  Cari
                </label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="ID / keterangan / tipe..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-10 rounded-xl border-slate-300 text-[13px] placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                  Agen
                </label>
                <div className="relative">
                  <Users size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white appearance-none"
                  >
                    <option value="all">Semua Agen</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500 mb-1.5">
                  Tipe Transaksi
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {typeOptions.map((type) => (
                    <button
                      key={type}
                      onClick={() => setSelectedType(type)}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 ${
                        selectedType === type
                          ? 'bg-teal-500 text-white shadow-sm'
                          : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {type === 'all' ? 'Semua' : type}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Transaction List */}
          <div className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {dateGroups.map((group, gi) => (
                  <motion.div
                    key={group.date}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.4, delay: gi * 0.05, ease: easeSmooth }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar size={14} className="text-slate-400" />
                      <h3 className="text-[14px] font-semibold text-slate-700">{group.dateLabel}</h3>
                      <span className="text-[11px] text-slate-400 ml-1">{group.items.length} txn</span>
                    </div>
                    <div className="space-y-2">
                      {group.items.map((tx) => (
                        <TransactionRow key={tx.id} tx={tx} agentMap={agentMap} />
                      ))}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}

            {!loading && dateGroups.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
                <History size={48} className="mx-auto text-slate-300 mb-4" />
                <p className="text-[15px] font-medium text-slate-500">Tidak ada transaksi ditemukan</p>
                <p className="text-[12px] text-slate-400 mt-1">Coba ubah filter atau kata kunci pencarian</p>
              </motion.div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
