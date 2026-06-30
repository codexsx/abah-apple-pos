import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  CheckCircle,
  Image as ImageIcon,
  Loader2,
  Save,
  Store,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useCompanyProfile } from '@/contexts/useCompanyProfile';
import {
  saveCompanyProfile,
  uploadCompanyLogo,
} from '@/services/companySettings';
import {
  validateCompanyLogoFile,
  validateCompanyName,
} from '@/services/companySettingsCore';

const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}

function LogoMark({ url, name, size = 'large' }: { url: string | null; name: string; size?: 'large' | 'small' }) {
  const box = size === 'large' ? 'h-28 w-28 rounded-[32px]' : 'h-12 w-12 rounded-2xl';
  const iconSize = size === 'large' ? 36 : 20;

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`${box} object-cover ring-1 ring-white/50 shadow-lg shadow-blue-900/10`}
      />
    );
  }

  return (
    <div className={`${box} flex items-center justify-center bg-white/80 text-blue-700 ring-1 ring-white/70 shadow-lg shadow-blue-900/10`}>
      <Store size={iconSize} />
    </div>
  );
}

export default function CompanySettings() {
  const navigate = useNavigate();
  const {
    companyProfile,
    refreshCompanyProfile,
    setCompanyProfile,
    isCompanyLoading,
  } = useCompanyProfile();
  const [name, setName] = useState(companyProfile.name);
  const [logoUrl, setLogoUrl] = useState<string | null>(companyProfile.logo_url);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setName(companyProfile.name);
    setLogoUrl(companyProfile.logo_url);
  }, [companyProfile.name, companyProfile.logo_url]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const shownLogo = previewUrl || logoUrl;
  const nameValidation = validateCompanyName(name);
  const canSave = !saving && nameValidation.ok;

  const fileLabel = useMemo(() => {
    if (selectedFile) return selectedFile.name;
    if (logoUrl) return 'Logo tersimpan';
    return 'Belum ada logo';
  }, [selectedFile, logoUrl]);

  const onFileChange = (file: File | null) => {
    setError('');
    setSuccess('');
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const validation = validateCompanyLogoFile(file);
    if (!validation.ok) {
      setSelectedFile(null);
      setError(validation.message);
      return;
    }

    setSelectedFile(file);
  };

  const handleRemoveLogo = () => {
    setSelectedFile(null);
    setLogoUrl(null);
    setError('');
    setSuccess('');
  };

  const handleSubmit = async () => {
    const validation = validateCompanyName(name);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const nextLogoUrl = selectedFile ? await uploadCompanyLogo(selectedFile) : logoUrl;
      const saved = await saveCompanyProfile({
        name,
        logo_url: nextLogoUrl,
      });
      setSelectedFile(null);
      setLogoUrl(saved.logo_url);
      setCompanyProfile(saved);
      await refreshCompanyProfile();
      setSuccess('Profile perusahaan tersimpan.');
    } catch (err) {
      setError(errorMessage(err, 'Gagal menyimpan profile perusahaan.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pb-8">
      <div className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100" />

      <section className="relative z-10 mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50"
            aria-label="Kembali"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight text-slate-950">Profile Perusahaan</h1>
            <p className="text-[13px] text-slate-500">Brand aplikasi, nama toko, dan logo.</p>
          </div>
        </div>
      </section>

      <section className="relative z-10 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: easeSmooth }}
          className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-card sm:p-6"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Store size={22} />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-slate-950">Identitas Toko</h2>
              <p className="text-[12px] text-slate-500">Default: Sixcode Smart OS</p>
            </div>
          </div>

          <div className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                Nama Toko
              </span>
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError('');
                  setSuccess('');
                }}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                maxLength={80}
                placeholder="Sixcode Smart OS"
              />
            </label>

            <div>
              <span className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                Logo
              </span>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[128px_minmax(0,1fr)]">
                <div className="flex h-32 items-center justify-center rounded-[28px] border border-slate-200 bg-slate-50">
                  <LogoMark url={shownLogo} name={name} />
                </div>
                <div className="flex flex-col justify-between gap-3">
                  <label className="group flex min-h-20 cursor-pointer items-center gap-4 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-3 transition hover:border-blue-300 hover:bg-blue-50/50">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
                      <UploadCloud size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-slate-800">{fileLabel}</p>
                      <p className="text-[12px] text-slate-500">PNG, GIF animasi, WebP, JPG. Maksimal 5 MB.</p>
                    </div>
                    <input
                      type="file"
                      accept="image/png,image/gif,image/webp,image/jpeg"
                      className="sr-only"
                      onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      <Trash2 size={14} /> Hapus Logo
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-700">
                <CheckCircle size={16} /> {success}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSave}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-blue-600 px-5 text-[14px] font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
                Simpan Profile
              </button>
            </div>
          </div>
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: easeSmooth }}
          className="relative overflow-hidden rounded-[36px] border border-white/70 bg-gradient-to-br from-sky-100 via-blue-100 to-white p-5 shadow-[0_24px_80px_rgba(37,99,235,0.16)]"
        >
          <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-white/55 blur-2xl" />
          <div className="absolute -bottom-20 left-8 h-48 w-48 rounded-full bg-blue-400/20 blur-3xl" />
          <div className="relative">
            <div className="mb-5 flex items-center justify-between">
              <div className="rounded-full border border-white/70 bg-white/75 px-3 py-1 text-[12px] font-semibold text-blue-900 shadow-sm">
                Preview
              </div>
              {isCompanyLoading ? (
                <Loader2 size={16} className="animate-spin text-blue-500" />
              ) : (
                <ImageIcon size={16} className="text-blue-500" />
              )}
            </div>
            <div className="rounded-[32px] border border-white/70 bg-white/55 p-4 shadow-lg shadow-blue-900/10 backdrop-blur-xl">
              <div className="mb-4 flex items-center gap-3">
                <LogoMark url={shownLogo} name={name} size="small" />
                <div className="min-w-0">
                  <p className="truncate text-[18px] font-semibold tracking-tight text-slate-950">
                    {name || 'Sixcode Smart OS'}
                  </p>
                  <p className="text-[12px] font-medium text-blue-900/60">Smart Retail OS</p>
                </div>
              </div>
              <div className="rounded-[28px] bg-gradient-to-br from-blue-500 via-blue-600 to-blue-800 p-4 text-white shadow-xl shadow-blue-700/20">
                <div className="mb-8 flex items-start justify-between">
                  <div>
                    <p className="text-[12px] text-blue-100">Company Profile</p>
                    <p className="mt-1 text-[24px] font-semibold leading-tight">{name || 'Sixcode Smart OS'}</p>
                  </div>
                  <LogoMark url={shownLogo} name={name} size="small" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {['Ready', 'Cash', 'Live'].map((label, index) => (
                    <div key={label} className="rounded-2xl border border-white/25 bg-white/15 px-3 py-2 backdrop-blur-sm">
                      <p className="text-[10px] text-blue-100">{label}</p>
                      <p className="mt-1 font-mono text-[16px] font-bold">
                        {index === 0 ? 'OS' : index === 1 ? 'Rp' : '24/7'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.aside>
      </section>
    </div>
  );
}
