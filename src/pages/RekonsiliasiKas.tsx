import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileSearch,
  Loader2,
  MonitorCheck,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  analyzeReconciliationWithAi,
  getWebappReconciliationEntries,
  todayLocalDate,
  type AiReconciliationResponse,
} from '@/services/reconciliation';
import {
  buildReconciliation,
  type ReconciliationEntry,
  type ReconciliationIssue,
  type ReconciliationResult,
  type ReconciliationSource,
  type SourceTotals,
} from '@/services/reconciliationCore';
import { parseReconciliationFile } from '@/services/reconciliationFiles';

function formatRupiah(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

function formatDirection(direction: ReconciliationEntry['direction']): string {
  return direction === 'in' ? 'Masuk' : 'Keluar';
}

function sourceLabel(source: ReconciliationSource): string {
  if (source === 'webapp') return 'Webapp';
  if (source === 'manual') return 'Manual';
  return 'Mutasi Bank';
}

function issueTone(issue: ReconciliationIssue): string {
  if (issue.severity === 'critical') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (issue.severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-sky-200 bg-sky-50 text-sky-700';
}

function totalsCardTone(source: ReconciliationSource): string {
  if (source === 'webapp') return 'border-blue-100 bg-blue-50 text-blue-700';
  if (source === 'manual') return 'border-amber-100 bg-amber-50 text-amber-700';
  return 'border-emerald-100 bg-emerald-50 text-emerald-700';
}

function TotalsCard({
  title,
  source,
  totals,
}: {
  title: string;
  source: ReconciliationSource;
  totals: SourceTotals;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${totalsCardTone(source)}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wider">{title}</p>
        <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-bold">
          {totals.count} baris
        </span>
      </div>
      <p className="mt-3 font-mono text-[24px] font-bold text-slate-950">
        {formatRupiah(totals.net)}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] font-semibold">
        <div className="rounded-xl bg-white/65 p-2">
          <p className="text-slate-400">Masuk</p>
          <p className="font-mono text-emerald-600">{formatRupiah(totals.moneyIn)}</p>
        </div>
        <div className="rounded-xl bg-white/65 p-2">
          <p className="text-slate-400">Keluar</p>
          <p className="font-mono text-rose-600">{formatRupiah(totals.moneyOut)}</p>
        </div>
      </div>
    </div>
  );
}

function UploadBox({
  source,
  title,
  description,
  entries,
  onUpload,
}: {
  source: Exclude<ReconciliationSource, 'webapp'>;
  title: string;
  description: string;
  entries: ReconciliationEntry[];
  onUpload: (source: Exclude<ReconciliationSource, 'webapp'>, file: File) => void;
}) {
  return (
    <label className="group flex min-h-[160px] cursor-pointer flex-col justify-between rounded-2xl border border-dashed border-slate-300 bg-white p-5 transition-colors hover:border-blue-300 hover:bg-blue-50/40">
      <input
        type="file"
        accept=".csv,.txt,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(source, file);
          e.target.value = '';
        }}
      />
      <div>
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-colors group-hover:bg-blue-100 group-hover:text-blue-600">
          <Upload size={20} />
        </div>
        <h3 className="text-[16px] font-semibold text-slate-950">{title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{description}</p>
      </div>
      <p className="mt-4 text-[12px] font-semibold text-slate-400">
        {entries.length > 0
          ? `${entries.length} baris terbaca`
          : 'CSV / Excel / TXT'}
      </p>
    </label>
  );
}

function EntryPill({ entry }: { entry: ReconciliationEntry }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-slate-800">{sourceLabel(entry.source)}</span>
        <span className={entry.direction === 'in' ? 'font-mono text-emerald-600' : 'font-mono text-rose-600'}>
          {formatDirection(entry.direction)} {formatRupiah(entry.amount)}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-slate-600">{entry.description}</p>
      <p className="mt-1 text-[11px] text-slate-400">
        {entry.date} - {entry.accountName}
        {entry.staffName ? ` - ${entry.staffName}` : ''}
      </p>
    </div>
  );
}

function IssueCard({ issue }: { issue: ReconciliationIssue }) {
  return (
    <div className={`rounded-2xl border p-4 ${issueTone(issue)}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider">{issue.kind.replaceAll('_', ' ')}</p>
          <h3 className="mt-1 text-[16px] font-bold text-slate-950">{issue.title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-700">{issue.description}</p>
          <p className="mt-2 text-[13px] font-semibold text-slate-800">{issue.suggestedAction}</p>
        </div>
        <div className="shrink-0 rounded-xl bg-white/75 px-3 py-2 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Impact</p>
          <p className="font-mono text-[15px] font-bold text-slate-950">{formatRupiah(issue.amountImpact)}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {issue.entries.map((entry) => (
          <EntryPill key={`${issue.id}:${entry.source}:${entry.id}`} entry={entry} />
        ))}
      </div>
    </div>
  );
}

export default function RekonsiliasiKas() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayLocalDate);
  const [webappEntries, setWebappEntries] = useState<ReconciliationEntry[]>([]);
  const [manualEntries, setManualEntries] = useState<ReconciliationEntry[]>([]);
  const [bankEntries, setBankEntries] = useState<ReconciliationEntry[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loadingWebapp, setLoadingWebapp] = useState(false);
  const [parseLoading, setParseLoading] = useState<ReconciliationSource | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [aiResult, setAiResult] = useState<AiReconciliationResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWebapp = useCallback(async () => {
    setLoadingWebapp(true);
    setError(null);
    try {
      const entries = await getWebappReconciliationEntries(date);
      setWebappEntries(entries);
      setResult(null);
      setAiResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Data webapp gagal dimuat.');
    } finally {
      setLoadingWebapp(false);
    }
  }, [date]);

  useEffect(() => {
    void loadWebapp();
  }, [loadWebapp]);

  const handleUpload = useCallback(
    async (source: Exclude<ReconciliationSource, 'webapp'>, file: File) => {
      setParseLoading(source);
      setError(null);
      try {
        const parsed = await parseReconciliationFile({ file, source, defaultDate: date });
        if (source === 'manual') setManualEntries(parsed.entries);
        else setBankEntries(parsed.entries);
        setWarnings((current) => [
          ...current.filter((warning) => !warning.startsWith(file.name)),
          ...parsed.warnings,
        ]);
        setResult(null);
        setAiResult(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : `${file.name} gagal dibaca.`);
      } finally {
        setParseLoading(null);
      }
    },
    [date],
  );

  const handleAnalyze = useCallback(() => {
    const next = buildReconciliation({
      webappEntries,
      manualEntries,
      bankEntries,
    });
    setResult(next);
    setAiResult(null);
  }, [webappEntries, manualEntries, bankEntries]);

  const handleAiAnalyze = useCallback(async () => {
    if (!result) return;
    setAiLoading(true);
    setError(null);
    try {
      const response = await analyzeReconciliationWithAi(result);
      setAiResult(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analisa AI gagal.');
    } finally {
      setAiLoading(false);
    }
  }, [result]);

  const canAnalyze = useMemo(
    () => webappEntries.length > 0 && (manualEntries.length > 0 || bankEntries.length > 0),
    [webappEntries.length, manualEntries.length, bankEntries.length],
  );

  return (
    <div className="pb-20">
      <motion.header
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mb-8"
      >
        <button
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft size={16} />
          Kembali
        </button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[12px] font-bold text-blue-700">
              <FileSearch size={14} />
              Rekonsiliasi Harian
            </div>
            <h1 className="font-display text-[34px] leading-tight text-slate-950 sm:text-[40px]">
              Rekonsiliasi Kas & Bank
            </h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-slate-500">
              Cocokkan data webapp, pendataan manual, dan mutasi bank untuk menemukan
              transaksi hilang, salah nominal, salah akun, biaya admin, atau settlement pending.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex h-12 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4">
              <CalendarDays size={17} className="text-slate-400" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent text-[14px] font-semibold text-slate-700 outline-none"
              />
            </label>
            <Button
              onClick={() => void loadWebapp()}
              disabled={loadingWebapp}
              variant="outline"
              className="h-12 rounded-xl gap-2"
            >
              {loadingWebapp ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
              Refresh Webapp
            </Button>
          </div>
        </div>
      </motion.header>

      {error && (
        <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">
          {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-700">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <TotalsCard
          title="Data Webapp"
          source="webapp"
          totals={{
            count: webappEntries.length,
            moneyIn: webappEntries.filter((entry) => entry.direction === 'in').reduce((sum, entry) => sum + entry.amount, 0),
            moneyOut: webappEntries.filter((entry) => entry.direction === 'out').reduce((sum, entry) => sum + entry.amount, 0),
            net: webappEntries.reduce((sum, entry) => sum + (entry.direction === 'in' ? entry.amount : -entry.amount), 0),
          }}
        />
        <TotalsCard
          title="Data Manual"
          source="manual"
          totals={{
            count: manualEntries.length,
            moneyIn: manualEntries.filter((entry) => entry.direction === 'in').reduce((sum, entry) => sum + entry.amount, 0),
            moneyOut: manualEntries.filter((entry) => entry.direction === 'out').reduce((sum, entry) => sum + entry.amount, 0),
            net: manualEntries.reduce((sum, entry) => sum + (entry.direction === 'in' ? entry.amount : -entry.amount), 0),
          }}
        />
        <TotalsCard
          title="Mutasi Bank"
          source="bank"
          totals={{
            count: bankEntries.length,
            moneyIn: bankEntries.filter((entry) => entry.direction === 'in').reduce((sum, entry) => sum + entry.amount, 0),
            moneyOut: bankEntries.filter((entry) => entry.direction === 'out').reduce((sum, entry) => sum + entry.amount, 0),
            net: bankEntries.reduce((sum, entry) => sum + (entry.direction === 'in' ? entry.amount : -entry.amount), 0),
          }}
        />
      </div>

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <UploadBox
          source="manual"
          title="Upload Data Pendataan Manual"
          description="File dari admin/staff berisi hasil hitung cash fisik, transfer/QRIS yang dicek manual, dan catatan closing."
          entries={manualEntries}
          onUpload={handleUpload}
        />
        <UploadBox
          source="bank"
          title="Upload Mutasi Bank Harian"
              description="Upload export mutasi Excel/CSV harian. Sistem membaca debit/kredit, nominal, tanggal, dan deskripsi langsung di browser tanpa menyimpan file."
          entries={bankEntries}
          onUpload={handleUpload}
        />
      </section>

      {parseLoading && (
        <div className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-blue-600">
          <Loader2 size={16} className="animate-spin" />
          Membaca file {sourceLabel(parseLoading)}...
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-slate-950">Analisa Selisih</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Matching angka dilakukan lokal. AI hanya memberi ringkasan penyebab jika env API sudah diisi.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={handleAnalyze}
            disabled={!canAnalyze || loadingWebapp}
            className="h-12 rounded-xl bg-blue-600 px-5 text-white hover:bg-blue-700 gap-2"
          >
            <FileSearch size={17} />
            Analisa Selisih
          </Button>
          <Button
            onClick={() => void handleAiAnalyze()}
            disabled={!result || aiLoading}
            variant="outline"
            className="h-12 rounded-xl gap-2"
          >
            {aiLoading ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
            Analisa AI
          </Button>
        </div>
      </div>

      {result && (
        <section className="mt-6 space-y-5">
          <div className="grid gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Issue</p>
              <p className="mt-2 font-mono text-[28px] font-bold text-slate-950">{result.summary.issueCount}</p>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-400">Critical</p>
              <p className="mt-2 font-mono text-[28px] font-bold text-rose-600">{result.summary.criticalCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Webapp vs Manual</p>
              <p className="mt-2 font-mono text-[20px] font-bold text-slate-950">
                {formatRupiah(result.summary.webappVsManualNet)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Webapp vs Bank</p>
              <p className="mt-2 font-mono text-[20px] font-bold text-slate-950">
                {formatRupiah(result.summary.webappVsBankNet)}
              </p>
            </div>
          </div>

          {aiResult && (
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 text-violet-800">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles size={18} />
                <h2 className="text-[16px] font-bold text-slate-950">Ringkasan AI</h2>
                {aiResult.provider && (
                  <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-bold text-violet-700">
                    {aiResult.provider}
                  </span>
                )}
              </div>
              {aiResult.available === false ? (
                <p className="text-[13px] font-semibold">{aiResult.error}</p>
              ) : (
                <>
                  <p className="text-[14px] font-semibold leading-relaxed">{aiResult.summary}</p>
                  {aiResult.recommendations && aiResult.recommendations.length > 0 && (
                    <ul className="mt-3 space-y-2 text-[13px]">
                      {aiResult.recommendations.map((item) => (
                        <li key={item} className="rounded-xl bg-white/70 px-3 py-2">
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold text-slate-950">Letak Miss Terdeteksi</h2>
                <p className="mt-1 text-[13px] text-slate-500">
                  Review daftar ini dari atas. Critical biasanya berarti ada data real tidak tercatat atau nominal beda.
                </p>
              </div>
              {result.summary.issueCount === 0 ? (
                <CheckCircle2 size={24} className="text-emerald-500" />
              ) : (
                <AlertTriangle size={24} className="text-amber-500" />
              )}
            </div>

            {result.issues.length === 0 ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6 text-center text-emerald-700">
                <CheckCircle2 size={30} className="mx-auto mb-2" />
                <p className="font-semibold">Tidak ada selisih yang terdeteksi dari data yang diupload.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {result.issues.map((issue) => (
                  <IssueCard key={issue.id} issue={issue} />
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-3 flex items-center gap-2">
                <MonitorCheck size={17} className="text-blue-600" />
                <h3 className="font-semibold text-slate-950">Unmatched Webapp</h3>
              </div>
              <div className="space-y-2">
                {result.unmatched.webapp.slice(0, 8).map((entry) => (
                  <EntryPill key={entry.id} entry={entry} />
                ))}
                {result.unmatched.webapp.length === 0 && <p className="text-[13px] text-slate-400">Tidak ada.</p>}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-3 flex items-center gap-2">
                <ClipboardList size={17} className="text-amber-600" />
                <h3 className="font-semibold text-slate-950">Unmatched Manual</h3>
              </div>
              <div className="space-y-2">
                {result.unmatched.manual.slice(0, 8).map((entry) => (
                  <EntryPill key={entry.id} entry={entry} />
                ))}
                {result.unmatched.manual.length === 0 && <p className="text-[13px] text-slate-400">Tidak ada.</p>}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-3 flex items-center gap-2">
                <Banknote size={17} className="text-emerald-600" />
                <h3 className="font-semibold text-slate-950">Unmatched Bank</h3>
              </div>
              <div className="space-y-2">
                {result.unmatched.bank.slice(0, 8).map((entry) => (
                  <EntryPill key={entry.id} entry={entry} />
                ))}
                {result.unmatched.bank.length === 0 && <p className="text-[13px] text-slate-400">Tidak ada.</p>}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
