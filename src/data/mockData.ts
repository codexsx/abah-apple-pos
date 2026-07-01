/**
 * Mock data for DR HTM POS Dashboard
 */

export interface User {
  name: string;
  role: 'MANAJER' | 'KEUANGAN' | 'KASIR' | 'TEKNISI';
  initials: string;
}

export const currentUser: User = {
  name: 'LUTFI',
  role: 'MANAJER',
  initials: 'LU',
};

export interface StockItem {
  id: string;
  model: string;
  capacity: string;
  condition:
    | 'Second iBox'
    | 'Second Bea Cukai'
    | 'Second Inter'
    | 'Second Ex-Inter'
    | 'Second Bid'
    | 'Baru iBox'
    | 'Baru Inter';
  color: string;
  imei: string;
  count: number;
  price: number;
}

export const stockItems: StockItem[] = [
  { id: '1', model: 'iPhone 14 Pro', capacity: '128GB', condition: 'Second iBox', color: 'Deep Purple', imei: '352345678901234', count: 3, price: 12500000 },
  { id: '2', model: 'iPhone 14 Pro Max', capacity: '256GB', condition: 'Second iBox', color: 'Space Black', imei: '352345678901235', count: 2, price: 14200000 },
  { id: '3', model: 'iPhone 13 Pro', capacity: '128GB', condition: 'Second Inter', color: 'Sierra Blue', imei: '352345678901236', count: 5, price: 9200000 },
  { id: '4', model: 'iPhone 13', capacity: '128GB', condition: 'Second iBox', color: 'Midnight', imei: '352345678901237', count: 4, price: 7800000 },
  { id: '5', model: 'iPhone 12 Pro Max', capacity: '256GB', condition: 'Second Ex-Inter', color: 'Gold', imei: '352345678901238', count: 2, price: 8200000 },
  { id: '6', model: 'iPhone 12', capacity: '128GB', condition: 'Second iBox', color: 'Blue', imei: '352345678901239', count: 6, price: 5800000 },
  { id: '7', model: 'iPhone 11 Pro Max', capacity: '64GB', condition: 'Second Inter', color: 'Space Gray', imei: '352345678901240', count: 3, price: 5200000 },
  { id: '8', model: 'iPhone 11', capacity: '128GB', condition: 'Second Bid', color: 'Black', imei: '352345678901241', count: 8, price: 3800000 },
  { id: '9', model: 'iPhone X', capacity: '256GB', condition: 'Second Ex-Inter', color: 'Silver', imei: '352345678901242', count: 4, price: 3200000 },
  { id: '10', model: 'iPhone XR', capacity: '128GB', condition: 'Second iBox', color: 'Coral', imei: '352345678901243', count: 5, price: 3500000 },
  { id: '11', model: 'iPhone 15 Pro', capacity: '256GB', condition: 'Baru iBox', color: 'Natural Titanium', imei: '352345678901244', count: 2, price: 18500000 },
  { id: '12', model: 'iPhone 15', capacity: '128GB', condition: 'Baru Inter', color: 'Pink', imei: '352345678901245', count: 3, price: 13200000 },
  { id: '13', model: 'iPhone 8 Plus', capacity: '64GB', condition: 'Second Bid', color: 'Gold', imei: '352345678901246', count: 7, price: 2200000 },
  { id: '14', model: 'iPhone SE 2022', capacity: '128GB', condition: 'Second iBox', color: 'Red', imei: '352345678901247', count: 4, price: 3800000 },
  { id: '15', model: 'iPhone 14', capacity: '128GB', condition: 'Second Inter', color: 'Purple', imei: '352345678901248', count: 3, price: 8900000 },
];

/* ------------------------------------------------------------------ */
/*  Accessories / Pelengkap Stock                                      */
/* ------------------------------------------------------------------ */

export interface AccessoryItem {
  id: string;
  name: string;
  category: 'charger' | 'tempered_glass' | 'case' | 'kotak' | 'paperbag';
  stock: number;
  status: 'AMAN' | 'MENIPIS' | 'HABIS';
}

export const accessoryStock: AccessoryItem[] = [
  { id: 'ACC-001', name: 'Charger', category: 'charger', stock: 24, status: 'AMAN' },
  { id: 'ACC-002', name: 'Charger O-like', category: 'charger', stock: 24, status: 'AMAN' },
  { id: 'ACC-003', name: 'Tempered Glass iPhone 11 Pro', category: 'tempered_glass', stock: 45, status: 'AMAN' },
  { id: 'ACC-004', name: 'Tempered Glass iPhone 11 Pro Max', category: 'tempered_glass', stock: 38, status: 'AMAN' },
  { id: 'ACC-005', name: 'Tempered Glass iPhone 12/12 Pro', category: 'tempered_glass', stock: 72, status: 'AMAN' },
  { id: 'ACC-006', name: 'Tempered Glass iPhone 12 mini', category: 'tempered_glass', stock: 15, status: 'MENIPIS' },
  { id: 'ACC-007', name: 'Tempered Glass iPhone 13/14/13 Pro', category: 'tempered_glass', stock: 120, status: 'AMAN' },
  { id: 'ACC-008', name: 'Tempered Glass iPhone 13 mini', category: 'tempered_glass', stock: 20, status: 'MENIPIS' },
  { id: 'ACC-009', name: 'Tempered Glass iPhone 14 Pro', category: 'tempered_glass', stock: 55, status: 'AMAN' },
  { id: 'ACC-010', name: 'Tempered Glass iPhone 15 Plus/16 Plus/13 Pro Max/14 Pro Max', category: 'tempered_glass', stock: 180, status: 'AMAN' },
  { id: 'ACC-011', name: 'Tempered Glass iPhone SE Gen 2', category: 'tempered_glass', stock: 42, status: 'AMAN' },
  { id: 'ACC-012', name: 'Tempered Glass iPhone XR/11', category: 'tempered_glass', stock: 89, status: 'AMAN' },
  { id: 'ACC-013', name: 'Case iPhone 14 Pro', category: 'case', stock: 0, status: 'HABIS' },
  { id: 'ACC-014', name: 'Kotak iPhone 11', category: 'kotak', stock: 86, status: 'AMAN' },
  { id: 'ACC-015', name: 'Kotak iPhone 12', category: 'kotak', stock: 120, status: 'AMAN' },
  { id: 'ACC-016', name: 'Kotak iPhone 13', category: 'kotak', stock: 145, status: 'AMAN' },
  { id: 'ACC-017', name: 'Kotak iPhone 14', category: 'kotak', stock: 95, status: 'AMAN' },
  { id: 'ACC-018', name: 'Kotak iPhone 15', category: 'kotak', stock: 68, status: 'AMAN' },
  { id: 'ACC-019', name: 'Kotak iPhone 15 Pro', category: 'kotak', stock: 55, status: 'AMAN' },
  { id: 'ACC-020', name: 'Kotak iPhone 15 Pro Max', category: 'kotak', stock: 42, status: 'AMAN' },
  { id: 'ACC-021', name: 'Kotak iPhone X/XS', category: 'kotak', stock: 30, status: 'AMAN' },
  { id: 'ACC-022', name: 'Kotak iPhone XR', category: 'kotak', stock: 22, status: 'AMAN' },
  { id: 'ACC-023', name: 'Paperbag Haburna Large', category: 'paperbag', stock: 316, status: 'AMAN' },
];

/* ------------------------------------------------------------------ */
/*  Service Records                                                    */
/* ------------------------------------------------------------------ */

export type ServiceStatus = 'ANTRIAN' | 'PROSES' | 'SELESAI' | 'GAGAL';
export type ServiceType = 'Customer' | 'Toko Sendiri' | 'Klaim Garansi';
export type Technician = string;

export interface ServiceRecord {
  id: string;
  customerName: string;
  phoneModel: string;
  capacity?: string;
  condition?: string;
  color?: string;
  imei?: string;
  batteryHealth?: number;
  issue: string;
  additionalNote?: string;
  status: ServiceStatus;
  estimatedCost: number;
  dp?: number;
  createdAt: string;
  completedAt?: string;
  technician?: Technician;
  serviceType: ServiceType;
  stkId?: string;
}

export const serviceRecords: ServiceRecord[] = [
  {
    id: 'SRV-001',
    customerName: 'Budi Santoso',
    phoneModel: 'iPhone 12',
    capacity: '128GB',
    condition: 'Second iBox',
    color: 'Blue',
    imei: '3523456789012395',
    batteryHealth: 82,
    issue: 'Ganti Battery. Battery health turun drastis, HP sering mati sendiri di 30%',
    additionalNote: '',
    status: 'ANTRIAN',
    estimatedCost: 450000,
    createdAt: '2026-06-24T08:30:00',
    technician: 'Zaidan',
    serviceType: 'Customer',
    stkId: 'STK-2395',
  },
  {
    id: 'SRV-002',
    customerName: 'Ani Wijaya',
    phoneModel: 'iPhone 13 Pro',
    capacity: '128GB',
    condition: 'Second Inter',
    color: 'Sierra Blue',
    imei: '3523456789012362',
    batteryHealth: 88,
    issue: 'Ganti LCD. LCD bergaris dan touch tidak responsif di bagian bawah',
    additionalNote: 'HP sudah pernah jatuh dari meja',
    status: 'PROSES',
    estimatedCost: 1200000,
    dp: 500000,
    createdAt: '2026-06-24T07:15:00',
    technician: 'Rendi',
    serviceType: 'Customer',
    stkId: 'STK-2362',
  },
  {
    id: 'SRV-003',
    customerName: 'Citra Lestari',
    phoneModel: 'iPhone 11',
    capacity: '128GB',
    condition: 'Second Bid',
    color: 'Black',
    imei: '3523456789012411',
    batteryHealth: 78,
    issue: 'Water Damage. Masuk air saat hujan, tidak bisa charge',
    additionalNote: 'Sudah dijemur 2 hari tetap tidak hidup',
    status: 'PROSES',
    estimatedCost: 850000,
    dp: 300000,
    createdAt: '2026-06-23T14:00:00',
    technician: 'Rendi',
    serviceType: 'Customer',
    stkId: 'STK-2411',
  },
  {
    id: 'SRV-004',
    customerName: 'Doni Pratama',
    phoneModel: 'iPhone 14 Pro Max',
    capacity: '256GB',
    condition: 'Second iBox',
    color: 'Space Black',
    imei: '3523456789012351',
    batteryHealth: 91,
    issue: 'Ganti Kamera Belakang. Kamera blur dan tidak bisa fokus',
    additionalNote: '',
    status: 'SELESAI',
    estimatedCost: 950000,
    createdAt: '2026-06-23T10:30:00',
    completedAt: '2026-06-24T11:48:00',
    technician: 'Fabio',
    serviceType: 'Customer',
    stkId: 'STK-2351',
  },
  {
    id: 'SRV-005',
    customerName: 'Toko',
    phoneModel: 'iPhone X',
    capacity: '256GB',
    condition: 'Second Ex-Inter',
    color: 'Silver',
    imei: '3523456789012420',
    batteryHealth: 75,
    issue: 'Face ID Error. True Depth camera malfunction',
    additionalNote: 'Unit untuk dijual setelah servis',
    status: 'ANTRIAN',
    estimatedCost: 600000,
    createdAt: '2026-06-24T09:00:00',
    technician: 'Zaidan',
    serviceType: 'Toko Sendiri',
    stkId: 'STK-2420',
  },
  {
    id: 'SRV-006',
    customerName: 'Fajar Nugroho',
    phoneModel: 'iPhone 12 Mini',
    capacity: '64GB',
    condition: 'Second iBox',
    color: 'White',
    imei: '3523456789012500',
    batteryHealth: 80,
    issue: 'Ganti Charging Port. Tidak bisa di cas dengan kabel original',
    additionalNote: '',
    status: 'PROSES',
    estimatedCost: 350000,
    createdAt: '2026-06-24T06:45:00',
    technician: 'Fabio',
    serviceType: 'Customer',
    stkId: 'STK-2500',
  },
  {
    id: 'SRV-007',
    customerName: 'Gita Amanda',
    phoneModel: 'iPhone 13',
    capacity: '128GB',
    condition: 'Second iBox',
    color: 'Midnight',
    imei: '3523456789012371',
    batteryHealth: 89,
    issue: 'Speaker Mati. Tidak ada suara saat telepon dan media',
    additionalNote: '',
    status: 'SELESAI',
    estimatedCost: 400000,
    createdAt: '2026-06-23T13:00:00',
    completedAt: '2026-06-24T10:15:00',
    technician: 'Zaidan',
    serviceType: 'Customer',
    stkId: 'STK-2371',
  },
  {
    id: 'SRV-008',
    customerName: 'Hadi Sucipto',
    phoneModel: 'iPhone 11 Pro',
    capacity: '64GB',
    condition: 'Second Inter',
    color: 'Space Gray',
    imei: '3523456789012400',
    batteryHealth: 76,
    issue: 'Ganti Battery + LCD. LCD retak dan battery kembung',
    additionalNote: 'Budget terbatas, pakai part OEM aja',
    status: 'GAGAL',
    estimatedCost: 1500000,
    dp: 500000,
    createdAt: '2026-06-22T09:30:00',
    completedAt: '2026-06-23T16:00:00',
    technician: 'Toko Lain',
    serviceType: 'Customer',
    stkId: 'STK-2400',
  },
  {
    id: 'SRV-009',
    customerName: 'Toko',
    phoneModel: 'iPhone 14',
    capacity: '128GB',
    condition: 'Second Inter',
    color: 'Purple',
    imei: '3523456789012480',
    batteryHealth: 93,
    issue: 'Back Glass Pecah. Perlu ganti kaca belakang',
    additionalNote: 'Unit untuk display etalase',
    status: 'ANTRIAN',
    estimatedCost: 700000,
    createdAt: '2026-06-24T09:45:00',
    technician: 'Fabio',
    serviceType: 'Toko Sendiri',
    stkId: 'STK-2480',
  },
  {
    id: 'SRV-010',
    customerName: 'Joko Widodo',
    phoneModel: 'iPhone XR',
    capacity: '128GB',
    condition: 'Second iBox',
    color: 'Coral',
    imei: '3523456789012432',
    batteryHealth: 84,
    issue: 'Ganti Battery. Battery health 78%, sering shutdown',
    additionalNote: '',
    status: 'PROSES',
    estimatedCost: 400000,
    createdAt: '2026-06-23T11:00:00',
    technician: 'Rendi',
    serviceType: 'Customer',
    stkId: 'STK-2432',
  },
  {
    id: 'SRV-011',
    customerName: 'Kartika Sari',
    phoneModel: 'iPhone 12 Pro',
    capacity: '256GB',
    condition: 'Second Ex-Inter',
    color: 'Gold',
    imei: '3523456789012381',
    batteryHealth: 86,
    issue: 'Network Issue. Sering no service di area sinyal kuat',
    additionalNote: 'Sudah coba ganti SIM card tetap sama',
    status: 'SELESAI',
    estimatedCost: 550000,
    createdAt: '2026-06-22T10:00:00',
    completedAt: '2026-06-23T14:30:00',
    technician: 'Zaidan',
    serviceType: 'Customer',
    stkId: 'STK-2381',
  },
  {
    id: 'SRV-012',
    customerName: 'Lukman Hakim',
    phoneModel: 'iPhone SE 2022',
    capacity: '128GB',
    condition: 'Second iBox',
    color: 'Red',
    imei: '3523456789012471',
    batteryHealth: 90,
    issue: 'Tombol Home Macet. Tidak bisa click, fingerprint masih works',
    additionalNote: '',
    status: 'ANTRIAN',
    estimatedCost: 250000,
    createdAt: '2026-06-24T10:00:00',
    technician: 'Rendi',
    serviceType: 'Customer',
    stkId: 'STK-2471',
  },
  {
    id: 'SRV-013',
    customerName: 'Toko',
    phoneModel: 'iPhone 11',
    capacity: '64GB',
    condition: 'Second Bid',
    color: 'White',
    imei: '3523456789012417',
    batteryHealth: 72,
    issue: 'Ganti LCD + Battery. LCD shadow dan battery kembung',
    additionalNote: 'Unit stok lama, perlu refresh sebelum jual',
    status: 'PROSES',
    estimatedCost: 800000,
    createdAt: '2026-06-24T08:00:00',
    technician: 'Toko Lain',
    serviceType: 'Toko Sendiri',
    stkId: 'STK-2417',
  },
  {
    id: 'SRV-014',
    customerName: 'Maya Anggraini',
    phoneModel: 'iPhone 13',
    capacity: '256GB',
    condition: 'Second iBox',
    color: 'Starlight',
    imei: '3523456789012375',
    batteryHealth: 87,
    issue: 'Ganti Kaca Camera. Lensa kaca belakang pecah',
    additionalNote: 'Kamera masih bisa foto dengan jelas',
    status: 'ANTRIAN',
    estimatedCost: 350000,
    createdAt: '2026-06-24T11:30:00',
    technician: 'Fabio',
    serviceType: 'Customer',
    stkId: 'STK-2375',
  },
  {
    id: 'SRV-015',
    customerName: 'Nina Septiani',
    phoneModel: 'iPhone 14 Pro',
    capacity: '128GB',
    condition: 'Second iBox',
    color: 'Deep Purple',
    imei: '3523456789012341',
    batteryHealth: 94,
    issue: 'Dynamic Island Mati. Black spot di pill area',
    additionalNote: 'Klaim garansi 30 hari — beli tanggal 25 Mei 2026',
    status: 'PROSES',
    estimatedCost: 0,
    createdAt: '2026-06-24T07:00:00',
    technician: 'Zaidan',
    serviceType: 'Klaim Garansi',
    stkId: 'STK-2341',
  },
  {
    id: 'SRV-016',
    customerName: 'Toko',
    phoneModel: 'iPhone 12',
    capacity: '64GB',
    condition: 'Second iBox',
    color: 'Green',
    imei: '3523456789012397',
    batteryHealth: 81,
    issue: 'Ganti Speaker. Suara pecah saat volume max',
    additionalNote: '',
    status: 'PROSES',
    estimatedCost: 280000,
    createdAt: '2026-06-23T09:30:00',
    technician: 'Rendi',
    serviceType: 'Toko Sendiri',
    stkId: 'STK-2397',
  },
  {
    id: 'SRV-017',
    customerName: 'Oscar Pratama',
    phoneModel: 'iPhone 13 Pro Max',
    capacity: '256GB',
    condition: 'Second iBox',
    color: 'Sierra Blue',
    imei: '3523456789012368',
    batteryHealth: 90,
    issue: 'Ganti Battery. BH 78% butuh refresh',
    additionalNote: '',
    status: 'SELESAI',
    estimatedCost: 500000,
    createdAt: '2026-06-22T11:00:00',
    completedAt: '2026-06-23T15:00:00',
    technician: 'Fabio',
    serviceType: 'Customer',
    stkId: 'STK-2368',
  },
  {
    id: 'SRV-018',
    customerName: 'Putri Handayani',
    phoneModel: 'iPhone 11',
    capacity: '128GB',
    condition: 'Second Bid',
    color: 'Purple',
    imei: '3523456789012413',
    batteryHealth: 83,
    issue: 'Ganti Tombol Volume. Volume up tidak respons',
    additionalNote: '',
    status: 'ANTRIAN',
    estimatedCost: 200000,
    createdAt: '2026-06-24T12:00:00',
    technician: 'Zaidan',
    serviceType: 'Customer',
    stkId: 'STK-2413',
  },
  {
    id: 'SRV-019',
    customerName: 'Toko',
    phoneModel: 'iPhone XR',
    capacity: '64GB',
    condition: 'Second iBox',
    color: 'Blue',
    imei: '3523456789012436',
    batteryHealth: 79,
    issue: 'Ganti LCD. LCD bergaris horizontal',
    additionalNote: 'Stok display unit',
    status: 'ANTRIAN',
    estimatedCost: 450000,
    createdAt: '2026-06-24T10:30:00',
    technician: 'Toko Lain',
    serviceType: 'Toko Sendiri',
    stkId: 'STK-2436',
  },
  {
    id: 'SRV-020',
    customerName: 'Rina Susanti',
    phoneModel: 'iPhone 15 Pro',
    capacity: '256GB',
    condition: 'Baru iBox',
    color: 'Natural Titanium',
    imei: '3523456789012441',
    batteryHealth: 100,
    issue: 'Tombol Action Mati. Tidak bisa klik, keluar garansi 1 tahun',
    additionalNote: 'Beli tanggal 1 Juni 2026',
    status: 'PROSES',
    estimatedCost: 0,
    createdAt: '2026-06-24T06:00:00',
    technician: 'Rendi',
    serviceType: 'Klaim Garansi',
    stkId: 'STK-2441',
  },
];

/* ------------------------------------------------------------------ */
/*  Purchase History (for warranty claim lookup)                       */
/* ------------------------------------------------------------------ */

export interface PurchaseRecord {
  id: string;
  imei: string;
  customerName: string;
  customerPhone: string;
  phoneModel: string;
  capacity: string;
  condition: string;
  color: string;
  batteryHealth: number;
  salePrice: number;
  warranty: string;
  purchaseDate: string;
  notes?: string;
}

export const purchaseHistory: PurchaseRecord[] = [
  {
    id: 'JUAL-20260525-001',
    imei: '3523456789012341',
    customerName: 'Nina Septiani',
    customerPhone: '081234567891',
    phoneModel: 'iPhone 14 Pro',
    capacity: '128GB',
    condition: 'Second iBox',
    color: 'Deep Purple',
    batteryHealth: 94,
    salePrice: 12500000,
    warranty: '30 Hari',
    purchaseDate: '2026-05-25',
    notes: 'Garansi 30 hari aktif',
  },
  {
    id: 'JUAL-20260601-002',
    imei: '3523456789012441',
    customerName: 'Rina Susanti',
    customerPhone: '081234567892',
    phoneModel: 'iPhone 15 Pro',
    capacity: '256GB',
    condition: 'Baru iBox',
    color: 'Natural Titanium',
    batteryHealth: 100,
    salePrice: 18500000,
    warranty: '1 Tahun',
    purchaseDate: '2026-06-01',
    notes: 'Garansi 1 tahun penuh',
  },
  {
    id: 'JUAL-20260610-003',
    imei: '3523456789012371',
    customerName: 'Gita Amanda',
    customerPhone: '081234567893',
    phoneModel: 'iPhone 13',
    capacity: '128GB',
    condition: 'Second iBox',
    color: 'Midnight',
    batteryHealth: 89,
    salePrice: 7800000,
    warranty: '7 Hari',
    purchaseDate: '2026-06-10',
    notes: 'Garansi sudah lewat',
  },
  {
    id: 'JUAL-20260615-004',
    imei: '3523456789012351',
    customerName: 'Doni Pratama',
    customerPhone: '081234567894',
    phoneModel: 'iPhone 14 Pro Max',
    capacity: '256GB',
    condition: 'Second iBox',
    color: 'Space Black',
    batteryHealth: 91,
    salePrice: 14200000,
    warranty: '90 Hari',
    purchaseDate: '2026-06-15',
    notes: 'Garansi 90 hari aktif',
  },
  {
    id: 'JUAL-20260620-005',
    imei: '3523456789012411',
    customerName: 'Citra Lestari',
    customerPhone: '081234567895',
    phoneModel: 'iPhone 11',
    capacity: '128GB',
    condition: 'Second Bid',
    color: 'Black',
    batteryHealth: 78,
    salePrice: 3800000,
    warranty: 'No Garansi',
    purchaseDate: '2026-06-20',
    notes: 'Tanpa garansi',
  },
];

/* ------------------------------------------------------------------ */
/*  Transactions & Stats                                               */
/* ------------------------------------------------------------------ */

export type TransactionType = 'Penjualan' | 'Pembelian' | 'Servis' | 'Pengeluaran' | 'Tukar Tambah';

export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  detail: string;
  amount: number | null;
  time: string;
  color: string;
}

export const recentTransactions: Transaction[] = [
  { id: 'TX-001', type: 'Penjualan', description: 'Penjualan', detail: 'iPhone 14 Pro 128GB Second iBox', amount: 12500000, time: '14:32', color: '#14B8A6' },
  { id: 'TX-002', type: 'Pembelian', description: 'Pembelian', detail: 'iPhone 11 128GB Second Inter (2 unit)', amount: 5400000, time: '13:15', color: '#D4A574' },
  { id: 'TX-003', type: 'Servis', description: 'Servis Selesai', detail: 'iPhone 12 — Ganti Battery', amount: null, time: '11:48', color: '#10B981' },
  { id: 'TX-004', type: 'Pengeluaran', description: 'Pengeluaran', detail: 'Beli galon + bayar listrik', amount: 185000, time: '10:22', color: '#334155' },
  { id: 'TX-005', type: 'Tukar Tambah', description: 'Tukar Tambah', detail: 'iPhone X → iPhone 13 Pro', amount: 3200000, time: '09:05', color: '#0D9488' },
  { id: 'TX-006', type: 'Penjualan', description: 'Penjualan', detail: 'iPhone 13 128GB Second iBox', amount: 8200000, time: '08:45', color: '#14B8A6' },
  { id: 'TX-007', type: 'Pembelian', description: 'Pembelian', detail: 'iPhone XR 128GB Second iBox (3 unit)', amount: 10500000, time: '08:20', color: '#D4A574' },
  { id: 'TX-008', type: 'Pengeluaran', description: 'Pengeluaran', detail: 'Beli part LCD iPhone 12', amount: 650000, time: '07:55', color: '#334155' },
];

export interface DailyStat {
  label: string;
  icon: string;
  value: number;
  prefix: string;
  suffix: string;
  color: string;
}

export const dailyStats: DailyStat[] = [
  { label: 'Total Penjualan', icon: 'TrendingUp', value: 24500000, prefix: 'Rp ', suffix: '', color: '#14B8A6' },
  { label: 'Total Pembelian', icon: 'ShoppingBag', value: 18200000, prefix: 'Rp ', suffix: '', color: '#D4A574' },
  { label: 'Servis Selesai', icon: 'CheckCircle', value: 6, prefix: '', suffix: '', color: '#10B981' },
  { label: 'Total Pengeluaran', icon: 'Receipt', value: 850000, prefix: 'Rp ', suffix: '', color: '#334155' },
];

export interface MiniStat {
  label: string;
  icon: string;
  value: number;
  unit: string;
  color: string;
}

export const miniStats: MiniStat[] = [
  { label: 'Penjualan', icon: 'TrendingUp', value: 12, unit: 'Hari Ini', color: '#14B8A6' },
  { label: 'Pembelian', icon: 'ShoppingBag', value: 5, unit: 'Hari Ini', color: '#D4A574' },
  { label: 'Servis Aktif', icon: 'Wrench', value: 8, unit: 'Dalam Proses', color: '#8B5CF6' },
  { label: 'Stok Ready', icon: 'Package', value: 247, unit: 'Unit', color: '#10B981' },
];

export const inventorySubItems = [
  { label: 'Stok HP', icon: 'Smartphone', description: 'Lihat unit + recovery + disposisi', href: '/stok?tab=hp' },
  { label: 'Pelengkap', icon: 'Plug', description: 'Charger, TG, case, kotak, paperbag', href: '/stok?tab=pelengkap' },
  { label: 'Sparepart', icon: 'Cpu', description: 'Untuk kebutuhan servis', href: '/stok?tab=sparepart' },
  { label: 'Cek Integritas Stok', icon: 'ShieldCheck', description: 'Deteksi anomali: unit hantu, IMEI ganda, orphan', href: '/stok?tab=integritas' },
];

/* ------------------------------------------------------------------ */
/*  Agents (Piutang/Hutang)                                           */
/* ------------------------------------------------------------------ */

export interface Agent {
  id: string;
  name: string;
  code: string;
  phone: string;
  note: string;
  lastTransactionAt: string | null;
}

export type AgentTransactionType = 'Stor/Bayar' | 'Koreksi' | 'Penyesuaian';
export type AgentPaymentMethod = 'Cash' | 'Transfer';

export interface AgentTransaction {
  id: string;
  agentId: string;
  type: AgentTransactionType;
  amount: number;
  method: AgentPaymentMethod;
  note: string;
  createdAt: string;
}

export const agents: Agent[] = [
  {
    id: 'AGN-001',
    name: 'DOPON',
    code: 'AGN-001',
    phone: '6288225688370',
    note: 'Agen utama',
    lastTransactionAt: '2026-06-19T14:38:24',
  },
  {
    id: 'AGN-002',
    name: 'BELUM',
    code: 'AGN-002',
    phone: '6287763621945',
    note: 'Placeholder/template',
    lastTransactionAt: null,
  },
  {
    id: 'AGN-003',
    name: 'ADA',
    code: 'AGN-003',
    phone: '6287763621945',
    note: 'Placeholder/template',
    lastTransactionAt: null,
  },
];

export const agentTransactions: AgentTransaction[] = [
  {
    id: 'AGN-TX-20260619-001',
    agentId: 'AGN-001',
    type: 'Stor/Bayar',
    amount: 50000000,
    method: 'Transfer',
    note: 'Stor bulan Juni',
    createdAt: '2026-06-19T14:38:24',
  },
  {
    id: 'AGN-TX-20260618-002',
    agentId: 'AGN-001',
    type: 'Penyesuaian',
    amount: 2728635,
    method: 'Cash',
    note: 'Penyesuaian saldo',
    createdAt: '2026-06-18T10:15:00',
  },
  {
    id: 'AGN-TX-20260617-003',
    agentId: 'AGN-001',
    type: 'Koreksi',
    amount: 121000000,
    method: 'Transfer',
    note: 'Koreksi hutang awal',
    createdAt: '2026-06-17T09:00:00',
  },
];

export function getAgentBalance(agentId: string): number {
  return agentTransactions
    .filter((tx) => tx.agentId === agentId)
    .reduce((sum, tx) => sum + tx.amount, 0);
}

export function getTotalAgentDebt(): number {
  return agents.reduce((sum, agent) => sum + getAgentBalance(agent.id), 0);
}

export function getAgentTransactions(agentId: string): AgentTransaction[] {
  return agentTransactions
    .filter((tx) => tx.agentId === agentId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function formatAgentPhone(phone: string): string {
  if (phone.startsWith('62')) {
    return `+62 ${phone.slice(2)}`;
  }
  return phone;
}
