import { useState, useEffect, type ElementType } from 'react';
import { Link, useLocation } from 'react-router';
import { motion } from 'framer-motion';
import {
  ShoppingCart,
  ShoppingBag,
  Wrench,
  Receipt,
  ArrowLeftRight,
  Package,
  LayoutDashboard,
  Menu,
  Cpu,
  HandCoins,
  FileText,
  PanelLeft,
  History,
  ChevronRight,
  Users,
  Wallet,
  TrendingUp,
  Settings,
  LogOut,
  Image as ImageIcon,
  KeyRound,
  ShieldCheck,
  Store,
  Trophy,
  CalendarCheck,
  ClipboardCheck,
} from 'lucide-react';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyProfile } from '@/contexts/useCompanyProfile';
import { avatarImageStyle } from '@/services/avatarCrop';
import { effectivePermission } from '@/services/permissionsCore';
import { canAccessPath } from '@/services/routePermissions';
import ProfilePhotoDialog from '@/components/ProfilePhotoDialog';
import ChangePasswordDialog from '@/components/ChangePasswordDialog';
import NotificationsMenu from '@/components/NotificationsMenu';

interface NavLink {
  path: string;
  label: string;
  shortLabel?: string;
  icon: ElementType;
}

const navLinks: NavLink[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/absensi', label: 'Absensi', shortLabel: 'Absen', icon: CalendarCheck },
  { path: '/penjualan', label: 'Penjualan', shortLabel: 'Jual', icon: ShoppingCart },
  { path: '/pembelian', label: 'Pembelian', shortLabel: 'Beli', icon: ShoppingBag },
  { path: '/servis', label: 'Servis', icon: Wrench },
  { path: '/pengeluaran', label: 'Pengeluaran', shortLabel: 'Keluar', icon: Receipt },
  { path: '/tukar-tambah', label: 'Tukar Tambah', shortLabel: 'Tukar', icon: ArrowLeftRight },
  { path: '/stok', label: 'Stok', icon: Package },
  { path: '/agen', label: 'Agen', icon: Users },
];

const sheetSections = [
  {
    title: 'Transaksi',
    items: [
      { path: '/penjualan', label: 'Penjualan', icon: ShoppingCart },
      { path: '/pembelian', label: 'Pembelian', icon: ShoppingBag },
      { path: '/servis', label: 'Servis', icon: Wrench },
      { path: '/pengeluaran', label: 'Pengeluaran', icon: Receipt },
      { path: '/tukar-tambah', label: 'Tukar Tambah', icon: ArrowLeftRight },
    ],
  },
  {
    title: 'Stok & Inventaris',
    items: [
      { path: '/stok', label: 'Stok HP', icon: Package },
      { path: '/stok/pelengkap', label: 'Stok Pelengkap', icon: Package },
      { path: '/stok/sparepart', label: 'Stok Sparepart', icon: Cpu },
    ],
  },
  {
    title: 'Agen',
    items: [
      { path: '/agen', label: 'Manajemen Agen', icon: Users },
      { path: '/agen/riwayat', label: 'Riwayat Transaksi Agen', icon: History },
    ],
  },
  {
    title: 'Operasi',
    items: [
      { path: '/absensi', label: 'Absensi Staff', icon: CalendarCheck },
      { path: '/ambil-pelengkap', label: 'Ambil Pelengkap', icon: PanelLeft },
      { path: '/pemasukan-lain', label: 'Pemasukan Lain & Transfer Kas', icon: HandCoins },
    ],
  },
  {
    title: 'Riwayat & Edit',
    items: [
      { path: '/riwayat/pembelian', label: 'Riwayat Pembelian', icon: History },
      { path: '/riwayat/penjualan', label: 'Riwayat Penjualan', icon: History },
      { path: '/riwayat/pengeluaran', label: 'Riwayat Pengeluaran', icon: History },
      { path: '/riwayat/tukar-tambah', label: 'Riwayat Tukar Tambah', icon: History },
    ],
  },
  {
    title: 'Laporan Keuangan',
    items: [
      { path: '/laporan/keuangan', label: 'Keuangan', icon: TrendingUp },
      { path: '/akun-kas', label: 'Akun & Kas', icon: Wallet },
      { path: '/laporan/tutup-harian', label: 'Tutup Harian', icon: FileText },
    ],
  },
  {
    title: 'Pengaturan',
    items: [
      { path: '/approval/transaksi', label: 'Approval Transaksi', icon: ClipboardCheck },
      { path: '/staff-performance', label: 'Staff Performance', icon: Trophy },
      { path: '/pengaturan/perusahaan', label: 'Profile Perusahaan', icon: Store },
      { path: '/pengaturan/users', label: 'Manajemen User', icon: ShieldCheck },
    ],
  },
];

const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const { companyProfile } = useCompanyProfile();

  const canManageUsers = effectivePermission(profile?.role, profile?.permissions, 'manage_users');
  const canSee = (path: string): boolean => canAccessPath(profile, path);
  const visibleNavLinks = navLinks.filter((link) => canSee(link.path));
  const visibleSections = sheetSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canSee(item.path)),
    }))
    .filter((section) => section.items.length > 0);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMenuOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1, ease: easeSmooth }}
      className="fixed top-0 left-0 right-0 z-50 h-20"
      style={{ willChange: 'transform' }}
    >
      <div
        className={
          'absolute inset-0 border-b border-slate-200/60 backdrop-blur-xl transition-all duration-300 ' +
          (scrolled ? 'bg-white/90 shadow-sm' : 'bg-slate-50/70')
        }
      />
      <div className="relative mx-auto grid h-full max-w-[1560px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 sm:px-6 lg:grid-cols-[190px_minmax(0,1fr)_auto] xl:px-8">
        {/* Logo */}
        <Link to="/" className="flex min-w-0 items-center gap-2.5 select-none lg:w-[190px]">
          {companyProfile.logo_url ? (
            <img
              src={companyProfile.logo_url}
              alt={companyProfile.name}
              className="h-10 w-10 rounded-2xl object-cover ring-1 ring-slate-200"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-500/20">
              <Store size={18} />
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col leading-none">
            <span className="truncate font-display text-[18px] text-slate-900 tracking-tight">
              {companyProfile.name}
            </span>
            <span className="truncate text-[10px] font-body font-medium text-slate-500 uppercase tracking-[0.1em]">
              Smart Retail OS
            </span>
          </div>
        </Link>

        {/* Desktop Nav Links — Pill Style */}
        <div className="hidden min-w-0 max-w-full items-center justify-self-center gap-1 overflow-x-auto overflow-y-hidden rounded-full border border-slate-200/60 bg-slate-100/80 p-1 [scrollbar-width:none] lg:flex [&::-webkit-scrollbar]:hidden">
          {visibleNavLinks.map((link) => {
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                className={
                  'relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-medium transition-all duration-200 ' +
                  (isActive
                    ? 'text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50')
                }
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-pill-bg"
                    className="absolute inset-0 bg-blue-600 rounded-full shadow-md shadow-blue-500/20"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <link.icon size={14} strokeWidth={2} className="relative z-10" />
                <span className="relative z-10 whitespace-nowrap">{link.shortLabel ?? link.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Right: Actions + Sheet Drawer + User Profile */}
        <div className="flex items-center gap-2 justify-self-end">
          <NotificationsMenu />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors shadow-sm"
                aria-label="Settings"
              >
                <Settings size={18} strokeWidth={2} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              <DropdownMenuItem
                onSelect={() => setPhotoDialogOpen(true)}
                className="cursor-pointer rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700"
              >
                <ImageIcon size={15} className="text-slate-400" />
                Edit Foto Profil
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setPasswordDialogOpen(true)}
                className="cursor-pointer rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700"
              >
                <KeyRound size={15} className="text-slate-400" />
                Ganti Password
              </DropdownMenuItem>
              {canManageUsers && (
                <>
                  <DropdownMenuItem asChild className="cursor-pointer rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700">
                    <Link to="/approval/transaksi">
                      <ClipboardCheck size={15} className="text-slate-400" />
                      Approval Transaksi
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700">
                    <Link to="/staff-performance">
                      <Trophy size={15} className="text-slate-400" />
                      Staff Performance
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700">
                    <Link to="/pengaturan/perusahaan">
                      <Store size={15} className="text-slate-400" />
                      Profile Perusahaan
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700">
                    <Link to="/pengaturan/users">
                      <ShieldCheck size={15} className="text-slate-400" />
                      Manajemen User
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sheet Drawer for all pages */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors shadow-sm"
                aria-label="Menu cepat"
              >
                <Menu size={18} strokeWidth={2} />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[320px] sm:w-[360px] p-0 overflow-y-auto bg-slate-50">
              <SheetHeader className="p-5 pb-3 border-b border-slate-100 bg-white">
                <SheetTitle className="text-[16px] font-semibold text-slate-900 font-body">
                  Menu Cepat
                </SheetTitle>
                <p className="text-[13px] text-slate-500 font-body">
                  Akses cepat ke semua halaman
                </p>
              </SheetHeader>
              <div className="flex flex-col gap-1 p-3">
                {visibleSections.map((section) => (
                  <div key={section.title} className="mb-2">
                    <h4 className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 font-body">
                      {section.title}
                    </h4>
                    <div className="flex flex-col gap-0.5">
                      {section.items.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                          <SheetClose asChild key={item.path + item.label}>
                            <Link
                              to={item.path}
                              className={
                                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors ' +
                                (isActive
                                  ? 'text-blue-700 bg-blue-50'
                                  : 'text-slate-700 hover:bg-slate-100')
                              }
                            >
                              <item.icon size={16} strokeWidth={2} className={isActive ? 'text-blue-600' : 'text-slate-400'} />
                              <span className="flex-1 font-body">{item.label}</span>
                              <ChevronRight size={14} className="text-slate-300" />
                            </Link>
                          </SheetClose>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          {/* User Profile Pill */}
          <div className="flex items-center gap-2.5 rounded-full bg-white border border-slate-200 pl-1.5 pr-2 py-1 shadow-sm">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.name || 'User'}
                className="h-8 w-8 rounded-full object-cover"
                style={avatarImageStyle(profile)}
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-[12px] font-semibold font-body">
                {profile?.initials || 'U'}
              </div>
            )}
            <div className="hidden 2xl:flex items-center gap-2">
              <span className="max-w-[150px] truncate text-[14px] font-semibold text-slate-900 font-body">
                {profile?.name || 'User'}
              </span>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 font-body">
                {profile?.role || 'KASIR'}
              </span>
            </div>
            <button
              onClick={() => signOut()}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-rose-500 transition-colors"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>

          {/* Mobile hamburger menu button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="lg:hidden flex h-10 w-10 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors shadow-sm"
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              {menuOpen ? (
                <>
                  <line x1="4" y1="4" x2="16" y2="16" />
                  <line x1="16" y1="4" x2="4" y2="16" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="17" y2="6" />
                  <line x1="3" y1="10" x2="17" y2="10" />
                  <line x1="3" y1="14" x2="17" y2="14" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {menuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="lg:hidden absolute top-20 left-0 right-0 border-b border-slate-200 bg-white/95 backdrop-blur-xl shadow-lg"
        >
          <div className="mx-auto max-w-[1200px] px-4 py-3 flex flex-col gap-1">
            {visibleNavLinks.map((link) => {
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={
                    'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors ' +
                    (isActive
                      ? 'text-white bg-blue-600'
                      : 'text-slate-600 hover:bg-slate-50')
                  }
                >
                  <link.icon size={16} strokeWidth={2} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
        </motion.div>
      )}

      <ProfilePhotoDialog open={photoDialogOpen} onClose={() => setPhotoDialogOpen(false)} />
      <ChangePasswordDialog open={passwordDialogOpen} onClose={() => setPasswordDialogOpen(false)} />
    </motion.nav>
  );
}
