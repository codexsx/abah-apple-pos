import { useMemo, useState } from 'react';
import { Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  submitTransactionChangeRequest,
  type SubmitTransactionChangeRequestInput,
} from '@/services/transactionApprovals';
import type { Transaction } from '@/services/transactions';

interface TransactionChangeRequestActionsProps {
  transaction: Transaction;
  onSubmitted?: () => void;
}

type ActiveAction = SubmitTransactionChangeRequestInput['action'];

const DELETE_SUPPORTED_TYPES = new Set<Transaction['type']>([
  'Penjualan',
  'Pembelian',
  'Pengeluaran',
  'Pemasukan Lain',
]);

function parseIdr(value: string): number | null {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return null;
  return Number(digits);
}

function formatIdrInput(value: number | null): string {
  return value === null ? '' : value.toLocaleString('id-ID');
}

export default function TransactionChangeRequestActions({
  transaction,
  onSubmitted,
}: TransactionChangeRequestActionsProps) {
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState(transaction.description);
  const [amountDraft, setAmountDraft] = useState(formatIdrInput(transaction.amount));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canDelete = DELETE_SUPPORTED_TYPES.has(transaction.type);
  const isOpen = activeAction !== null;
  const dialogTitle = activeAction === 'delete' ? 'Ajukan Hapus Transaksi' : 'Ajukan Edit Transaksi';

  const amountValue = useMemo(() => parseIdr(amountDraft), [amountDraft]);

  function open(action: ActiveAction) {
    setActiveAction(action);
    setDescriptionDraft(transaction.description);
    setAmountDraft(formatIdrInput(transaction.amount));
    setReason('');
    setMessage(null);
  }

  function close() {
    if (saving) return;
    setActiveAction(null);
  }

  async function getCurrentUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    const userId = data.user?.id;
    if (!userId) throw new Error('Sesi login tidak ditemukan.');
    return userId;
  }

  async function submit() {
    if (!activeAction) return;
    setSaving(true);
    setMessage(null);

    try {
      const requestedBy = await getCurrentUserId();
      await submitTransactionChangeRequest({
        transaction,
        action: activeAction,
        reason,
        requestedBy,
        proposed:
          activeAction === 'edit'
            ? {
                description: descriptionDraft,
                detail: transaction.detail,
                amount: amountValue,
              }
            : undefined,
      });
      setMessage('Request approval berhasil dibuat.');
      onSubmitted?.();
      setTimeout(() => setActiveAction(null), 450);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Request approval gagal dibuat.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            open('edit');
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
        >
          <Pencil size={12} />
          Edit
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              open('delete');
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
          >
            <Trash2 size={12} />
            Hapus
          </button>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={(nextOpen) => (!nextOpen ? close() : undefined)}>
        <DialogContent
          className="max-w-[520px]"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[18px]">
              <ShieldCheck size={18} className="text-blue-600" />
              {dialogTitle}
            </DialogTitle>
            <DialogDescription>
              Request akan masuk ke halaman approval boss/manajer sebelum data berubah.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {activeAction === 'edit' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor={`tx-desc-${transaction.id}`}>Judul transaksi</Label>
                  <Input
                    id={`tx-desc-${transaction.id}`}
                    value={descriptionDraft}
                    onChange={(event) => setDescriptionDraft(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`tx-amount-${transaction.id}`}>Nominal</Label>
                  <Input
                    id={`tx-amount-${transaction.id}`}
                    inputMode="numeric"
                    value={amountDraft}
                    onChange={(event) => setAmountDraft(event.target.value)}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor={`tx-reason-${transaction.id}`}>
                Alasan {activeAction === 'delete' ? 'hapus' : 'edit'} *
              </Label>
              <Textarea
                id={`tx-reason-${transaction.id}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Contoh: salah input nominal / transaksi dobel"
                rows={4}
              />
            </div>

            {message && (
              <p
                className={
                  'rounded-xl px-3 py-2 text-[13px] ' +
                  (message.includes('berhasil')
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-rose-50 text-rose-700')
                }
              >
                {message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close} disabled={saving}>
              Batal
            </Button>
            <Button type="button" onClick={submit} disabled={saving}>
              {saving ? 'Mengirim...' : 'Kirim Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
