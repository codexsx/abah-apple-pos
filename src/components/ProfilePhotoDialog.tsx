// Feature: user-management
import { useState, useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Upload, ImageUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { uploadAvatar } from '@/services/avatar';

export default function ProfilePhotoDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { profile, refreshProfile } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setFile(null);
      setPreviewUrl('');
      setError('');
      setSuccess('');
      setUploading(false);
    }
  }, [open]);

  // Build (and revoke) an object URL for the preview.
  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    setError('');
    setSuccess('');
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
  }

  async function handleUpload() {
    if (!file) {
      setError('Pilih file gambar terlebih dahulu');
      return;
    }
    if (!profile) {
      setError('Profil tidak ditemukan');
      return;
    }
    setError('');
    setUploading(true);
    try {
      await uploadAvatar(profile.id, file);
      await refreshProfile();
      setSuccess('Foto profil berhasil diperbarui');
      setTimeout(() => onClose(), 800);
    } catch (err: any) {
      console.error('[ProfilePhotoDialog] upload error:', err);
      setError(err?.message || 'Gagal mengunggah foto');
      setUploading(false);
    }
  }

  const currentUrl = previewUrl || profile?.avatar_url || '';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !uploading && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Edit Foto Profil</DialogTitle>
          <DialogDescription>
            Pilih gambar untuk dijadikan foto profil Anda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
              {currentUrl ? (
                <img
                  src={currentUrl}
                  alt="Pratinjau foto profil"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[28px] font-semibold text-slate-400 font-body">
                  {profile?.initials || 'U'}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <ImageUp size={15} />
              {file ? 'Ganti Gambar' : 'Pilih Gambar'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={handlePick}
              className="hidden"
            />
            {file && (
              <p className="max-w-full truncate text-[12px] text-slate-500">{file.name}</p>
            )}
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
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !file}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
          >
            <Upload size={15} />
            {uploading ? 'Mengunggah…' : 'Unggah Foto'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
