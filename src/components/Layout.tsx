import { useLocation } from 'react-router';
import { Outlet } from 'react-router';
import Navbar from './Navbar';
import Footer from './Footer';
import ScrollProgress from './ScrollProgress';

const footerPaths = ['/', '/penjualan', '/pembelian', '/pengeluaran', '/tukar-tambah'];

export default function Layout() {
  const location = useLocation();
  const showFooter = footerPaths.some((p) => location.pathname === p);

  return (
    <div className="min-h-[100dvh] relative">
      <ScrollProgress />
      <Navbar />
      <main
        className="relative mx-auto max-w-[1200px] px-4 sm:px-6"
        style={{
          paddingTop: '88px',
          paddingBottom: showFooter ? '96px' : '32px',
        }}
      >
        <Outlet />
      </main>
      {showFooter && <Footer />}
    </div>
  );
}
