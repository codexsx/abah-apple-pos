import { Suspense, lazy, type ComponentType } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CompanyProfileProvider } from '@/contexts/CompanyProfileContext';
import FinanceRoute from '@/components/FinanceRoute';
import PermissionRoute from '@/components/PermissionRoute';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';

/* ── eagerly loaded core pages ── */
import Penjualan from './pages/Penjualan';
import Pembelian from './pages/Pembelian';
import Servis from './pages/Servis';
import Pengeluaran from './pages/Pengeluaran';
import TukarTambah from './pages/TukarTambah';
import Buyback from './pages/Buyback';
import Stok from './pages/Stok';

const CHUNK_RELOAD_KEY = 'abah-pos:chunk-reload-attempted';

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk \d+ failed/i.test(message);
}

function lazyRoute<T extends ComponentType<unknown>>(loader: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const module = await loader();
      window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      return module;
    } catch (error) {
      if (
        isChunkLoadError(error) &&
        window.sessionStorage.getItem(CHUNK_RELOAD_KEY) !== '1'
      ) {
        window.sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
        window.location.reload();
        return new Promise<never>(() => {});
      }
      throw error;
    }
  });
}

/* ── lazily loaded new pages ── */
const PemasukanLain = lazyRoute(() => import('./pages/PemasukanLain'));
const StokPelengkap = lazyRoute(() => import('./pages/StokPelengkap'));
const StokSparepart = lazyRoute(() => import('./pages/StokSparepart'));
const AmbilPelengkap = lazyRoute(() => import('./pages/AmbilPelengkap'));
const RiwayatPembelian = lazyRoute(() => import('./pages/RiwayatPembelian'));
const RiwayatPenjualan = lazyRoute(() => import('./pages/RiwayatPenjualan'));
const RiwayatPengeluaran = lazyRoute(() => import('./pages/RiwayatPengeluaran'));
const RiwayatTukarTambah = lazyRoute(() => import('./pages/RiwayatTukarTambah'));
const TutupHarian = lazyRoute(() => import('./pages/TutupHarian'));
const RekonsiliasiKas = lazyRoute(() => import('./pages/RekonsiliasiKas'));
const Agen = lazyRoute(() => import('./pages/Agen'));
const AgenDetail = lazyRoute(() => import('./pages/AgenDetail'));
const AgenRiwayat = lazyRoute(() => import('./pages/AgenRiwayat'));
const AkunKas = lazyRoute(() => import('./pages/AkunKas'));
const Keuangan = lazyRoute(() => import('./pages/Keuangan'));
const ManajemenUser = lazyRoute(() => import('./pages/ManajemenUser'));
const CompanySettings = lazyRoute(() => import('./pages/CompanySettings'));
const StaffPerformance = lazyRoute(() => import('./pages/StaffPerformance'));
const Absensi = lazyRoute(() => import('./pages/Absensi'));
const TransactionApprovals = lazyRoute(() => import('./pages/TransactionApprovals'));

/* ── loading fallback ── */
function PageLoader() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
        <span className="text-[13px] text-slate-500 font-body">Memuat halaman&hellip;</span>
      </div>
    </div>
  );
}

/* ── protected route wrapper ── */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

/* ── public route wrapper (redirect if logged in) ── */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

/* ── route tree ── */
function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <CompanyProfileProvider>
              <Layout />
            </CompanyProfileProvider>
          </ProtectedRoute>
        }
      >
        {/* Core pages */}
        <Route path="/" element={<Home />} />
        <Route path="/penjualan" element={<PermissionRoute permission="penjualan"><Penjualan /></PermissionRoute>} />
        <Route path="/pembelian" element={<PermissionRoute permission="pembelian"><Pembelian /></PermissionRoute>} />
        <Route path="/servis" element={<PermissionRoute permission="servis"><Servis /></PermissionRoute>} />
        <Route path="/pengeluaran" element={<PermissionRoute permission="pengeluaran"><Pengeluaran /></PermissionRoute>} />
        <Route path="/tukar-tambah" element={<PermissionRoute permission="tukar_tambah"><TukarTambah /></PermissionRoute>} />
        <Route path="/buyback" element={<PermissionRoute permission="pembelian"><Buyback /></PermissionRoute>} />
        <Route path="/stok" element={<PermissionRoute permission="stok"><Stok /></PermissionRoute>} />
        <Route
          path="/absensi"
          element={
            <Suspense fallback={<PageLoader />}>
              <Absensi />
            </Suspense>
          }
        />

        {/* Lazy-loaded pages */}
        <Route
          path="/pemasukan-lain"
          element={
            <PermissionRoute permission="pengeluaran">
              <Suspense fallback={<PageLoader />}>
                <PemasukanLain />
              </Suspense>
            </PermissionRoute>
          }
        />
        <Route
          path="/stok/pelengkap"
          element={
            <PermissionRoute permission="stok">
              <Suspense fallback={<PageLoader />}>
                <StokPelengkap />
              </Suspense>
            </PermissionRoute>
          }
        />
        <Route
          path="/stok/sparepart"
          element={
            <PermissionRoute permission="stok">
              <Suspense fallback={<PageLoader />}>
                <StokSparepart />
              </Suspense>
            </PermissionRoute>
          }
        />
        <Route
          path="/ambil-pelengkap"
          element={
            <PermissionRoute permission="stok">
              <Suspense fallback={<PageLoader />}>
                <AmbilPelengkap />
              </Suspense>
            </PermissionRoute>
          }
        />
        <Route
          path="/riwayat/pembelian"
          element={
            <PermissionRoute permission="pembelian">
              <Suspense fallback={<PageLoader />}>
                <RiwayatPembelian />
              </Suspense>
            </PermissionRoute>
          }
        />
        <Route
          path="/riwayat/penjualan"
          element={
            <PermissionRoute permission="penjualan">
              <Suspense fallback={<PageLoader />}>
                <RiwayatPenjualan />
              </Suspense>
            </PermissionRoute>
          }
        />
        <Route
          path="/riwayat/pengeluaran"
          element={
            <PermissionRoute permission="pengeluaran">
              <Suspense fallback={<PageLoader />}>
                <RiwayatPengeluaran />
              </Suspense>
            </PermissionRoute>
          }
        />
        <Route
          path="/riwayat/tukar-tambah"
          element={
            <PermissionRoute permission="tukar_tambah">
              <Suspense fallback={<PageLoader />}>
                <RiwayatTukarTambah />
              </Suspense>
            </PermissionRoute>
          }
        />
        <Route
          path="/laporan/tutup-harian"
          element={
            <FinanceRoute>
              <Suspense fallback={<PageLoader />}>
                <TutupHarian />
              </Suspense>
            </FinanceRoute>
          }
        />
        <Route
          path="/laporan/rekonsiliasi-kas"
          element={
            <FinanceRoute>
              <Suspense fallback={<PageLoader />}>
                <RekonsiliasiKas />
              </Suspense>
            </FinanceRoute>
          }
        />
        <Route
          path="/agen"
          element={
            <PermissionRoute permission="agen">
              <Suspense fallback={<PageLoader />}>
                <Agen />
              </Suspense>
            </PermissionRoute>
          }
        />
        <Route
          path="/agen/:id"
          element={
            <PermissionRoute permission="agen">
              <Suspense fallback={<PageLoader />}>
                <AgenDetail />
              </Suspense>
            </PermissionRoute>
          }
        />
        <Route
          path="/agen/riwayat"
          element={
            <PermissionRoute permission="agen">
              <Suspense fallback={<PageLoader />}>
                <AgenRiwayat />
              </Suspense>
            </PermissionRoute>
          }
        />
        <Route
          path="/akun-kas"
          element={
            <FinanceRoute>
              <Suspense fallback={<PageLoader />}>
                <AkunKas />
              </Suspense>
            </FinanceRoute>
          }
        />
        <Route
          path="/laporan/keuangan"
          element={
            <FinanceRoute>
              <Suspense fallback={<PageLoader />}>
                <Keuangan />
              </Suspense>
            </FinanceRoute>
          }
        />
        <Route
          path="/pengaturan/users"
          element={
            <PermissionRoute permission="manage_users">
              <Suspense fallback={<PageLoader />}>
                <ManajemenUser />
              </Suspense>
            </PermissionRoute>
          }
        />
        <Route
          path="/staff-performance"
          element={
            <PermissionRoute permission="manage_users">
              <Suspense fallback={<PageLoader />}>
                <StaffPerformance />
              </Suspense>
            </PermissionRoute>
          }
        />
        <Route
          path="/approval/transaksi"
          element={
            <PermissionRoute permission="manage_users">
              <Suspense fallback={<PageLoader />}>
                <TransactionApprovals />
              </Suspense>
            </PermissionRoute>
          }
        />
        <Route
          path="/pengaturan/perusahaan"
          element={
            <PermissionRoute permission="manage_users">
              <Suspense fallback={<PageLoader />}>
                <CompanySettings />
              </Suspense>
            </PermissionRoute>
          }
        />
      </Route>
    </Routes>
  );
}

function AppSpeedInsights() {
  const location = useLocation();
  return <SpeedInsights route={location.pathname} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
      <AppSpeedInsights />
    </AuthProvider>
  );
}
