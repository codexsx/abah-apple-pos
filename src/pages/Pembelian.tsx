import { useState, useMemo, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Info,
  ChevronDown,
  Banknote,
  CreditCard,
  RotateCcw,
  Save,
  Plus,
  Minus,
  AlertTriangle,
  Check,
  X,
  Upload,
} from 'lucide-react';
import AccountPicker from '@/components/AccountPicker';
import AgentDefectImportDialog from '@/components/AgentDefectImportDialog';
import {
  getAccountPickerData,
  type AccountWithBalance,
} from '@/services/accounts';
import {
  deriveDirection,
  buildPostings,
  validatePaymentSelection,
} from '@/services/paymentPosting';
import {
  recordAccessoryPurchaseWithPostings,
  recordPurchaseWithPostings,
} from '@/services/postings';
import { getStockItems } from '@/services/stock';
import { getAgents, type Agent } from '@/services/agents';
import {
  ACCESSORY_CATEGORIES,
  type AccessoryCategory,
} from '@/services/accessoryCore';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SupplierType = 'perorangan' | 'agen' | 'toko';
type PurchaseDataMode = 'full' | 'quantity' | 'color';

interface UnitEntry {
  id: number;
  imei: string;
  price: string;
  sellPrice: string;
  batteryHealth: number;
  chargerIncluded: boolean;
  boxIncluded: boolean;
}

interface ColorStockEntry {
  id: number;
  color: string;
  quantity: string;
  costPrice: string;
  sellPrice: string;
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const phoneModels = [
  'iPhone 8 Plus',
  'iPhone 11',
  'iPhone 11 Pro',
  'iPhone 12',
  'iPhone 12 Pro',
  'iPhone 12 Pro Max',
  'iPhone 13',
  'iPhone 13 Pro',
  'iPhone 14',
  'iPhone 14 Pro',
  'iPhone 14 Pro Max',
  'iPhone 15',
  'iPhone 15 Pro',
  'iPhone 15 Pro Max',
  'iPhone SE 2022',
  'iPhone X',
  'iPhone XR',
];

const capacities = ['64GB', '128GB', '256GB', '512GB', '1TB'];

const conditions = [
  'Second iBox',
  'Second Inter Unlock',
  'Second Inter SimLock',
  'Second Inter Unlock Minus',
  'Baru iBox',
  'Baru Inter',
];

const colorMap: Record<string, string[]> = {
  'iPhone 11': ['Black', 'White', 'Red', 'Green', 'Yellow', 'Purple'],
  'iPhone 11 Pro': ['Space Gray', 'Silver', 'Gold', 'Midnight Green'],
  'iPhone 12': ['Black', 'White', 'Red', 'Green', 'Blue', 'Purple'],
  'iPhone 12 Pro': ['Graphite', 'Silver', 'Gold', 'Pacific Blue'],
  'iPhone 12 Pro Max': ['Graphite', 'Silver', 'Gold', 'Pacific Blue'],
  'iPhone 13': ['Midnight', 'Starlight', 'Blue', 'Pink', 'Green', 'Red'],
  'iPhone 13 Pro': ['Sierra Blue', 'Silver', 'Gold', 'Graphite', 'Alpine Green'],
  'iPhone 14': ['Midnight', 'Starlight', 'Blue', 'Purple', 'Yellow', 'Red', 'Green'],
  'iPhone 14 Pro': ['Space Black', 'Silver', 'Gold', 'Deep Purple'],
  'iPhone 14 Pro Max': ['Space Black', 'Silver', 'Gold', 'Deep Purple'],
  'iPhone 15': ['Pink', 'Yellow', 'Green', 'Blue', 'Black'],
  'iPhone 15 Pro': ['Natural Titanium', 'Blue Titanium', 'White Titanium', 'Black Titanium'],
  'iPhone 15 Pro Max': ['Natural Titanium', 'Blue Titanium', 'White Titanium', 'Black Titanium'],
  'iPhone X': ['Space Gray', 'Silver'],
  'iPhone XR': ['Black', 'White', 'Red', 'Blue', 'Coral', 'Yellow'],
  'iPhone 8 Plus': ['Space Gray', 'Silver', 'Gold', 'Red'],
  'iPhone SE 2022': ['Midnight', 'Starlight', 'Red'],
};

const supplierPlaceholders: Record<SupplierType, string> = {
  perorangan: 'Pak Tono',
  agen: 'PT iPhone Indonesia',
  toko: 'Toko Sebelah',
};

const accessoryCategoryLabels: Record<AccessoryCategory, string> = {
  charger: 'Charger',
  tempered_glass: 'Tempered Glass',
  case: 'Case',
  kotak: 'Kotak',
  paperbag: 'Paperbag',
};

/* ------------------------------------------------------------------ */
/*  Animation                                                          */
/* ------------------------------------------------------------------ */

const easeSmooth = [0.16, 1, 0.3, 1] as [number, number, number, number];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: easeSmooth },
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatPrice(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID');
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function parseMoney(value: string): number {
  return Number(onlyDigits(value)) || 0;
}

function formatMoneyInput(value: string): string {
  const digits = onlyDigits(value);
  return digits ? `Rp ${digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}` : '';
}

function isMinusCondition(condition: string): boolean {
  return /minus/i.test(condition);
}

function getSliderTrackColor(val: number): string {
  if (val >= 80) return 'accent-emerald-500';
  if (val >= 50) return 'accent-amber-500';
  return 'accent-rose-500';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Pembelian() {
  const navigate = useNavigate();
  const location = useLocation();

  /* -- Section 1: Supplier -- */
  const [supplierType, setSupplierType] = useState<SupplierType>('perorangan');
  const [supplierName, setSupplierName] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState<string | null>(null);

  /* -- Section 2: Batch Specs -- */
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedCapacity, setSelectedCapacity] = useState('');
  const [selectedCondition, setSelectedCondition] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [quantity, setQuantity] = useState(1);

  /* -- Section 3: Unit Entries -- */
  const [purchaseDataMode, setPurchaseDataMode] = useState<PurchaseDataMode>('full');
  const [unitEntries, setUnitEntries] = useState<UnitEntry[]>([
    { id: 1, imei: '', price: '', sellPrice: '', batteryHealth: 85, chargerIncluded: false, boxIncluded: false },
  ]);
  const [bulkQuantity, setBulkQuantity] = useState('1');
  const [bulkTotalCost, setBulkTotalCost] = useState('');
  const [bulkSellPrice, setBulkSellPrice] = useState('');
  const [colorStockEntries, setColorStockEntries] = useState<ColorStockEntry[]>([
    { id: 1, color: '', quantity: '1', costPrice: '', sellPrice: '' },
  ]);

  /* -- Section 4: Payment -- */
  const [cashAmount, setCashAmount] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [useAgentDebt, setUseAgentDebt] = useState(false);
  const [showAgentImport, setShowAgentImport] = useState(false);

  /* -- Account selection (Phase 2 ledger wiring) -- */
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [cashAccount, setCashAccount] = useState<AccountWithBalance | null>(null);
  const [transferAccount, setTransferAccount] = useState<AccountWithBalance | null>(null);

  /* -- Accessory/pelengkap purchase modal -- */
  const [showAccessoryPurchase, setShowAccessoryPurchase] = useState(false);
  const [accessoryName, setAccessoryName] = useState('');
  const [accessoryCategory, setAccessoryCategory] = useState<AccessoryCategory>('charger');
  const [accessoryQty, setAccessoryQty] = useState('1');
  const [accessoryUnitCost, setAccessoryUnitCost] = useState('');
  const [accessoryMinStock, setAccessoryMinStock] = useState('0');
  const [accessoryCashAmount, setAccessoryCashAmount] = useState('');
  const [accessoryTransferAmount, setAccessoryTransferAmount] = useState('');
  const [accessoryCashAccount, setAccessoryCashAccount] = useState<AccountWithBalance | null>(null);
  const [accessoryTransferAccount, setAccessoryTransferAccount] = useState<AccountWithBalance | null>(null);
  const [accessorySaving, setAccessorySaving] = useState(false);
  const [accessorySaveError, setAccessorySaveError] = useState<string | null>(null);

  /* -- Save lifecycle -- */
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  /* -- Live stock IMEIs for the "sudah ada di stok" duplicate check -- */
  const [existingImeis, setExistingImeis] = useState<Set<string>>(new Set());

  const refreshExistingImeis = useCallback(async () => {
    const items = await getStockItems();
    const imeis = items
      .map((s) => s.imei)
      .filter((i): i is string => !!i);
    setExistingImeis(new Set(imeis));
  }, []);

  useEffect(() => {
    let active = true;
    getStockItems()
      .then((items) => {
        if (!active) return;
        const imeis = items
          .map((s) => s.imei)
          .filter((i): i is string => !!i);
        setExistingImeis(new Set(imeis));
      })
      .catch(() => {
        if (!active) return;
        setExistingImeis(new Set());
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setAgentsLoading(true);
    setAgentsError(null);
    getAgents()
      .then((data) => {
        if (!active) return;
        setAgents(data);
      })
      .catch((err) => {
        console.error('[Pembelian] agents load error:', err);
        if (!active) return;
        setAgents([]);
        setAgentsError('Daftar agen tidak dapat dimuat');
      })
      .finally(() => {
        if (active) setAgentsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getAccountPickerData()
      .then((data) => {
        if (active) setAccounts(data);
      })
      .catch(() => {
        // Picker simply shows its empty-state if accounts can't be loaded.
      });
    return () => {
      active = false;
    };
  }, []);

  /* -- Dropdown open states -- */
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  /* -- derived -- */
  const availableColors = useMemo(() => {
    if (!selectedModel) return [];
    return colorMap[selectedModel] || [];
  }, [selectedModel]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const activeDataMode: PurchaseDataMode = supplierType === 'agen' ? purchaseDataMode : 'full';
  const usesFullUnitData = activeDataMode === 'full';
  const usesQuantityOnlyData = activeDataMode === 'quantity';
  const usesColorGroupedData = activeDataMode === 'color';
  const minusBatch = isMinusCondition(selectedCondition);

  const fullModeTotalCost = useMemo(
    () => unitEntries.reduce((sum, u) => sum + parseMoney(u.price), 0),
    [unitEntries],
  );

  const bulkQuantityNum = Number(onlyDigits(bulkQuantity)) || 0;
  const bulkTotalCostNum = parseMoney(bulkTotalCost);
  const bulkSellPriceNum = parseMoney(bulkSellPrice);
  const bulkAverageCost = bulkQuantityNum > 0
    ? Math.round(bulkTotalCostNum / bulkQuantityNum)
    : 0;

  const colorStockRows = useMemo(
    () => colorStockEntries.map((entry) => ({
      ...entry,
      quantityNum: Number(onlyDigits(entry.quantity)) || 0,
      costPriceNum: parseMoney(entry.costPrice),
      sellPriceNum: parseMoney(entry.sellPrice),
    })),
    [colorStockEntries],
  );

  const colorModeTotalCost = useMemo(
    () => colorStockRows.reduce((sum, row) => sum + row.quantityNum * row.costPriceNum, 0),
    [colorStockRows],
  );

  const displayQuantity = useMemo(() => {
    if (usesQuantityOnlyData) return bulkQuantityNum;
    if (usesColorGroupedData) {
      return colorStockRows.reduce((sum, row) => sum + row.quantityNum, 0);
    }
    return quantity;
  }, [usesQuantityOnlyData, usesColorGroupedData, bulkQuantityNum, colorStockRows, quantity]);

  const totalCost = useMemo(() => {
    if (usesQuantityOnlyData) return bulkTotalCostNum;
    if (usesColorGroupedData) return colorModeTotalCost;
    return fullModeTotalCost;
  }, [usesQuantityOnlyData, usesColorGroupedData, bulkTotalCostNum, colorModeTotalCost, fullModeTotalCost]);

  const cashNum = parseMoney(cashAmount);
  const transferNum = parseMoney(transferAmount);
  const paymentTotal = cashNum + transferNum;
  const unpaidAmount = Math.max(0, totalCost - paymentTotal);
  const agentDebtAmount = supplierType === 'agen' && useAgentDebt
    ? unpaidAmount
    : 0;

  const accessoryQtyNum = Number(onlyDigits(accessoryQty)) || 0;
  const accessoryUnitCostNum = parseMoney(accessoryUnitCost);
  const accessoryMinStockNum = Number(onlyDigits(accessoryMinStock)) || 0;
  const accessoryTotal = accessoryQtyNum * accessoryUnitCostNum;
  const accessoryCashNum = parseMoney(accessoryCashAmount);
  const accessoryTransferNum = parseMoney(accessoryTransferAmount);
  const accessoryPaymentTotal = accessoryCashNum + accessoryTransferNum;

  const accessorySubmitHint = useMemo(() => {
    if (!accessoryName.trim()) return 'Isi nama pelengkap dulu';
    if (accessoryQtyNum <= 0) return 'Isi jumlah beli pelengkap';
    if (accessoryUnitCostNum <= 0) return 'Isi modal per pcs';
    if (accessoryPaymentTotal <= 0) return 'Isi pembayaran pelengkap';
    if (accessoryPaymentTotal !== accessoryTotal) return 'Pembayaran harus sama dengan total modal';
    if (accessoryCashNum > 0 && !accessoryCashAccount) return 'Pilih akun kas untuk porsi cash';
    if (accessoryTransferNum > 0 && !accessoryTransferAccount) return 'Pilih akun bank untuk porsi transfer';
    return null;
  }, [
    accessoryName,
    accessoryQtyNum,
    accessoryUnitCostNum,
    accessoryPaymentTotal,
    accessoryTotal,
    accessoryCashNum,
    accessoryTransferNum,
    accessoryCashAccount,
    accessoryTransferAccount,
  ]);

  const canSubmitAccessoryPurchase = accessorySubmitHint === null;

  const allImeis = useMemo(() => {
    const imeis = unitEntries.map((u) => u.imei).filter((i) => i.length === 15);
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const imei of imeis) {
      if (seen.has(imei)) duplicates.add(imei);
      seen.add(imei);
    }
    return { duplicates, all: seen };
  }, [unitEntries]);

  const canSubmit = useMemo(() => {
    if (supplierType === 'agen') {
      if (agentsLoading || agentsError || !selectedAgentId || !selectedAgent) return false;
    } else if (!supplierName.trim()) {
      return false;
    }
    if (!selectedModel || !selectedCapacity || !selectedCondition) return false;
    if (usesFullUnitData) {
      if (!selectedColor) return false;
      if (unitEntries.length === 0) return false;
      for (const u of unitEntries) {
        if (u.imei.length !== 15) return false;
        if (!u.price || parseMoney(u.price) <= 0) return false;
        // Harga jual is optional, but if entered it must be a positive amount.
        if (u.sellPrice && parseMoney(u.sellPrice) <= 0) return false;
        if (allImeis.duplicates.has(u.imei)) return false;
        if (existingImeis.has(u.imei)) return false;
      }
    } else {
      if (minusBatch) return false;
      if (usesQuantityOnlyData) {
        if (bulkQuantityNum <= 0 || bulkTotalCostNum <= 0) return false;
        if (bulkSellPrice && bulkSellPriceNum <= 0) return false;
      }
      if (usesColorGroupedData) {
        if (colorStockRows.length === 0) return false;
        for (const row of colorStockRows) {
          if (!row.color) return false;
          if (row.quantityNum <= 0 || row.costPriceNum <= 0) return false;
          if (row.sellPrice && row.sellPriceNum <= 0) return false;
        }
      }
    }
    // A non-zero payment portion needs its matching account chosen (Req 1.1, 1.2).
    if (cashNum > 0 && !cashAccount) return false;
    if (transferNum > 0 && !transferAccount) return false;
    if (supplierType === 'agen' && paymentTotal < totalCost && !useAgentDebt) return false;
    // Payment is OPTIONAL: a purchase may be saved unpaid (credit/hutang) — the
    // stock still enters inventory; cash/bank only moves when a payment is entered.
    return true;
  }, [supplierType, supplierName, agentsLoading, agentsError, selectedAgentId, selectedAgent, selectedModel, selectedCapacity, selectedCondition, usesFullUnitData, selectedColor, unitEntries, allImeis, existingImeis, minusBatch, usesQuantityOnlyData, bulkQuantityNum, bulkTotalCostNum, bulkSellPrice, bulkSellPriceNum, usesColorGroupedData, colorStockRows, cashNum, transferNum, cashAccount, transferAccount, paymentTotal, totalCost, useAgentDebt]);

  /**
   * First unmet requirement, in the same order as `canSubmit`, surfaced near the
   * Simpan button so the user always knows WHY they can't submit yet (instead of
   * a silently-disabled button that feels like "no endpoint").
   */
  const submitHint = useMemo(() => {
    if (supplierType === 'agen') {
      if (agentsLoading) return 'Memuat daftar agen';
      if (agentsError) return agentsError;
      if (agents.length === 0) return 'Tambah agen dulu di menu Agen';
      if (!selectedAgentId || !selectedAgent) return 'Pilih agen penjual dulu';
    } else if (!supplierName.trim()) {
      return 'Isi nama penjual dulu';
    }
    if (!selectedModel || !selectedCapacity || !selectedCondition)
      return 'Lengkapi spesifikasi (tipe, kapasitas, kondisi)';
    if (usesFullUnitData) {
      if (!selectedColor) return 'Lengkapi warna unit';
      for (const u of unitEntries) {
        if (u.imei.length !== 15) return 'IMEI tiap unit harus 15 digit';
        if (!u.price || parseMoney(u.price) <= 0) return 'Isi Harga Modal tiap unit';
        if (u.sellPrice && parseMoney(u.sellPrice) <= 0) return 'Harga Jual tidak boleh 0';
        if (allImeis.duplicates.has(u.imei)) return 'Ada IMEI duplikat antar unit';
        if (existingImeis.has(u.imei)) return 'Ada IMEI yang sudah ada di stok';
      }
    } else {
      if (minusBatch) return 'Mode tanpa IMEI hanya untuk unit mulus/non-minus';
      if (usesQuantityOnlyData) {
        if (bulkQuantityNum <= 0) return 'Isi Jumlah Stok';
        if (bulkTotalCostNum <= 0) return 'Isi Total Modal';
        if (bulkSellPrice && bulkSellPriceNum <= 0) return 'Harga Jual / Unit tidak boleh 0';
      }
      if (usesColorGroupedData) {
        for (const row of colorStockRows) {
          if (!row.color) return 'Pilih Warna Stok';
          if (row.quantityNum <= 0) return 'Isi Jumlah Unit';
          if (row.costPriceNum <= 0) return 'Isi Modal per Unit';
          if (row.sellPrice && row.sellPriceNum <= 0) return 'Harga Jual / Unit tidak boleh 0';
        }
      }
    }
    if (cashNum > 0 && !cashAccount) return 'Pilih akun kas untuk porsi cash';
    if (transferNum > 0 && !transferAccount) return 'Pilih akun bank untuk porsi transfer';
    if (supplierType === 'agen' && paymentTotal < totalCost && !useAgentDebt)
      return 'Centang Hutang ke Agen untuk sisa pembayaran';
    return null;
  }, [supplierType, supplierName, agentsLoading, agentsError, agents.length, selectedAgentId, selectedAgent, selectedModel, selectedCapacity, selectedCondition, usesFullUnitData, selectedColor, unitEntries, allImeis, existingImeis, minusBatch, usesQuantityOnlyData, bulkQuantityNum, bulkTotalCostNum, bulkSellPrice, bulkSellPriceNum, usesColorGroupedData, colorStockRows, cashNum, transferNum, cashAccount, transferAccount, paymentTotal, totalCost, useAgentDebt]);

  /* -- callbacks -- */
  const handleQuantityChange = useCallback(
    (delta: number) => {
      setQuantity((prev) => {
        const next = Math.max(1, Math.min(50, prev + delta));
        setUnitEntries((entries) => {
          if (next > entries.length) {
            const additions: UnitEntry[] = Array.from({ length: next - entries.length }, (_, i) => ({
              id: Date.now() + i,
              imei: '',
              price: '',
              sellPrice: '',
              batteryHealth: 85,
              chargerIncluded: false,
              boxIncluded: false,
            }));
            return [...entries, ...additions];
          }
          if (next < entries.length) {
            return entries.slice(0, next);
          }
          return entries;
        });
        return next;
      });
    },
    []
  );

  const updateUnit = useCallback(
    (id: number, updates: Partial<UnitEntry>) => {
      setUnitEntries((prev) => prev.map((u) => (u.id === id ? { ...u, ...updates } : u)));
    },
    []
  );

  const updateColorStockEntry = useCallback(
    (id: number, updates: Partial<ColorStockEntry>) => {
      setColorStockEntries((prev) => prev.map((entry) => (
        entry.id === id ? { ...entry, ...updates } : entry
      )));
    },
    [],
  );

  const addColorStockEntry = useCallback(() => {
    setColorStockEntries((prev) => [
      ...prev,
      { id: Date.now(), color: '', quantity: '1', costPrice: '', sellPrice: '' },
    ]);
  }, []);

  const removeColorStockEntry = useCallback((id: number) => {
    setColorStockEntries((prev) => (prev.length > 1 ? prev.filter((entry) => entry.id !== id) : prev));
  }, []);

  const handleDataModeChange = useCallback((mode: PurchaseDataMode) => {
    setPurchaseDataMode(mode);
    setSaveError(null);
    setOpenDropdown(null);
    if (mode !== 'full') {
      setSelectedColor('');
    }
  }, []);

  const handleSupplierTypeChange = useCallback((type: SupplierType) => {
    setSupplierType(type);
    setSupplierName('');
    setSelectedAgentId('');
    setUseAgentDebt(false);
    if (type !== 'agen') {
      setPurchaseDataMode('full');
    }
  }, []);

  const handleReset = useCallback(() => {
    setSupplierType('perorangan');
    setSupplierName('');
    setSelectedAgentId('');
    setSelectedModel('');
    setSelectedCapacity('');
    setSelectedCondition('');
    setSelectedColor('');
    setQuantity(1);
    setUnitEntries([{ id: Date.now(), imei: '', price: '', sellPrice: '', batteryHealth: 85, chargerIncluded: false, boxIncluded: false }]);
    setPurchaseDataMode('full');
    setBulkQuantity('1');
    setBulkTotalCost('');
    setBulkSellPrice('');
    setColorStockEntries([{ id: Date.now() + 1, color: '', quantity: '1', costPrice: '', sellPrice: '' }]);
    setCashAmount('');
    setTransferAmount('');
    setUseAgentDebt(false);
    setCashAccount(null);
    setTransferAccount(null);
    setSaveError(null);
  }, []);

  const handleAccessoryReset = useCallback(() => {
    setAccessoryName('');
    setAccessoryCategory('charger');
    setAccessoryQty('1');
    setAccessoryUnitCost('');
    setAccessoryMinStock('0');
    setAccessoryCashAmount('');
    setAccessoryTransferAmount('');
    setAccessoryCashAccount(null);
    setAccessoryTransferAccount(null);
    setAccessorySaveError(null);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('pelengkap') === '1') {
      setShowAccessoryPurchase(true);
      setAccessorySaveError(null);
    }
  }, [location.search]);

  const handleAccessoryPurchaseSave = useCallback(async () => {
    if (accessorySaving) return;
    if (!canSubmitAccessoryPurchase) {
      setAccessorySaveError(accessorySubmitHint ?? 'Lengkapi data pelengkap terlebih dahulu.');
      return;
    }

    const validation = validatePaymentSelection({
      cashPortion: accessoryCashNum,
      cashAccountType: accessoryCashAccount?.type ?? null,
      transferPortion: accessoryTransferNum,
      transferAccountType: accessoryTransferAccount?.type ?? null,
      requiresPayment: true,
    });
    if (!validation.ok) {
      setAccessorySaveError(validation.message);
      return;
    }

    const name = accessoryName.trim();
    const description = `Pembelian Pelengkap - ${accessoryQtyNum} pcs ${name}`;
    const postings = buildPostings(deriveDirection('expense'), {
      cashPortion: accessoryCashNum,
      cashAccountId: accessoryCashAccount?.id ?? null,
      transferPortion: accessoryTransferNum,
      transferAccountId: accessoryTransferAccount?.id ?? null,
    });
    const detail = JSON.stringify({
      kind: 'accessory_purchase',
      items: [{
        name,
        category: accessoryCategory,
        quantity: accessoryQtyNum,
        unitCost: accessoryUnitCostNum,
        minStock: accessoryMinStockNum,
      }],
      payment: { cash: accessoryCashNum, transfer: accessoryTransferNum },
      total: accessoryTotal,
    });

    setAccessorySaving(true);
    setAccessorySaveError(null);
    setSaveSuccess(false);
    try {
      await recordAccessoryPurchaseWithPostings({
        type: 'Pembelian Pelengkap',
        description,
        detail,
        amount: accessoryTotal,
        postings,
        accessories: [{
          name,
          category: accessoryCategory,
          qty: accessoryQtyNum,
          unit_cost: accessoryUnitCostNum,
          min_stock: accessoryMinStockNum,
        }],
      });
      setSaveSuccess(true);
      setShowAccessoryPurchase(false);
      handleAccessoryReset();
    } catch (err) {
      console.error('[Pembelian] accessory purchase save error:', err);
      setAccessorySaveError(
        err instanceof Error && err.message
          ? err.message
          : 'Pembelian pelengkap tidak dapat disimpan.',
      );
    } finally {
      setAccessorySaving(false);
    }
  }, [
    accessorySaving,
    canSubmitAccessoryPurchase,
    accessorySubmitHint,
    accessoryCashNum,
    accessoryCashAccount,
    accessoryTransferNum,
    accessoryTransferAccount,
    accessoryName,
    accessoryQtyNum,
    accessoryCategory,
    accessoryUnitCostNum,
    accessoryMinStockNum,
    accessoryTotal,
    handleAccessoryReset,
  ]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    // Surface the exact blocking reason instead of a silently-disabled button.
    if (!canSubmit) {
      setSaveError(submitHint ?? 'Lengkapi data pembelian terlebih dahulu.');
      return;
    }
    setSaveError(null);
    setSaveSuccess(false);

    // Validate the payment selection before any persistence (Req 4.x).
    // Payment is OPTIONAL (credit purchase allowed): only enforce account rules
    // for the non-zero portions; a zero total is permitted (saved as unpaid).
    const validation = validatePaymentSelection({
      cashPortion: cashNum,
      cashAccountType: cashAccount?.type ?? null,
      transferPortion: transferNum,
      transferAccountType: transferAccount?.type ?? null,
      requiresPayment: false,
    });
    if (!validation.ok) {
      setSaveError(validation.message);
      return;
    }

    const supplierDisplayName = supplierType === 'agen'
      ? selectedAgent?.name ?? supplierName
      : supplierName.trim();
    const supplierPayload = supplierType === 'agen'
      ? {
          type: supplierType,
          name: supplierDisplayName,
          agentId: selectedAgentId,
          code: selectedAgent?.code ?? null,
        }
      : { type: supplierType, name: supplierDisplayName };

    const stockGroups: Array<{
      color: string;
      quantity: number;
      totalCost: number;
      costPrice: number;
      sellPrice: number;
      hasImei: false;
    }> = usesFullUnitData
      ? []
      : usesQuantityOnlyData
        ? [{
            color: 'Random',
            quantity: bulkQuantityNum,
            totalCost: bulkTotalCostNum,
            costPrice: bulkAverageCost,
            sellPrice: bulkSellPriceNum > 0 ? bulkSellPriceNum : bulkAverageCost,
            hasImei: false,
          }]
        : colorStockRows.map((row) => ({
            color: row.color,
            quantity: row.quantityNum,
            totalCost: row.quantityNum * row.costPriceNum,
            costPrice: row.costPriceNum,
            sellPrice: row.sellPriceNum > 0 ? row.sellPriceNum : row.costPriceNum,
            hasImei: false,
          }));

    const payload = {
      supplier: supplierPayload,
      dataMode: activeDataMode,
      specs: {
        model: selectedModel,
        capacity: selectedCapacity,
        condition: selectedCondition,
        color: usesFullUnitData ? selectedColor : usesQuantityOnlyData ? 'Random' : 'Per warna',
        quantity: displayQuantity,
      },
      units: usesFullUnitData
        ? unitEntries.map((u) => ({
            imei: u.imei,
            price: parseMoney(u.price),
            sellPrice: parseMoney(u.sellPrice),
            batteryHealth: u.batteryHealth,
            chargerIncluded: u.chargerIncluded,
            boxIncluded: u.boxIncluded,
          }))
        : [],
      stockGroups,
      payment: { cash: cashNum, transfer: transferNum, debt: agentDebtAmount },
      total: totalCost,
    };

    // Pembelian is an expense → money_out (Req 7.2).
    const direction = deriveDirection('expense');
    const postings = buildPostings(direction, {
      cashPortion: cashNum,
      cashAccountId: cashAccount?.id ?? null,
      transferPortion: transferNum,
      transferAccountId: transferAccount?.id ?? null,
    });

    const unitWord = displayQuantity > 1 ? `${displayQuantity} unit` : '1 unit';
    const description = `${supplierDisplayName} - ${unitWord} ${selectedModel}`.trim();
    const agentDebt = agentDebtAmount > 0 && selectedAgent
      ? {
          agentId: selectedAgent.id,
          amount: agentDebtAmount,
          method: 'Hutang' as const,
          note: `Pembelian ${unitWord} ${selectedModel}`,
        }
      : null;

    // Full data inserts one row per IMEI. Batch modes insert grouped non-IMEI
    // stock rows and rely on stock_items.count for future sales.
    const items = usesFullUnitData
      ? unitEntries.map((u) => {
          const costPrice = parseMoney(u.price);
          const sellPrice = parseMoney(u.sellPrice);
          return {
            model: selectedModel,
            capacity: selectedCapacity,
            condition: selectedCondition,
            color: selectedColor,
            imei: u.imei,
            cost_price: costPrice,
            price: sellPrice > 0 ? sellPrice : costPrice,
            count: 1,
          };
        })
      : stockGroups.map((group) => ({
          model: selectedModel,
          capacity: selectedCapacity,
          condition: selectedCondition,
          color: group.color,
          imei: null,
          cost_price: group.costPrice,
          price: group.sellPrice,
          count: group.quantity,
        }));

    setSaving(true);
    try {
      await recordPurchaseWithPostings({
        type: 'Pembelian',
        description,
        detail: JSON.stringify(payload),
        amount: totalCost,
        postings,
        items,
        agentDebt,
      });
      // Reflect the just-added IMEIs in the live set so a second purchase in
      // this session detects them as duplicates ("IMEI sudah ada di stok").
      setExistingImeis((prev) => {
        const next = new Set(prev);
        for (const it of items) {
          if (it.imei) next.add(it.imei);
        }
        return next;
      });
      setSaveSuccess(true);
      handleReset();
    } catch (err) {
      // Surface the real backend reason so issues are diagnosable (e.g. a
      // duplicate IMEI) instead of a vague message.
      console.error('[Pembelian] save error:', err);
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Transaksi tidak dapat disimpan. Silakan coba lagi.';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }, [canSubmit, submitHint, saving, supplierType, supplierName, selectedAgent, selectedAgentId, selectedModel, selectedCapacity, selectedCondition, selectedColor, activeDataMode, usesFullUnitData, usesQuantityOnlyData, unitEntries, bulkQuantityNum, bulkTotalCostNum, bulkAverageCost, bulkSellPriceNum, colorStockRows, displayQuantity, cashNum, transferNum, cashAccount, transferAccount, totalCost, agentDebtAmount, handleReset]);

  /* -- Custom Select component -- */
  const CustomSelect = ({
    label,
    value,
    options,
    onChange,
    placeholder,
    disabled = false,
    fieldId,
  }: {
    label: string;
    value: string;
    options: string[];
    onChange: (v: string) => void;
    placeholder: string;
    disabled?: boolean;
    fieldId: string;
  }) => {
    const isOpen = openDropdown === fieldId;

    return (
      <div className={`relative ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
        <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
          {label}
        </label>
        <button
          type="button"
          onClick={() => setOpenDropdown(isOpen ? null : fieldId)}
          className="flex w-full h-11 items-center justify-between rounded-xl border border-slate-300 bg-white px-4 text-left text-[14px] transition-all hover:border-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
        >
          <span className={value ? 'text-slate-900' : 'text-slate-400'}>
            {value || placeholder}
          </span>
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.15, ease: easeSmooth }}
              style={{ originX: 0, originY: 0 }}
              className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-card-elevated py-1 max-h-56 overflow-auto"
            >
              {options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setOpenDropdown(null);
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-[14px] transition-colors hover:bg-slate-50 ${
                    value === opt ? 'text-teal-700 font-medium bg-teal-50/50' : 'text-slate-700'
                  }`}
                >
                  {opt}
                  {value === opt && <Check size={16} className="text-teal-600" />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  /* -- IMEI status helper -- */
  const getImeiStatus = (imei: string, id: number) => {
    if (!imei) return 'empty';
    if (imei.length !== 15) return 'invalid';
    if (existingImeis.has(imei)) return 'exists';
    if (allImeis.duplicates.has(imei)) {
      const firstIdx = unitEntries.findIndex((u) => u.imei === imei);
      if (unitEntries[firstIdx]?.id !== id) return 'duplicate';
    }
    return 'valid';
  };

  const imeiStatusConfig: Record<string, { border: string; text: string; message: string; icon: React.ReactNode }> = {
    empty: { border: 'border-slate-300', text: '', message: '', icon: null },
    invalid: { border: 'border-amber-400', text: 'text-amber-600', message: 'IMEI harus 15 digit', icon: <AlertTriangle size={14} className="text-amber-500" /> },
    exists: { border: 'border-rose-400', text: 'text-rose-600', message: 'IMEI sudah ada di stok', icon: <AlertTriangle size={14} className="text-rose-500" /> },
    duplicate: { border: 'border-rose-400', text: 'text-rose-600', message: 'IMEI duplikat', icon: <AlertTriangle size={14} className="text-rose-500" /> },
    valid: { border: 'border-emerald-400', text: 'text-emerald-600', message: 'IMEI valid', icon: <Check size={14} className="text-emerald-500" /> },
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="pb-24">
      {/* ====== Page Header ====== */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="mb-8"
      >
        <motion.div variants={cardVariants} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="font-display text-[36px] text-slate-900 leading-tight">
              Pembelian HP
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowAccessoryPurchase(true);
              setAccessorySaveError(null);
            }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-[14px] font-semibold text-white shadow-md shadow-teal-500/20 transition-colors hover:bg-teal-700 active:scale-[0.98]"
          >
            <Plus size={16} />
            Tambah Pelengkap
          </button>
        </motion.div>

        <motion.div variants={cardVariants} className="mb-2">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-[13px] text-slate-500">1 / 4</span>
            <div className="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '25%' }}
                transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] as [number, number, number, number] }}
                className="h-full rounded-full bg-gold"
              />
            </div>
          </div>
          <p className="text-[14px] text-slate-500">Catat HP masuk ke stok toko.</p>
        </motion.div>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-6"
      >
        {/* ====== Card 1: Sumber Pembelian ====== */}
        <motion.div variants={cardVariants} className="rounded-2xl border border-slate-200 bg-white shadow-card p-6">
          <div className="mb-5">
            <h2 className="text-[18px] font-semibold text-slate-900 font-body">Sumber Pembelian</h2>
            <p className="text-[13px] text-slate-500 mt-0.5">Pilih asal HP yang masuk ke stok toko.</p>
          </div>

          {/* Supplier Type Toggle */}
          <div className="relative flex bg-surface-sunk rounded-xl p-1 mb-4">
            {(['perorangan', 'agen', 'toko'] as SupplierType[]).map((type) => (
              <button
                key={type}
                onClick={() => handleSupplierTypeChange(type)}
                className={`relative z-10 flex-1 rounded-[10px] py-2.5 text-[14px] font-medium text-center transition-colors capitalize ${
                  supplierType === type ? 'text-gold' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {type === 'toko' ? 'Toko Lain' : type}
              </button>
            ))}
            <motion.div
              layoutId="supplier-tab-indicator"
              className="absolute top-1 bottom-1 rounded-[10px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
              style={{
                left: `calc(${supplierType === 'perorangan' ? 0 : supplierType === 'agen' ? 1 : 2} * 33.33% + 4px)`,
                width: 'calc(33.33% - 6px)',
              }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            />
          </div>

          {/* Nama Penjual */}
          <div>
            {supplierType === 'agen' ? (
              <>
                <label htmlFor="supplier-agent" className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                  Nama Agen <span className="text-rose-500">*</span>
                </label>
                <select
                  id="supplier-agent"
                  value={selectedAgentId}
                  disabled={agentsLoading || Boolean(agentsError) || agents.length === 0}
                  onChange={(e) => {
                    const agent = agents.find((item) => item.id === e.target.value) ?? null;
                    setSelectedAgentId(e.target.value);
                    setSupplierName(agent?.name ?? '');
                  }}
                  className="w-full h-11 rounded-xl border border-slate-300 bg-white px-4 text-[14px] text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">
                    {agentsLoading
                      ? 'Memuat daftar agen...'
                      : agentsError
                        ? 'Daftar agen gagal dimuat'
                        : agents.length === 0
                          ? 'Belum ada agen terdaftar'
                          : 'Pilih agen terdaftar'}
                  </option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} ({agent.code})
                    </option>
                  ))}
                </select>
                {agentsError && (
                  <p className="mt-2 text-[12px] text-rose-600">{agentsError}</p>
                )}
                {!agentsLoading && !agentsError && agents.length === 0 && (
                  <p className="mt-2 text-[12px] text-slate-500">Tambahkan agen dulu dari menu Agen.</p>
                )}
                <button
                  type="button"
                  onClick={() => setShowAgentImport(true)}
                  disabled={!selectedAgentId || agentsLoading || Boolean(agentsError)}
                  className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 text-[13px] font-semibold text-teal-700 transition-colors hover:bg-teal-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <Upload size={15} />
                  Import Excel Minus
                </button>
              </>
            ) : (
              <>
                <label htmlFor="supplier-name" className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                  Nama Penjual <span className="text-rose-500">*</span>
                </label>
                <input
                  id="supplier-name"
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder={supplierPlaceholders[supplierType]}
                  className="w-full h-11 rounded-xl border border-slate-300 bg-white px-4 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                />
              </>
            )}
          </div>
        </motion.div>

        {/* ====== Card 2: Spesifikasi Batch ====== */}
        <motion.div variants={cardVariants} className="rounded-2xl border border-slate-200 bg-white shadow-card p-6">
          <div className="mb-5">
            <h2 className="text-[18px] font-semibold text-slate-900 font-body">Spesifikasi Batch</h2>
            <p className="text-[13px] text-slate-500 mt-0.5">
              {usesFullUnitData
                ? 'Semua unit dalam pembelian ini punya tipe, kapasitas, kondisi, dan warna yang sama. Untuk variasi, buat pembelian terpisah.'
                : 'Batch agen tanpa IMEI dipakai untuk unit mulus/non-minus. IMEI bisa diisi nanti saat penjualan.'}
            </p>
          </div>

          {supplierType === 'agen' && (
            <div className="mb-5">
              <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                Format Data Agen
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 rounded-xl bg-surface-sunk p-1">
                {([
                  { value: 'full', label: 'Full Data' },
                  { value: 'quantity', label: 'Jumlah Stok' },
                  { value: 'color', label: 'Warna + Modal Tanpa IMEI' },
                ] as Array<{ value: PurchaseDataMode; label: string }>).map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    aria-pressed={purchaseDataMode === mode.value}
                    onClick={() => handleDataModeChange(mode.value)}
                    className={`rounded-[10px] px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                      purchaseDataMode === mode.value
                        ? 'bg-white text-gold shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CustomSelect
              fieldId="tipe"
              label="Tipe HP *"
              value={selectedModel}
              options={phoneModels}
              onChange={(v) => {
                setSelectedModel(v);
                setSelectedColor('');
                setColorStockEntries((prev) => prev.map((entry) => ({ ...entry, color: '' })));
              }}
              placeholder="Pilih tipe HP"
            />
            <CustomSelect
              fieldId="kapasitas"
              label="Kapasitas *"
              value={selectedCapacity}
              options={capacities}
              onChange={setSelectedCapacity}
              placeholder="Pilih kapasitas"
            />
            <CustomSelect
              fieldId="kondisi"
              label="Kondisi *"
              value={selectedCondition}
              options={conditions}
              onChange={setSelectedCondition}
              placeholder="Pilih kondisi"
            />
            {usesFullUnitData ? (
              <CustomSelect
                fieldId="warna"
                label="Warna *"
                value={selectedColor}
                options={availableColors}
                onChange={setSelectedColor}
                placeholder={selectedModel ? 'Pilih warna' : 'Pilih tipe HP dulu...'}
                disabled={!selectedModel}
              />
            ) : (
              <div>
                <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                  Warna
                </label>
                <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-[14px] text-slate-500">
                  {usesQuantityOnlyData ? 'Random' : 'Diisi per baris'}
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-start gap-2">
            <Info size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
            <p className="text-[12px] text-slate-400 italic">
              Warna resmi Apple mengikuti tipe HP yang dipilih.
            </p>
          </div>

          {usesFullUnitData && (
            <div className="mt-5">
              <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                Jumlah Unit <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(-1)}
                  disabled={quantity <= 1}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-colors"
                >
                  <Minus size={16} />
                </button>
                <span className="w-12 text-center font-mono text-[18px] font-semibold text-slate-900">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => handleQuantityChange(1)}
                  disabled={quantity >= 50}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          )}
        </motion.div>

        {/* ====== Card 3: Detail Unit per IMEI ====== */}
        <motion.div variants={cardVariants} className="rounded-2xl border border-slate-200 bg-white shadow-card p-6">
          <div className="mb-5">
            <h2 className="text-[18px] font-semibold text-slate-900 font-body">Detail Unit</h2>
            <p className="text-[13px] text-slate-500 mt-0.5">
              {usesFullUnitData
                ? 'Masukkan IMEI dan harga untuk setiap unit.'
                : usesQuantityOnlyData
                  ? 'Masukkan total jumlah stok dan total modal dari agen.'
                  : 'Kelompokkan stok agen berdasarkan warna dan modal per unit.'}
            </p>
          </div>

          {usesFullUnitData ? (
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {unitEntries.map((unit, idx) => {
                const status = getImeiStatus(unit.imei, unit.id);
                const statusCfg = imeiStatusConfig[status];
                const priceNum = Number(unit.price.replace(/\D/g, '')) || 0;

                return (
                  <motion.div
                    key={unit.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3, ease: easeSmooth }}
                    className="rounded-xl border border-slate-200 p-5"
                  >
                    {/* Unit Header */}
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[14px] font-semibold text-slate-700">
                        Unit #{idx + 1}
                      </span>
                      <span className="font-mono text-[16px] font-semibold text-slate-900">
                        {formatPrice(priceNum)}
                      </span>
                    </div>

                    {/* Fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* IMEI */}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1">
                          IMEI (15 digit) <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={unit.imei}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, '').slice(0, 15);
                              updateUnit(unit.id, { imei: v });
                            }}
                            placeholder="352461789012345"
                            maxLength={15}
                            className={`w-full h-10 rounded-xl border ${statusCfg.border} bg-white px-3 font-mono text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all tracking-[0.04em]`}
                          />
                          {status !== 'empty' && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2">
                              {statusCfg.icon}
                            </span>
                          )}
                        </div>
                        {statusCfg.message && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`text-[11px] mt-1 ${statusCfg.text}`}
                          >
                            {statusCfg.message}
                          </motion.p>
                        )}
                      </div>

                      {/* Harga Modal (harga beli) */}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1">
                          Harga Modal <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={unit.price ? 'Rp ' + unit.price.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}
                          onChange={(e) => {
                            updateUnit(unit.id, { price: e.target.value.replace(/\D/g, '') });
                          }}
                          placeholder="Rp 0"
                          className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 font-mono text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all text-right"
                        />
                      </div>

                      {/* Harga Jual */}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1">
                          Harga Jual
                        </label>
                        <input
                          type="text"
                          value={unit.sellPrice ? 'Rp ' + unit.sellPrice.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}
                          onChange={(e) => {
                            updateUnit(unit.id, { sellPrice: e.target.value.replace(/\D/g, '') });
                          }}
                          placeholder="Rp 0"
                          className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 font-mono text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all text-right"
                        />
                      </div>

                      {/* Battery Health */}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1">
                          BH % <span className="text-rose-500">*</span>
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={unit.batteryHealth}
                            onChange={(e) => updateUnit(unit.id, { batteryHealth: Number(e.target.value) })}
                            className={`flex-1 h-2 rounded-full appearance-none bg-slate-200 cursor-pointer ${getSliderTrackColor(unit.batteryHealth)}`}
                            style={{
                              background: `linear-gradient(to right, ${unit.batteryHealth >= 80 ? '#10B981' : unit.batteryHealth >= 50 ? '#F59E0B' : '#F43F5E'} ${unit.batteryHealth}%, #E2E8F0 ${unit.batteryHealth}%)`,
                            }}
                          />
                          <span className={`font-mono text-[13px] font-semibold w-9 text-right ${
                            unit.batteryHealth >= 80 ? 'text-emerald-600' : unit.batteryHealth >= 50 ? 'text-amber-600' : 'text-rose-600'
                          }`}>
                            {unit.batteryHealth}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Checkboxes */}
                    <div className="flex items-center gap-5 mt-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <div
                          onClick={() => updateUnit(unit.id, { chargerIncluded: !unit.chargerIncluded })}
                          className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                            unit.chargerIncluded
                              ? 'bg-teal-500 border-teal-500'
                              : 'border-slate-300 bg-white hover:border-slate-400'
                          }`}
                        >
                          {unit.chargerIncluded && <Check size={12} className="text-white" />}
                        </div>
                        <span className="text-[13px] text-slate-600">Charger included</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <div
                          onClick={() => updateUnit(unit.id, { boxIncluded: !unit.boxIncluded })}
                          className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                            unit.boxIncluded
                              ? 'bg-teal-500 border-teal-500'
                              : 'border-slate-300 bg-white hover:border-slate-400'
                          }`}
                        >
                          {unit.boxIncluded && <Check size={12} className="text-white" />}
                        </div>
                        <span className="text-[13px] text-slate-600">Kotak included</span>
                      </label>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
          ) : usesQuantityOnlyData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="bulk-quantity" className="block text-[11px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1">
                    Jumlah Stok <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="bulk-quantity"
                    type="text"
                    inputMode="numeric"
                    value={bulkQuantity}
                    onChange={(e) => setBulkQuantity(onlyDigits(e.target.value).slice(0, 4))}
                    className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 font-mono text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="bulk-total-cost" className="block text-[11px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1">
                    Total Modal <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="bulk-total-cost"
                    type="text"
                    value={formatMoneyInput(bulkTotalCost)}
                    onChange={(e) => setBulkTotalCost(onlyDigits(e.target.value))}
                    placeholder="Rp 0"
                    className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 font-mono text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all text-right"
                  />
                </div>
                <div>
                  <label htmlFor="bulk-sell-price" className="block text-[11px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1">
                    Harga Jual / Unit
                  </label>
                  <input
                    id="bulk-sell-price"
                    type="text"
                    value={formatMoneyInput(bulkSellPrice)}
                    onChange={(e) => setBulkSellPrice(onlyDigits(e.target.value))}
                    placeholder="Rp 0"
                    className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 font-mono text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all text-right"
                  />
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-slate-500">
                    Modal / Unit
                  </p>
                  <p className="mt-1 font-mono text-[18px] font-semibold text-slate-900">
                    {formatPrice(bulkAverageCost)}
                  </p>
                  <p className="mt-0.5 text-[12px] text-slate-500">
                    Warna stok akan disimpan sebagai Random.
                  </p>
                </div>
              </div>
              {minusBatch && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-700">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  <span>Gunakan Full Data untuk unit minus/defect agar IMEI dan detail lengkap tetap tercatat.</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                {colorStockEntries.map((entry, idx) => {
                  const rowQuantity = Number(onlyDigits(entry.quantity)) || 0;
                  const rowCostPrice = parseMoney(entry.costPrice);
                  const rowTotal = rowQuantity * rowCostPrice;

                  return (
                    <div key={entry.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <span className="text-[14px] font-semibold text-slate-700">
                          Grup Warna #{idx + 1}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[14px] font-semibold text-slate-900">
                            {formatPrice(rowTotal)}
                          </span>
                          {colorStockEntries.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeColorStockEntry(entry.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                              aria-label={`Hapus grup warna ${idx + 1}`}
                            >
                              <Minus size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                        <div>
                          <label htmlFor={`color-stock-${entry.id}`} className="block text-[11px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1">
                            Warna Stok <span className="text-rose-500">*</span>
                          </label>
                          <select
                            id={`color-stock-${entry.id}`}
                            value={entry.color}
                            onChange={(e) => updateColorStockEntry(entry.id, { color: e.target.value })}
                            disabled={!selectedModel}
                            className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-[13px] text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            <option value="">{selectedModel ? 'Pilih warna' : 'Pilih tipe dulu'}</option>
                            {availableColors.map((color) => (
                              <option key={color} value={color}>
                                {color}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`color-quantity-${entry.id}`} className="block text-[11px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1">
                            Jumlah Unit <span className="text-rose-500">*</span>
                          </label>
                          <input
                            id={`color-quantity-${entry.id}`}
                            type="text"
                            inputMode="numeric"
                            value={entry.quantity}
                            onChange={(e) => updateColorStockEntry(entry.id, { quantity: onlyDigits(e.target.value).slice(0, 4) })}
                            className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 font-mono text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                          />
                        </div>
                        <div>
                          <label htmlFor={`color-cost-${entry.id}`} className="block text-[11px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1">
                            Modal per Unit <span className="text-rose-500">*</span>
                          </label>
                          <input
                            id={`color-cost-${entry.id}`}
                            type="text"
                            value={formatMoneyInput(entry.costPrice)}
                            onChange={(e) => updateColorStockEntry(entry.id, { costPrice: onlyDigits(e.target.value) })}
                            placeholder="Rp 0"
                            className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 font-mono text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all text-right"
                          />
                        </div>
                        <div>
                          <label htmlFor={`color-sell-${entry.id}`} className="block text-[11px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1">
                            Harga Jual / Unit
                          </label>
                          <input
                            id={`color-sell-${entry.id}`}
                            type="text"
                            value={formatMoneyInput(entry.sellPrice)}
                            onChange={(e) => updateColorStockEntry(entry.id, { sellPrice: onlyDigits(e.target.value) })}
                            placeholder="Rp 0"
                            className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 font-mono text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all text-right"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={addColorStockEntry}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Plus size={15} />
                Tambah Warna
              </button>
              {minusBatch && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-700">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  <span>Gunakan Full Data untuk unit minus/defect agar IMEI dan detail lengkap tetap tercatat.</span>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* ====== Card 4: Pembayaran ====== */}
        <motion.div variants={cardVariants} className="rounded-2xl border border-slate-200 bg-white shadow-card p-6">
          <h2 className="text-[18px] font-semibold text-slate-900 font-body mb-4">Pembayaran</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                Bayar Cash
              </label>
              <div className="relative">
                <Banknote size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={cashAmount ? 'Rp ' + cashAmount.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}
                  onChange={(e) => setCashAmount(e.target.value.replace(/\D/g, ''))}
                  placeholder="Rp 0"
                  className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-10 pr-4 font-mono text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                Bayar Transfer
              </label>
              <div className="relative">
                <CreditCard size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={transferAmount ? 'Rp ' + transferAmount.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}
                  onChange={(e) => setTransferAmount(e.target.value.replace(/\D/g, ''))}
                  placeholder="Rp 0"
                  className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-10 pr-4 font-mono text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Account selection for non-zero payment portions (Req 8.4, 8.5) */}
          {(cashNum > 0 || transferNum > 0) && (
            <div className="mt-4 space-y-4">
              {cashNum > 0 && (
                <AccountPicker
                  label="Akun Kas (porsi cash)"
                  filterType="Cash"
                  accounts={accounts}
                  value={cashAccount?.id ?? null}
                  onChange={(_, account) => {
                    setCashAccount(account);
                    setSaveError(null);
                  }}
                />
              )}
              {transferNum > 0 && (
                <AccountPicker
                  label="Akun Bank (porsi transfer)"
                  filterType="Bank"
                  accounts={accounts}
                  value={transferAccount?.id ?? null}
                  onChange={(_, account) => {
                    setTransferAccount(account);
                    setSaveError(null);
                  }}
                />
              )}
            </div>
          )}

          {supplierType === 'agen' && (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <input
                type="checkbox"
                checked={useAgentDebt}
                onChange={(e) => {
                  setUseAgentDebt(e.target.checked);
                  setSaveError(null);
                }}
                className="mt-1 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="flex-1">
                <span className="block text-[13px] font-semibold text-amber-800">
                  Hutang ke Agen
                </span>
                <span className="mt-0.5 block text-[12px] text-amber-700/80">
                  Sisa belum dibayar {formatPrice(unpaidAmount)} akan masuk ke data hutang agen.
                </span>
              </span>
            </label>
          )}

          {totalCost > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-xl bg-slate-50 p-4 flex items-center justify-between"
            >
              <div>
                <p className="text-[13px] text-slate-500">Total Biaya</p>
                <p className="font-mono text-[20px] font-semibold text-slate-900">{formatPrice(totalCost)}</p>
              </div>
              <div className="text-right">
                <p className="text-[13px] text-slate-500">Total Bayar</p>
                <p className={`font-mono text-[20px] font-semibold ${paymentTotal >= totalCost ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {formatPrice(paymentTotal)}
                </p>
              </div>
            </motion.div>
          )}

          {paymentTotal > 0 && paymentTotal < totalCost && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[13px] text-amber-600 mt-2"
            >
              Jumlah pembayaran belum sesuai total.
            </motion.p>
          )}

          {saveError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700"
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-500" />
              <span>{saveError}</span>
            </motion.div>
          )}

          {saveSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-700"
            >
              <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" />
              <span>Pembelian berhasil disimpan.</span>
            </motion.div>
          )}
        </motion.div>
      </motion.div>

      {/* ====== Bottom Action Bar ====== */}
      <motion.div
        initial={{ y: 72, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: easeSmooth, delay: 0.3 }}
        className="fixed bottom-0 left-0 right-0 z-40 h-[72px] border-t border-slate-200 bg-white shadow-bottom-bar"
      >
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <div>
            <p className="text-[14px] text-slate-700">
              <span className="font-mono font-semibold">{displayQuantity}</span>{' '}
              <span className="text-slate-500">unit</span>
            </p>
            <motion.p
              key={totalCost}
              initial={{ scale: 1.05 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="font-mono text-[22px] font-bold text-slate-900 leading-tight"
            >
              {formatPrice(totalCost)}
            </motion.p>
            {totalCost > 0 && displayQuantity > 0 && (
              <p className="text-[12px] text-slate-500">
                {formatPrice(Math.round(totalCost / displayQuantity))} / unit
              </p>
            )}
            {!canSubmit && !saving && submitHint && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-600">
                <AlertTriangle size={11} /> {submitHint}
              </p>
            )}
            {saveError && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-rose-600">
                <AlertTriangle size={11} /> {saveError}
              </p>
            )}
            {saveSuccess && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                <Check size={11} /> Pembelian tersimpan.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 rounded-xl bg-slate-100 px-5 py-2.5 text-[14px] font-semibold text-slate-700 transition-colors hover:bg-slate-200 active:scale-[0.98]"
            >
              <RotateCcw size={16} />
              <span className="hidden sm:inline">Reset</span>
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={16} />
              {saving ? 'Menyimpan...' : 'Simpan Pembelian'}
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showAccessoryPurchase && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 px-4 py-4 sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="accessory-purchase-title"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ duration: 0.2, ease: easeSmooth }}
              className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-card-elevated"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
                <div>
                  <h2 id="accessory-purchase-title" className="text-[18px] font-semibold text-slate-900">
                    Tambah Pelengkap
                  </h2>
                  <p className="mt-0.5 text-[13px] text-slate-500">
                    Kas/bank turun, biaya masuk HPP saat pelengkap dipakai.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAccessoryPurchase(false);
                    setAccessorySaveError(null);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                  aria-label="Tutup tambah pelengkap"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="space-y-5 p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="accessory-name" className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                      Nama Pelengkap <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="accessory-name"
                      type="text"
                      value={accessoryName}
                      onChange={(e) => {
                        setAccessoryName(e.target.value);
                        setAccessorySaveError(null);
                      }}
                      placeholder="Box iPhone 11"
                      className="w-full h-11 rounded-xl border border-slate-300 bg-white px-4 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                    />
                  </div>

                  <div>
                    <label htmlFor="accessory-category" className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                      Kategori Pelengkap <span className="text-rose-500">*</span>
                    </label>
                    <select
                      id="accessory-category"
                      value={accessoryCategory}
                      onChange={(e) => {
                        setAccessoryCategory(e.target.value as AccessoryCategory);
                        setAccessorySaveError(null);
                      }}
                      className="w-full h-11 rounded-xl border border-slate-300 bg-white px-4 text-[14px] text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                    >
                      {ACCESSORY_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {accessoryCategoryLabels[category]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="accessory-qty" className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                      Jumlah Beli <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="accessory-qty"
                      type="number"
                      min={1}
                      step={1}
                      value={accessoryQty}
                      onChange={(e) => {
                        setAccessoryQty(onlyDigits(e.target.value));
                        setAccessorySaveError(null);
                      }}
                      className="w-full h-11 rounded-xl border border-slate-300 bg-white px-4 font-mono text-[14px] text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                    />
                  </div>

                  <div>
                    <label htmlFor="accessory-unit-cost" className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                      Modal per Pcs <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 font-mono">
                        Rp
                      </span>
                      <input
                        id="accessory-unit-cost"
                        type="text"
                        inputMode="numeric"
                        value={formatMoneyInput(accessoryUnitCost)}
                        onChange={(e) => {
                          setAccessoryUnitCost(onlyDigits(e.target.value));
                          setAccessorySaveError(null);
                        }}
                        placeholder="Rp 0"
                        className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-10 pr-4 font-mono text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="accessory-min-stock" className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                      Stok Minimum
                    </label>
                    <input
                      id="accessory-min-stock"
                      type="number"
                      min={0}
                      step={1}
                      value={accessoryMinStock}
                      onChange={(e) => {
                        setAccessoryMinStock(onlyDigits(e.target.value));
                        setAccessorySaveError(null);
                      }}
                      className="w-full h-11 rounded-xl border border-slate-300 bg-white px-4 font-mono text-[14px] text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                    />
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-[13px] font-medium text-slate-600">Total Modal Pelengkap</p>
                    <p className="font-mono text-[20px] font-bold text-slate-900">
                      {formatPrice(accessoryTotal)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="accessory-cash" className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                      Bayar Cash Pelengkap
                    </label>
                    <div className="relative">
                      <Banknote size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        id="accessory-cash"
                        type="text"
                        inputMode="numeric"
                        value={formatMoneyInput(accessoryCashAmount)}
                        onChange={(e) => {
                          setAccessoryCashAmount(onlyDigits(e.target.value));
                          setAccessoryCashAccount(null);
                          setAccessorySaveError(null);
                        }}
                        placeholder="Rp 0"
                        className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-10 pr-4 font-mono text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="accessory-transfer" className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                      Bayar Transfer Pelengkap
                    </label>
                    <div className="relative">
                      <CreditCard size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        id="accessory-transfer"
                        type="text"
                        inputMode="numeric"
                        value={formatMoneyInput(accessoryTransferAmount)}
                        onChange={(e) => {
                          setAccessoryTransferAmount(onlyDigits(e.target.value));
                          setAccessoryTransferAccount(null);
                          setAccessorySaveError(null);
                        }}
                        placeholder="Rp 0"
                        className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-10 pr-4 font-mono text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {(accessoryCashNum > 0 || accessoryTransferNum > 0) && (
                  <div className="space-y-4">
                    {accessoryCashNum > 0 && (
                      <AccountPicker
                        label="Akun Kas Pelengkap"
                        filterType="Cash"
                        accounts={accounts}
                        value={accessoryCashAccount?.id ?? null}
                        onChange={(_, account) => {
                          setAccessoryCashAccount(account);
                          setAccessorySaveError(null);
                        }}
                      />
                    )}
                    {accessoryTransferNum > 0 && (
                      <AccountPicker
                        label="Akun Bank Pelengkap"
                        filterType="Bank"
                        accounts={accounts}
                        value={accessoryTransferAccount?.id ?? null}
                        onChange={(_, account) => {
                          setAccessoryTransferAccount(account);
                          setAccessorySaveError(null);
                        }}
                      />
                    )}
                  </div>
                )}

                {accessorySaveError && (
                  <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-500" />
                    <span>{accessorySaveError}</span>
                  </div>
                )}

                {!accessorySaveError && accessorySubmitHint && (
                  <p className="flex items-center gap-1.5 text-[12px] font-medium text-amber-600">
                    <AlertTriangle size={13} /> {accessorySubmitHint}
                  </p>
                )}
              </div>

              <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAccessoryPurchase(false);
                    setAccessorySaveError(null);
                  }}
                  disabled={accessorySaving}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleAccessoryPurchaseSave}
                  disabled={accessorySaving}
                  className="rounded-xl bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {accessorySaving ? 'Menyimpan...' : 'Simpan Pelengkap'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AgentDefectImportDialog
        open={showAgentImport}
        agents={agents}
        initialAgentId={selectedAgentId}
        onClose={() => setShowAgentImport(false)}
        onImported={async () => {
          try {
            await refreshExistingImeis();
          } catch (err) {
            console.error('[Pembelian] refresh stock after import error:', err);
          }
          setShowAgentImport(false);
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 4000);
        }}
      />

      {/* Dropdown click-outside handler */}
      {openDropdown && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setOpenDropdown(null)}
        />
      )}
    </div>
  );
}
