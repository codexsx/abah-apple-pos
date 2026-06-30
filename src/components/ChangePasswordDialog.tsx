// Feature: user-management
import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { changeOwnPassword } from '@/services/auth';

const MIN_LENGTH = 6;

export default function ChangePasswordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset state whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setSuccess('');
      setSubmitting(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword.length < MIN_LENGTH) {
      setError(`Password minimal ${MIN_LENGTH} karakter`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password tidak cocok');
      return;
    }

    setSubmitting(true);
    try {
      await changeOwnPassword(newPassword);
      setSuccess('Password berhasil diperbarui');
      setTimeout(() => onClose(), 800);
    } catch (err: any) {
      console.error('[ChangePasswordDialog] change password error:', err);
      setError(err?.message || 'Gagal mengganti password');
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Ganti Password</DialogTitle>
          <DialogDescription>
            Masukkan password baru Anda minimal {MIN_LENGTH} karakter.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="cp-new"
              className="mb-1.5 block text-[12px] font-semibold text-slate-600"
            >
              Password Baru
            </label>
            <input
              id="cp-new"
              type="password"
              autoFocus
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••"
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-slate-900 outline-none transition-colors placeholder:text-slate-300 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          <div>
            <label
              htmlFor="cp-confirm"
              className="mb-1.5 block text-[12px] font-semibold text-slate-600"
            >
              Konfirmasi Password
            </label>
            <input
              id="cp-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••"
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-slate-900 outline-none transition-colors placeholder:text-slate-300 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[12px] font-medium text-rose-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[12px] font-medium text-emerald-700">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
              <span>{success}</span>
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
              className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              <KeyRound size={15} />
              {submitting ? 'Menyimpan…' : 'Simpan Password'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
