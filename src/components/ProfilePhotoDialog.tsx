// Feature: user-management
import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { AlertCircle, CheckCircle2, ImageUp, RotateCcw, SlidersHorizontal, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { useAuth } from '@/contexts/AuthContext';
import { updateAvatarCrop, uploadAvatar } from '@/services/avatar';
import {
  avatarImageStyle,
  DEFAULT_AVATAR_CROP,
  normalizeAvatarCrop,
  type AvatarCrop,
} from '@/services/avatarCrop';

function cropsEqual(a: AvatarCrop, b: AvatarCrop): boolean {
  return (
    Math.abs(a.avatar_crop_x - b.avatar_crop_x) < 0.001 &&
    Math.abs(a.avatar_crop_y - b.avatar_crop_y) < 0.001 &&
    Math.abs(a.avatar_zoom - b.avatar_zoom) < 0.001
  );
}

function CropControl({
  label,
  value,
  displayValue,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold text-slate-600">{label}</span>
        <span className="font-mono text-[12px] font-semibold text-slate-400">{displayValue}</span>
      </div>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={[value]}
        onValueChange={(next) => onChange(next[0] ?? value)}
      />
    </div>
  );
}

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
  const [crop, setCrop] = useState<AvatarCrop>(DEFAULT_AVATAR_CROP);
  const [initialCrop, setInitialCrop] = useState<AvatarCrop>(DEFAULT_AVATAR_CROP);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  // Reset state whenever the dialog opens.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const nextCrop = normalizeAvatarCrop(profile);
      setFile(null);
      setPreviewUrl('');
      setCrop(nextCrop);
      setInitialCrop(nextCrop);
      setError('');
      setSuccess('');
      setUploading(false);
    }
    wasOpenRef.current = open;
  }, [open, profile]);

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

  const currentUrl = previewUrl || profile?.avatar_url || '';
  const hasImage = Boolean(currentUrl);
  const cropChanged = !cropsEqual(crop, initialCrop);
  const canSave = Boolean(profile) && hasImage && (Boolean(file) || cropChanged);

  function setCropValue(key: keyof AvatarCrop, value: number) {
    setError('');
    setSuccess('');
    setCrop((prev) => normalizeAvatarCrop({ ...prev, [key]: value }));
  }

  function handlePick(e: ChangeEvent<HTMLInputElement>) {
    setError('');
    setSuccess('');
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    if (picked) setCrop(DEFAULT_AVATAR_CROP);
  }

  async function handleSave() {
    if (!hasImage) {
      setError('Pilih file gambar terlebih dahulu');
      return;
    }
    if (!profile) {
      setError('Profil tidak ditemukan');
      return;
    }
    if (!file && !cropChanged) return;

    setError('');
    setUploading(true);
    try {
      if (file) {
        await uploadAvatar(profile.id, file, crop);
      } else {
        await updateAvatarCrop(profile.id, crop);
      }
      await refreshProfile();
      setInitialCrop(crop);
      setFile(null);
      setSuccess('Foto profil berhasil diperbarui');
      setTimeout(() => onClose(), 800);
    } catch (err: any) {
      console.error('[ProfilePhotoDialog] save error:', err);
      setError(err?.message || 'Gagal menyimpan foto');
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !uploading && onClose()}>
      <DialogContent className="max-w-[520px] rounded-2xl">
        <DialogHeader>
          <DialogTitle>Edit Foto Profil</DialogTitle>
          <DialogDescription>
            Atur foto, zoom, dan posisi supaya pas di avatar dan kartu profil.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[128px_minmax(0,1fr)]">
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
                {hasImage ? (
                  <img
                    src={currentUrl}
                    alt="Pratinjau foto profil"
                    className="h-full w-full object-cover"
                    style={avatarImageStyle(crop)}
                  />
                ) : (
                  <span className="font-body text-[28px] font-semibold text-slate-400">
                    {profile?.initials || 'U'}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
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
            </div>

            <div className="space-y-3">
              <div className="relative h-[132px] overflow-hidden rounded-[26px] border border-white/70 bg-gradient-to-br from-sky-200 via-blue-100 to-slate-100 shadow-sm">
                {hasImage ? (
                  <img
                    src={currentUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    style={avatarImageStyle(crop)}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center font-body text-[34px] font-semibold text-blue-800">
                    {profile?.initials || 'U'}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/58 via-slate-950/12 to-white/8" />
                <div className="absolute inset-x-3 bottom-3 rounded-[20px] border border-white/25 bg-white/18 px-4 py-3 text-white shadow-lg backdrop-blur-md">
                  <p className="truncate text-[15px] font-semibold leading-tight">
                    {profile?.name || 'User'}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] font-semibold text-white/75">
                    {profile?.role || 'KASIR'}
                  </p>
                </div>
              </div>
              {file && (
                <p className="max-w-full truncate text-[12px] text-slate-500">{file.name}</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
                <SlidersHorizontal size={15} className="text-slate-400" />
                Crop & Posisi
              </div>
              <button
                type="button"
                onClick={() => setCrop(DEFAULT_AVATAR_CROP)}
                disabled={uploading || !hasImage}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                <RotateCcw size={12} />
                Reset
              </button>
            </div>
            <div className="space-y-4">
              <CropControl
                label="Zoom"
                value={crop.avatar_zoom}
                displayValue={`${Math.round(crop.avatar_zoom * 100)}%`}
                min={0.8}
                max={2.5}
                step={0.05}
                disabled={uploading || !hasImage}
                onChange={(value) => setCropValue('avatar_zoom', value)}
              />
              <CropControl
                label="Posisi X"
                value={crop.avatar_crop_x}
                displayValue={`${Math.round(crop.avatar_crop_x)}%`}
                min={0}
                max={100}
                step={1}
                disabled={uploading || !hasImage}
                onChange={(value) => setCropValue('avatar_crop_x', value)}
              />
              <CropControl
                label="Posisi Y"
                value={crop.avatar_crop_y}
                displayValue={`${Math.round(crop.avatar_crop_y)}%`}
                min={0}
                max={100}
                step={1}
                disabled={uploading || !hasImage}
                onChange={(value) => setCropValue('avatar_crop_y', value)}
              />
            </div>
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
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={uploading || !canSave}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
          >
            <Upload size={15} />
            {uploading ? 'Menyimpan...' : 'Simpan Foto'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
