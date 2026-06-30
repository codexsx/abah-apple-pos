import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

// Footer hanya menampilkan jam + tanggal.
// Tombol Simpan/Batal SUDAH ADA di setiap halaman transaksi masing-masing
// (Pembelian, Penjualan, Pengeluaran, TukarTambah) — footer TIDAK duplikat
// tombol itu karena akan menimpa (z-index) dan menghalangi tombol asli.
export default function Footer() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const hours = pad(time.getHours());
  const minutes = pad(time.getMinutes());
  const seconds = pad(time.getSeconds());

  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const dateStr = `${dayNames[time.getDay()]}, ${time.getDate()} ${monthNames[time.getMonth()]} ${time.getFullYear()}`;

  return (
    <motion.footer
      initial={{ y: 72 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, delay: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
      className="fixed bottom-0 left-0 right-0 z-30 h-[72px] border-t border-slate-200 bg-white shadow-bottom-bar"
    >
      <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-4 sm:px-6">
        {/* Left: Clock + Date */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5 font-mono text-[16px] font-medium text-slate-700">
            <span>{hours}</span>
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
            >
              :
            </motion.span>
            <span>{minutes}</span>
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
            >
              :
            </motion.span>
            <span>{seconds}</span>
          </div>
          <span className="hidden sm:inline text-[13px] text-slate-500">{dateStr}</span>
        </div>
        <span className="text-[11px] text-slate-400 font-body">DR HTM POS v2.0</span>
      </div>
    </motion.footer>
  );
}
