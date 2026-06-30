import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Agent } from '@/services/agents';
import {
  importAgentDefectStock,
  parseAgentDefectStockFile,
} from '@/services/agentStockImport';
import type {
  AgentDefectImportPreview,
  ParsedAgentDefectStockRow,
} from '@/services/agentStockImportCore';
import { STOCK_STATUSES, type StockStatus } from '@/services/stockCore';

interface AgentDefectImportDialogProps {
  open: boolean;
  agents: Agent[];
  onClose: () => void;
  onImported: (batchId: string) => Promise<void> | void;
}

const STATUS_LABELS: Record<StockStatus, string> = {
  READY: 'Ready',
  SERVIS: 'Servis',
  KANIBAL: 'Kanibal',
  RUSAK: 'Rusak',
  TERJUAL: 'Terjual',
};

function formatRupiah(value: number) {
  return 'Rp ' + value.toLocaleString('id-ID');
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-mono text-[17px] font-bold leading-none text-slate-900">
        {value}
      </p>
    </div>
  );
}

function RowStatusBadges({ row }: { row: ParsedAgentDefectStockRow }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {row.errors.map((error) => (
        <span
          key={`error-${error}`}
          className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700"
        >
          {error}
        </span>
      ))}
      {row.errors.length === 0 && row.warnings.map((warning) => (
        <span
          key={`warning-${warning}`}
          className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
        >
          {warning}
        </span>
      ))}
      {row.errors.length === 0 && row.warnings.length === 0 && (
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          Valid
        </span>
      )}
    </div>
  );
}

export default function AgentDefectImportDialog({
  open,
  agents,
  onClose,
  onImported,
}: AgentDefectImportDialogProps) {
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [defaultStatus, setDefaultStatus] = useState<StockStatus>('READY');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AgentDefectImportPreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [doneBatchId, setDoneBatchId] = useState('');

  const previewRows = useMemo(() => preview?.rows.slice(0, 12) ?? [], [preview]);

  useEffect(() => {
    if (!open) return;
    setSelectedAgentId((current) => current || agents[0]?.id || '');
    setDefaultStatus('READY');
    setFile(null);
    setPreview(null);
    setError('');
    setDoneBatchId('');
  }, [agents, open]);

  async function parseFile(nextFile: File, status: StockStatus) {
    setParsing(true);
    setError('');
    setDoneBatchId('');
    try {
      const nextPreview = await parseAgentDefectStockFile(nextFile, status);
      setPreview(nextPreview);
    } catch (err: any) {
      console.error('[AgentDefectImportDialog] parse error:', err);
      setPreview(null);
      setError(err?.message || 'File Excel tidak bisa dibaca.');
    } finally {
      setParsing(false);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setPreview(null);
    if (!nextFile) return;
    await parseFile(nextFile, defaultStatus);
  }

  async function handleStatusChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextStatus = event.target.value as StockStatus;
    setDefaultStatus(nextStatus);
    if (file) await parseFile(file, nextStatus);
  }

  async function handleImport() {
    if (!preview || !file || importing) return;
    setImporting(true);
    setError('');
    setDoneBatchId('');
    try {
      const batchId = await importAgentDefectStock({
        agentId: selectedAgentId,
        fileName: file.name,
        preview,
      });
      setDoneBatchId(batchId);
      await onImported(batchId);
    } catch (err: any) {
      console.error('[AgentDefectImportDialog] import error:', err);
      setError(err?.message || 'Import stok minus gagal.');
    } finally {
      setImporting(false);
    }
  }

  const canImport =
    Boolean(selectedAgentId) &&
    Boolean(file) &&
    Boolean(preview) &&
    (preview?.summary.validRows ?? 0) > 0 &&
    !parsing &&
    !importing;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !importing) onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto border-slate-200 bg-white sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-teal-600" />
            Import Stok Minus Agen
          </DialogTitle>
          <DialogDescription>
            Upload Excel agen untuk unit minus lengkap. Baris valid akan masuk ke stok sebagai unit siap jual atau status yang dipilih.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-4">
            <div>
              <label htmlFor="agent-import-agent" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                Agen
              </label>
              <select
                id="agent-import-agent"
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-[14px] outline-none transition-colors focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
                disabled={agents.length === 0}
              >
                {agents.length === 0 ? (
                  <option value="">Belum ada agen</option>
                ) : (
                  agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.code} - {agent.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label htmlFor="agent-import-status" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                Status Awal
              </label>
              <select
                id="agent-import-status"
                value={defaultStatus}
                onChange={handleStatusChange}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-[14px] outline-none transition-colors focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
              >
                {STOCK_STATUSES.filter((status) => status !== 'TERJUAL').map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center transition-colors hover:border-teal-400 hover:bg-teal-50/40">
              <Upload size={24} className="text-teal-600" />
              <span className="mt-2 text-[14px] font-semibold text-slate-900">
                Pilih file Excel
              </span>
              <span className="mt-1 text-[12px] text-slate-500">
                Format minimal: Model, Imei, BH, Carrier, Defect Description, Harga
              </span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="sr-only"
                onChange={handleFileChange}
                disabled={parsing || importing}
              />
            </label>

            {file && (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <p className="truncate text-[13px] font-semibold text-slate-900">{file.name}</p>
                <p className="text-[11px] text-slate-500">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {parsing && (
              <div className="flex min-h-[210px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
                <Loader2 size={24} className="animate-spin text-teal-600" />
                <span className="ml-2 text-[13px] font-semibold text-slate-600">
                  Membaca Excel...
                </span>
              </div>
            )}

            {!parsing && preview && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <SummaryCard label="Total Baris" value={preview.summary.totalRows} />
                  <SummaryCard label="Valid" value={preview.summary.validRows} />
                  <SummaryCard label="Warning" value={preview.summary.warningRows} />
                  <SummaryCard label="Error" value={preview.summary.errorRows} />
                  <SummaryCard label="Total Modal" value={formatRupiah(preview.summary.totalCost)} />
                </div>

                {preview.summary.errorRows > 0 && (
                  <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span>
                      Baris error tidak akan diimport. Perbaiki Excel kalau baris itu tetap mau masuk stok.
                    </span>
                  </div>
                )}

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <p className="text-[13px] font-semibold text-slate-900">Preview Baris</p>
                    <p className="text-[11px] text-slate-500">
                      Menampilkan {previewRows.length} dari {preview.summary.totalRows}
                    </p>
                  </div>
                  <div className="max-h-[300px] overflow-auto">
                    <table className="w-full min-w-[760px] text-left text-[12px]">
                      <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Row</th>
                          <th className="px-3 py-2">Model</th>
                          <th className="px-3 py-2">IMEI / BH</th>
                          <th className="px-3 py-2">Minus</th>
                          <th className="px-3 py-2 text-right">Modal</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewRows.map((row) => (
                          <tr key={row.sourceRowNumber} className="align-top">
                            <td className="px-3 py-2 font-mono text-slate-500">
                              {row.sourceRowNumber}
                            </td>
                            <td className="px-3 py-2">
                              <p className="font-semibold text-slate-900">
                                {row.model} {row.capacity}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {row.carrier || '-'}
                              </p>
                            </td>
                            <td className="px-3 py-2">
                              <p className="font-mono text-slate-700">{row.imei || '-'}</p>
                              <p className="text-[11px] text-slate-500">
                                BH {row.batteryHealth ?? '-'}%
                              </p>
                            </td>
                            <td className="max-w-[240px] px-3 py-2 text-slate-700">
                              {row.defectDescription || '-'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900">
                              {formatRupiah(row.costPrice)}
                            </td>
                            <td className="px-3 py-2">
                              <RowStatusBadges row={row} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {!parsing && !preview && !error && (
              <div className="flex min-h-[210px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-6 text-center">
                <p className="text-[13px] text-slate-500">
                  Belum ada file dipilih. Preview validasi akan tampil di sini sebelum data masuk ke stok.
                </p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
            {error}
          </p>
        )}

        {doneBatchId && (
          <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
            <CheckCircle2 size={16} />
            Import berhasil. Batch: {doneBatchId}
          </p>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!canImport}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-600 disabled:opacity-60"
          >
            {importing && <Loader2 size={15} className="animate-spin" />}
            {importing ? 'Mengimport...' : `Import ${preview?.summary.validRows ?? 0} Unit`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
