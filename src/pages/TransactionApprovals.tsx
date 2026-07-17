import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  getTransactionChangeRequests,
  reviewTransactionChangeRequest,
  type TransactionChangeRequest,
  type TransactionReviewDecision,
} from '@/services/transactionApprovals';
import { summarizeTransactionDetailForApproval } from '@/services/transactionApprovalsCore';
import {
  getTransactionDisplayDetail,
  getTransactionStaffName,
  type Transaction,
} from '@/services/transactions';
import {
  getServiceChangeRequests,
  reviewServiceChangeRequest,
  type ServiceChangeRequest,
  type ServiceReviewDecision,
} from '@/services/serviceApprovals';
import {
  SERVICE_EDITABLE_FIELDS,
  summarizeServiceEditForApproval,
  type ProposedServiceEdit,
  type ServiceChangeCurrentValue,
  type ServiceUsageSnapshot,
} from '@/services/serviceApprovalsCore';

function formatRupiah(value: number | null | undefined): string {
  return `Rp ${(value ?? 0).toLocaleString('id-ID')}`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function statusClass(status: TransactionChangeRequest['status']): string {
  if (status === 'approved') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (status === 'rejected') return 'bg-rose-50 text-rose-700 border-rose-100';
  return 'bg-amber-50 text-amber-700 border-amber-100';
}

function actionLabel(action: TransactionChangeRequest['action']): string {
  return action === 'delete' ? 'Hapus' : 'Edit';
}

function transactionFromRequest(request: TransactionChangeRequest): Transaction | null {
  if (request.transaction) return request.transaction;
  const snapshot = request.snapshot;
  if (!snapshot || typeof snapshot !== 'object') return null;
  return {
    id: String(snapshot.id ?? request.transaction_id),
    type: (snapshot.type ?? 'Pengeluaran') as Transaction['type'],
    description: String(snapshot.description ?? ''),
    detail: String(snapshot.detail ?? ''),
    amount: Number(snapshot.amount ?? 0),
    created_at: String(snapshot.created_at ?? request.created_at),
    staff_id: typeof snapshot.staff_id === 'string' ? snapshot.staff_id : null,
  };
}

function DetailLineList({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 border-t border-white/70 pt-3 text-[12px] text-slate-600">
      {lines.map((line, index) => (
        <li key={`${line}-${index}`} className="break-words">
          {line}
        </li>
      ))}
    </ul>
  );
}

// Kolom `proposed` tersimpan snake_case di DB (usages_upsert/usages_delete) —
// konversi ke ProposedServiceEdit (camelCase) sebelum di-summarize.
function proposedServiceEditFromRequest(request: ServiceChangeRequest): ProposedServiceEdit {
  const raw = (request.proposed ?? {}) as ProposedServiceEdit & {
    usages_upsert?: ProposedServiceEdit['usagesUpsert'];
    usages_delete?: string[];
  };
  return {
    fields: raw.fields,
    usagesUpsert: raw.usagesUpsert ?? raw.usages_upsert ?? [],
    usagesDelete: raw.usagesDelete ?? raw.usages_delete ?? [],
  };
}

// Rekonstruksi nilai saat ini dari snapshot (field record snake_case + usages
// saat request diajukan).
function serviceCurrentFromSnapshot(request: ServiceChangeRequest): ServiceChangeCurrentValue {
  const snapshot = (request.snapshot ?? {}) as Record<string, unknown>;
  const fields: ServiceChangeCurrentValue['fields'] = {};
  for (const field of SERVICE_EDITABLE_FIELDS) {
    const value = snapshot[field];
    if (typeof value === 'string' || typeof value === 'number' || value === null) {
      fields[field] = value;
    }
  }
  const usages = Array.isArray(snapshot.usages)
    ? (snapshot.usages as ServiceUsageSnapshot[])
    : [];
  return { fields, usages };
}

function SectionHeader({
  title,
  pendingCount,
  isBatching,
  batchDisabled,
  onApproveAll,
}: {
  title: string;
  pendingCount: number;
  isBatching: boolean;
  batchDisabled: boolean;
  onApproveAll: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-[18px] font-semibold text-slate-900">{title}</h2>
        {pendingCount > 0 && (
          <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-[12px] font-semibold text-amber-700">
            {pendingCount} pending
          </span>
        )}
      </div>
      {pendingCount > 0 && (
        <Button type="button" onClick={onApproveAll} disabled={batchDisabled}>
          {isBatching ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <CheckCircle2 size={15} />
          )}
          Setujui Semua ({pendingCount})
        </Button>
      )}
    </div>
  );
}

export default function TransactionApprovals() {
  const [requests, setRequests] = useState<TransactionChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [serviceRequests, setServiceRequests] = useState<ServiceChangeRequest[]>([]);
  const [serviceLoading, setServiceLoading] = useState(true);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [processingServiceId, setProcessingServiceId] = useState<string | null>(null);
  const [serviceNotes, setServiceNotes] = useState<Record<string, string>>({});
  const [batchSection, setBatchSection] = useState<'transaction' | 'service' | null>(null);
  const [batchSummary, setBatchSummary] = useState<{
    section: 'transaction' | 'service';
    message: string;
  } | null>(null);

  const pendingCount = useMemo(
    () => requests.filter((request) => request.status === 'pending').length,
    [requests],
  );

  const pendingServiceCount = useMemo(
    () => serviceRequests.filter((request) => request.status === 'pending').length,
    [serviceRequests],
  );

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await getTransactionChangeRequests());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat approval transaksi.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadServiceRequests = useCallback(async () => {
    setServiceLoading(true);
    setServiceError(null);
    try {
      setServiceRequests(await getServiceChangeRequests());
    } catch (err) {
      setServiceError(err instanceof Error ? err.message : 'Gagal memuat approval servis.');
    } finally {
      setServiceLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
    loadServiceRequests();
  }, [loadRequests, loadServiceRequests]);

  async function review(requestId: string, decision: TransactionReviewDecision) {
    setProcessingId(requestId);
    setError(null);
    try {
      await reviewTransactionChangeRequest({
        requestId,
        decision,
        reviewNote: notes[requestId] ?? '',
      });
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval transaksi gagal diproses.');
    } finally {
      setProcessingId(null);
    }
  }

  async function reviewService(requestId: string, decision: ServiceReviewDecision) {
    setProcessingServiceId(requestId);
    setServiceError(null);
    try {
      await reviewServiceChangeRequest({
        requestId,
        decision,
        reviewNote: serviceNotes[requestId] ?? '',
      });
      await loadServiceRequests();
    } catch (err) {
      setServiceError(err instanceof Error ? err.message : 'Approval servis gagal diproses.');
    } finally {
      setProcessingServiceId(null);
    }
  }

  // Batch approve: konfirmasi dulu, lalu review semua request pending di satu
  // section (tanpa catatan) dan tampilkan ringkasan hasilnya.
  async function approveAll(section: 'transaction' | 'service') {
    const pending = (section === 'transaction' ? requests : serviceRequests).filter(
      (request) => request.status === 'pending',
    );
    if (pending.length === 0) return;
    const label = section === 'transaction' ? 'transaksi' : 'servis';
    if (
      !window.confirm(
        `Setujui semua ${pending.length} request ${label}? Perubahan akan langsung diterapkan.`,
      )
    ) {
      return;
    }

    setBatchSection(section);
    setBatchSummary(null);
    try {
      const results = await Promise.allSettled(
        pending.map((request) =>
          section === 'transaction'
            ? reviewTransactionChangeRequest({
                requestId: request.id,
                decision: 'approved',
                reviewNote: '',
              })
            : reviewServiceChangeRequest({
                requestId: request.id,
                decision: 'approved',
                reviewNote: '',
              }),
        ),
      );
      const succeeded = results.filter((result) => result.status === 'fulfilled').length;
      const failed = results.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      let message = `Berhasil: ${succeeded} disetujui`;
      if (failed.length > 0) {
        const reason = failed[0].reason;
        const firstError = reason instanceof Error ? reason.message : String(reason);
        message += ` · ${failed.length} gagal (${firstError})`;
      }
      setBatchSummary({ section, message });
      await Promise.all([loadRequests(), loadServiceRequests()]);
    } finally {
      setBatchSection(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[12px] font-semibold text-blue-700">
            <ClipboardCheck size={14} />
            Approval Manager
          </div>
          <h1 className="font-display text-[34px] leading-tight text-slate-900">
            Approval Transaksi &amp; Servis
          </h1>
          <p className="mt-1 text-[14px] text-slate-500">
            Review request edit/hapus transaksi dan perubahan servis sebelum data berubah.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            loadRequests();
            loadServiceRequests();
          }}
          disabled={loading || serviceLoading}
        >
          <RefreshCw size={16} />
          Refresh
        </Button>
      </motion.div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Pending
          </p>
          <p className="mt-2 font-mono text-[28px] font-semibold text-slate-900">
            {pendingCount}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Total Request
          </p>
          <p className="mt-2 font-mono text-[28px] font-semibold text-slate-900">
            {requests.length}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Status
          </p>
          <p className="mt-2 text-[15px] font-semibold text-slate-700">
            {pendingCount > 0 ? 'Butuh review' : 'Tidak ada request pending'}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[14px] text-rose-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <section className="mb-10">
        <SectionHeader
          title="Approval Transaksi"
          pendingCount={pendingCount}
          isBatching={batchSection === 'transaction'}
          batchDisabled={batchSection !== null}
          onApproveAll={() => approveAll('transaction')}
        />

        {batchSummary?.section === 'transaction' && (
          <div className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-600">
            <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
            {batchSummary.message}
          </div>
        )}

        {loading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-3 text-slate-500">
            <Loader2 size={18} className="animate-spin" />
            Memuat approval transaksi...
          </div>
        </div>
      ) : requests.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white text-center">
          <ShieldCheck size={42} className="mb-3 text-slate-300" />
          <h2 className="text-[18px] font-semibold text-slate-900">Belum ada request approval</h2>
          <p className="mt-1 text-[14px] text-slate-500">
            Request edit/hapus transaksi dari staff akan muncul di sini.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const transaction = transactionFromRequest(request);
            const displayDetail = transaction ? getTransactionDisplayDetail(transaction) : '';
            const isPending = request.status === 'pending';
            const isProcessing = processingId === request.id;
            const requester = request.requester?.name ?? 'Staff tidak tercatat';
            const currentDetailLines = summarizeTransactionDetailForApproval(transaction?.detail);
            const proposedDetailLines = summarizeTransactionDetailForApproval(
              request.proposed_detail ?? transaction?.detail,
            );

            return (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-700">
                        {actionLabel(request.action)} {transaction?.type ?? 'Transaksi'}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${statusClass(request.status)}`}>
                        {request.status}
                      </span>
                    </div>
                    <h2 className="text-[16px] font-semibold text-slate-900">
                      {transaction?.description ?? 'Transaksi tidak ditemukan'}
                    </h2>
                    {displayDetail && (
                      <p className="mt-1 text-[13px] text-slate-500">{displayDetail}</p>
                    )}
                    <div className="mt-3 grid gap-2 text-[12px] text-slate-500 sm:grid-cols-2">
                      <span>Request: {formatDateTime(request.created_at)}</span>
                      <span>Pengaju: {requester}</span>
                      <span>Input awal: {transaction ? getTransactionStaffName(transaction) : '-'}</span>
                      <span>ID: <span className="font-mono">{request.transaction_id}</span></span>
                    </div>
                    <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
                      <span className="font-semibold">Alasan:</span> {request.reason}
                    </div>

                    {request.action === 'edit' && (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                            Data Saat Ini
                          </p>
                          <p className="mt-2 text-[13px] font-semibold text-slate-900">
                            {transaction?.description ?? '-'}
                          </p>
                          <p className="mt-1 font-mono text-[14px] text-slate-700">
                            {formatRupiah(transaction?.amount)}
                          </p>
                          <DetailLineList lines={currentDetailLines} />
                        </div>
                        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-500">
                            Usulan Edit
                          </p>
                          <p className="mt-2 text-[13px] font-semibold text-slate-900">
                            {request.proposed_description ?? transaction?.description ?? '-'}
                          </p>
                          <p className="mt-1 font-mono text-[14px] text-blue-700">
                            {formatRupiah(request.proposed_amount ?? transaction?.amount)}
                          </p>
                          <DetailLineList lines={proposedDetailLines} />
                        </div>
                      </div>
                    )}

                    {request.action === 'delete' && currentDetailLines.length > 0 && (
                      <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                          Detail Unit
                        </p>
                        <DetailLineList lines={currentDetailLines} />
                      </div>
                    )}
                  </div>

                  <div className="w-full shrink-0 space-y-3 lg:w-[290px]">
                    <Textarea
                      value={notes[request.id] ?? ''}
                      disabled={!isPending || isProcessing}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [request.id]: event.target.value,
                        }))
                      }
                      placeholder="Catatan approval opsional"
                      rows={3}
                    />
                    {isPending ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isProcessing}
                          onClick={() => review(request.id, 'rejected')}
                        >
                          <XCircle size={15} />
                          Tolak
                        </Button>
                        <Button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => review(request.id, 'approved')}
                        >
                          <CheckCircle2 size={15} />
                          Approve
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
                        Diproses: {request.reviewed_at ? formatDateTime(request.reviewed_at) : '-'}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
      </section>

      <section>
        <SectionHeader
          title="Approval Servis"
          pendingCount={pendingServiceCount}
          isBatching={batchSection === 'service'}
          batchDisabled={batchSection !== null}
          onApproveAll={() => approveAll('service')}
        />

        {batchSummary?.section === 'service' && (
          <div className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-600">
            <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
            {batchSummary.message}
          </div>
        )}

        {serviceError && (
          <div className="mb-3 flex items-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[14px] text-rose-700">
            <AlertCircle size={16} />
            {serviceError}
          </div>
        )}

        {serviceLoading ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center gap-3 text-slate-500">
              <Loader2 size={18} className="animate-spin" />
              Memuat approval servis...
            </div>
          </div>
        ) : serviceRequests.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white text-center">
            <ShieldCheck size={42} className="mb-3 text-slate-300" />
            <h2 className="text-[18px] font-semibold text-slate-900">
              Belum ada request perubahan servis
            </h2>
            <p className="mt-1 text-[14px] text-slate-500">
              Request edit data servis dari staff akan muncul di sini.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {serviceRequests.map((request) => {
              const snapshot = (request.snapshot ?? {}) as Record<string, unknown>;
              const phoneModel = String(
                request.service_record?.phone_model ??
                  snapshot.phone_model ??
                  'Record servis tidak ditemukan',
              );
              const capacity = String(
                request.service_record?.capacity ?? snapshot.capacity ?? '',
              );
              const customerName = String(
                request.service_record?.customer_name ?? snapshot.customer_name ?? '-',
              );
              const recordStatus = String(
                request.service_record?.status ?? snapshot.status ?? '-',
              );
              const serviceType = String(
                request.service_record?.service_type ?? snapshot.service_type ?? '-',
              );
              const technician = String(
                request.service_record?.technician ?? snapshot.technician ?? '-',
              );
              const isPending = request.status === 'pending';
              const isProcessing = processingServiceId === request.id;
              const requester = request.requester?.name ?? 'Staff tidak tercatat';
              const diffLines = summarizeServiceEditForApproval(
                serviceCurrentFromSnapshot(request),
                proposedServiceEditFromRequest(request),
              );

              return (
                <motion.div
                  key={request.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-700">
                          Edit Servis
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${statusClass(request.status)}`}>
                          {request.status}
                        </span>
                      </div>
                      <h3 className="text-[16px] font-semibold text-slate-900">
                        {phoneModel} {capacity}
                      </h3>
                      <div className="mt-3 grid gap-2 text-[12px] text-slate-500 sm:grid-cols-2">
                        <span>Customer: {customerName}</span>
                        <span>Status: {recordStatus}</span>
                        <span>Jenis: {serviceType}</span>
                        <span>Teknisi: {technician}</span>
                        <span>Request: {formatDateTime(request.created_at)}</span>
                        <span>Pengaju: {requester}</span>
                        <span>
                          ID: <span className="font-mono">{request.service_record_id}</span>
                        </span>
                      </div>
                      <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
                        <span className="font-semibold">Alasan:</span> {request.reason}
                      </div>

                      {diffLines.length > 0 && (
                        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-500">
                            Usulan Edit
                          </p>
                          <DetailLineList lines={diffLines} />
                        </div>
                      )}
                    </div>

                    <div className="w-full shrink-0 space-y-3 lg:w-[290px]">
                      <Textarea
                        value={serviceNotes[request.id] ?? ''}
                        disabled={!isPending || isProcessing}
                        onChange={(event) =>
                          setServiceNotes((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))
                        }
                        placeholder="Catatan approval opsional"
                        rows={3}
                      />
                      {isPending ? (
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={isProcessing}
                            onClick={() => reviewService(request.id, 'rejected')}
                          >
                            <XCircle size={15} />
                            Tolak
                          </Button>
                          <Button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => reviewService(request.id, 'approved')}
                          >
                            <CheckCircle2 size={15} />
                            Setujui
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-1 rounded-xl bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
                          <p>
                            Diproses:{' '}
                            {request.reviewed_at ? formatDateTime(request.reviewed_at) : '-'}
                          </p>
                          <p>Reviewer: {request.reviewer?.name ?? '-'}</p>
                          {request.review_note && <p>Catatan: {request.review_note}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
