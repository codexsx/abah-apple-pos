import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  X,
  ChevronDown,
  Check,
  User,
  Phone,
  Banknote,
  CreditCard,
  RotateCcw,
  Save,
  Smartphone,
  Plus,
  Shield,
  Gift,
  Plug,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { getStockItems, type StockItem } from '@/services/stock';
import { identifierLabel, type DeviceCategory } from '@/services/stockCore';
import { getAccessories, type Accessory } from '@/services/accessories';
import {
  validateSale,
  computeTotals,
  serializeSaleDetail,
  toSaleDetail,
  buildDescription,
  type AssembledSale,
} from '@/services/finalization';
import {
  deriveDirection,
  buildPostings,
  validatePaymentSelection,
  type PaymentSelection,
} from '@/services/paymentPosting';
import { recordSaleWithPostings, type SaleAccessoryInput } from '@/services/postings';
import {
  getAccountPickerData,
  type AccountWithBalance,
} from '@/services/accounts';
import AccountPicker from '@/components/AccountPicker';
import { ConfirmationView } from '@/components/sale/ConfirmationView';
import type { ReceiptData } from '@/services/receipt';
import { printReceipt } from '@/services/receipt';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface UnitDetail {
  stockId: string;
  imei: string;
  color: string;
  defectDescription: string;
  batteryHealth: number;
  suggestedPrice: number;
  hasImei: boolean;
  stockCount: number;
  /** Kategori perangkat: IPHONE (default) | IPAD — iPad: `imei` berisi SN. */
  deviceCategory?: DeviceCategory;
}

interface StockGroup {
  id: string;
  model: string;
  capacity: string;
  condition: string;
  units: UnitDetail[];
}

interface SelectedUnit {
  stockId: string;
  groupId: string;
  imei: string;
  model: string;
  capacity: string;
  condition: string;
  color: string;
  defectDescription: string;
  batteryHealth: number;
  sellingPrice: number;
  stockHasImei: boolean;
  /** Kategori perangkat: IPHONE (default) | IPAD — iPad: `imei` berisi SN. */
  deviceCategory?: DeviceCategory;
}

interface AddedItem {
  id: string;
  name: string;
  price: number;
}

interface AddedBonus {
  /** Real `accessory_stock.id` — forwarded ke RPC untuk dekremen stok. */
  id: string;
  name: string;
  /** Harga modal aksesori (IDR integer) — di-roll ke harga modal unit. */
  price: number;
}

interface BoxStatus {
  charger: boolean;
  paperbag: boolean;
  temperedGlass: boolean;
  case: boolean;
  kotak: boolean;
}

type BoxStatusKey = keyof BoxStatus;

/* ------------------------------------------------------------------ */
/*  Expanded stock data (individual units per group)                   */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Live stock grouping helper                                         */
/* ------------------------------------------------------------------ */

/**
 * Group live READY stock rows by `model + '|' + capacity + '|' + condition`.
 * Each group's `units` are the real rows in that group, carrying the REAL
 * `stockId` (row id), `imei` (row.imei ?? ''), `color`, a placeholder
 * `batteryHealth` of 0 (no real column), and a per-unit `suggestedPrice`
 * (row.price).
 */
function buildStockGroups(rows: StockItem[]): StockGroup[] {
  const map = new Map<string, StockGroup>();
  for (const row of rows) {
    const key = `${row.model}|${row.capacity}|${row.condition}`;
    let group = map.get(key);
    if (!group) {
      group = {
        id: key,
        model: row.model,
        capacity: row.capacity,
        condition: row.condition,
        units: [],
      };
      map.set(key, group);
    }
    group.units.push({
      stockId: row.id,
      imei: row.imei ?? '',
      color: row.color,
      defectDescription: row.defect_description ?? '',
      batteryHealth: 0,
      suggestedPrice: row.price,
      hasImei: row.has_imei,
      stockCount: Math.max(1, row.count || 1),
      deviceCategory: row.device_category ?? 'IPHONE',
    });
  }
  return Array.from(map.values());
}

/**
 * Query identitas yang bisa dipakai mencari unit: tepat 15 digit (IMEI iPhone,
 * dicocokkan persis) atau 8–14 karakter (Serial Number iPad, case-insensitive).
 */
function isSearchableIdentifier(query: string): boolean {
  const len = query.trim().length;
  return len >= 8 && len <= 15;
}

const warrantyOptions = ['No Garansi', '7 Hari', '30 Hari', '90 Hari', '1 Tahun'];

/* Kategori aksesori yang bisa dipakai sebagai item manual / bonus. */
const ITEM_CATEGORIES: Accessory['category'][] = ['charger', 'tempered_glass'];
const BONUS_CATEGORIES: Accessory['category'][] = [
  'charger',
  'paperbag',
  'tempered_glass',
  'kotak',
];

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
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

const initialBoxStatus: BoxStatus = {
  charger: false,
  paperbag: true,
  temperedGlass: false,
  case: false,
  kotak: false,
};

const BOX_ACCESSORY_CATEGORIES: Record<BoxStatusKey, Accessory['category']> = {
  charger: 'charger',
  paperbag: 'paperbag',
  temperedGlass: 'tempered_glass',
  case: 'case',
  kotak: 'kotak',
};

const BOX_STATUS_LABELS: Record<BoxStatusKey, string> = {
  charger: 'Charger',
  paperbag: 'Paperbag',
  temperedGlass: 'Tempered Glass',
  case: 'Case',
  kotak: 'Kotak',
};

const MODEL_SPECIFIC_BOX_KEYS = new Set<BoxStatusKey>([
  'temperedGlass',
  'case',
  'kotak',
]);

const ACCESSORY_MODEL_GENERIC_WORDS = new Set([
  'box',
  'kotak',
  'case',
  'casing',
  'tempered',
  'glass',
  'anti',
  'gores',
  'original',
  'ori',
  'free',
  'bonus',
  'dus',
  'dusbook',
]);

function normalizeAccessoryText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value: string): string[] {
  const normalized = normalizeAccessoryText(value);
  return normalized ? normalized.split(/\s+/) : [];
}

function findTokenSequence(haystack: string[], needle: string[]): number {
  if (needle.length === 0 || needle.length > haystack.length) return -1;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    if (needle.every((token, index) => haystack[i + index] === token)) {
      return i;
    }
  }
  return -1;
}

function accessoryNameMatchesModel(name: string, model: string): boolean {
  const nameTokens = tokens(name);
  const modelTokens = tokens(model);
  const startIndex = findTokenSequence(nameTokens, modelTokens);
  if (startIndex === -1) return false;

  const leftovers = [
    ...nameTokens.slice(0, startIndex),
    ...nameTokens.slice(startIndex + modelTokens.length),
  ];
  return leftovers.every((token) => ACCESSORY_MODEL_GENERIC_WORDS.has(token));
}

function compareAccessoryPriority(a: Accessory, b: Accessory): number {
  const stockRank = Number(b.stock > 0) - Number(a.stock > 0);
  if (stockRank !== 0) return stockRank;
  const nameLengthRank = a.name.length - b.name.length;
  if (nameLengthRank !== 0) return nameLengthRank;
  return a.name.localeCompare(b.name, 'id');
}

function findAccessoryForBoxStatus(
  accessories: Accessory[],
  key: BoxStatusKey,
  selectedModel: string | null,
): Accessory | null {
  const category = BOX_ACCESSORY_CATEGORIES[key];
  const candidates = accessories
    .filter((item) => item.category === category)
    .sort(compareAccessoryPriority);

  if (MODEL_SPECIFIC_BOX_KEYS.has(key)) {
    if (!selectedModel) return null;
    return (
      candidates.find((item) => accessoryNameMatchesModel(item.name, selectedModel)) ?? null
    );
  }

  return candidates[0] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Penjualan() {
  const navigate = useNavigate();

  /* -- state -- */
  const [activeTab, setActiveTab] = useState<'cari' | 'browse'>('browse');
  const [browseSearch, setBrowseSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedUnits, setSelectedUnits] = useState<SelectedUnit[]>([]);

  /* -- live READY stock (replaces the old mock-derived stockGroups) -- */
  const [stockRows, setStockRows] = useState<StockItem[]>([]);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockReloadKey, setStockReloadKey] = useState(0);

  /* -- live aksesori (menggantikan mock `accessoryStock`): dipakai untuk
        daftar item manual & bonus, dan membawa `id`/`price` DB nyata. -- */
  const [accessories, setAccessories] = useState<Accessory[]>([]);

  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [hargaJual, setHargaJual] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [discount, setDiscount] = useState('');

  /* -- Items & Bonus state -- */
  const [imeiActivationPrice, setImeiActivationPrice] = useState('');
  const [addedItems, setAddedItems] = useState<AddedItem[]>([]);
  const [addedBonuses, setAddedBonuses] = useState<AddedBonus[]>([]);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [selectedItemName, setSelectedItemName] = useState('');

  /* -- Garansi & Box state -- */
  const [warranty, setWarranty] = useState('');
  const [boxStatus, setBoxStatus] = useState<BoxStatus>(initialBoxStatus);

  /* -- finalization state (tasks 8.2–8.4) -- */
  const [confirmation, setConfirmation] = useState<ReceiptData | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* -- account selection (task 6.1: atomic posting path) -- */
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [cashAccountId, setCashAccountId] = useState<string | null>(null);
  const [cashAccount, setCashAccount] = useState<AccountWithBalance | null>(null);
  const [transferAccountId, setTransferAccountId] = useState<string | null>(null);
  const [transferAccount, setTransferAccount] = useState<AccountWithBalance | null>(null);

  /* -- load active accounts once on mount; failures degrade to an empty list
        (the AccountPicker then shows its empty-state and validation blocks
        finalize) and never block the rest of the page. -- */
  useEffect(() => {
    let cancelled = false;
    getAccountPickerData()
      .then((data) => {
        if (!cancelled) setAccounts(data);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* -- load REAL stock on mount (and on retry): keep only READY rows so the
        browse/IMEI flows only ever sell sellable units. Failures surface an
        inline error+retry and never crash the page; an empty result shows an
        empty hint in the Browse list. -- */
  useEffect(() => {
    let cancelled = false;
    setStockLoading(true);
    setStockError(null);
    getStockItems()
      .then((rows) => {
        if (cancelled) return;
        setStockRows(rows.filter((r) => r.status === 'READY'));
        setStockLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setStockRows([]);
        setStockError('Gagal memuat stok. Silakan coba lagi.');
        setStockLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stockReloadKey]);

  /* -- groups derived from the live READY rows -- */
  const stockGroups = useMemo(() => buildStockGroups(stockRows), [stockRows]);

  /* -- load REAL aksesori sekali saat mount: gagal-muat jatuh ke daftar
        kosong (UI tetap jalan, tidak crash). -- */
  useEffect(() => {
    let cancelled = false;
    getAccessories()
      .then((rows) => {
        if (!cancelled) setAccessories(rows);
      })
      .catch(() => {
        if (!cancelled) setAccessories([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* -- daftar aksesori untuk item manual (autocomplete nama) -- */
  const accessoryItems = useMemo(
    () => accessories.filter((a) => ITEM_CATEGORIES.includes(a.category)),
    [accessories]
  );

  /* -- daftar aksesori bonus: hanya yang masih ada stok -- */
  const bonusItems = useMemo(
    () => accessories.filter((a) => a.stock > 0 && BONUS_CATEGORIES.includes(a.category)),
    [accessories]
  );

  const selectedAccessoryModel = useMemo(() => {
    const uniqueModels = Array.from(
      new Map(
        selectedUnits.map((unit) => [
          normalizeAccessoryText(unit.model),
          unit.model,
        ]),
      ).values(),
    ).filter((model) => model.trim().length > 0);

    return uniqueModels.length === 1 ? uniqueModels[0] : null;
  }, [selectedUnits]);

  const boxStatusAccessoryByKey = useMemo<Record<BoxStatusKey, Accessory | null>>(
    () => ({
      charger: findAccessoryForBoxStatus(accessories, 'charger', selectedAccessoryModel),
      paperbag: findAccessoryForBoxStatus(accessories, 'paperbag', selectedAccessoryModel),
      temperedGlass: findAccessoryForBoxStatus(accessories, 'temperedGlass', selectedAccessoryModel),
      case: findAccessoryForBoxStatus(accessories, 'case', selectedAccessoryModel),
      kotak: findAccessoryForBoxStatus(accessories, 'kotak', selectedAccessoryModel),
    }),
    [accessories, selectedAccessoryModel],
  );

  const boxStatusRows = useMemo(
    () =>
      (Object.keys(BOX_ACCESSORY_CATEGORIES) as BoxStatusKey[]).map((key) => {
        const accessory = boxStatusAccessoryByKey[key];
        const needsModel = MODEL_SPECIFIC_BOX_KEYS.has(key);
        let disabledReason: string | null = null;

        if (needsModel && selectedUnits.length === 0) {
          disabledReason = 'pilih HP dulu';
        } else if (needsModel && !selectedAccessoryModel) {
          disabledReason = 'pilih 1 model';
        } else if (!accessory) {
          disabledReason = needsModel ? 'stok belum ada' : 'HABIS';
        } else if (accessory.stock <= 0) {
          disabledReason = 'HABIS';
        }

        return {
          key,
          accessory,
          label:
            key === 'charger' || key === 'paperbag'
              ? BOX_STATUS_LABELS[key]
              : accessory?.name ?? BOX_STATUS_LABELS[key],
          disabledReason,
        };
      }),
    [boxStatusAccessoryByKey, selectedAccessoryModel, selectedUnits.length],
  );

  const accessoryStatusRows = useMemo(
    () => boxStatusRows.filter((row) => row.key !== 'kotak'),
    [boxStatusRows],
  );

  const kotakStatusRow = useMemo(
    () => boxStatusRows.find((row) => row.key === 'kotak') ?? null,
    [boxStatusRows],
  );

  const boxStatusBonuses = useMemo<AddedBonus[]>(() => {
    const selected: AddedBonus[] = [];
    (Object.keys(BOX_ACCESSORY_CATEGORIES) as BoxStatusKey[]).forEach((key) => {
      if (!boxStatus[key]) return;
      const accessory = boxStatusAccessoryByKey[key];
      if (accessory && accessory.stock <= 0) return;
      if (!accessory) return;
      selected.push({ id: accessory.id, name: accessory.name, price: accessory.price });
    });
    return selected;
  }, [boxStatusAccessoryByKey, boxStatus]);

  const costedBonuses = useMemo<AddedBonus[]>(() => {
    const map = new Map<string, AddedBonus>();
    for (const bonus of [...boxStatusBonuses, ...addedBonuses]) {
      map.set(bonus.id, bonus);
    }
    return Array.from(map.values());
  }, [boxStatusBonuses, addedBonuses]);

  /* -- derived -- */
  const filteredGroups = useMemo(() => {
    const q = browseSearch.toLowerCase().trim();
    if (!q) return stockGroups;
    return stockGroups.filter(
      (g) =>
        g.model.toLowerCase().includes(q) ||
        g.capacity.toLowerCase().includes(q) ||
        g.condition.toLowerCase().includes(q)
    );
  }, [browseSearch, stockGroups]);

  const hargaJualNum = Number(hargaJual.replace(/\D/g, '')) || 0;
  const imeiActivationNum = Number(imeiActivationPrice.replace(/\D/g, '')) || 0;
  const addedItemsTotal = addedItems.reduce((s, it) => s + it.price, 0);

  const totalTransaction = useMemo(
    () => selectedUnits.reduce((sum, u) => sum + u.sellingPrice, 0) + hargaJualNum + imeiActivationNum + addedItemsTotal,
    [selectedUnits, hargaJualNum, imeiActivationNum, addedItemsTotal]
  );

  const cashNum = Number(cashAmount.replace(/\D/g, '')) || 0;
  const transferNum = Number(transferAmount.replace(/\D/g, '')) || 0;
  const paymentTotal = cashNum + transferNum;
  const discountNum = Number(discount.replace(/\D/g, '')) || 0;

  /* -- net-of-discount total: gross (totalTransaction) minus discount,
        clamped at 0. Equals the gross when no discount is entered. -- */
  const netTotal = Math.max(0, totalTransaction - discountNum);

  /* -- assembled sale (normalized view consumed by the finalization core) -- */
  const assembledSale = useMemo<AssembledSale>(
    () => ({
      units: selectedUnits.map((u) => ({
        // Non-IMEI handling: `validateSale` (services/finalization.ts) does NOT
        // require a non-empty or unique imei — it only reads imei to label an
        // INVALID_PRICE message. So we pass the real `u.imei` as-is (which is ''
        // for non-IMEI stock rows); empty imeis neither fail validation nor break
        // the receipt. The atomic flip to TERJUAL keys off `stockId`, not imei.
        imei: u.imei,
        model: u.model,
        capacity: u.capacity,
        condition: u.condition,
        color: u.color,
        ...(u.defectDescription ? { defectDescription: u.defectDescription } : {}),
        ...(u.batteryHealth > 0 ? { batteryHealth: u.batteryHealth } : {}),
        // Kategori perangkat diteruskan hanya bila bukan default 'IPHONE'
        // (misal 'IPAD' — `imei` berisi SN), agar detail JSON tetap ramping.
        ...(u.deviceCategory && u.deviceCategory !== 'IPHONE'
          ? { deviceCategory: u.deviceCategory }
          : {}),
        sellingPrice: u.sellingPrice,
      })),
      manualSalePrice: hargaJualNum,
      imeiActivationPrice: imeiActivationNum,
      items: addedItems.map((it) => ({ name: it.name, price: it.price })),
      bonuses: costedBonuses.map((b) => ({ name: b.name, costPrice: b.price })),
      warranty: warranty || null,
      customerName: customerName || null,
      customerPhone: customerPhone || null,
      payment: { cash: cashNum, transfer: transferNum },
      discount: discountNum,
    }),
    [
      selectedUnits,
      hargaJualNum,
      imeiActivationNum,
      addedItems,
      costedBonuses,
      warranty,
      customerName,
      customerPhone,
      cashNum,
      transferNum,
      discountNum,
    ]
  );

  /* -- finalize gate (Req 1.4): non-interactive while the sale is invalid -- */
  const validation = useMemo(() => validateSale(assembledSale), [assembledSale]);

  /* -- selected accessories label -- */
  const selectedAccessories = useMemo(() => {
    return boxStatusRows
      .filter((row) => boxStatus[row.key] && !row.disabledReason)
      .map((row) => row.label);
  }, [boxStatus, boxStatusRows]);

  /* -- callbacks -- */
  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isSelected = useCallback(
    (stockId: string) => selectedUnits.some((u) => u.stockId === stockId),
    [selectedUnits]
  );

  const toggleUnit = useCallback(
    (group: StockGroup, unit: UnitDetail) => {
      setSelectedUnits((prev) => {
        const exists = prev.some((u) => u.stockId === unit.stockId);
        if (exists) {
          return prev.filter((u) => u.stockId !== unit.stockId);
        }
        return [
          ...prev,
          {
            stockId: unit.stockId,
            groupId: group.id,
            imei: unit.imei,
            model: group.model,
            capacity: group.capacity,
            condition: group.condition,
            color: unit.color,
            defectDescription: unit.defectDescription,
            batteryHealth: unit.batteryHealth,
            sellingPrice: unit.suggestedPrice,
            stockHasImei: unit.hasImei,
            deviceCategory: unit.deviceCategory,
          },
        ];
      });
    },
    []
  );

  const removeSelected = useCallback((stockId: string) => {
    setSelectedUnits((prev) => prev.filter((u) => u.stockId !== stockId));
  }, []);

  const updateSellingPrice = useCallback((stockId: string, price: number) => {
    setSelectedUnits((prev) =>
      prev.map((u) => (u.stockId === stockId ? { ...u, sellingPrice: price } : u))
    );
  }, []);

  const updateSelectedUnit = useCallback((stockId: string, updates: Partial<SelectedUnit>) => {
    setSelectedUnits((prev) =>
      prev.map((unit) => (unit.stockId === stockId ? { ...unit, ...updates } : unit)),
    );
  }, []);

  const handleReset = useCallback(() => {
    setSelectedUnits([]);
    setCashAmount('');
    setTransferAmount('');
    setDiscount('');
    setCashAccountId(null);
    setCashAccount(null);
    setTransferAccountId(null);
    setTransferAccount(null);
    setCustomerName('');
    setCustomerPhone('');
    setHargaJual('');
    setExpandedGroups(new Set());
    setImeiActivationPrice('');
    setAddedItems([]);
    setAddedBonuses([]);
    setWarranty('');
    setBoxStatus(initialBoxStatus);
  }, []);

  const handleFinalize = useCallback(async () => {
    if (isSubmitting) return;

    // Re-run validation against the assembled sale; surface message on failure
    // and return without mutating any entered data (Req 1.1–1.3, 1.5, 1.6).
    const result = validateSale(assembledSale);
    if (!result.ok) {
      setFinalizeError(result.message);
      return;
    }

    // Validate the account selection for the money-moving portions. The settled
    // amount posted to the ledger is what the customer actually pays
    // (cashNum + transferNum); change due is informational only. Reject without
    // persisting when an account is missing or the wrong type (Req 4.1–4.7).
    const selectionCheck = validatePaymentSelection({
      cashPortion: cashNum,
      cashAccountType: cashAccount?.type ?? null,
      transferPortion: transferNum,
      transferAccountType: transferAccount?.type ?? null,
      requiresPayment: true,
    });
    if (!selectionCheck.ok) {
      setFinalizeError(selectionCheck.message);
      return;
    }

    setFinalizeError(null);
    setIsSubmitting(true);

    try {
      const totals = computeTotals(assembledSale);
      const detail = serializeSaleDetail(toSaleDetail(assembledSale));
      const description = buildDescription(customerName || null, selectedUnits.length);

      // Penjualan is an income flow → money_in. Build the postings from the
      // actual received cash/transfer portions (Req 2.3, 5.1–5.4, 7.1).
      const direction = deriveDirection('income');
      const selection: PaymentSelection = {
        cashPortion: cashNum,
        cashAccountId,
        transferPortion: transferNum,
        transferAccountId,
      };
      const postings = buildPostings(direction, selection);

      // Real stock units being sold: their ids drive the atomic flip to
      // TERJUAL / count decrement inside record_sale_with_postings (keyed by
      // stockId, independent of imei).
      const stockIds = selectedUnits.map((u) => u.stockId);

      // Aksesori bonus yang dipilih → diteruskan ke RPC: tiap baris mendekremen
      // accessory_stock sebesar qty dan biayanya (unit_cost) di-roll ke harga
      // modal unit pertama yang terjual. qty default 1 per bonus.
      const accessories: SaleAccessoryInput[] = costedBonuses.map((b) => ({
        id: b.id,
        qty: 1,
        unit_cost: b.price,
      }));

      // Persist with a 10s timeout race (Req 3.8): the sentinel rejects if the
      // insert does not resolve in time.
      const TIMEOUT_MS = 10_000;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('FINALIZE_TIMEOUT')),
          TIMEOUT_MS
        );
      });

      let transactionId: string | undefined;
      try {
        transactionId = await Promise.race([
          recordSaleWithPostings({
            type: 'Penjualan',
            description,
            detail,
            amount: totals.transactionTotal,
            postings,
            stockIds,
            accessories,
          }),
          timeout,
        ]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }

      // Success within 10s: capture the confirmation snapshot (Req 3.7, 4.1).
      const finalizedAt = new Date().toISOString();
      const receipt: ReceiptData = {
        transactionId,
        units: assembledSale.units,
        items: assembledSale.items,
        bonuses: assembledSale.bonuses,
        warranty: assembledSale.warranty,
        customerName: assembledSale.customerName,
        customerPhone: assembledSale.customerPhone,
        totals,
        payment: assembledSale.payment,
        finalizedAt,
      };
      setPrintError(null);
      setResetError(null);
      setConfirmation(receipt);
    } catch {
      // Error or timeout: retain all entered data, do not open confirmation (Req 3.8).
      setFinalizeError('Penjualan tidak dapat disimpan. Silakan coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    assembledSale,
    customerName,
    selectedUnits,
    costedBonuses,
    cashNum,
    transferNum,
    cashAccount,
    transferAccount,
    cashAccountId,
    transferAccountId,
  ]);

  /* -- confirmation print/dismiss (tasks 8.3, 8.4) -- */
  const handlePrint = useCallback(() => {
    try {
      setPrintError(null);
      printReceipt();
    } catch {
      setPrintError('Tidak dapat membuka dialog cetak');
    }
  }, []);

  const handleDismissConfirmation = useCallback(() => {
    try {
      handleReset();
      setConfirmation(null);
      setPrintError(null);
      setResetError(null);
      // Reload READY stock so units just sold (now TERJUAL in the DB) drop out
      // of the browse/IMEI lists and can't be sold again.
      setStockReloadKey((k) => k + 1);
    } catch {
      // Reset failed: keep the confirmation open and surface the error (Req 5.5).
      setResetError('Reset tidak selesai');
    }
  }, [handleReset]);

  /* -- IMEI search tab -- */
  const [imeiSearch, setImeiSearch] = useState('');
  const [imeiResult, setImeiResult] = useState<(UnitDetail & { model: string; capacity: string; condition: string }) | null>(null);

  const handleImeiSearch = useCallback(() => {
    const q = imeiSearch.trim();
    if (!isSearchableIdentifier(q)) return;
    for (const g of stockGroups) {
      // Skip non-IMEI rows (empty imei) so a query never matches them.
      // 15 digit → IMEI iPhone, exact match; 8–14 karakter → SN iPad,
      // dicocokkan case-insensitive (SN tersimpan uppercase di DB).
      const unit = g.units.find(
        (u) =>
          u.imei !== '' &&
          (q.length === 15
            ? u.imei === q
            : u.imei.toUpperCase() === q.toUpperCase())
      );
      if (unit) {
        setImeiResult({
          ...unit,
          model: g.model,
          capacity: g.capacity,
          condition: g.condition,
        });
        return;
      }
    }
    setImeiResult(null);
  }, [imeiSearch, stockGroups]);

  const addImeiResult = useCallback(() => {
    if (!imeiResult) return;
    const group = stockGroups.find(
      (g) =>
        g.model === imeiResult.model &&
        g.capacity === imeiResult.capacity &&
        g.condition === imeiResult.condition
    );
    if (!group) return;
    toggleUnit(group, {
      stockId: imeiResult.stockId,
      imei: imeiResult.imei,
      color: imeiResult.color,
      batteryHealth: imeiResult.batteryHealth,
      suggestedPrice: imeiResult.suggestedPrice,
      hasImei: imeiResult.hasImei,
      stockCount: imeiResult.stockCount,
      defectDescription: imeiResult.defectDescription,
      deviceCategory: imeiResult.deviceCategory,
    });
    setImeiResult(null);
    setImeiSearch('');
  }, [imeiResult, toggleUnit, stockGroups]);

  /* -- item/bonus modal handlers -- */
  const addItem = () => {
    const price = Number(itemPrice.replace(/\D/g, '')) || 0;
    if (!selectedItemName || price <= 0) return;
    setAddedItems((prev) => [...prev, { id: `ITM-${Date.now()}`, name: selectedItemName, price }]);
    setShowItemModal(false);
    setItemPrice('');
    setSelectedItemName('');
    setItemSearch('');
  };

  const addBonus = (acc: Accessory) => {
    if (addedBonuses.some((b) => b.id === acc.id)) return;
    setAddedBonuses((prev) => [...prev, { id: acc.id, name: acc.name, price: acc.price }]);
  };

  const removeItem = (id: string) => setAddedItems((prev) => prev.filter((it) => it.id !== id));
  const removeBonus = (id: string) => setAddedBonuses((prev) => prev.filter((b) => b.id !== id));

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
        <motion.div variants={cardVariants} className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate('/')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-[36px] text-slate-900 leading-tight">
              Penjualan HP
            </h1>
          </div>
        </motion.div>

        <motion.div variants={cardVariants} className="mb-2">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-[13px] text-slate-500">1 / 5</span>
            <div className="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '20%' }}
                transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] as [number, number, number, number] }}
                className="h-full rounded-full bg-teal-500"
              />
            </div>
          </div>
          <p className="text-[14px] text-slate-500">
            Cari unit dari stok, isi detail konsumen, items &amp; bonus, garansi, lalu pembayaran.
          </p>
        </motion.div>
      </motion.div>

      {/* ====== Card 1: Pilih Unit HP ====== */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-6"
      >
        <motion.div variants={cardVariants} className="rounded-2xl border border-slate-200 bg-white shadow-card p-6">
          <div className="mb-5">
            <h2 className="text-[18px] font-semibold text-slate-900 font-body">Pilih Unit HP</h2>
            <p className="text-[13px] text-slate-500 mt-0.5">
              Cari berdasarkan IMEI atau browse stok yang siap dijual.
            </p>
          </div>

          {/* Tab Toggle */}
          <div className="relative flex bg-surface-sunk rounded-xl p-1 mb-5">
            <motion.div
              layoutId="penjualan-tab-indicator"
              className="absolute top-1 bottom-1 rounded-[10px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
              style={{
                left: activeTab === 'cari' ? 4 : '50%',
                width: 'calc(50% - 4px)',
              }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            />
            <button
              onClick={() => setActiveTab('cari')}
              className={`relative z-10 flex-1 rounded-[10px] py-2.5 text-[14px] font-medium text-center transition-colors ${
                activeTab === 'cari' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Cari IMEI / SN
            </button>
            <button
              onClick={() => setActiveTab('browse')}
              className={`relative z-10 flex-1 rounded-[10px] py-2.5 text-[14px] font-medium text-center transition-colors ${
                activeTab === 'browse' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Browse Stok
            </button>
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {activeTab === 'cari' ? (
              <motion.div
                key="cari"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.25, ease: easeSmooth }}
              >
                <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                  IMEI / SN
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={imeiSearch}
                      onChange={(e) => {
                        // Alfanumerik: IMEI 15 digit (iPhone) atau SN 8–14 karakter (iPad).
                        const v = e.target.value.replace(/[^0-9A-Za-z]/g, '').slice(0, 15);
                        setImeiSearch(v);
                        if (!isSearchableIdentifier(v)) setImeiResult(null);
                      }}
                      placeholder="Contoh: 352461789012345"
                      className="w-full h-11 rounded-xl border border-slate-300 bg-white px-4 font-mono text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                    />
                    {isSearchableIdentifier(imeiSearch) && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Check size={18} className="text-emerald-500" />
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleImeiSearch}
                    disabled={!isSearchableIdentifier(imeiSearch)}
                    className="h-11 rounded-xl bg-teal-500 px-5 text-[14px] font-semibold text-white transition-colors hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Cari
                  </button>
                </div>
                {imeiSearch.length > 0 && !isSearchableIdentifier(imeiSearch) && (
                  <p className="text-[12px] text-amber-600 mt-1.5">Masukkan 15 digit IMEI atau 8–14 karakter SN</p>
                )}

                <AnimatePresence>
                  {imeiResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[14px] font-semibold text-slate-900">{imeiResult.model}</p>
                          <p className="text-[13px] text-slate-500">{imeiResult.capacity} &middot; {imeiResult.condition}</p>
                          <p className="text-[13px] text-slate-500">{imeiResult.color}</p>
                          <p className="font-mono text-[14px] text-slate-600 mt-1">
                            {imeiResult.deviceCategory === 'IPAD'
                              ? `${identifierLabel(imeiResult.deviceCategory)}: ${imeiResult.imei}`
                              : imeiResult.imei}
                          </p>
                          <p className="font-mono text-[16px] font-semibold text-slate-900 mt-1">{formatPrice(imeiResult.suggestedPrice)}</p>
                        </div>
                        <button
                          onClick={addImeiResult}
                          className="h-10 rounded-xl bg-teal-500 px-4 text-[13px] font-semibold text-white hover:bg-teal-600 transition-colors"
                        >
                          + Tambah
                        </button>
                      </div>
                    </motion.div>
                  )}
                  {isSearchableIdentifier(imeiSearch) && !imeiResult && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center"
                    >
                      <Smartphone size={40} className="mx-auto text-slate-300 mb-2" />
                      <p className="text-[14px] text-slate-500">Unit tidak ditemukan di stok.</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div
                key="browse"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.25, ease: easeSmooth }}
              >
                {/* Search */}
                <div className="relative mb-4">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={browseSearch}
                    onChange={(e) => setBrowseSearch(e.target.value)}
                    placeholder="Cari tipe / kapasitas / warna..."
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-10 pr-10 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                  />
                  {browseSearch && (
                    <button
                      onClick={() => setBrowseSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Accordion List */}
                <div className="space-y-2">
                  {stockLoading ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
                      <Loader2 size={28} className="text-teal-500 animate-spin mb-2" />
                      <p className="text-[14px] text-slate-500">Memuat stok…</p>
                    </div>
                  ) : stockError ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 p-8 text-center">
                      <AlertCircle size={28} className="text-red-500 mb-2" />
                      <p className="text-[14px] text-red-700 mb-3">{stockError}</p>
                      <button
                        onClick={() => setStockReloadKey((k) => k + 1)}
                        className="flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-red-600 transition-colors"
                      >
                        <RotateCcw size={14} /> Coba lagi
                      </button>
                    </div>
                  ) : (
                    <>
                      <AnimatePresence>
                        {filteredGroups.map((group, idx) => (
                          <motion.div
                            key={group.id}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.04, duration: 0.3, ease: easeSmooth }}
                            className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                          >
                        {/* Group Header */}
                        <button
                          onClick={() => toggleGroup(group.id)}
                          className="flex w-full items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="text-left">
                              <p className="text-[14px] font-semibold text-slate-900">
                                {group.model} &middot; {group.capacity}
                              </p>
                              <p className="text-[13px] text-slate-500">{group.condition}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700">
                              {group.units.reduce((sum, unit) => sum + unit.stockCount, 0)}
                            </span>
                            <motion.div
                              animate={{ rotate: expandedGroups.has(group.id) ? 180 : 0 }}
                              transition={{ duration: 0.3, ease: easeSmooth }}
                            >
                              <ChevronDown size={18} className="text-slate-400" />
                            </motion.div>
                          </div>
                        </button>

                        {/* Expanded Units */}
                        <AnimatePresence>
                          {expandedGroups.has(group.id) && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: easeSmooth }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 pb-4 space-y-2">
                                {group.units.map((unit) => {
                                  const selected = isSelected(unit.stockId);
                                  return (
                                    <motion.div
                                      key={unit.stockId}
                                      layout
                                      className={`flex items-center justify-between rounded-[10px] p-3 transition-colors ${
                                        selected
                                          ? 'bg-teal-50 border border-teal-200'
                                          : 'bg-slate-50 border border-slate-100'
                                      }`}
                                    >
                                      <div className="flex-1 min-w-0">
                                        <p className="font-mono text-[13px] text-slate-700 tracking-[0.04em]">
                                          {unit.deviceCategory === 'IPAD'
                                            ? `${identifierLabel(unit.deviceCategory)}: ${unit.imei}`
                                            : unit.imei || 'Tanpa IMEI'}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                          <span className="text-[12px] text-slate-500">{unit.color}</span>
                                          <span className="text-slate-300">&middot;</span>
                                          <span className="text-[12px] text-slate-500">{formatPrice(unit.suggestedPrice)}</span>
                                          {unit.defectDescription && (
                                            <>
                                              <span className="text-slate-300">&middot;</span>
                                              <span className="text-[12px] font-medium text-amber-700">{unit.defectDescription}</span>
                                            </>
                                          )}
                                          {!unit.hasImei && unit.stockCount > 1 && (
                                            <>
                                              <span className="text-slate-300">&middot;</span>
                                              <span className="text-[12px] text-slate-500">{unit.stockCount} tersedia</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => toggleUnit(group, unit)}
                                        className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition-all ${
                                          selected
                                            ? 'bg-teal-500 text-white'
                                            : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-600'
                                        }`}
                                      >
                                        {selected ? (
                                          <>
                                            <Check size={14} /> Dipilih
                                          </>
                                        ) : (
                                          <>+ Pilih</>
                                        )}
                                      </button>
                                    </motion.div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {filteredGroups.length === 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                      <Smartphone size={40} className="mx-auto text-slate-300 mb-2" />
                      <p className="text-[14px] text-slate-500">
                        {stockGroups.length === 0
                          ? 'Belum ada stok siap dijual.'
                          : 'Tidak ada stok yang cocok.'}
                      </p>
                    </div>
                  )}
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Selected Units Chips */}
          <AnimatePresence>
            {selectedUnits.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: easeSmooth }}
                className="mt-5 pt-5 border-t border-slate-200"
              >
                <p className="text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-2">
                  {selectedUnits.length} unit dipilih
                </p>
                <div className="flex flex-wrap gap-2">
                  <AnimatePresence>
                    {selectedUnits.map((unit) => (
                      <motion.div
                        key={unit.stockId}
                        initial={{ opacity: 0, scale: 0.9, x: 20 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.9, x: 20 }}
                        transition={{ duration: 0.2, ease: easeSmooth }}
                        className="flex items-center gap-2 rounded-lg bg-teal-50 border border-teal-200 pl-3 pr-2 py-1.5"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] text-teal-800">{unit.imei || 'Tanpa IMEI'}</p>
                          <p className="text-[11px] text-teal-600">{unit.model}</p>
                        </div>
                        <button
                          onClick={() => removeSelected(unit.stockId)}
                          className="flex-shrink-0 h-5 w-5 rounded-full bg-teal-200/60 flex items-center justify-center text-teal-700 hover:bg-teal-200 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ====== Card 2: Detail Konsumen ====== */}
        <motion.div variants={cardVariants} className="rounded-2xl border border-slate-200 bg-white shadow-card p-6">
          <button
            onClick={() => setCustomerOpen((v) => !v)}
            className="flex w-full items-center justify-between"
          >
            <div className="text-left">
              <h2 className="text-[18px] font-semibold text-slate-900 font-body">Detail Konsumen</h2>
              <p className="text-[13px] text-slate-500 mt-0.5">Data pembeli + harga jual keseluruhan.</p>
            </div>
            <motion.div
              animate={{ rotate: customerOpen ? 180 : 0 }}
              transition={{ duration: 0.3, ease: easeSmooth }}
            >
              <ChevronDown size={20} className="text-slate-400" />
            </motion.div>
          </button>

          <AnimatePresence>
            {customerOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: easeSmooth }}
                className="overflow-hidden"
              >
                <div className="pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.06 }}
                  >
                    <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                      Nama Konsumen
                    </label>
                    <div className="relative">
                      <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Budi Santoso"
                        className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                      />
                    </div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 }}
                  >
                    <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                      No. WhatsApp
                    </label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                        placeholder="081234567890"
                        className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                      />
                    </div>
                  </motion.div>
                  {/* HARGA JUAL - NEW */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18 }}
                    className="sm:col-span-2"
                  >
                    <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
                      HARGA JUAL *
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 font-mono">Rp</span>
                      <input
                        type="text"
                        value={hargaJual ? 'Rp ' + hargaJual.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}
                        onChange={(e) => {
                          const num = e.target.value.replace(/\D/g, '');
                          setHargaJual(num);
                        }}
                        placeholder="0"
                        className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-12 pr-4 font-mono text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">Harga jual akhir setelah semua tambahan/bonus.</p>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ====== Card 3: Harga Jual per Unit ====== */}
        <AnimatePresence>
          {selectedUnits.length > 0 && (
            <motion.div
              variants={cardVariants}
              initial="hidden"
              animate="show"
              className="rounded-2xl border border-slate-200 bg-white shadow-card p-6"
            >
              <h2 className="text-[18px] font-semibold text-slate-900 font-body mb-4">Harga Jual per Unit</h2>
              <div className="space-y-3">
                {selectedUnits.map((unit, idx) => (
                  <motion.div
                    key={unit.stockId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05, duration: 0.3, ease: easeSmooth }}
                    className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-slate-900">{unit.model}</p>
                      <p className="text-[12px] text-slate-500">{unit.capacity} &middot; {unit.condition} &middot; {unit.color}</p>
                      {unit.defectDescription && (
                        <p className="mt-0.5 text-[12px] font-medium text-amber-700">
                          Minus: {unit.defectDescription}
                        </p>
                      )}
                      <p className="font-mono text-[12px] text-slate-400 mt-0.5">{unit.imei || 'Tanpa IMEI'}</p>
                    </div>
                    <div className="flex-shrink-0">
                      <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1 text-right">
                        Harga Jual
                      </label>
                      <input
                        type="text"
                        value={unit.sellingPrice > 0 ? 'Rp ' + unit.sellingPrice.toLocaleString('id-ID') : ''}
                        onChange={(e) => {
                          const num = Number(e.target.value.replace(/\D/g, ''));
                          updateSellingPrice(unit.stockId, num);
                        }}
                        placeholder="Rp 0"
                        className="w-40 h-10 rounded-xl border border-slate-300 bg-white px-3 font-mono text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all text-right"
                      />
                    </div>
                    {!unit.stockHasImei && (
                      <div className="basis-full grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
                        <div>
                          <label
                            htmlFor={`sale-imei-${unit.stockId}`}
                            className="block text-[11px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1"
                          >
                            IMEI Unit
                          </label>
                          <input
                            id={`sale-imei-${unit.stockId}`}
                            type="text"
                            value={unit.imei}
                            onChange={(e) => {
                              updateSelectedUnit(unit.stockId, {
                                imei: e.target.value.replace(/\D/g, '').slice(0, 15),
                              });
                            }}
                            placeholder="351234567890123"
                            maxLength={15}
                            className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 font-mono text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`sale-color-${unit.stockId}`}
                            className="block text-[11px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1"
                          >
                            Warna Aktual
                          </label>
                          <input
                            id={`sale-color-${unit.stockId}`}
                            type="text"
                            value={unit.color}
                            onChange={(e) => updateSelectedUnit(unit.stockId, { color: e.target.value })}
                            placeholder="Black"
                            className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`sale-bh-${unit.stockId}`}
                            className="block text-[11px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1"
                          >
                            Battery Health (%)
                          </label>
                          <input
                            id={`sale-bh-${unit.stockId}`}
                            type="number"
                            min={0}
                            max={100}
                            value={unit.batteryHealth > 0 ? unit.batteryHealth : ''}
                            onChange={(e) => {
                              const value = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                              updateSelectedUnit(unit.stockId, { batteryHealth: value });
                            }}
                            placeholder="87"
                            className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 font-mono text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                          />
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ====== Card 4: Items & Bonus ====== */}
        <motion.div variants={cardVariants} className="rounded-2xl border border-slate-200 bg-white shadow-card p-6">
          <div className="mb-5">
            <h2 className="text-[18px] font-semibold text-slate-900 font-body">Items &amp; Bonus</h2>
            <p className="text-[13px] text-slate-500 mt-0.5">
              Items berbayar tambahan + bonus aksesoris (untuk pengurangan stok pelengkap otomatis).
            </p>
          </div>

          {/* Aktivasi IMEI */}
          <div className="mb-5">
            <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
              AKTIVASI IMEI (OPSIONAL)
            </label>
            <div className="relative">
              <Shield size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={imeiActivationPrice ? 'Rp ' + imeiActivationPrice.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}
                onChange={(e) => {
                  const num = e.target.value.replace(/\D/g, '');
                  setImeiActivationPrice(num);
                }}
                placeholder="Rp 0"
                className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-10 pr-4 font-mono text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
              />
            </div>
          </div>

          {/* Items Tambahan */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em]">
                ITEMS TAMBAHAN
              </label>
              <button
                onClick={() => setShowItemModal(true)}
                className="flex items-center gap-1 rounded-lg bg-teal-50 px-3 py-1.5 text-[12px] font-medium text-teal-700 hover:bg-teal-100 transition-colors"
              >
                <Plus size={14} /> Tambah Item
              </button>
            </div>
            <AnimatePresence>
              {addedItems.length > 0 ? (
                <div className="space-y-2">
                  {addedItems.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Plug size={14} className="text-slate-400" />
                        <span className="text-[13px] text-slate-700">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-medium text-slate-900">{formatPrice(item.price)}</span>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="h-6 w-6 rounded-full bg-slate-200/60 flex items-center justify-center text-slate-500 hover:bg-rose-100 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-slate-400 italic">Belum ada item tambahan.</p>
              )}
            </AnimatePresence>
          </div>

          {/* Bonus Aksesoris */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em]">
                BONUS AKSESORIS
              </label>
              <button
                onClick={() => setShowBonusModal(true)}
                className="flex items-center gap-1 rounded-lg bg-purple-50 px-3 py-1.5 text-[12px] font-medium text-purple-700 hover:bg-purple-100 transition-colors"
              >
                <Gift size={14} /> Tambah Bonus
              </button>
            </div>
            <AnimatePresence>
              {addedBonuses.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {addedBonuses.map((bonus) => (
                    <motion.div
                      key={bonus.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="flex items-center gap-2 rounded-lg bg-purple-50 border border-purple-200 pl-3 pr-2 py-1.5"
                    >
                      <Gift size={12} className="text-purple-500" />
                      <span className="text-[12px] text-purple-700">{bonus.name}</span>
                      <button
                        onClick={() => removeBonus(bonus.id)}
                        className="h-5 w-5 rounded-full bg-purple-200/60 flex items-center justify-center text-purple-600 hover:bg-purple-200 transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-slate-400 italic">Belum ada bonus aksesoris.</p>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ====== Card 5: Garansi & Box ====== */}
        <motion.div variants={cardVariants} className="rounded-2xl border border-slate-200 bg-white shadow-card p-6">
          <div className="mb-5">
            <h2 className="text-[18px] font-semibold text-slate-900 font-body">Garansi &amp; Box</h2>
            <p className="text-[13px] text-slate-500 mt-0.5">
              Tier garansi yang diberikan ke pembeli + status kotak/aksesoris.
            </p>
          </div>

          {/* Garansi Dropdown */}
          <div className="mb-5">
            <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
              GARANSI *
            </label>
            <select
              value={warranty}
              onChange={(e) => setWarranty(e.target.value)}
              className="w-full h-11 rounded-xl border border-slate-300 px-4 text-[14px] outline-none transition-all duration-200 font-body bg-white focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
            >
              <option value="">Pilih garansi</option>
              {warrantyOptions.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
            {!warranty && <p className="text-[11px] text-amber-600 mt-1">Pilih tier garansi (wajib).</p>}
          </div>

          {/* Status Kotak & Aksesoris */}
          <div>
            <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-2">
              STATUS KOTAK &amp; AKSESORIS *
            </label>

            {/* AKSESORIS (GROUP) */}
            <div className="rounded-xl border border-slate-200 overflow-hidden mb-3">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.06em]">AKSESORIS (GROUP)</p>
              </div>
              <div className="divide-y divide-slate-100">
                {accessoryStatusRows.map((row) => {
                  const disabled = Boolean(row.disabledReason);
                  return (
                    <label
                      key={row.key}
                      className={`flex items-center justify-between px-4 py-3 transition-colors ${
                        disabled
                          ? 'bg-slate-50/30 cursor-not-allowed'
                          : 'hover:bg-slate-50/50 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={boxStatus[row.key] && !disabled}
                          disabled={disabled}
                          onChange={(e) =>
                            setBoxStatus((p) => ({ ...p, [row.key]: e.target.checked }))
                          }
                          className={`h-4 w-4 rounded ${
                            disabled
                              ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                              : 'border-slate-300 text-teal-600 focus:ring-teal-500'
                          }`}
                        />
                        <span className={`text-[13px] ${disabled ? 'text-slate-400' : 'text-slate-700'}`}>
                          {row.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {row.accessory && row.accessory.stock > 0 ? (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            disabled ? 'bg-slate-100 text-slate-400' : 'bg-teal-50 text-teal-700'
                          }`}>
                            {row.accessory.stock} in stock
                          </span>
                        ) : null}
                        {row.disabledReason === 'HABIS' ? (
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                            HABIS
                          </span>
                        ) : row.disabledReason ? (
                          <span className="text-[11px] text-slate-400 italic">{row.disabledReason}</span>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* KOTAK */}
            <div className="rounded-xl border border-slate-200 overflow-hidden mb-3">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.06em]">KOTAK</p>
              </div>
              <div>
                {kotakStatusRow ? (
                  <label
                    className={`flex items-center justify-between px-4 py-3 transition-colors ${
                      kotakStatusRow.disabledReason
                        ? 'bg-slate-50/30 cursor-not-allowed'
                        : 'hover:bg-slate-50/50 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={boxStatus.kotak && !kotakStatusRow.disabledReason}
                        disabled={Boolean(kotakStatusRow.disabledReason)}
                        onChange={(e) => setBoxStatus((p) => ({ ...p, kotak: e.target.checked }))}
                        className={`h-4 w-4 rounded ${
                          kotakStatusRow.disabledReason
                            ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                            : 'border-slate-300 text-teal-600 focus:ring-teal-500'
                        }`}
                      />
                      <span
                        className={`text-[13px] ${
                          kotakStatusRow.disabledReason ? 'text-slate-400' : 'text-slate-700'
                        }`}
                      >
                        {kotakStatusRow.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {kotakStatusRow.accessory && kotakStatusRow.accessory.stock > 0 ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            kotakStatusRow.disabledReason
                              ? 'bg-slate-100 text-slate-400'
                              : 'bg-teal-50 text-teal-700'
                          }`}
                        >
                          {kotakStatusRow.accessory.stock} in stock
                        </span>
                      ) : null}
                      {kotakStatusRow.disabledReason === 'HABIS' ? (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                          HABIS
                        </span>
                      ) : kotakStatusRow.disabledReason ? (
                        <span className="text-[11px] text-slate-400 italic">
                          {kotakStatusRow.disabledReason}
                        </span>
                      ) : null}
                    </div>
                  </label>
                ) : null}
              </div>
            </div>

            {/* Status otomatis */}
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
              <p className="text-[13px] text-amber-800">
                <span className="font-medium">Kelengkapan:</span>{' '}
                {selectedAccessories.length > 0 ? selectedAccessories.join(', ') : '—'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* ====== Card 6: Pembayaran ====== */}
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
                  onChange={(e) => {
                    const num = e.target.value.replace(/\D/g, '');
                    setCashAmount(num);
                  }}
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
                  onChange={(e) => {
                    const num = e.target.value.replace(/\D/g, '');
                    setTransferAmount(num);
                  }}
                  placeholder="Rp 0"
                  className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-10 pr-4 font-mono text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Diskon / Potongan Harga (Phase 5 sales-discount). Rupiah-formatted
              like the cash/transfer fields; feeds discountNum → assembledSale. */}
          <div className="mt-4">
            <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">
              Diskon / Potongan Harga
            </label>
            <div className="relative">
              <input
                type="text"
                value={discount ? 'Rp ' + discount.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}
                onChange={(e) => {
                  const num = e.target.value.replace(/\D/g, '');
                  setDiscount(num);
                }}
                placeholder="Rp 0"
                className="w-full h-11 rounded-xl border border-slate-300 bg-white px-4 font-mono text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
              />
            </div>
          </div>

          {/* Account selection per non-zero payment portion (task 6.1).
              Cash portion → Cash account; transfer portion → Bank account. */}
          {(cashNum > 0 || transferNum > 0) && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {cashNum > 0 && (
                <AccountPicker
                  label="Akun Kas (porsi cash)"
                  filterType="Cash"
                  accounts={accounts}
                  value={cashAccountId}
                  onChange={(id, account) => {
                    setCashAccountId(id);
                    setCashAccount(account);
                  }}
                />
              )}
              {transferNum > 0 && (
                <AccountPicker
                  label="Akun Bank (porsi transfer)"
                  filterType="Bank"
                  accounts={accounts}
                  value={transferAccountId}
                  onChange={(id, account) => {
                    setTransferAccountId(id);
                    setTransferAccount(account);
                  }}
                />
              )}
            </div>
          )}

          {totalTransaction > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-xl bg-slate-50 p-4"
            >
              {/* Totals breakdown: gross subtotal, discount, net total (Phase 5). */}
              <div className="space-y-1 mb-3 border-b border-slate-200 pb-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-slate-500">Subtotal</span>
                  <span className="font-mono text-[14px] text-slate-700">{formatPrice(totalTransaction)}</span>
                </div>
                {discountNum > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-slate-500">Diskon</span>
                    <span className="font-mono text-[14px] text-rose-600">- {formatPrice(discountNum)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-slate-700">Total</span>
                  <span className="font-mono text-[15px] font-semibold text-slate-900">{formatPrice(netTotal)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-[13px] text-slate-500">Total Transaksi</p>
                  <p className="font-mono text-[20px] font-semibold text-slate-900">{formatPrice(netTotal)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] text-slate-500">Total Bayar</p>
                  <p className={`font-mono text-[20px] font-semibold ${paymentTotal >= netTotal ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {formatPrice(paymentTotal)}
                  </p>
                </div>
              </div>
              {paymentTotal >= netTotal && netTotal > 0 && (
                <div className="flex items-center gap-1 text-emerald-600">
                  <Check size={14} />
                  <span className="text-[12px] font-medium">Pembayaran lunas</span>
                </div>
              )}
            </motion.div>
          )}

          {paymentTotal > 0 && paymentTotal < netTotal && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[13px] text-amber-600 mt-2"
            >
              Jumlah pembayaran belum sesuai total. Kurang {formatPrice(netTotal - paymentTotal)}.
            </motion.p>
          )}
        </motion.div>
      </motion.div>

      {/* ====== Item Modal ====== */}
      <AnimatePresence>
        {showItemModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setShowItemModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.25, ease: easeSmooth }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-card-hover p-6"
            >
              <h3 className="text-[18px] font-semibold text-slate-900 mb-1">Tambah Item Berbayar</h3>
              <p className="text-[13px] text-slate-500 mb-4">Pilih aksesoris dan masukkan harga jual.</p>

              {/* Search / Select */}
              <div className="mb-4">
                <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">Nama Item</label>
                <input
                  type="text"
                  value={itemSearch}
                  onChange={(e) => {
                    setItemSearch(e.target.value);
                    setSelectedItemName(e.target.value);
                  }}
                  placeholder="Cari atau ketik nama item..."
                  className="w-full h-11 rounded-xl border border-slate-300 bg-white px-4 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all mb-2"
                />
                <div className="max-h-32 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {accessoryItems
                    .filter((a) => a.name.toLowerCase().includes(itemSearch.toLowerCase()))
                    .map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          setSelectedItemName(a.name);
                          setItemSearch(a.name);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 text-left transition-colors"
                      >
                        <span className="text-[13px] text-slate-700">{a.name}</span>
                        <span className="text-[11px] text-slate-400">stok: {a.stock}</span>
                      </button>
                    ))}
                  {itemSearch && !accessoryItems.some((a) => a.name.toLowerCase().includes(itemSearch.toLowerCase())) && (
                    <div className="px-3 py-2 text-[12px] text-slate-400 italic">Ketik nama item manual</div>
                  )}
                </div>
              </div>

              <div className="mb-5">
                <label className="block text-[12px] font-medium text-slate-500 uppercase tracking-[0.04em] mb-1.5">Harga Jual (Rp)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 font-mono">Rp</span>
                  <input
                    type="text"
                    value={itemPrice ? 'Rp ' + itemPrice.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}
                    onChange={(e) => setItemPrice(e.target.value.replace(/\D/g, ''))}
                    placeholder="0"
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-12 pr-4 font-mono text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10 transition-all"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowItemModal(false);
                    setItemPrice('');
                    setSelectedItemName('');
                    setItemSearch('');
                  }}
                  className="flex-1 rounded-xl bg-slate-100 py-2.5 text-[14px] font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={addItem}
                  disabled={!selectedItemName || Number(itemPrice.replace(/\D/g, '')) <= 0}
                  className="flex-1 rounded-xl bg-teal-500 py-2.5 text-[14px] font-semibold text-white hover:bg-teal-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Tambah
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====== Bonus Modal ====== */}
      <AnimatePresence>
        {showBonusModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setShowBonusModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.25, ease: easeSmooth }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-card-hover p-6"
            >
              <h3 className="text-[18px] font-semibold text-slate-900 mb-1">Tambah Bonus Aksesoris</h3>
              <p className="text-[13px] text-slate-500 mb-4">Pilih aksesoris dari stok yang tersedia.</p>

              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4">
                {bonusItems.map((item) => {
                  const alreadyAdded = addedBonuses.some((b) => b.id === item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (!alreadyAdded) addBonus(item);
                      }}
                      disabled={alreadyAdded}
                      className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                        alreadyAdded ? 'bg-purple-50 cursor-not-allowed opacity-60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Gift size={14} className={alreadyAdded ? 'text-purple-400' : 'text-slate-400'} />
                        <span className={`text-[13px] ${alreadyAdded ? 'text-purple-700' : 'text-slate-700'}`}>{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">{item.stock}</span>
                        {alreadyAdded && <Check size={14} className="text-purple-500" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setShowBonusModal(false)}
                className="w-full rounded-xl bg-slate-100 py-2.5 text-[14px] font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Tutup
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====== Bottom Action Bar ====== */}
      <motion.div
        initial={{ y: 72, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: easeSmooth, delay: 0.3 }}
        className="fixed bottom-0 left-0 right-0 z-40 h-[72px] border-t border-slate-200 bg-white shadow-bottom-bar"
      >
        {finalizeError && (
          <div className="absolute -top-12 left-0 right-0 mx-auto max-w-[1200px] px-4 sm:px-6">
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-medium text-red-700 shadow-sm"
            >
              {finalizeError}
            </div>
          </div>
        )}
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <div>
            <p className="text-[13px] text-slate-500">Total Transaksi</p>
            <motion.p
              key={totalTransaction}
              initial={{ scale: 1.05 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="font-mono text-[22px] font-bold text-slate-900 leading-tight"
            >
              {formatPrice(totalTransaction)}
            </motion.p>
            {selectedUnits.length > 0 && (
              <p className="text-[12px] text-slate-500">{selectedUnits.length} unit dipilih</p>
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
              onClick={handleFinalize}
              disabled={!validation.ok || isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-teal-600 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={16} />
              {isSubmitting ? 'Menyimpan…' : 'Simpan Penjualan'}
            </button>
          </div>
        </div>
      </motion.div>

      {/* ====== Confirmation overlay (tasks 8.3, 8.4) ====== */}
      {confirmation && (
        <ConfirmationView
          receipt={confirmation}
          printError={resetError ?? printError}
          onPrint={handlePrint}
          onDismiss={handleDismissConfirmation}
        />
      )}
    </div>
  );
}
