import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
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
  Bell,
  Headphones,
  Heart,
  KeyRound,
  Lock,
  MessageCircle,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Smartphone,
  Store,
  UserRound,
  VolumeX,
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
import { avatarImageStyle } from '@/services/avatarCrop';
import { applyDocumentBrand } from '@/services/documentBrand';

const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];

type MotionPermissionResult = 'default' | 'denied' | 'granted';
type MotionPermissionState = 'idle' | 'prompting' | 'granted' | 'denied';
type MotionEventWithPermission = {
  requestPermission?: () => Promise<MotionPermissionResult>;
};

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

const loginBubbles: Array<{
  id: string;
  src: string;
  fallback: ReactNode;
  label: string;
  x: string;
  y: string;
  depth: number;
  delay: number;
}> = [
  {
    id: 'chat',
    src: '/login-icons/chat.png',
    fallback: <MessageCircle size={28} />,
    label: 'Chat',
    x: '84%',
    y: '18%',
    depth: 18,
    delay: 0,
  },
  {
    id: 'like',
    src: '/login-icons/like.png',
    fallback: <Heart size={28} />,
    label: 'Like',
    x: '87%',
    y: '35%',
    depth: -18,
    delay: 0.35,
  },
  {
    id: 'quiet',
    src: '/login-icons/quiet.png',
    fallback: <VolumeX size={28} />,
    label: 'Quiet',
    x: '80%',
    y: '54%',
    depth: 14,
    delay: 0.7,
  },
  {
    id: 'airpods',
    src: '/login-icons/airpods.png',
    fallback: <Headphones size={28} />,
    label: 'Audio',
    x: '85%',
    y: '76%',
    depth: 20,
    delay: 1,
  },
  {
    id: 'notice',
    src: '/login-icons/notice.png',
    fallback: <Bell size={28} />,
    label: 'Notice',
    x: '16%',
    y: '77%',
    depth: -16,
    delay: 1.3,
  },
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
        className="h-full w-full rounded-[18px] object-cover sm:rounded-[20px]"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center rounded-[18px] bg-slate-950 text-white sm:rounded-[20px]">
      <Store size={24} />
    </div>
  );
}

function AccountAvatar({ account, size = 'lg' }: { account: LoginAccount; size?: 'md' | 'lg' }) {
  const [imageFailed, setImageFailed] = useState(false);
  const dimension = size === 'lg' ? 'h-12 w-12 sm:h-14 sm:w-14' : 'h-10 w-10 sm:h-11 sm:w-11';

  if (account.avatar_url && !imageFailed) {
    return (
      <img
        src={account.avatar_url}
        alt={account.name}
        className={`${dimension} shrink-0 rounded-[16px] object-cover shadow-sm ring-1 ring-white/70 sm:rounded-[18px]`}
        style={avatarImageStyle(account)}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${dimension} flex shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br from-slate-900 to-blue-700 font-display text-[16px] text-white shadow-sm ring-1 ring-white/70 sm:rounded-[18px] sm:text-[18px]`}
    >
      {account.initials}
    </div>
  );
}

function RoleBadge({ role }: { role: LoginAccount['role'] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase sm:text-[11px] ${ROLE_TONE[role]}`}
    >
      {ROLE_ICON[role]}
      {ROLE_LABEL[role]}
    </span>
  );
}

function FloatingBubble({
  src,
  fallback,
  label,
  x,
  y,
  depth,
  delay,
  motionX,
  motionY,
}: {
  src: string;
  fallback: ReactNode;
  label: string;
  x: string;
  y: string;
  depth: number;
  delay: number;
  motionX: MotionValue<number>;
  motionY: MotionValue<number>;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const translateX = useTransform(motionX, (value) => value * depth);
  const translateY = useTransform(motionY, (value) => value * depth * -0.8);

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 flex h-11 w-11 items-center justify-center rounded-[17px] border border-white/70 bg-white/45 text-blue-50 shadow-[0_20px_55px_rgba(15,23,42,0.14)] backdrop-blur-xl sm:h-16 sm:w-16 sm:rounded-[24px] lg:h-[74px] lg:w-[74px] lg:rounded-[28px]"
      style={{ left: x, top: y, x: translateX, y: translateY }}
      initial={{ opacity: 0, scale: 0.78 }}
      animate={{ opacity: 0.84, scale: 1 }}
      transition={{
        opacity: { duration: 0.5, delay },
        scale: { duration: 0.5, delay, ease: easeSmooth },
      }}
    >
      <motion.span
        className="flex h-full w-full items-center justify-center drop-shadow-sm"
        aria-label={label}
        animate={{ rotate: [0, 3, -3, 0], y: [0, -8, 0] }}
        transition={{
          rotate: { duration: 7, repeat: Infinity, delay, ease: 'easeInOut' },
          y: { duration: 5.5, repeat: Infinity, delay, ease: 'easeInOut' },
        }}
      >
        {!imageFailed ? (
          <img
            src={src}
            alt=""
            className="h-[118%] w-[118%] object-contain"
            onError={() => setImageFailed(true)}
          />
        ) : (
          fallback
        )}
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
      className={`group flex w-full items-center gap-3 rounded-[20px] border p-2.5 text-left transition-all sm:rounded-[22px] sm:p-3 ${
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
  const location = useLocation();
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
  const [motionAccess, setMotionAccess] = useState<MotionPermissionState>('idle');

  const parallaxX = useMotionValue(0);
  const parallaxY = useMotionValue(0);
  const smoothX = useSpring(parallaxX, { stiffness: 112, damping: 21, mass: 0.42 });
  const smoothY = useSpring(parallaxY, { stiffness: 112, damping: 21, mass: 0.42 });
  const lastOrientationAtRef = useRef(0);

  const sceneRotateX = useTransform(smoothY, [-1, 1], [4.2, -4.2]);
  const sceneRotateY = useTransform(smoothX, [-1, 1], [-5.2, 5.2]);
  const heroX = useTransform(smoothX, [-1, 1], [-20, 20]);
  const heroY = useTransform(smoothY, [-1, 1], [-16, 16]);
  const cardX = useTransform(smoothX, [-1, 1], [9, -9]);
  const cardY = useTransform(smoothY, [-1, 1], [8, -8]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null,
    [accounts, selectedAccountId],
  );
  const manualLoginUnlocked = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('manual') === '1';
  }, [location.search]);

  useEffect(() => {
    applyDocumentBrand(companyProfile);
  }, [companyProfile]);
  const shouldUseManualLogin = manualLoginUnlocked || (!isDirectoryLoading && accounts.length === 0);
  const activeAccount = shouldUseManualLogin ? null : selectedAccount;
  const featureCards = useMemo(
    () => [
      { label: companyProfile.login_feature_one_label, icon: <ShoppingBag size={15} /> },
      { label: companyProfile.login_feature_two_label, icon: <PackageCheck size={15} /> },
      { label: companyProfile.login_feature_three_label, icon: <Wrench size={15} /> },
    ],
    [companyProfile],
  );

  const requestMotionAccess = useCallback(async () => {
    if (motionAccess === 'prompting' || motionAccess === 'granted') return;

    setMotionAccess('prompting');
    const orientationEvent = globalThis.DeviceOrientationEvent as unknown as
      | MotionEventWithPermission
      | undefined;
    const motionEvent = globalThis.DeviceMotionEvent as unknown as
      | MotionEventWithPermission
      | undefined;

    const permissionRequests: Array<Promise<MotionPermissionResult>> = [];
    if (typeof orientationEvent?.requestPermission === 'function') {
      permissionRequests.push(orientationEvent.requestPermission());
    }
    if (typeof motionEvent?.requestPermission === 'function') {
      permissionRequests.push(motionEvent.requestPermission());
    }

    if (permissionRequests.length === 0) {
      setMotionAccess('granted');
      return;
    }

    try {
      const results = await Promise.all(permissionRequests);
      setMotionAccess(results.some((result) => result === 'denied') ? 'denied' : 'granted');
    } catch {
      setMotionAccess('denied');
    }
  }, [motionAccess]);

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
    function applyDeviceParallax(x: number, y: number) {
      parallaxX.set(clamp(x, -1, 1));
      parallaxY.set(clamp(y, -1, 1));
    }

    function handlePointerMove(event: PointerEvent) {
      const nextX = (event.clientX / window.innerWidth - 0.5) * 2;
      const nextY = (event.clientY / window.innerHeight - 0.5) * 2;
      applyDeviceParallax(nextX, nextY);
    }

    function handleOrientation(event: DeviceOrientationEvent) {
      if (event.gamma == null && event.beta == null) return;
      lastOrientationAtRef.current = Date.now();
      if (motionAccess !== 'granted') setMotionAccess('granted');

      const gamma = clamp((event.gamma ?? 0) / 18, -1, 1);
      const beta = clamp(((event.beta ?? 0) - 38) / 26, -1, 1);
      applyDeviceParallax(gamma, beta);
    }

    function handleMotion(event: DeviceMotionEvent) {
      if (Date.now() - lastOrientationAtRef.current < 220) return;
      const acceleration = event.accelerationIncludingGravity;
      if (acceleration?.x == null || acceleration.y == null) return;
      if (motionAccess !== 'granted') setMotionAccess('granted');

      applyDeviceParallax(acceleration.x / 7, -acceleration.y / 7);
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('deviceorientation', handleOrientation, { passive: true });
    window.addEventListener('devicemotion', handleMotion, { passive: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [motionAccess, parallaxX, parallaxY]);

  function chooseAccount(account: LoginAccount) {
    setSelectedAccountId(account.id);
    setPassword('');
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const loginIdentifier = shouldUseManualLogin
      ? manualIdentifier.trim()
      : selectedAccount?.username || manualIdentifier.trim();
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
      className="relative min-h-screen overflow-x-hidden bg-[#eaf1f8] px-3 py-3 text-slate-950 sm:px-6 sm:py-5 lg:px-10"
      onPointerDown={() => void requestMotionAccess()}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(255,255,255,0.9),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(186,230,253,0.65),transparent_32%),linear-gradient(135deg,#f8fbff_0%,#e5eef7_46%,#dce9f4_100%)]" />
      <div className="absolute inset-x-0 top-0 h-20 bg-white/40 backdrop-blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: easeSmooth }}
        className="relative mx-auto flex min-h-[calc(100vh-24px)] w-full max-w-[1180px] items-start sm:min-h-[calc(100vh-40px)] lg:items-center"
      >
        <motion.div
          data-testid="login-parallax-scene"
          className="grid w-full gap-3 rounded-[30px] border border-white/75 bg-white/38 p-2 shadow-[0_28px_95px_rgba(15,23,42,0.16)] backdrop-blur-2xl sm:gap-4 sm:p-3 md:p-4 lg:grid-cols-[1.02fr_0.95fr_0.92fr]"
          style={{ rotateX: sceneRotateX, rotateY: sceneRotateY, transformPerspective: 1200 }}
        >
          <motion.section
            className="relative min-h-[320px] overflow-hidden rounded-[26px] bg-slate-950 p-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] sm:min-h-[360px] sm:p-7 lg:min-h-[620px] lg:rounded-[28px]"
            style={{ x: heroX, y: heroY }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_12%,rgba(96,165,250,0.75),transparent_34%),radial-gradient(circle_at_70%_86%,rgba(45,212,191,0.44),transparent_32%),linear-gradient(145deg,#0f172a_0%,#164e63_54%,#111827_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.12)_0%,transparent_36%,rgba(255,255,255,0.08)_68%,transparent_100%)]" />

            {loginBubbles.map((bubble) => (
              <FloatingBubble
                key={bubble.id}
                src={bubble.src}
                fallback={bubble.fallback}
                label={bubble.label}
                x={bubble.x}
                y={bubble.y}
                depth={bubble.depth}
                delay={bubble.delay}
                motionX={smoothX}
                motionY={smoothY}
              />
            ))}

            <div className="relative z-20 flex h-full min-h-[288px] flex-col justify-between sm:min-h-[310px] lg:min-h-[564px]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-12 w-12 shrink-0 rounded-[18px] bg-white/15 p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.22)] ring-1 ring-white/25 backdrop-blur-xl sm:h-14 sm:w-14 sm:rounded-[20px]">
                    <CompanyLogo companyProfile={companyProfile} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase text-cyan-100 sm:text-[11px]">
                      {companyProfile.login_kicker}
                    </p>
                    <h1 className="truncate font-display text-[24px] leading-none text-white sm:text-[34px]">
                      {companyProfile.name}
                    </h1>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void requestMotionAccess();
                  }}
                  aria-label="Aktifkan gyro"
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border backdrop-blur-xl transition lg:hidden ${
                    motionAccess === 'granted'
                      ? 'border-emerald-200/70 bg-emerald-300/25 text-emerald-50'
                      : 'border-white/20 bg-white/12 text-cyan-50'
                  }`}
                >
                  <Smartphone size={17} />
                </button>
              </div>

              <div className="max-w-[310px] sm:max-w-[360px]">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-3 py-1.5 text-[11px] font-semibold text-cyan-50 backdrop-blur-xl sm:mb-4 sm:text-[12px]">
                  <Sparkles size={14} />
                  {companyProfile.login_badge_label}
                </div>
                <p className="font-display text-[37px] leading-[0.94] text-white sm:text-[52px] lg:text-[58px]">
                  {companyProfile.login_headline}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {featureCards.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[16px] border border-white/18 bg-white/12 px-2.5 py-2.5 text-[11px] font-semibold text-cyan-50 backdrop-blur-xl sm:rounded-[18px] sm:px-3 sm:py-3 sm:text-[12px]"
                  >
                    <div className="mb-1.5 text-cyan-100 sm:mb-2">{item.icon}</div>
                    <span className="block truncate">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>

          <section className="rounded-[26px] border border-white/70 bg-white/58 p-4 shadow-card-elevated backdrop-blur-xl sm:p-5 lg:min-h-[620px] lg:rounded-[28px]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase text-slate-500 sm:text-[11px]">Pilih Akun</p>
                <h2 className="mt-1 text-[22px] font-semibold text-slate-950 sm:text-[24px]">
                  {companyProfile.login_accounts_title}
                </h2>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-[16px] bg-blue-600 text-white shadow-[0_12px_24px_rgba(37,99,235,0.25)] sm:h-11 sm:w-11 sm:rounded-[17px]">
                <UserRound size={20} />
              </div>
            </div>

            {isDirectoryLoading ? (
              <div className="grid gap-3">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-[74px] animate-pulse rounded-[20px] bg-white/70 sm:h-[82px]" />
                ))}
              </div>
            ) : accounts.length > 0 ? (
              <div className="grid max-h-[360px] gap-3 overflow-y-auto pr-1 lg:max-h-[440px]">
                {accounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    active={!shouldUseManualLogin && selectedAccount?.id === account.id}
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
            className="rounded-[26px] border border-white/75 bg-white/72 p-4 shadow-[0_24px_65px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-5 lg:min-h-[620px] lg:rounded-[28px]"
            style={{ x: cardX, y: cardY }}
          >
            <div className="flex h-full flex-col">
              <div className="mb-5 rounded-[22px] border border-slate-100 bg-slate-50/80 p-4 sm:rounded-[24px]">
                <p className="mb-3 text-[10px] font-semibold uppercase text-slate-500 sm:text-[11px]">Akun Aktif</p>
                {activeAccount ? (
                  <div className="flex items-center gap-3">
                    <AccountAvatar account={activeAccount} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[17px] font-semibold text-slate-950 sm:text-[18px]">
                        {activeAccount.name}
                      </div>
                      <div className="mt-1">
                        <RoleBadge role={activeAccount.role} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-slate-500">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[16px] bg-white sm:h-11 sm:w-11 sm:rounded-[18px]">
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
                    {companyProfile.login_footer_label}
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
