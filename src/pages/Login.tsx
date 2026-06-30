import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  KeyRound,
  Lock,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  UserRound,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getCompanyProfile } from '@/services/companySettings';
import {
  DEFAULT_COMPANY_PROFILE,
  type CompanyProfile,
} from '@/services/companySettingsCore';
import {
  getLoginAccounts,
  type LoginAccount,
} from '@/services/loginDirectory';

const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];

const ROLE_LABEL: Record<LoginAccount['role'], string> = {
  MANAJER: 'Manajer',
  KASIR: 'Kasir',
  TEKNISI: 'Teknisi',
};

const ROLE_TONE: Record<LoginAccount['role'], string> = {
  MANAJER: 'border-blue-200 bg-blue-50 text-blue-700',
  KASIR: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  TEKNISI: 'border-amber-200 bg-amber-50 text-amber-700',
};

const ROLE_ICON: Record<LoginAccount['role'], ReactNode> = {
  MANAJER: <ShieldCheck size={14} />,
  KASIR: <ShoppingBag size={14} />,
  TEKNISI: <Wrench size={14} />,
};

const loginBubbles = [
  { id: 'sales', icon: '🛒', label: 'Sales', x: '84%', y: '19%', depth: 18, delay: 0 },
  { id: 'stock', icon: '📦', label: 'Stock', x: '86%', y: '34%', depth: -18, delay: 0.35 },
  { id: 'phone', icon: '📱', label: 'Phone', x: '15%', y: '76%', depth: -16, delay: 0.7 },
  { id: 'money', icon: '💸', label: 'Finance', x: '86%', y: '76%', depth: 20, delay: 1 },
  { id: 'tools', icon: '🛠️', label: 'Service', x: '80%', y: '53%', depth: 14, delay: 1.3 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function CompanyLogo({ companyProfile }: { companyProfile: CompanyProfile }) {
  if (companyProfile.logo_url) {
    return (
      <img
        src={companyProfile.logo_url}
        alt={`${companyProfile.name} logo`}
        className="h-full w-full rounded-[20px] object-cover"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center rounded-[20px] bg-slate-950 text-white">
      <Store size={26} />
    </div>
  );
}

function AccountAvatar({ account, size = 'lg' }: { account: LoginAccount; size?: 'md' | 'lg' }) {
  const dimension = size === 'lg' ? 'h-14 w-14' : 'h-11 w-11';

  if (account.avatar_url) {
    return (
      <img
        src={account.avatar_url}
        alt={account.name}
        className={`${dimension} shrink-0 rounded-[18px] object-cover shadow-sm ring-1 ring-white/70`}
      />
    );
  }

  return (
    <div
      className={`${dimension} flex shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-slate-900 to-blue-700 font-display text-[18px] text-white shadow-sm ring-1 ring-white/70`}
    >
      {account.initials}
    </div>
  );
}

function RoleBadge({ role }: { role: LoginAccount['role'] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase ${ROLE_TONE[role]}`}
    >
      {ROLE_ICON[role]}
      {ROLE_LABEL[role]}
    </span>
  );
}

function FloatingBubble({
  icon,
  label,
  x,
  y,
  depth,
  delay,
  motionX,
  motionY,
}: {
  icon: string;
  label: string;
  x: string;
  y: string;
  depth: number;
  delay: number;
  motionX: MotionValue<number>;
  motionY: MotionValue<number>;
}) {
  const translateX = useTransform(motionX, (value) => value * depth);
  const translateY = useTransform(motionY, (value) => value * depth * -0.8);

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/70 bg-white/45 text-[22px] shadow-[0_20px_55px_rgba(15,23,42,0.14)] backdrop-blur-xl sm:h-16 sm:w-16 sm:rounded-[24px] sm:text-[28px] lg:h-[74px] lg:w-[74px] lg:rounded-[28px] lg:text-[32px]"
      style={{ left: x, top: y, x: translateX, y: translateY }}
      initial={{ opacity: 0, scale: 0.78 }}
      animate={{ opacity: 0.82, scale: 1 }}
      transition={{
        opacity: { duration: 0.5, delay },
        scale: { duration: 0.5, delay, ease: easeSmooth },
      }}
    >
      <motion.span
        className="drop-shadow-sm"
        aria-label={label}
        animate={{ rotate: [0, 3, -3, 0], y: [0, -8, 0] }}
        transition={{
          rotate: { duration: 7, repeat: Infinity, delay, ease: 'easeInOut' },
          y: { duration: 5.5, repeat: Infinity, delay, ease: 'easeInOut' },
        }}
      >
        {icon}
      </motion.span>
    </motion.div>
  );
}

function AccountCard({
  account,
  active,
  onSelect,
}: {
  account: LoginAccount;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex w-full items-center gap-3 rounded-[22px] border p-3 text-left transition-all ${
        active
          ? 'border-blue-300 bg-white shadow-[0_16px_34px_rgba(37,99,235,0.16)]'
          : 'border-white/70 bg-white/55 hover:border-blue-200 hover:bg-white/85 hover:shadow-card-elevated'
      }`}
    >
      <AccountAvatar account={account} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-slate-950">{account.name}</div>
        <div className="mt-1">
          <RoleBadge role={account.role} />
        </div>
      </div>
      <ArrowRight
        size={18}
        className={`shrink-0 transition-transform ${
          active ? 'translate-x-0 text-blue-600' : 'text-slate-300 group-hover:translate-x-1 group-hover:text-blue-500'
        }`}
      />
    </button>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [accounts, setAccounts] = useState<LoginAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [manualIdentifier, setManualIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [directoryError, setDirectoryError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDirectoryLoading, setIsDirectoryLoading] = useState(true);

  const parallaxX = useMotionValue(0);
  const parallaxY = useMotionValue(0);
  const smoothX = useSpring(parallaxX, { stiffness: 92, damping: 24, mass: 0.45 });
  const smoothY = useSpring(parallaxY, { stiffness: 92, damping: 24, mass: 0.45 });
  const requestedMotionAccessRef = useRef(false);

  const sceneRotateX = useTransform(smoothY, [-1, 1], [3.5, -3.5]);
  const sceneRotateY = useTransform(smoothX, [-1, 1], [-4.5, 4.5]);
  const heroX = useTransform(smoothX, [-1, 1], [-18, 18]);
  const heroY = useTransform(smoothY, [-1, 1], [-14, 14]);
  const cardX = useTransform(smoothX, [-1, 1], [9, -9]);
  const cardY = useTransform(smoothY, [-1, 1], [8, -8]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null,
    [accounts, selectedAccountId],
  );
  const shouldUseManualLogin = !isDirectoryLoading && accounts.length === 0;

  const requestMotionAccess = useCallback(() => {
    if (requestedMotionAccessRef.current || typeof DeviceOrientationEvent === 'undefined') return;

    const orientationEvent = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
    };

    if (typeof orientationEvent.requestPermission !== 'function') return;

    requestedMotionAccessRef.current = true;
    void orientationEvent.requestPermission().catch(() => undefined);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadLoginData() {
      setIsDirectoryLoading(true);
      try {
        const [profile, nextAccounts] = await Promise.all([
          getCompanyProfile().catch(() => DEFAULT_COMPANY_PROFILE),
          getLoginAccounts(),
        ]);

        if (!mounted) return;
        setCompanyProfile(profile);
        setAccounts(nextAccounts);
        setSelectedAccountId(nextAccounts[0]?.id ?? null);
        setDirectoryError('');
      } catch (err: any) {
        if (!mounted) return;
        setCompanyProfile(DEFAULT_COMPANY_PROFILE);
        setAccounts([]);
        setSelectedAccountId(null);
        setDirectoryError(err?.message || 'Daftar akun belum bisa dimuat.');
      } finally {
        if (mounted) setIsDirectoryLoading(false);
      }
    }

    loadLoginData();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const nextX = (event.clientX / window.innerWidth - 0.5) * 2;
      const nextY = (event.clientY / window.innerHeight - 0.5) * 2;
      parallaxX.set(clamp(nextX, -1, 1));
      parallaxY.set(clamp(nextY, -1, 1));
    }

    function handleOrientation(event: DeviceOrientationEvent) {
      const gamma = clamp((event.gamma ?? 0) / 24, -1, 1);
      const beta = clamp(((event.beta ?? 0) - 35) / 32, -1, 1);
      parallaxX.set(gamma);
      parallaxY.set(beta);
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('deviceorientation', handleOrientation, { passive: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [parallaxX, parallaxY]);

  function chooseAccount(account: LoginAccount) {
    setSelectedAccountId(account.id);
    setPassword('');
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const loginIdentifier = selectedAccount?.username || manualIdentifier.trim();
    if (!loginIdentifier) {
      setError('Pilih akun terlebih dahulu.');
      return;
    }

    setIsLoading(true);
    try {
      await signIn(loginIdentifier, password);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Password salah atau akun belum aktif.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-[#eaf1f8] px-4 py-5 text-slate-950 sm:px-6 lg:px-10"
      onPointerDown={requestMotionAccess}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(255,255,255,0.9),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(186,230,253,0.65),transparent_32%),linear-gradient(135deg,#f8fbff_0%,#e5eef7_46%,#dce9f4_100%)]" />
      <div className="absolute inset-x-0 top-0 h-20 bg-white/40 backdrop-blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: easeSmooth }}
        className="relative mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-[1180px] items-center"
      >
        <motion.div
          className="grid w-full gap-4 rounded-[34px] border border-white/75 bg-white/38 p-3 shadow-[0_28px_95px_rgba(15,23,42,0.16)] backdrop-blur-2xl md:p-4 lg:grid-cols-[1.02fr_0.95fr_0.92fr]"
          style={{ rotateX: sceneRotateX, rotateY: sceneRotateY, transformPerspective: 1200 }}
        >
          <motion.section
            className="relative min-h-[300px] overflow-hidden rounded-[28px] bg-slate-950 p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] sm:min-h-[360px] sm:p-7 lg:min-h-[620px]"
            style={{ x: heroX, y: heroY }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_12%,rgba(96,165,250,0.75),transparent_34%),radial-gradient(circle_at_70%_86%,rgba(45,212,191,0.44),transparent_32%),linear-gradient(145deg,#0f172a_0%,#164e63_54%,#111827_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.12)_0%,transparent_36%,rgba(255,255,255,0.08)_68%,transparent_100%)]" />

            {loginBubbles.map((bubble) => (
              <FloatingBubble
                key={bubble.id}
                icon={bubble.icon}
                label={bubble.label}
                x={bubble.x}
                y={bubble.y}
                depth={bubble.depth}
                delay={bubble.delay}
                motionX={smoothX}
                motionY={smoothY}
              />
            ))}

            <div className="relative z-20 flex h-full min-h-[260px] flex-col justify-between sm:min-h-[310px] lg:min-h-[564px]">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 shrink-0 rounded-[20px] bg-white/15 p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.22)] ring-1 ring-white/25 backdrop-blur-xl">
                  <CompanyLogo companyProfile={companyProfile} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase text-cyan-100">Smart POS</p>
                  <h1 className="truncate font-display text-[28px] leading-none text-white sm:text-[34px]">
                    {companyProfile.name}
                  </h1>
                </div>
              </div>

              <div className="max-w-[360px]">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-3 py-1.5 text-[12px] font-semibold text-cyan-50 backdrop-blur-xl">
                  <Sparkles size={14} />
                  Staff Access
                </div>
                <p className="font-display text-[42px] leading-[0.92] text-white sm:text-[52px] lg:text-[58px]">
                  Masuk cepat untuk operasional toko.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Kasir', icon: <ShoppingBag size={16} /> },
                  { label: 'Stok', icon: <PackageCheck size={16} /> },
                  { label: 'Servis', icon: <Wrench size={16} /> },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[18px] border border-white/18 bg-white/12 px-3 py-3 text-[12px] font-semibold text-cyan-50 backdrop-blur-xl"
                  >
                    <div className="mb-2 text-cyan-100">{item.icon}</div>
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
          </motion.section>

          <section className="rounded-[28px] border border-white/70 bg-white/58 p-4 shadow-card-elevated backdrop-blur-xl sm:p-5 lg:min-h-[620px]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase text-slate-500">Pilih Akun</p>
                <h2 className="mt-1 text-[24px] font-semibold text-slate-950">Staff Terdaftar</h2>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-[17px] bg-blue-600 text-white shadow-[0_12px_24px_rgba(37,99,235,0.25)]">
                <UserRound size={21} />
              </div>
            </div>

            {isDirectoryLoading ? (
              <div className="grid gap-3">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-[82px] animate-pulse rounded-[22px] bg-white/70" />
                ))}
              </div>
            ) : accounts.length > 0 ? (
              <div className="grid max-h-[440px] gap-3 overflow-y-auto pr-1">
                {accounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    active={selectedAccount?.id === account.id}
                    onSelect={() => chooseAccount(account)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 p-4 text-[13px] text-amber-800">
                {directoryError || 'Daftar akun belum tersedia.'}
              </div>
            )}
          </section>

          <motion.section
            className="rounded-[28px] border border-white/75 bg-white/72 p-4 shadow-[0_24px_65px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-5 lg:min-h-[620px]"
            style={{ x: cardX, y: cardY }}
          >
            <div className="flex h-full flex-col">
              <div className="mb-5 rounded-[24px] border border-slate-100 bg-slate-50/80 p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase text-slate-500">Akun Aktif</p>
                {selectedAccount ? (
                  <div className="flex items-center gap-3">
                    <AccountAvatar account={selectedAccount} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[18px] font-semibold text-slate-950">
                        {selectedAccount.name}
                      </div>
                      <div className="mt-1">
                        <RoleBadge role={selectedAccount.role} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-slate-500">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-white">
                      <UserRound size={20} />
                    </div>
                    <div className="text-[14px] font-medium">Login manual</div>
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
                <div className="space-y-4">
                  {shouldUseManualLogin && (
                    <div>
                      <label
                        htmlFor="login-identifier"
                        className="mb-1.5 block text-[12px] font-semibold uppercase text-slate-500"
                      >
                        Username atau Email
                      </label>
                      <div className="relative">
                        <UserRound
                          size={17}
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          id="login-identifier"
                          type="text"
                          value={manualIdentifier}
                          onChange={(e) => setManualIdentifier(e.target.value)}
                          placeholder="username atau nama@email.com"
                          required
                          className="h-12 w-full rounded-[16px] border border-slate-200 bg-white pl-11 pr-4 text-[14px] text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="login-password"
                      className="mb-1.5 block text-[12px] font-semibold uppercase text-slate-500"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <Lock
                        size={17}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        id="login-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password akun"
                        required
                        className="h-12 w-full rounded-[16px] border border-slate-200 bg-white pl-11 pr-4 text-[14px] text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10"
                      />
                    </div>
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 flex items-center gap-2 rounded-[16px] border border-rose-100 bg-rose-50 p-3 text-[13px] text-rose-600"
                  >
                    <AlertCircle size={16} />
                    {error}
                  </motion.div>
                )}

                <div className="mt-6 flex flex-1 flex-col justify-end gap-3">
                  <button
                    type="submit"
                    disabled={isLoading || isDirectoryLoading}
                    className="flex h-[52px] min-h-[52px] w-full items-center justify-center gap-2 rounded-[18px] bg-slate-950 px-4 py-3 text-[14px] font-semibold text-white shadow-[0_18px_36px_rgba(15,23,42,0.22)] transition-all hover:-translate-y-0.5 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {isLoading ? 'Memuat...' : 'Login'}
                    <KeyRound size={17} />
                  </button>
                  <p className="text-center text-[12px] font-medium text-slate-400">
                    {companyProfile.name}
                  </p>
                </div>
              </form>
            </div>
          </motion.section>
        </motion.div>
      </motion.div>
    </div>
  );
}
