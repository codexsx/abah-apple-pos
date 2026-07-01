// Feature: user-management
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  RefreshCw,
  UserPlus,
  Users,
  Pencil,
  Trash2,
  KeyRound,
  AlertCircle,
  Shield,
  X,
} from 'lucide-react';
import {
  listUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
  type ManagedUser,
} from '@/services/users';
import {
  PERMISSION_KEYS,
  ROLE_DEFAULTS,
  type PermissionKey,
  type PermissionOverrides,
  type AppRole,
} from '@/services/permissionsCore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
/* ------------------------------------------------------------------ */

const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];
const easeOutExpo = [0.19, 1, 0.22, 1] as [number, number, number, number];

/* ------------------------------------------------------------------ */
/*  Labels                                                             */
/* ------------------------------------------------------------------ */

const ROLES: AppRole[] = ['MANAJER', 'KEUANGAN', 'KASIR', 'TEKNISI'];

const ROLE_LABEL: Record<AppRole, string> = {
  MANAJER: 'MANAJER',
  KEUANGAN: 'ADMIN/KEUANGAN',
  KASIR: 'KASIR',
  TEKNISI: 'TEKNISI',
};

const ROLE_BADGE_CLASS: Record<AppRole, string> = {
  MANAJER: 'bg-indigo-50 text-indigo-700',
  KEUANGAN: 'bg-violet-50 text-violet-700',
  KASIR: 'bg-teal-50 text-teal-700',
  TEKNISI: 'bg-amber-50 text-amber-700',
};

const PERMISSION_LABEL: Record<PermissionKey, string> = {
  finance: 'Akses Keuangan',
  manage_users: 'Kelola User',
  penjualan: 'Penjualan',
  pembelian: 'Pembelian',
  servis: 'Servis',
  pengeluaran: 'Pengeluaran',
  tukar_tambah: 'Tukar Tambah',
  stok: 'Stok',
  agen: 'Agen',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Build the full explicit permission map a user effectively has: start from
 *  the role defaults and apply any per-user overrides on top. */
function resolvePermissionMap(
  role: AppRole,
  overrides: PermissionOverrides,
): Record<PermissionKey, boolean> {
  const result = {} as Record<PermissionKey, boolean>;
  for (const key of PERMISSION_KEYS) {
    const override = overrides[key];
    result[key] = typeof override === 'boolean' ? override : ROLE_DEFAULTS[role][key];
  }
  return result;
}

/** Count granted permissions in an explicit map. */
function countGranted(map: Record<PermissionKey, boolean>): number {
  return PERMISSION_KEYS.reduce((n, key) => (map[key] ? n + 1 : n), 0);
}

/* ------------------------------------------------------------------ */
/*  Permission checkbox grid                                           */
/* ------------------------------------------------------------------ */

function PermissionGrid({
  value,
  onToggle,
  disabled,
}: {
  value: Record<PermissionKey, boolean>;
  onToggle: (key: PermissionKey) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PERMISSION_KEYS.map((key) => {
        const checked = value[key];
        return (
          <label
            key={key}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-medium transition-colors cursor-pointer ${
              checked
                ? 'border-teal-500 bg-teal-50 text-teal-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => onToggle(key)}
              className="h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="truncate">{PERMISSION_LABEL[key]}</span>
          </label>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Confirmation dialog                                                */
/* ------------------------------------------------------------------ */

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'default',
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition-colors disabled:opacity-50 ${
              tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {busy ? 'Memproses…' : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Create / Edit user dialog                                          */
/* ------------------------------------------------------------------ */

function UserFormDialog({
  open,
  mode,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: ManagedUser | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AppRole>('KASIR');
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean>>(
    () => ({ ...ROLE_DEFAULTS.KASIR }),
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset fields whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initial) {
      const initialRole = initial.role;
      setUsername(initial.username ?? '');
      setName(initial.name ?? '');
      setRole(initialRole);
      setPermissions(resolvePermissionMap(initialRole, initial.permissions ?? {}));
    } else {
      setUsername('');
      setName('');
      setRole('KASIR');
      setPermissions({ ...ROLE_DEFAULTS.KASIR });
    }
    setPassword('');
    setError('');
    setSubmitting(false);
  }, [open, mode, initial]);

  // When the role changes, pre-fill the checkboxes from the role defaults.
  function handleRoleChange(next: AppRole) {
    setRole(next);
    setPermissions({ ...ROLE_DEFAULTS[next] });
  }

  function togglePermission(key: PermissionKey) {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (mode === 'create' && username.trim().length === 0) {
      setError('Username wajib diisi');
      return;
    }
    if (name.trim().length === 0) {
      setError('Nama wajib diisi');
      return;
    }
    if (mode === 'create' && password.length < 6) {
      setError('Password minimal 6 karakter');
      return;
    }

    // Store the full explicit permission map (every key's boolean).
    const permissionOverrides: PermissionOverrides = { ...permissions };

    setSubmitting(true);
    try {
      if (mode === 'create') {
        await createUser({
          username: username.trim(),
          password,
          name: name.trim(),
          role,
          permissions: permissionOverrides,
        });
        onSaved('User berhasil dibuat');
      } else if (initial) {
        await updateUser(initial.id, {
          name: name.trim(),
          role,
          permissions: permissionOverrides,
        });
        onSaved('User berhasil diperbarui');
      }
    } catch (err: any) {
      console.error('[ManajemenUser] save user error:', err);
      setError(err?.message || 'Gagal menyimpan user');
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Tambah User' : 'Edit User'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Buat akun pengguna baru dan atur hak akses fiturnya.'
              : 'Ubah nama, peran, dan hak akses pengguna.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'create' && (
            <div>
              <label htmlFor="usr-username" className="mb-1.5 block text-[12px] font-semibold text-slate-600">
                Username
              </label>
              <input
                id="usr-username"
                type="text"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="contoh: budi"
                maxLength={120}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-slate-900 outline-none transition-colors placeholder:text-slate-300 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />
            </div>
          )}

          <div>
            <label htmlFor="usr-name" className="mb-1.5 block text-[12px] font-semibold text-slate-600">
              Nama
            </label>
            <input
              id="usr-name"
              type="text"
              autoFocus={mode === 'edit'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="contoh: Budi Santoso"
              maxLength={120}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-slate-900 outline-none transition-colors placeholder:text-slate-300 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          {mode === 'create' && (
            <div>
              <label htmlFor="usr-password" className="mb-1.5 block text-[12px] font-semibold text-slate-600">
                Password <span className="font-normal text-slate-400">(min. 6 karakter)</span>
              </label>
              <input
                id="usr-password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password awal"
                maxLength={120}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-slate-900 outline-none transition-colors placeholder:text-slate-300 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />
            </div>
          )}

          <div>
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">Peran</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ROLES.map((r) => {
                const active = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleRoleChange(r)}
                    aria-pressed={active}
                    className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                      active
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {ROLE_LABEL[r]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">Hak Akses</span>
            <PermissionGrid value={permissions} onToggle={togglePermission} disabled={role === 'MANAJER'} />
            {role === 'MANAJER' && (
              <p className="mt-1.5 text-[11px] text-slate-400">
                MANAJER selalu memiliki akses penuh ke semua fitur.
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[12px] font-medium text-rose-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
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
              className="rounded-xl bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Menyimpan…' : mode === 'create' ? 'Tambah User' : 'Simpan'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Reset password dialog                                              */
/* ------------------------------------------------------------------ */

function ResetPasswordDialog({
  open,
  user,
  onClose,
  onSaved,
}: {
  open: boolean;
  user: ManagedUser | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPassword('');
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError('');

    if (password.length < 6) {
      setError('Password minimal 6 karakter');
      return;
    }

    setSubmitting(true);
    try {
      await resetUserPassword(user.id, password);
      onSaved('Password berhasil direset');
    } catch (err: any) {
      console.error('[ManajemenUser] reset password error:', err);
      setError(err?.message || 'Gagal mereset password');
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>
            {user ? `Atur password baru untuk ${user.name}.` : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reset-password" className="mb-1.5 block text-[12px] font-semibold text-slate-600">
              Password Baru <span className="font-normal text-slate-400">(min. 6 karakter)</span>
            </label>
            <input
              id="reset-password"
              type="text"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password baru"
              maxLength={120}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-slate-900 outline-none transition-colors placeholder:text-slate-300 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[12px] font-medium text-rose-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
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
              className="rounded-xl bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Menyimpan…' : 'Reset Password'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  User card                                                          */
/* ------------------------------------------------------------------ */

function UserCard({
  user,
  index,
  onEdit,
  onResetPassword,
  onDelete,
}: {
  user: ManagedUser;
  index: number;
  onEdit: () => void;
  onResetPassword: () => void;
  onDelete: () => void;
}) {
  const permMap = resolvePermissionMap(user.role, user.permissions ?? {});
  const granted = countGranted(permMap);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: easeSmooth }}
      className="rounded-2xl border border-slate-200 bg-white shadow-card p-5"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <Users size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[16px] font-semibold text-slate-900 font-body truncate">{user.name}</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ROLE_BADGE_CLASS[user.role]}`}
              >
                {ROLE_LABEL[user.role]}
              </span>
            </div>
            <p className="mt-0.5 text-[13px] text-slate-500 truncate">
              @{user.username ?? '-'}
            </p>
            <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-400">
              <Shield size={12} />
              {granted} dari {PERMISSION_KEYS.length} fitur diizinkan
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Pencil size={13} />
          Edit
        </button>
        <button
          onClick={onResetPassword}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <KeyRound size={13} />
          Reset Password
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[12px] font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
        >
          <Trash2 size={13} />
          Hapus
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toast                                                              */
/* ------------------------------------------------------------------ */

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-[13px] font-medium text-white shadow-lg"
    >
      <span>{message}</span>
      <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
        <X size={14} />
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function ManajemenUser() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Dialog state.
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ManagedUser | null>(null);
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (err: any) {
      console.error('[ManajemenUser] load error:', err);
      setError(err?.message || 'Gagal memuat data user');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setActionBusy(true);
    try {
      await deleteUser(deleteTarget.id);
      setToast(`${deleteTarget.name} dihapus`);
      setDeleteTarget(null);
      await loadUsers();
    } catch (err: any) {
      console.error('[ManajemenUser] delete error:', err);
      setToast(err?.message || 'Gagal menghapus user');
      setDeleteTarget(null);
    } finally {
      setActionBusy(false);
    }
  }

  /* ----- Loading / error states ----- */

  if (loading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-teal-200 border-t-teal-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8">
        <AlertCircle size={48} className="text-rose-500 mb-4" />
        <p className="text-[16px] font-medium text-slate-700 text-center">{error}</p>
        <button
          onClick={loadUsers}
          className="mt-4 rounded-xl bg-teal-600 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors"
        >
          Coba lagi
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
            aria-label="Kembali"
          >
            <ArrowLeft size={18} />
          </motion.button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-[36px] text-slate-900 leading-tight">Manajemen User</h1>
              <span className="font-mono text-[13px] text-slate-500">{users.length} user</span>
            </div>
          </div>
          <motion.button
            whileHover={{ rotate: 180 }}
            whileTap={{ scale: 0.95 }}
            onClick={loadUsers}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            title="Refresh"
            aria-label="Muat ulang"
          >
            <RefreshCw size={16} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors"
          >
            <UserPlus size={16} />
            Tambah User
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

      {/* User list / empty state */}
      {users.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 px-6 text-center shadow-card"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-500 mb-4">
            <Users size={28} />
          </div>
          <p className="text-[16px] font-semibold text-slate-700">Belum ada user</p>
          <p className="mt-1 text-[13px] text-slate-500 max-w-sm">
            Tambahkan pengguna untuk memberi akses ke aplikasi sesuai peran dan hak aksesnya.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-5 flex items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 transition-colors"
          >
            <UserPlus size={16} />
            Tambah User
          </button>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-4">
          {users.map((user, index) => (
            <UserCard
              key={user.id}
              user={user}
              index={index}
              onEdit={() => setEditTarget(user)}
              onResetPassword={() => setResetTarget(user)}
              onDelete={() => setDeleteTarget(user)}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <UserFormDialog
        open={showCreate}
        mode="create"
        onClose={() => setShowCreate(false)}
        onSaved={(msg) => {
          setShowCreate(false);
          setToast(msg);
          loadUsers();
        }}
      />

      {/* Edit dialog */}
      <UserFormDialog
        open={!!editTarget}
        mode="edit"
        initial={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={(msg) => {
          setEditTarget(null);
          setToast(msg);
          loadUsers();
        }}
      />

      {/* Reset password dialog */}
      <ResetPasswordDialog
        open={!!resetTarget}
        user={resetTarget}
        onClose={() => setResetTarget(null)}
        onSaved={(msg) => {
          setResetTarget(null);
          setToast(msg);
        }}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Hapus user?"
        description={
          <>
            <strong>{deleteTarget?.name}</strong> akan dihapus permanen. Tindakan ini tidak dapat
            dibatalkan.
          </>
        }
        confirmLabel="Hapus"
        tone="danger"
        busy={actionBusy}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      <AnimatePresence>
        {toast && <Toast key={toast} message={toast} onClose={() => setToast('')} />}
      </AnimatePresence>
    </div>
  );
}
