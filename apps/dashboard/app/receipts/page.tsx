'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { BackLink, PageShell } from '@/components/PageShell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { supabase } from '@/lib/supabaseClient';

type ReceiptRow = {
  id: string;
  owner_id: string;
  store: string;
  receipt_date: string;
  currency: string;
  total_amount: number;
  discount_total: number;
  sgr_bottle_charge: number;
  sgr_recovered_amount: number;
  merchant_name: string | null;
  merchant_city: string | null;
  merchant_cif: string | null;
  processing_status: string | null;
  processing_warnings: unknown[] | null;
  source_file_name: string | null;
  source_rel_path: string | null;
  source_hash: string | null;
  schema_version: number | null;
};

type FoodQuality = 'healthy' | 'balanced' | 'junk';

const FOOD_QUALITY_OPTIONS: { value: FoodQuality; label: string }[] = [
  { value: 'healthy', label: 'Healthy' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'junk', label: 'Junk' },
];

type ReceiptItemRow = {
  id?: string;
  receipt_id: string;
  name: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  paid_amount: number | null;
  discount: number | null;
  needs_review: boolean | null;
  is_food?: boolean | null;
  food_quality?: FoodQuality | null;
  meta: Record<string, unknown>;
};

type ReceiptItemPrefillRow = Pick<
  ReceiptItemRow,
  'name' | 'quantity' | 'unit' | 'unit_price' | 'paid_amount' | 'discount' | 'needs_review' | 'is_food' | 'food_quality' | 'meta'
> & {
  created_at?: string | null;
};

type FoodHintRow = {
  name: string | null;
  is_food: boolean | null;
  food_quality: FoodQuality | null;
  created_at?: string | null;
};

type ReceiptImportItem = Record<string, unknown> & {
  meta?: Record<string, unknown>;
  name?: string;
  quantity?: number | string | null;
  unit?: string | null;
  unit_price?: number | string | null;
  paid_amount?: number | string | null;
  discount?: number | string | null;
  needs_review?: boolean | null;
  is_food?: boolean | null;
  food_quality?: FoodQuality | null;
};

type ReceiptImportPayload = {
  store?: string;
  timestamp?: string;
  currency?: string;
  total?: number | string | null;
  discount_total?: number | string | null;
  sgr_bottle_charge?: number | string | null;
  sgr_recovered_amount?: number | string | null;
  merchant?: Record<string, unknown> | null;
  processing?: Record<string, unknown> | null;
  source?: Record<string, unknown> | null;
  items?: unknown[];
  schema_version?: number | string | null;
};

type ReceiptDeleteStep = 'armed' | 'ready';

type PendingReceiptDelete = {
  id: string;
  step: ReceiptDeleteStep;
};

type EditorSessionMode = 'existing' | 'draft-empty' | 'draft-imported';

type ReceiptTotalsSummary = {
  itemsSubtotal: number;
  receiptTotal: number;
  grossItemsTotal: number;
  netItemsTotal: number;
  discountedItemsTotal: number;
  discountedNetItemsTotal: number;
  bestComputedTotal: number;
  fallbackComputedTotal: number;
  delta: number;
  absDelta: number;
  hasMatch: boolean;
  likelySgrAdjustment: number | null;
  likelySgrBottleCount: number | null;
};

const RECEIPT_TOTAL_MISMATCH_CODE = 'receipt_total_mismatch';
const SGR_BOTTLE_PRICE = 0.5;

function fmtDate(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ro-RO');
}

function fmtDateOnly(ts: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ro-RO');
}

function isoWeekNumber(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function weekColorValue(ts: string | null) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const week = isoWeekNumber(d);
  const palette = ['#3FB6A8', '#4A86C5', '#6A5FA8', '#C7923E', '#C15C5C'];
  return palette[week % palette.length];
}

function weekGlyph(ts: string | null) {
  if (!ts) return '✰';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '✰';
  const week = isoWeekNumber(d);
  const glyphs = ['༄', 'ᯓ★', '₍^. .^₎⟆', '⋆｡𖦹°⭒˚｡⋆', 'ﮩ٨ـﮩﮩ٨ـ♡ﮩ٨ـﮩﮩ٨ـ'];
  return glyphs[week % glyphs.length];
}

function toInputDateTime(ts: string | null) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromInputDateTime(value: string) {
  if (!value) return null;
  const d = new Date(value);
  return d.toISOString();
}

function isMobileViewport() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 1023px)').matches;
}

function monthKey(ts: string | null) {
  if (!ts) return 'unknown';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function dayKey(ts: string | null) {
  if (!ts) return 'unknown';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatMonthLabel(key: string) {
  if (key === 'unknown') return 'Dată necunoscută';
  const [year, month] = key.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(d.getTime())) return key;
  const label = d.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' });
  return label;
}

function hashString(input: string) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function buildManualSourceHash(seed?: string | null) {
  const rawSeed =
    (seed && seed.trim()) ||
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random()}`);
  return `manual_${hashString(rawSeed)}`;
}

function normalizeImportedSourceHash(payload: ReceiptImportPayload) {
  const merchant = isRecord(payload.merchant) ? payload.merchant : {};
  const source = isRecord(payload.source) ? payload.source : {};
  const normalizedItems = (Array.isArray(payload.items) ? payload.items : []).map((rawItem) => {
    const item = isRecord(rawItem) ? rawItem : {};
    return {
      name: typeof item.name === 'string' ? item.name.trim() : '',
      quantity: Number(item.quantity ?? 0),
      unit: typeof item.unit === 'string' ? item.unit.trim() : '',
      unit_price: Number(item.unit_price ?? 0),
      paid_amount: Number(item.paid_amount ?? 0),
      discount: Number(item.discount ?? 0),
    };
  });

  return `import_${hashString(
    JSON.stringify({
      store: typeof payload.store === 'string' ? payload.store.trim() : '',
      timestamp: typeof payload.timestamp === 'string' ? payload.timestamp.trim() : '',
      currency: typeof payload.currency === 'string' ? payload.currency.trim() : '',
      total: Number(payload.total ?? 0),
      discount_total: Number(payload.discount_total ?? 0),
      sgr_bottle_charge: Number(payload.sgr_bottle_charge ?? 0),
      sgr_recovered_amount: Number(payload.sgr_recovered_amount ?? 0),
      merchant_name: typeof merchant.name === 'string' ? merchant.name.trim() : '',
      merchant_city: typeof merchant.city === 'string' ? merchant.city.trim() : '',
      merchant_cif: typeof merchant.cif === 'string' ? merchant.cif.trim() : '',
      source_file_name: typeof source.file_name === 'string' ? source.file_name.trim() : '',
      source_rel_path: typeof source.rel_path === 'string' ? source.rel_path.trim() : '',
      items: normalizedItems,
    })
  )}`;
}

function resolveReceiptSourceHash(receipt: Pick<ReceiptRow, 'id' | 'source_hash'>) {
  const existing = receipt.source_hash?.trim();
  if (existing) return existing;
  if (receipt.id?.trim()) {
    return buildManualSourceHash(`receipt:${receipt.id}`);
  }
  return buildManualSourceHash();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: string | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isHalfStep(value: number) {
  return Math.abs(value * 2 - Math.round(value * 2)) < 0.01;
}

function snapToHalfStep(value: number) {
  return roundMoney(Math.round(value * 2) / 2);
}

function formatSignedMoney(value: number) {
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(2)}`;
}

function getItemNetAmount(item: Pick<ReceiptItemRow, 'paid_amount' | 'quantity' | 'unit_price' | 'discount'>) {
  const paid = item.paid_amount;
  if (paid != null && !Number.isNaN(Number(paid))) {
    return roundMoney(Number(paid));
  }
  const qty = Number(item.quantity) || 0;
  const unit = Number(item.unit_price) || 0;
  const disc = Number(item.discount) || 0;
  return roundMoney(Math.max(0, qty * unit - disc));
}

function buildReceiptTotals(
  receipt: Pick<ReceiptRow, 'total_amount' | 'discount_total' | 'sgr_bottle_charge' | 'sgr_recovered_amount'> | null,
  itemsSubtotalRaw: number
): ReceiptTotalsSummary {
  const itemsSubtotal = roundMoney(itemsSubtotalRaw);
  const sgrCharge = roundMoney(Number(receipt?.sgr_bottle_charge ?? 0));
  const sgrRecovered = roundMoney(Math.abs(Number(receipt?.sgr_recovered_amount ?? 0)));
  const discountTotal = roundMoney(Number(receipt?.discount_total ?? 0));
  const receiptTotal = roundMoney(Number(receipt?.total_amount ?? 0));
  const grossItemsTotal = roundMoney(itemsSubtotal + sgrCharge);
  const netItemsTotal = roundMoney(grossItemsTotal - sgrRecovered);
  const discountedItemsTotal = roundMoney(grossItemsTotal - discountTotal);
  const discountedNetItemsTotal = roundMoney(discountedItemsTotal - sgrRecovered);
  const candidates = [grossItemsTotal, netItemsTotal, discountedItemsTotal, discountedNetItemsTotal];
  const bestComputedTotal = candidates.reduce((best, current) => {
    if (Math.abs(current - receiptTotal) < Math.abs(best - receiptTotal)) {
      return current;
    }
    return best;
  }, candidates[0] ?? 0);
  const delta = roundMoney(receiptTotal - bestComputedTotal);
  const absDelta = roundMoney(Math.abs(delta));
  const likelySgrAdjustment = absDelta >= SGR_BOTTLE_PRICE && isHalfStep(absDelta) ? absDelta : null;
  const likelySgrBottleCount =
    likelySgrAdjustment != null ? Math.round(likelySgrAdjustment / SGR_BOTTLE_PRICE) : null;

  return {
    itemsSubtotal,
    receiptTotal,
    grossItemsTotal,
    netItemsTotal,
    discountedItemsTotal,
    discountedNetItemsTotal,
    bestComputedTotal,
    fallbackComputedTotal: netItemsTotal,
    delta,
    absDelta,
    hasMatch: Math.abs(bestComputedTotal - receiptTotal) < 0.01,
    likelySgrAdjustment,
    likelySgrBottleCount,
  };
}

function getReceiptTotals(
  receipt: Pick<ReceiptRow, 'total_amount' | 'discount_total' | 'sgr_bottle_charge' | 'sgr_recovered_amount'> | null,
  items: ReceiptItemRow[]
) {
  return buildReceiptTotals(
    receipt,
    items.reduce((sum, item) => sum + getItemNetAmount(item), 0)
  );
}

function hasStoredTotalMismatchWarning(warnings: unknown[] | null | undefined) {
  if (!Array.isArray(warnings)) return false;
  return warnings.some(
    (warning) =>
      warning === RECEIPT_TOTAL_MISMATCH_CODE ||
      (isRecord(warning) && warning.code === RECEIPT_TOTAL_MISMATCH_CODE)
  );
}

function mergeSyntheticReceiptWarnings(
  warnings: unknown[] | null | undefined,
  totals: ReceiptTotalsSummary
) {
  const baseWarnings = (Array.isArray(warnings) ? warnings : []).filter((warning) => {
    if (warning === RECEIPT_TOTAL_MISMATCH_CODE) return false;
    return !(isRecord(warning) && warning.code === RECEIPT_TOTAL_MISMATCH_CODE);
  });

  if (totals.hasMatch) {
    return baseWarnings;
  }

  const warning: Record<string, unknown> = {
    code: RECEIPT_TOTAL_MISMATCH_CODE,
    delta: totals.absDelta,
    receipt_total: totals.receiptTotal,
    computed_total: totals.bestComputedTotal,
    items_sum: totals.itemsSubtotal,
  };

  if (totals.likelySgrAdjustment != null) {
    warning.likely_sgr_adjustment = totals.likelySgrAdjustment;
    warning.likely_sgr_bottles = totals.likelySgrBottleCount;
  }

  return [...baseWarnings, warning];
}

const ITEM_CORE_KEYS = new Set([
  'name',
  'quantity',
  'unit',
  'unit_price',
  'paid_amount',
  'discount',
  'needs_review',
  'is_food',
  'food_quality',
  'meta',
]);

function extractItemMeta(item: unknown) {
  if (!isRecord(item)) return {};
  const meta: Record<string, unknown> = {};
  Object.entries(item).forEach(([key, value]) => {
    if (!ITEM_CORE_KEYS.has(key)) {
      meta[key] = value;
    }
  });
  return meta;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function normalizeDirtyCheckText(value: string | null | undefined) {
  return value?.trim() ?? '';
}

function normalizeDirtyCheckTimestamp(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return parsed.toISOString();
}

function normalizeReceiptForDirtyCheck(receipt: ReceiptRow | null) {
  if (!receipt) return '';
  return stableSerialize({
    id: receipt.id ?? '',
    store: normalizeDirtyCheckText(receipt.store),
    receipt_date: normalizeDirtyCheckTimestamp(receipt.receipt_date),
    currency: normalizeDirtyCheckText(receipt.currency),
    total_amount: Number(receipt.total_amount ?? 0),
    discount_total: Number(receipt.discount_total ?? 0),
    sgr_bottle_charge: Number(receipt.sgr_bottle_charge ?? 0),
    sgr_recovered_amount: Number(receipt.sgr_recovered_amount ?? 0),
    merchant_name: normalizeDirtyCheckText(receipt.merchant_name),
    merchant_city: normalizeDirtyCheckText(receipt.merchant_city),
    merchant_cif: normalizeDirtyCheckText(receipt.merchant_cif),
    processing_status: normalizeDirtyCheckText(receipt.processing_status),
    source_file_name: normalizeDirtyCheckText(receipt.source_file_name),
    source_rel_path: normalizeDirtyCheckText(receipt.source_rel_path),
    source_hash: normalizeDirtyCheckText(receipt.source_hash),
    schema_version: Number(receipt.schema_version ?? 3),
  });
}

function normalizeItemsForDirtyCheck(receiptItems: ReceiptItemRow[]) {
  return stableSerialize(
    receiptItems.map((item) => ({
      id: item.id ?? '',
      name: item.name ?? '',
      quantity: item.quantity == null ? null : Number(item.quantity),
      unit: item.unit ?? '',
      unit_price: item.unit_price == null ? null : Number(item.unit_price),
      paid_amount: item.paid_amount == null ? null : Number(item.paid_amount),
      discount: item.discount == null ? null : Number(item.discount),
      needs_review: Boolean(item.needs_review),
      is_food: item.is_food == null ? null : Boolean(item.is_food),
      food_quality: item.food_quality ?? null,
      meta: item.meta ?? {},
    }))
  );
}

function buildJsonExport(selected: ReceiptRow, items: ReceiptItemRow[]) {
  const sourceHash =
    (selected.source_hash && selected.source_hash.trim()) || resolveReceiptSourceHash(selected);
  const warnings = Array.isArray(selected.processing_warnings) ? selected.processing_warnings : [];
  const exportedItems = items.map((item) => {
    const itemMeta =
      item.meta && typeof item.meta === 'object' && !Array.isArray(item.meta) ? item.meta : {};
    const isFood = item.is_food === null || item.is_food === undefined ? true : Boolean(item.is_food);
    return {
      ...itemMeta,
      name: item.name ?? '',
      quantity: item.quantity ?? 1,
      unit: item.unit ?? 'BUC',
      unit_price: item.unit_price ?? null,
      paid_amount: item.paid_amount ?? null,
      discount: Number(item.discount ?? 0),
      needs_review: Boolean(item.needs_review),
      is_food: isFood,
      food_quality: isFood ? item.food_quality ?? null : null,
    };
  });
  return {
    schema_version: Number(selected.schema_version ?? 3),
    store: selected.store ?? 'lidl',
    timestamp: selected.receipt_date ?? null,
    currency: selected.currency ?? 'RON',
    total: Number(selected.total_amount ?? 0),
    discount_total: Number(selected.discount_total ?? 0),
    sgr_bottle_charge: Number(selected.sgr_bottle_charge ?? 0),
    sgr_recovered_amount: Number(selected.sgr_recovered_amount ?? 0),
    merchant: {
      name: selected.merchant_name ?? null,
      address: null,
      city: selected.merchant_city ?? null,
      cif: selected.merchant_cif ?? null,
    },
    items: exportedItems,
    processing: {
      status: selected.processing_status ?? 'ok',
      warnings,
      error: null,
      ocr_engine: null,
    },
    source: {
      file_name: selected.source_file_name ?? null,
      store_folder: selected.store ?? null,
      rel_path: selected.source_rel_path ?? null,
      source_hash: sourceHash,
    },
    raw_text: null,
  };
}

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [items, setItems] = useState<ReceiptItemRow[]>([]);
  const [persistedItemsSnapshot, setPersistedItemsSnapshot] = useState<ReceiptItemRow[]>([]);
  const [receiptTotalsById, setReceiptTotalsById] = useState<Record<string, ReceiptTotalsSummary>>({});
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [storeOptions, setStoreOptions] = useState<string[]>(['all']);
  const [itemNameOptions, setItemNameOptions] = useState<string[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReceiptRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [populatingFood, setPopulatingFood] = useState(false);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const [pendingReceiptDelete, setPendingReceiptDelete] = useState<PendingReceiptDelete | null>(null);
  const [confirmDeleteReceipt, setConfirmDeleteReceipt] = useState<ReceiptRow | null>(null);
  const [deletingReceipt, setDeletingReceipt] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [metaLocked, setMetaLocked] = useState(true);
  const [deleteItemsAckSignature, setDeleteItemsAckSignature] = useState('');
  const [editorSessionMode, setEditorSessionMode] = useState<EditorSessionMode | null>(null);
  const itemPrefillCache = useRef<Record<string, Partial<ReceiptItemRow>>>({});
  const prevSelectionRef = useRef<ReceiptRow | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);
  const saveChangesRef = useRef<() => Promise<void>>(async () => {});
  const canUseSaveShortcutRef = useRef(false);
  const closeSelectedEditorRef = useRef<(options?: { skipConfirm?: boolean }) => boolean>(() => false);
  const closeJsonImportPanelRef = useRef<() => void>(() => {});
  const selectedRef = useRef<ReceiptRow | null>(null);
  const showJsonImportRef = useRef(false);
  const confirmDeleteReceiptRef = useRef<ReceiptRow | null>(null);
  const savingRef = useRef(false);
  const deletingReceiptRef = useRef(false);
  const editorBaselineReceiptRef = useRef('');
  const editorBaselineItemsRef = useRef('');
  const selectedId = selected?.id ?? null;

  const stores = useMemo(() => storeOptions, [storeOptions]);
  const todayKey = useMemo(() => dayKey(new Date().toISOString()), []);
  const currentMonthKey = useMemo(() => monthKey(new Date().toISOString()), []);
  const selectedTotals = useMemo(() => getReceiptTotals(selected, items), [selected, items]);
  const pendingDeletedItems = useMemo(() => {
    const currentIds = new Set(items.map((item) => item.id).filter(Boolean));
    return persistedItemsSnapshot.filter((item) => item.id && !currentIds.has(item.id));
  }, [items, persistedItemsSnapshot]);
  const pendingDeletedItemsSignature = useMemo(
    () => pendingDeletedItems.map((item) => item.id).filter(Boolean).join('|'),
    [pendingDeletedItems]
  );
  const isDeleteItemsAckValid =
    !pendingDeletedItems.length || deleteItemsAckSignature === pendingDeletedItemsSignature;
  const needsInitialDraftSave = Boolean(selected && !selected.id && editorSessionMode === 'draft-imported');
  const editorHasUnsavedChanges = useMemo(() => {
    if (!selected) return false;
    if (needsInitialDraftSave) return true;
    return (
      normalizeReceiptForDirtyCheck(selected) !== editorBaselineReceiptRef.current ||
      normalizeItemsForDirtyCheck(items) !== editorBaselineItemsRef.current
    );
  }, [items, needsInitialDraftSave, selected]);
  const canSaveEditor = Boolean(selected) && !saving && isDeleteItemsAckValid && editorHasUnsavedChanges;
  const canUseSaveShortcut = canSaveEditor;
  const saveButtonTitle = !isDeleteItemsAckValid
    ? 'Confirmă mai întâi itemele care vor fi șterse definitiv'
    : !editorHasUnsavedChanges
      ? 'Nu există modificări de salvat'
      : undefined;
  const saveButtonLabel = saving ? 'Se salvează…' : editorHasUnsavedChanges ? 'Save' : 'Saved';
  saveChangesRef.current = saveChanges;
  selectedRef.current = selected;
  showJsonImportRef.current = showJsonImport;
  confirmDeleteReceiptRef.current = confirmDeleteReceipt;
  savingRef.current = saving;
  deletingReceiptRef.current = deletingReceipt;
  const groupedReceipts = useMemo(() => {
    const groups: {
      key: string;
      label: string;
      items: ReceiptRow[];
      total: number;
      currency: string | null;
    }[] = [];
    const index = new Map<string, number>();
    receipts.forEach((receipt) => {
      const receiptTotal = Number(receipt.total_amount) || 0;
      const key = monthKey(receipt.receipt_date);
      const label = formatMonthLabel(key);
      if (!index.has(key)) {
        index.set(key, groups.length);
        groups.push({
          key,
          label,
          items: [receipt],
          total: receiptTotal,
          currency: receipt.currency ?? null,
        });
      } else {
        const group = groups[index.get(key)!];
        group.items.push(receipt);
        group.total += receiptTotal;
        if (!group.currency && receipt.currency) {
          group.currency = receipt.currency;
        }
      }
    });
    return groups;
  }, [receipts]);

  function queueEditorIntoView() {
    if (!isMobileViewport()) return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  useEffect(() => {
    if (!selectedId || !isMobileViewport()) return;
    queueEditorIntoView();
  }, [selectedId]);

  useEffect(() => {
    if (deleteItemsAckSignature && deleteItemsAckSignature !== pendingDeletedItemsSignature) {
      setDeleteItemsAckSignature('');
    }
  }, [deleteItemsAckSignature, pendingDeletedItemsSignature]);

  useEffect(() => {
    canUseSaveShortcutRef.current = canUseSaveShortcut;
  }, [canUseSaveShortcut]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function handleKeyDown(event: KeyboardEvent) {
      const wantsSave = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
      if (!wantsSave || event.altKey) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (!canUseSaveShortcutRef.current) return;
      void saveChangesRef.current();
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (savingRef.current || deletingReceiptRef.current) return;
      if (!confirmDeleteReceiptRef.current && !showJsonImportRef.current && !selectedRef.current) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (confirmDeleteReceiptRef.current) {
        setConfirmDeleteReceipt(null);
        return;
      }

      if (showJsonImportRef.current) {
        closeJsonImportPanelRef.current();
      }

      if (selectedRef.current) {
        closeSelectedEditorRef.current();
      }
    }

    window.addEventListener('keydown', handleEscape, { capture: true });
    return () => window.removeEventListener('keydown', handleEscape, { capture: true });
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('receipts')
        .select('store')
        .limit(1000);

      if (!alive) return;
      if (error) {
        return;
      }

      const set = new Set(
        ((data as Array<Pick<ReceiptRow, 'store'>> | null) ?? [])
          .map((row) => row.store)
          .filter(isNonEmptyString)
      );
      setStoreOptions(['all', ...Array.from(set).sort()]);
    })();

    return () => {
      alive = false;
    };
  }, []);

  function updateItemAt(index: number, patch: Partial<ReceiptItemRow>) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function setEditorBaseline(
    receipt: ReceiptRow | null,
    nextItems: ReceiptItemRow[],
    mode: EditorSessionMode | null
  ) {
    setEditorSessionMode(mode);
    editorBaselineReceiptRef.current = normalizeReceiptForDirtyCheck(receipt);
    editorBaselineItemsRef.current = normalizeItemsForDirtyCheck(nextItems);
  }

  function resetEditorBaseline() {
    setEditorBaseline(null, [], null);
  }

  function requiresInitialDraftSave(receipt: ReceiptRow | null) {
    return Boolean(receipt && !receipt.id && editorSessionMode === 'draft-imported');
  }

  function hasUnsavedEditorChanges() {
    if (!selected) return false;
    if (requiresInitialDraftSave(selected)) return true;

    const currentReceiptSnapshot = normalizeReceiptForDirtyCheck(selected);
    const currentItemsSnapshot = normalizeItemsForDirtyCheck(items);

    return (
      currentReceiptSnapshot !== editorBaselineReceiptRef.current ||
      currentItemsSnapshot !== editorBaselineItemsRef.current
    );
  }

  function closeJsonImportPanel() {
    setJsonInput('');
    setShowJsonImport(false);
  }

  function closeSelectedEditor(options?: { skipConfirm?: boolean }) {
    if (!selected) return false;

    if (!options?.skipConfirm && hasUnsavedEditorChanges()) {
      const shouldClose =
        typeof window === 'undefined'
          ? true
          : window.confirm('Există modificări nesalvate în bonul curent. Vrei să-l închizi?');
      if (!shouldClose) {
        return false;
      }
    }

    const previousSelection =
      selected.id === '' && prevSelectionRef.current?.id ? prevSelectionRef.current : null;

    if (previousSelection) {
      setEditorBaseline(previousSelection, [], 'existing');
      setSelected(previousSelection);
    } else {
      resetEditorBaseline();
      setSelected(null);
    }

    setItems([]);
    setPersistedItemsSnapshot([]);
    setSuccess(null);
    setMetaLocked(true);
    setPendingDeleteKey(null);
    setPendingReceiptDelete(null);
    setConfirmDeleteReceipt(null);
    setDeleteItemsAckSignature('');
    return true;
  }

  closeJsonImportPanelRef.current = closeJsonImportPanel;
  closeSelectedEditorRef.current = closeSelectedEditor;

  function updateItemFoodAt(index: number, patch: Partial<ReceiptItemRow>) {
    setItems((prev) => {
      const next = [...prev];
      const merged = { ...next[index], ...patch };
      if (merged.is_food === false) {
        merged.food_quality = null;
      }
      next[index] = merged;
      return next;
    });
  }

  async function prefillItemFromName(index: number, name: string) {
    const cleaned = name.trim();
    if (cleaned.length < 3) return;
    const exactMatch = itemNameOptions.some(
      (opt) => opt.toLowerCase() === cleaned.toLowerCase()
    );
    if (!exactMatch) return;
    const cacheKey = cleaned.toLowerCase();
    if (itemPrefillCache.current[cacheKey]) {
      const cached = itemPrefillCache.current[cacheKey];
      updateItemAt(index, cached);
      return;
    }

    let data: ReceiptItemPrefillRow[] | null = null;
    const primary = await supabase
      .from('receipt_items')
      .select(
        'name,quantity,unit,unit_price,paid_amount,discount,needs_review,is_food,food_quality,meta,created_at'
      )
      .ilike('name', cleaned)
      .order('created_at', { ascending: false })
      .limit(1);

    if (primary.error) {
      const fallback = await supabase
        .from('receipt_items')
        .select('name,quantity,unit,unit_price,paid_amount,discount,needs_review,is_food,food_quality,meta')
        .ilike('name', cleaned)
        .limit(1);
      if (fallback.error || !fallback.data?.length) return;
      data = (fallback.data ?? []) as ReceiptItemPrefillRow[];
    } else {
      data = (primary.data ?? []) as ReceiptItemPrefillRow[];
    }

    if (!data?.length) return;
    const latest = data[0];

    const suggested: Partial<ReceiptItemRow> = {
      unit: latest.unit ?? 'BUC',
      unit_price: latest.unit_price ?? null,
    };

    const currentQty = items[index]?.quantity ?? 1;
    if (suggested.unit_price != null) {
      suggested.paid_amount = Number(currentQty) * Number(suggested.unit_price);
    }

    if (items[index]?.is_food == null && latest.is_food != null) {
      suggested.is_food = Boolean(latest.is_food);
      if (!suggested.is_food) {
        suggested.food_quality = null;
      }
    }
    if (
      items[index]?.food_quality == null &&
      latest.food_quality &&
      (items[index]?.is_food ?? latest.is_food) !== false
    ) {
      suggested.food_quality = latest.food_quality as FoodQuality;
    }

    itemPrefillCache.current[cacheKey] = suggested;
    updateItemAt(index, suggested);
  }

  function applyFoodHintsToItems(
    baseItems: ReceiptItemRow[],
    lookup: Map<string, { is_food: boolean | null; food_quality: FoodQuality | null }>
  ) {
    return baseItems.map((item) => {
      if (!item.name || !item.name.trim()) return item;
      const key = item.name.trim().toLowerCase();
      const hint = lookup.get(key);
      if (!hint) return item;

      let nextIsFood = item.is_food;
      let nextQuality = item.food_quality;

      if (nextIsFood == null && hint.is_food != null) {
        nextIsFood = hint.is_food;
      }
      if (nextIsFood === false) {
        nextQuality = null;
      } else if (nextQuality == null && hint.food_quality != null) {
        nextQuality = hint.food_quality;
      }

      if (nextIsFood === item.is_food && nextQuality === item.food_quality) {
        return item;
      }

      return {
        ...item,
        is_food: nextIsFood ?? item.is_food,
        food_quality: nextQuality ?? null,
      };
    });
  }

  async function populateFoodFromHistory(
    itemsOverride?: ReceiptItemRow[],
    options?: { silent?: boolean }
  ) {
    const silent = options?.silent ?? false;
    const baseItems = itemsOverride ?? items;
    if (!baseItems.length) return;
    const targets = baseItems.filter((item) => {
      if (!item.name || !item.name.trim()) return false;
      if (item.is_food === false) return false;
      return item.is_food == null || item.food_quality == null;
    });
    if (!targets.length) return;

    const names = Array.from(
      new Set(targets.map((item) => item.name!.trim()).filter(Boolean))
    );
    if (!names.length) return;

    if (!silent) {
      setPopulatingFood(true);
    }
    setErr(null);
    const { data, error } = await supabase
      .from('receipt_items')
      .select('name,is_food,food_quality,created_at')
      .in('name', names)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      setErr(error.message);
      if (!silent) {
        setPopulatingFood(false);
      }
      return;
    }

    const lookup = new Map<string, { is_food: boolean | null; food_quality: FoodQuality | null }>();
    ((data as FoodHintRow[] | null) ?? []).forEach((row) => {
      const key = typeof row.name === 'string' ? row.name.trim().toLowerCase() : '';
      if (!key || lookup.has(key)) return;
      lookup.set(key, {
        is_food: row.is_food === null || row.is_food === undefined ? null : Boolean(row.is_food),
        food_quality: row.food_quality ? (row.food_quality as FoodQuality) : null,
      });
    });

    if (!lookup.size) {
      if (!silent) {
        setPopulatingFood(false);
      }
      return;
    }

    if (itemsOverride) {
      setItems(applyFoodHintsToItems(baseItems, lookup));
    } else {
      setItems((prev) => applyFoodHintsToItems(prev, lookup));
    }

    if (!silent) {
      setPopulatingFood(false);
      setSuccess('Tipurile alimentare au fost populate unde exista istoric.');
    }
  }

  async function applyJsonToEditor(payload: unknown) {
    const parsedPayload: ReceiptImportPayload = isRecord(payload) ? (payload as ReceiptImportPayload) : {};
    const merchant = isRecord(parsedPayload.merchant) ? parsedPayload.merchant : {};
    const processing = isRecord(parsedPayload.processing) ? parsedPayload.processing : {};
    const source = isRecord(parsedPayload.source) ? parsedPayload.source : {};
    const store = parsedPayload.store ?? 'lidl';
    const timestamp = parsedPayload.timestamp ?? new Date().toISOString();
    const fallbackHash =
      typeof source.source_hash === 'string'
        ? source.source_hash.trim()
        : normalizeImportedSourceHash(parsedPayload);

    const nextSelected: ReceiptRow = {
      id: '',
      owner_id: ownerId ?? '',
      store,
      receipt_date: timestamp,
      currency: parsedPayload.currency ?? 'RON',
      total_amount: Number(parsedPayload.total ?? 0),
      discount_total: Number(parsedPayload.discount_total ?? 0),
      sgr_bottle_charge: Number(parsedPayload.sgr_bottle_charge ?? 0),
      sgr_recovered_amount: Number(parsedPayload.sgr_recovered_amount ?? 0),
      merchant_name: typeof merchant.name === 'string' ? merchant.name : '',
      merchant_city: typeof merchant.city === 'string' ? merchant.city : '',
      merchant_cif: typeof merchant.cif === 'string' ? merchant.cif : '',
      processing_status: typeof processing.status === 'string' ? processing.status : 'ok',
      processing_warnings: Array.isArray(processing.warnings) ? processing.warnings : [],
      source_file_name: typeof source.file_name === 'string' ? source.file_name : '',
      source_rel_path: typeof source.rel_path === 'string' ? source.rel_path : '',
      source_hash: fallbackHash ?? '',
      schema_version: Number(parsedPayload.schema_version ?? 3),
    };
    setPendingReceiptDelete(null);
    setConfirmDeleteReceipt(null);

    const parsedItems = Array.isArray(parsedPayload.items) ? parsedPayload.items : [];
    const nextItems: ReceiptItemRow[] = parsedItems.map((rawItem) => {
      const item = isRecord(rawItem) ? (rawItem as ReceiptImportItem) : {};
      const quantity = item.quantity ?? 1;
      const paidAmount = item.paid_amount ?? null;
      const unitPrice =
        item.unit_price ?? (paidAmount != null && quantity ? Number(paidAmount) / Number(quantity) : null);
      const isFood = item.is_food === false ? false : true;
      const foodQuality =
        isFood && item.food_quality ? item.food_quality : null;
      const importedMeta =
        isRecord(item.meta) ? item.meta : {};
      return {
        receipt_id: '',
        name: item.name ?? '',
        quantity: Number(quantity),
        unit: item.unit ?? 'BUC',
        unit_price: unitPrice != null ? Number(unitPrice) : null,
        paid_amount: paidAmount != null ? Number(paidAmount) : null,
        discount: item.discount != null ? Number(item.discount) : 0,
        needs_review: Boolean(item.needs_review),
        is_food: isFood,
        food_quality: foodQuality,
        meta: { ...importedMeta, ...extractItemMeta(item) },
      };
    });
    setEditorBaseline(nextSelected, nextItems, 'draft-imported');
    setSelected(nextSelected);
    setItems(nextItems);
    setMetaLocked(false);
    await populateFoodFromHistory(nextItems, { silent: true });
    closeJsonImportPanel();
    queueEditorIntoView();
  }

  async function loadReceipts(activeStore: string) {
    setErr(null);
    const query = supabase
      .from('receipts')
      .select(
        'id,owner_id,store,receipt_date,currency,total_amount,discount_total,sgr_bottle_charge,sgr_recovered_amount,merchant_name,merchant_city,merchant_cif,processing_status,processing_warnings,source_file_name,source_rel_path,source_hash,schema_version'
      )
      .order('receipt_date', { ascending: false })
      .limit(500);

    if (activeStore !== 'all') {
      query.eq('store', activeStore);
    }

    const { data, error } = await query;
    if (error) {
      setErr(error.message);
      return;
    }
    const nextReceipts = (data ?? []) as ReceiptRow[];
    setReceipts(nextReceipts);

    const receiptIds = nextReceipts.map((receipt) => receipt.id).filter(Boolean);
    if (!receiptIds.length) {
      setReceiptTotalsById({});
      return;
    }

    const itemSubtotals = new Map<string, number>();
    const chunkSize = 100;
    type ReceiptItemSummaryRow = Pick<
      ReceiptItemRow,
      'receipt_id' | 'quantity' | 'unit_price' | 'paid_amount' | 'discount'
    >;

    for (let i = 0; i < receiptIds.length; i += chunkSize) {
      const chunk = receiptIds.slice(i, i + chunkSize);
      const { data: chunkItems, error: chunkError } = await supabase
        .from('receipt_items')
        .select('receipt_id,quantity,unit_price,paid_amount,discount')
        .in('receipt_id', chunk);

      if (chunkError) {
        setReceiptTotalsById({});
        return;
      }

      const typedChunkItems = ((chunkItems ?? []) as unknown as ReceiptItemSummaryRow[]);
      typedChunkItems.forEach((item) => {
        const current = itemSubtotals.get(item.receipt_id) ?? 0;
        itemSubtotals.set(item.receipt_id, roundMoney(current + getItemNetAmount(item)));
      });
    }

    const nextTotalsById: Record<string, ReceiptTotalsSummary> = {};
    nextReceipts.forEach((receipt) => {
      const itemsSubtotal = itemSubtotals.get(receipt.id);
      if (itemsSubtotal == null) return;
      nextTotalsById[receipt.id] = buildReceiptTotals(receipt, itemsSubtotal);
    });
    setReceiptTotalsById(nextTotalsById);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setOwnerId(data?.user?.id ?? null);
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await loadReceipts(storeFilter);
      if (!alive) return;
    })();

    return () => {
      alive = false;
    };
  }, [storeFilter]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('receipt_items')
        .select('name')
        .limit(2000);

      if (!alive) return;
      if (error) {
        return;
      }

      const set = new Set(
        (((data as Array<Pick<ReceiptItemRow, 'name'>> | null) ?? []))
          .map((row) => row.name)
          .filter(isNonEmptyString)
      );
      setItemNameOptions(Array.from(set).sort());
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('receipt_items')
        .select('unit')
        .limit(2000);

      if (!alive) return;
      if (error) {
        return;
      }

      const set = new Set(
        (((data as Array<Pick<ReceiptItemRow, 'unit'>> | null) ?? []))
          .map((row) => row.unit)
          .filter(isNonEmptyString)
      );
      setUnitOptions(Array.from(set).sort());
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setPersistedItemsSnapshot([]);
      if (!selectedRef.current) {
        setEditorSessionMode(null);
        editorBaselineReceiptRef.current = '';
        editorBaselineItemsRef.current = '';
      }
      return;
    }
    if (savingRef.current) {
      return;
    }
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('receipt_items')
        .select(
          'id,receipt_id,name,quantity,unit,unit_price,paid_amount,discount,needs_review,is_food,food_quality,meta'
        )
        .eq('receipt_id', selectedId)
        .order('id', { ascending: true });

      if (!alive) return;
      if (savingRef.current) return;
      if (error) {
        setErr(error.message);
        return;
      }
      const nextItems = (data ?? []) as ReceiptItemRow[];
      setItems(nextItems);
      setPersistedItemsSnapshot(nextItems);
      const baselineReceipt = selectedRef.current;
      setEditorBaseline(baselineReceipt, nextItems, 'existing');
    })();

    return () => {
      alive = false;
    };
  }, [selectedId]);

  async function saveChanges() {
    if (!selected || savingRef.current || !hasUnsavedEditorChanges()) return;
    setSaving(true);
    setErr(null);
    setSuccess(null);

    const computedSourceHash = resolveReceiptSourceHash(selected);
    const existingItems = items.map((item) => {
      if (item.unit_price == null && item.quantity && item.paid_amount != null) {
        return {
          ...item,
          unit_price: Number(item.paid_amount) / Number(item.quantity),
        };
      }
      return item;
    });
    const currentPersistedIds = new Set(existingItems.map((item) => item.id).filter(Boolean));
    const deletedPersistedItems = persistedItemsSnapshot.filter(
      (item) => item.id && !currentPersistedIds.has(item.id)
    );

    if (deletedPersistedItems.length && !isDeleteItemsAckValid) {
      setErr('Confirmă itemele care vor fi șterse definitiv înainte să salvezi.');
      setSaving(false);
      return;
    }

    const computedTotals = getReceiptTotals(selected, existingItems);
    const nextProcessingWarnings = mergeSyntheticReceiptWarnings(selected.processing_warnings, computedTotals);

    const payload = {
      store: selected.store,
      receipt_date: selected.receipt_date,
      currency: selected.currency,
      total_amount: Number(selected.total_amount) || 0,
      discount_total: Number(selected.discount_total) || 0,
      sgr_bottle_charge: Number(selected.sgr_bottle_charge) || 0,
      sgr_recovered_amount: Number(selected.sgr_recovered_amount) || 0,
      merchant_name: selected.merchant_name,
      merchant_city: selected.merchant_city,
      merchant_cif: selected.merchant_cif,
      processing_status: selected.processing_status,
      processing_warnings: nextProcessingWarnings,
      source_file_name: selected.source_file_name,
      source_rel_path: selected.source_rel_path,
      source_hash: computedSourceHash,
      schema_version: selected.schema_version,
    };

    let receiptId = selected.id;
    if (receiptId) {
      const { error: receiptErr } = await supabase
        .from('receipts')
        .update(payload)
        .eq('id', receiptId);

      if (receiptErr) {
        setErr(receiptErr.message);
        setSaving(false);
        return;
      }
    } else {
      if (!ownerId) {
        setErr('Nu pot salva: owner_id lipseste.');
        setSaving(false);
        return;
      }
      const { data: inserted, error: insertErr } = await supabase
        .from('receipts')
        .insert({
          owner_id: ownerId,
          ...payload,
        })
        .select('id')
        .single();

      if (insertErr) {
        if (
          insertErr.code === '23505' &&
          insertErr.message.includes('receipts_owner_id_store_source_hash_key')
        ) {
          setErr('Bonul pare deja importat pentru același magazin și aceeași sursă.');
        } else {
          setErr(insertErr.message);
        }
        setSaving(false);
        return;
      }
      receiptId = inserted.id;
      setSelected({
        ...selected,
        id: receiptId,
        owner_id: ownerId,
        source_hash: computedSourceHash,
        processing_warnings: nextProcessingWarnings,
      });
    }

    const newItems = existingItems.filter((item) => !item.id);
    const persistedItems = existingItems.filter((item) => item.id);

    for (const item of persistedItems) {
      const { error: itemErr } = await supabase
        .from('receipt_items')
        .update({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          paid_amount: item.paid_amount,
          discount: item.discount,
          needs_review: item.needs_review,
          is_food: item.is_food === null || item.is_food === undefined ? true : item.is_food,
          food_quality: item.is_food === false ? null : item.food_quality ?? null,
          meta: item.meta ?? {},
        })
        .eq('id', item.id);

      if (itemErr) {
        setErr(itemErr.message);
        setSaving(false);
        return;
      }
    }

    if (newItems.length) {
      const insertPayload = newItems.map((item) => ({
        owner_id: selected.owner_id || ownerId,
        receipt_id: receiptId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        paid_amount: item.paid_amount,
        discount: item.discount ?? 0,
        needs_review: Boolean(item.needs_review),
        is_food: item.is_food === null || item.is_food === undefined ? true : item.is_food,
        food_quality: item.is_food === false ? null : item.food_quality ?? null,
        meta: {},
      }));

      const { error: insertErr } = await supabase
        .from('receipt_items')
        .insert(insertPayload);

      if (insertErr) {
        setErr(insertErr.message);
        setSaving(false);
        return;
      }
    }

    if (deletedPersistedItems.length) {
      const deletedItemIds = deletedPersistedItems.map((item) => item.id).filter(Boolean);
      const { error: deleteItemsErr } = await supabase
        .from('receipt_items')
        .delete()
        .in('id', deletedItemIds)
        .eq('receipt_id', receiptId);

      if (deleteItemsErr) {
        setErr(deleteItemsErr.message);
        setSaving(false);
        return;
      }
    }

    const nextSelectedReceipt = {
      ...selected,
      id: receiptId,
      owner_id: selected.owner_id || ownerId || '',
      source_hash: computedSourceHash,
      processing_warnings: nextProcessingWarnings,
    };
    setSelected(nextSelectedReceipt);

    const { data: refreshedItems } = await supabase
      .from('receipt_items')
      .select(
        'id,receipt_id,name,quantity,unit,unit_price,paid_amount,discount,needs_review,is_food,food_quality,meta'
      )
      .eq('receipt_id', receiptId)
      .order('id', { ascending: true });
    const nextItems = (refreshedItems ?? []) as ReceiptItemRow[];
    setItems(nextItems);
    setPersistedItemsSnapshot(nextItems);
    setDeleteItemsAckSignature('');
    setEditorBaseline(nextSelectedReceipt, nextItems, 'existing');
    await loadReceipts(storeFilter);
    queueEditorIntoView();
    setSaving(false);
    setSuccess('Salvat.');
  }

  function restorePendingDeletedItems() {
    if (!pendingDeletedItems.length) return;
    setItems((prev) => {
      const persistedById = new Map(prev.filter((item) => item.id).map((item) => [item.id as string, item]));
      const unsavedItems = prev.filter((item) => !item.id);
      const restoredPersistedItems = persistedItemsSnapshot.map((item) => {
        const itemId = item.id as string;
        return persistedById.get(itemId) ?? item;
      });
      return [...restoredPersistedItems, ...unsavedItems];
    });
    setPendingDeleteKey(null);
    setDeleteItemsAckSignature('');
  }

  async function deleteReceiptNow() {
    if (!confirmDeleteReceipt) return;
    if (!selected?.id) return;
    if (metaLocked) return;

    const target = confirmDeleteReceipt;
    if (selected.id !== target.id) {
      setErr('Selecția s-a schimbat. Reia ștergerea pentru bonul selectat.');
      setPendingReceiptDelete(null);
      setConfirmDeleteReceipt(null);
      return;
    }

    setDeletingReceipt(true);
    setErr(null);
    setSuccess(null);

    const { error: itemsErr } = await supabase
      .from('receipt_items')
      .delete()
      .eq('receipt_id', target.id);

    if (itemsErr) {
      setErr(itemsErr.message);
      setDeletingReceipt(false);
      return;
    }

    const receiptDeleteQuery = supabase
      .from('receipts')
      .delete()
      .eq('id', target.id);

    if (target.owner_id) {
      receiptDeleteQuery.eq('owner_id', target.owner_id);
    }

    const { error: receiptErr } = await receiptDeleteQuery;

    if (receiptErr) {
      setErr(receiptErr.message);
      setDeletingReceipt(false);
      return;
    }

    setConfirmDeleteReceipt(null);
    setPendingReceiptDelete(null);
    setSelected(null);
    setItems([]);
    setMetaLocked(true);
    setSuccess('Bonul a fost șters.');
    await loadReceipts(storeFilter);
    setDeletingReceipt(false);
  }

  async function readJsonFromClipboard(options?: { parseAfterRead?: boolean }) {
    setErr(null);
    try {
      const text = await navigator.clipboard.readText();
      setJsonInput(text);

      if (options?.parseAfterRead) {
        const parsed = JSON.parse(text);
        await applyJsonToEditor(parsed);
        setSuccess('JSON importat din clipboard.');
      }
    } catch {
      setErr('Clipboard read nu este disponibil aici. Încearcă Import file.');
    }
  }

  async function parseJsonInput() {
    setErr(null);
    try {
      const parsed = JSON.parse(jsonInput);
      await applyJsonToEditor(parsed);
      setSuccess('JSON importat.');
    } catch {
      setErr('JSON invalid.');
    }
  }

  async function handleJsonFilePicked(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setJsonInput(text);
      setSuccess(`Loaded ${file.name}.`);
      setErr(null);
    } catch {
      setErr('Nu am putut citi fișierul selectat.');
    } finally {
      event.target.value = '';
    }
  }

  return (
    <>
      <PageShell>
        <div className="space-y-6">
        <section className="surface-card surface-card--soft p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="display-title text-2xl font-semibold tracking-[-0.06em] sm:text-3xl">
              Receipts
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <ThemeToggle />
              <BackLink href="/">Dashboard</BackLink>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              className="btn-base btn-secondary"
              href="/receipts/export"
            >
              JSON Export
            </Link>
            <Link
              className="btn-base btn-secondary"
              href="/receipts/charts"
            >
              Charts
            </Link>
          </div>
        </section>

        <div className="surface-card p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Magazin
              </label>
              <select
                className="field-base min-h-10 min-w-[9rem] px-4 text-sm"
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
              >
                {stores.map((store) => (
                  <option key={store} value={store}>
                    {store === 'all' ? 'Toate' : store}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="btn-base btn-primary"
                onClick={() => setShowJsonImport((v) => !v)}
              >
                + Add via JSON
              </button>
              <button
                className="btn-base btn-secondary"
                onClick={() => {
                  prevSelectionRef.current = selected;
                  const nowIso = new Date().toISOString();
                  const nextSelected: ReceiptRow = {
                    id: '',
                    owner_id: ownerId ?? '',
                    store: storeFilter === 'all' ? 'lidl' : storeFilter,
                    receipt_date: nowIso,
                    currency: 'RON',
                    total_amount: 0,
                    discount_total: 0,
                    sgr_bottle_charge: 0,
                    sgr_recovered_amount: 0,
                    merchant_name: '',
                    merchant_city: '',
                    merchant_cif: '',
                    processing_status: 'ok',
                    processing_warnings: [],
                    source_file_name: '',
                    source_rel_path: '',
                    source_hash: buildManualSourceHash(),
                    schema_version: 3,
                  };
                  setEditorBaseline(nextSelected, [], 'draft-empty');
                  setSelected(nextSelected);
                  setItems([]);
                  setPersistedItemsSnapshot([]);
                  setSuccess(null);
                  setMetaLocked(false);
                  setPendingDeleteKey(null);
                  setPendingReceiptDelete(null);
                  setConfirmDeleteReceipt(null);
                  setDeleteItemsAckSignature('');
                }}
              >
                + Add receipt
              </button>
            </div>
          </div>
          {showJsonImport ? (
            <div className="surface-card surface-card--soft mt-4 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Import JSON</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-base btn-ghost"
                    onClick={() => void readJsonFromClipboard()}
                    type="button"
                  >
                    Paste
                  </button>
                  <button
                    className="btn-base btn-primary"
                    onClick={() => void readJsonFromClipboard({ parseAfterRead: true })}
                    type="button"
                  >
                    Paste + Parse
                  </button>
                  <button
                    className="btn-base btn-ghost"
                    onClick={() => jsonFileInputRef.current?.click()}
                    type="button"
                  >
                    Import file
                  </button>
                </div>
              </div>
              <input
                ref={jsonFileInputRef}
                accept=".json,application/json,text/plain"
                className="hidden"
                onChange={(event) => void handleJsonFilePicked(event)}
                type="file"
              />
              <textarea
                className="field-base mt-3 block h-56 min-h-56 w-full max-w-full resize-none overflow-auto px-4 py-3 font-mono text-[11px] leading-5 sm:h-72 sm:min-h-72 sm:text-xs"
                placeholder="Pune aici JSON-ul de la parser (schema v3)"
                spellCheck={false}
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
              ></textarea>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-[var(--muted)]">
                  {jsonInput ? `${jsonInput.length.toLocaleString('ro-RO')} chars loaded` : 'No JSON loaded'}
                </div>
                <div className="flex flex-wrap gap-2">
                <button
                  className="btn-base btn-primary"
                  onClick={() => void parseJsonInput()}
                  type="button"
                >
                  Parse
                </button>
                <button
                  className="btn-base btn-ghost"
                  onClick={closeJsonImportPanel}
                  type="button"
                >
                  Close
                </button>
                </div>
              </div>
            </div>
          ) : null}
          {err ? (
            <div className="surface-card surface-card--danger mt-3 p-3 text-sm">
              {err}
            </div>
          ) : null}
          {success ? (
            <div className="surface-card surface-card--success mt-3 p-3 text-sm">
              {success}
            </div>
          ) : null}
        </div>

        <div
          className={`mt-4 grid grid-cols-1 gap-4 ${
            selected ? 'lg:grid-cols-[0.3fr_1.7fr]' : ''
          }`}
        >
          <div
            className={`surface-card p-3 ${
              selected ? 'order-2 lg:order-1' : ''
            }`}
          >
            <div className="text-base font-semibold">Bonuri</div>
            {!groupedReceipts.length ? (
              <div className="metric-tile mt-2 text-sm text-[var(--muted)]">
                Nu există bonuri.
              </div>
            ) : null}
            {groupedReceipts.map((group) => {
              const hasSelectedInGroup = group.items.some((r) => r.id === selected?.id);
              const isPastMonth = group.key !== 'unknown' && group.key < currentMonthKey;
              return (
                <details
                  key={group.key}
                  className="mt-3 rounded-[1.35rem] border border-[var(--border)]/60 bg-[var(--panel-2)]/30 p-3"
                  open={hasSelectedInGroup || !isPastMonth}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                    <span>{group.label}</span>
                    <span className="h-px flex-1 bg-[var(--border)]/60" />
                    <span className="text-[10px] font-semibold text-[var(--muted)]">
                      {Math.round(group.total)} {group.currency ?? 'RON'}
                    </span>
                  </summary>
                  <div
                    className={`mt-2 ${
                      selected
                        ? 'space-y-2'
                        : 'grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
                    }`}
                  >
                    {group.items.map((r) => {
                      const isTodayReceipt = dayKey(r.receipt_date) === todayKey;
                      const isSelected = selected?.id === r.id;
                      const totals = receiptTotalsById[r.id];
                      const hasTotalMismatch = totals ? !totals.hasMatch : hasStoredTotalMismatchWarning(r.processing_warnings);
                      const warningTitle = totals
                        ? `Delta total: ${formatSignedMoney(totals.delta)} ${r.currency}`
                        : 'Bon cu diferenta intre total si suma itemelor';
                      return (
                        <button
                          key={r.id}
                          className={`w-full rounded-lg border p-1 text-left text-[11px] leading-tight transition ${
                            isSelected
                              ? 'border-sky-100 bg-[#255f73] ring-2 ring-sky-100/90 shadow-[0_0_0_1px_rgba(186,230,253,0.45)] hover:bg-[#2c7188]'
                              : isTodayReceipt
                                ? 'border-emerald-300/35 bg-emerald-500/10 hover:bg-emerald-500/15'
                                : 'border-[var(--border)] bg-[var(--panel-2)] hover:bg-[#1b4a45]'
                          }`}
                          onClick={() => {
                            setEditorBaseline(r, [], 'existing');
                            setSelected(r);
                            setItems([]);
                            setPersistedItemsSnapshot([]);
                            setSuccess(null);
                            setMetaLocked(true);
                            setPendingDeleteKey(null);
                            setPendingReceiptDelete(null);
                            setConfirmDeleteReceipt(null);
                            setDeleteItemsAckSignature('');
                          }}
                        >
                          <div className="relative flex items-start gap-3">
                            {!selected ? (
                              <span
                                className="pointer-events-none absolute inset-0 flex items-center justify-center text-base opacity-30"
                                style={{ color: weekColorValue(r.receipt_date) ?? 'var(--muted)' }}
                              >
                                {weekGlyph(r.receipt_date)}
                              </span>
                            ) : null}
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                                {r.store}
                              </div>
                              <div
                                className="mt-0.5 text-[10px]"
                                style={{
                                  color: weekColorValue(r.receipt_date) ?? 'var(--muted)',
                                }}
                              >
                                {fmtDateOnly(r.receipt_date)}
                              </div>
                            </div>
                            <div className="ml-auto text-right">
                              <div className="flex items-center justify-end gap-1 text-[9px] uppercase tracking-wide text-[var(--muted)]">
                                {hasTotalMismatch ? (
                                  <span title={warningTitle} className="text-[var(--warning)]">
                                    ⚠
                                  </span>
                                ) : null}
                                <span>Total</span>
                              </div>
                              <div className="text-sm font-semibold text-[var(--text)]">
                                {r.total_amount?.toFixed(2)} {r.currency}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>

            {selected ? (
              <div
                ref={editorRef}
                className="surface-card order-1 p-3 lg:order-2"
              >
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center justify-between gap-3">
                  <div className="text-xl font-semibold">Editor bon</div>
                  <div
                    className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold lg:inline-flex ${
                      selectedTotals.hasMatch
                        ? 'bg-emerald-500/15 text-emerald-200'
                        : 'bg-amber-500/15 text-amber-100'
                    }`}
                  >
                    {selectedTotals.hasMatch ? 'Total ok' : `Delta ${formatSignedMoney(selectedTotals.delta)}`}
                  </div>
                  </div>
                  <div className="flex items-center gap-2 self-end">
                  <button
                    className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-xs text-[var(--text)]"
                    onClick={() =>
                      setMetaLocked((prev) => {
                        const next = !prev;
                        if (next) {
                          setPendingReceiptDelete(null);
                          setConfirmDeleteReceipt(null);
                        }
                        return next;
                      })
                    }
                    type="button"
                >
                  {metaLocked ? '🔒 Unlock' : '✏️ Lock'}
                </button>
                  <button
                    className={`rounded-md border border-[var(--border)] px-2 py-1 text-sm disabled:opacity-50 ${
                      pendingReceiptDelete?.id === selected.id && pendingReceiptDelete.step === 'ready'
                        ? 'bg-rose-500/20 text-rose-200'
                        : pendingReceiptDelete?.id === selected.id && pendingReceiptDelete.step === 'armed'
                          ? 'bg-amber-400/20 text-amber-200'
                          : 'bg-[var(--panel-2)] text-[var(--text)]'
                    }`}
                    disabled={!selected.id || saving || deletingReceipt || metaLocked}
                    onClick={() => {
                      if (!selected.id || saving || deletingReceipt || metaLocked) return;
                      if (!pendingReceiptDelete || pendingReceiptDelete.id !== selected.id) {
                        setPendingReceiptDelete({ id: selected.id, step: 'armed' });
                        return;
                      }
                      if (pendingReceiptDelete.step === 'armed') {
                        setPendingReceiptDelete({ id: selected.id, step: 'ready' });
                        return;
                      }
                      setConfirmDeleteReceipt(selected);
                    }}
                    title={
                      metaLocked
                        ? 'Unlock editor ca să poți șterge'
                        : pendingReceiptDelete?.id === selected.id && pendingReceiptDelete.step === 'ready'
                          ? 'Deschide confirmarea finală'
                          : pendingReceiptDelete?.id === selected.id
                            ? 'Pasul 2: încă un click pentru armare finală'
                            : 'Pasul 1: armează ștergerea'
                    }
                    type="button"
                  >
                    🗑️
                  </button>
                  <button
                    className="hidden rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-sm text-[var(--text)] disabled:opacity-50 md:inline-flex"
                  disabled={!selected}
                  onClick={() => {
                    if (!selected) return;
                    try {
                      const payload = buildJsonExport(selected, items);
                      const json = JSON.stringify(payload, null, 2);
                      const blob = new Blob([json], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      const datePart = (selected.receipt_date ?? new Date().toISOString()).slice(0, 10);
                      link.href = url;
                      link.download = `receipt-${selected.store || 'export'}-${datePart}.json`;
                      document.body.appendChild(link);
                      link.click();
                      link.remove();
                      URL.revokeObjectURL(url);
                      setSuccess('JSON exportat.');
                      setErr(null);
                    } catch {
                      setErr('Nu am putut exporta JSON-ul.');
                    }
                  }}
                  type="button"
                >
                  Export JSON
                </button>
                  <button
                    className="hidden rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm text-[var(--text)] md:inline-flex"
                    onClick={() => {
                      closeSelectedEditor();
                    }}
                    disabled={!selected || saving || deletingReceipt}
                    title="Închide editor"
                  type="button"
                >
                  ✕
                </button>
                  </div>
                </div>

                <div className="hidden items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)]/75 px-4 py-3 md:flex">
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                        Ready to save
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[var(--text)]">
                        {selected?.store || 'receipt'} · {items.length} item{items.length === 1 ? '' : 'e'}
                      </div>
                    </div>
                    <div className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted)]">
                      {editorHasUnsavedChanges ? 'Ai modificări locale.' : 'Nicio modificare locală.'}
                    </div>
                    <div className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--text)]">
                      Computed {selectedTotals.bestComputedTotal.toFixed(2)} {selected?.currency ?? 'RON'}
                    </div>
                    <div className="text-xs text-[var(--muted)]">Ctrl/Cmd+S</div>
                  </div>
                  <button
                    className="btn-base btn-primary min-h-11 min-w-[11rem] shrink-0 justify-center text-sm disabled:opacity-50"
                    disabled={!canSaveEditor}
                    onClick={saveChanges}
                    title={saveButtonTitle}
                    type="button"
                  >
                    {saveButtonLabel}
                  </button>
                </div>
            </div>

            <div className="sticky top-3 z-20 mt-3 md:hidden">
              <div
                className={`surface-card p-3 ${
                  selectedTotals.hasMatch ? 'surface-card--success' : 'surface-card--danger'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                      Computed
                    </div>
                    <div className="mt-1 text-base font-semibold text-[var(--text)]">
                      {selectedTotals.hasMatch ? 'Total ok' : 'Verificare necesară'}
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      Bon {selected?.store || 'receipt'} · {items.length} item{items.length === 1 ? '' : 'e'}
                    </div>
                  </div>
                  <div
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      selectedTotals.hasMatch
                        ? 'bg-emerald-500/15 text-emerald-200'
                        : 'bg-amber-500/15 text-amber-100'
                    }`}
                  >
                    {selectedTotals.hasMatch ? 'OK' : `Delta ${formatSignedMoney(selectedTotals.delta)}`}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2">
                    <div className="text-[var(--muted)]">Receipt total</div>
                    <div className="mt-1 font-semibold text-[var(--text)]">
                      {selectedTotals.receiptTotal.toFixed(2)} {selected?.currency ?? 'RON'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2">
                    <div className="text-[var(--muted)]">Computed</div>
                    <div className="mt-1 font-semibold text-[var(--text)]">
                      {selectedTotals.bestComputedTotal.toFixed(2)} {selected?.currency ?? 'RON'}
                    </div>
                  </div>
                </div>
                {!selectedTotals.hasMatch ? (
                  <div className="mt-2 rounded-xl border border-[var(--warning)]/25 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2 text-xs text-[var(--muted)]">
                    {selectedTotals.likelySgrAdjustment != null
                      ? `Posibil SGR: ${selectedTotals.likelySgrAdjustment.toFixed(2)} ${selected?.currency ?? 'RON'}`
                      : 'Totalul din bon nu bate cu suma calculată din items.'}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    className="btn-base btn-primary min-h-12 w-full text-base disabled:opacity-50"
                    disabled={!canSaveEditor}
                    onClick={saveChanges}
                    title={saveButtonTitle}
                    type="button"
                  >
                    {saveButtonLabel}
                  </button>
                  <button
                    className="btn-base btn-secondary min-h-11 w-full disabled:opacity-50"
                    disabled={!selected || saving || deletingReceipt}
                    onClick={() => {
                      closeSelectedEditor();
                    }}
                    type="button"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-2 text-sm">
              <fieldset disabled={metaLocked} className={metaLocked ? 'opacity-60' : ''}>
                <div className="space-y-3">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Receipt details
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span className="shrink-0">Magazin</span>
                      <input
                        className="h-6 w-36 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-[11px] text-[var(--text)]"
                        value={selected.store}
                        onChange={(e) => setSelected({ ...selected, store: e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span className="shrink-0">Data</span>
                      <input
                        type="datetime-local"
                        className="h-6 w-52 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-[11px] text-[var(--text)]"
                        value={toInputDateTime(selected.receipt_date)}
                        onChange={(e) =>
                          setSelected({
                            ...selected,
                            receipt_date: fromInputDateTime(e.target.value) ?? selected.receipt_date,
                          })
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span className="shrink-0">Total</span>
                      <input
                        type="number"
                        step="0.01"
                        className="h-6 w-24 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-[11px] text-[var(--text)]"
                        value={selected.total_amount ?? 0}
                        onChange={(e) => setSelected({ ...selected, total_amount: Number(e.target.value) })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span className="shrink-0">Monedă</span>
                      <input
                        className="h-6 w-20 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-[11px] text-[var(--text)]"
                        value={selected.currency ?? 'RON'}
                        onChange={(e) => setSelected({ ...selected, currency: e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span className="shrink-0">Discount</span>
                      <input
                        type="number"
                        step="0.01"
                        className="h-6 w-24 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-[11px] text-[var(--text)]"
                        value={selected.discount_total ?? 0}
                        onChange={(e) => setSelected({ ...selected, discount_total: Number(e.target.value) })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span className="shrink-0">SGR charge</span>
                      <input
                        type="number"
                        step="0.5"
                        className="h-6 w-24 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-[11px] text-[var(--text)]"
                        value={selected.sgr_bottle_charge ?? 0}
                        onBlur={(e) =>
                          setSelected({
                            ...selected,
                            sgr_bottle_charge: snapToHalfStep(Number(e.target.value) || 0),
                          })
                        }
                        onChange={(e) => setSelected({ ...selected, sgr_bottle_charge: Number(e.target.value) })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span className="shrink-0">SGR recovered</span>
                      <input
                        type="number"
                        step="0.01"
                        className="h-6 w-24 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-[11px] text-[var(--text)]"
                        value={selected.sgr_recovered_amount ?? 0}
                        onChange={(e) => setSelected({ ...selected, sgr_recovered_amount: Number(e.target.value) })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span className="shrink-0">Merchant</span>
                      <input
                        className="h-6 w-56 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-[11px] text-[var(--text)]"
                        value={selected.merchant_name ?? ''}
                        onChange={(e) => setSelected({ ...selected, merchant_name: e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span className="shrink-0">Oraș</span>
                      <input
                        className="h-6 w-40 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-[11px] text-[var(--text)]"
                        value={selected.merchant_city ?? ''}
                        onChange={(e) => setSelected({ ...selected, merchant_city: e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span className="shrink-0">CIF</span>
                      <input
                        className="h-6 w-28 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-[11px] text-[var(--text)]"
                        value={selected.merchant_cif ?? ''}
                        onChange={(e) => setSelected({ ...selected, merchant_cif: e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span className="shrink-0">Status</span>
                      <input
                        className="h-6 w-24 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-[11px] text-[var(--text)]"
                        value={selected.processing_status ?? ''}
                        onChange={(e) => setSelected({ ...selected, processing_status: e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span className="shrink-0">Source file</span>
                      <input
                        className="h-6 w-64 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-[11px] text-[var(--text)]"
                        value={selected.source_file_name ?? ''}
                        onChange={(e) => setSelected({ ...selected, source_file_name: e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span className="shrink-0">Source path</span>
                      <input
                        className="h-6 w-64 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-[11px] text-[var(--text)]"
                        value={selected.source_rel_path ?? ''}
                        onChange={(e) => setSelected({ ...selected, source_rel_path: e.target.value })}
                      />
                    </label>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-lg font-semibold">Items</div>
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-xs text-[var(--text)] disabled:opacity-60"
                          onClick={() => populateFoodFromHistory()}
                          disabled={populatingFood || !items.length}
                          type="button"
                        >
                          {populatingFood ? 'Populare…' : 'Food hints'}
                        </button>
                        <button
                          className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-xs text-[var(--text)]"
                          onClick={() => {
                            if (!selected) return;
                            setItems([
                              ...items,
                              {
                                receipt_id: selected.id,
                                name: '',
                                quantity: 1,
                                unit: 'BUC',
                                unit_price: null,
                                paid_amount: null,
                                discount: 0,
                                needs_review: false,
                                is_food: true,
                                food_quality: null,
                                meta: {},
                              },
                            ]);
                          }}
                          type="button"
                        >
                          + Add item
                        </button>
                      </div>
                    </div>
                    {pendingDeletedItems.length ? (
                      <div className="mt-3 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-3 text-xs text-[var(--muted)]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-semibold text-rose-200">
                            La salvare se vor șterge definitiv {pendingDeletedItems.length} item{pendingDeletedItems.length > 1 ? 'e' : ''} din bon.
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[11px] text-[var(--text)]"
                              onClick={restorePendingDeletedItems}
                            >
                              Restore items
                            </button>
                            <button
                              type="button"
                              className={`rounded-md border px-2 py-1 text-[11px] ${
                                isDeleteItemsAckValid
                                  ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                                  : 'border-rose-400/30 bg-rose-500/10 text-rose-100'
                              }`}
                              onClick={() => setDeleteItemsAckSignature(pendingDeletedItemsSignature)}
                            >
                              {isDeleteItemsAckValid ? 'Ștergerea este confirmată' : 'Confirm ștergerea la Save'}
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {pendingDeletedItems.map((item) => (
                            <span
                              key={item.id}
                              className="rounded-full border border-rose-400/20 bg-[var(--panel)] px-2 py-1 text-[11px] text-[var(--text)]"
                            >
                              {(item.name ?? 'Item fără nume').trim() || 'Item fără nume'} · {getItemNetAmount(item).toFixed(2)} {selected?.currency ?? 'RON'}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 text-[11px]">
                          Fără confirmarea asta, `Save` rămâne blocat ca să nu ștergi accidental linii deja persistate în DB.
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-2 space-y-2">
                    <datalist id="receipt-item-names">
                      {itemNameOptions.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                    <div className="hidden grid-cols-[minmax(220px,1fr)_80px_80px_110px_110px_80px_180px_120px] gap-2 px-1 text-sm uppercase tracking-wide text-[var(--muted)] sm:grid">
                      <span>Produs</span>
                      <span>Cant.</span>
                      <span>Unit</span>
                      <span>Pret/u</span>
                      <span>Total</span>
                      <span>Disc</span>
                      <span>Food</span>
                      <span>Rev</span>
                    </div>
                    <datalist id="receipt-item-units">
                      {unitOptions.map((unit) => (
                        <option key={unit} value={unit} />
                      ))}
                    </datalist>
                    {items.map((item, idx) => {
                      const isFood = item.is_food !== false;
                      const itemKey = item.id ?? `new-${idx}`;
                      const isDeleteArmed = pendingDeleteKey === itemKey;
                      return (
                        <div
                          key={itemKey}
                          className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-2 sm:grid-cols-[minmax(220px,1fr)_80px_80px_110px_110px_80px_180px_120px]"
                        >
                        <input
                          className="h-6 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-sm text-[var(--text)]"
                          value={item.name ?? ''}
                          placeholder="Nume produs (ex: Tortilla)"
                          list="receipt-item-names"
                          onChange={(e) => {
                            const value = e.target.value;
                            updateItemAt(idx, { name: value });
                            if (!item.id) {
                              prefillItemFromName(idx, value);
                            }
                          }}
                        />
                        <input
                          type="number"
                          step="0.01"
                          className="h-6 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-sm text-[var(--text)]"
                          value={item.quantity ?? ''}
                          placeholder="Cantitate ex: 1"
                          onChange={(e) => {
                            const value = e.target.value;
                            const prevTotal = (item.quantity ?? 0) * (item.unit_price ?? 0);
                            const nextQuantity = value === '' ? null : Number(value);
                            const nextTotal = (nextQuantity ?? 0) * (item.unit_price ?? 0);
                            const next = [...items];
                            next[idx] = {
                              ...item,
                              quantity: nextQuantity,
                              paid_amount:
                                item.paid_amount == null || item.paid_amount === prevTotal
                                  ? nextTotal || null
                                  : item.paid_amount,
                            };
                            setItems(next);
                          }}
                        />
                        <input
                          className="h-6 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-sm text-[var(--text)]"
                          value={item.unit ?? ''}
                          placeholder="Unit ex: BUC"
                          list="receipt-item-units"
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = { ...item, unit: e.target.value };
                            setItems(next);
                          }}
                        />
                        <input
                          type="number"
                          step="0.01"
                          className="h-6 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-sm text-[var(--text)]"
                          value={item.unit_price ?? ''}
                          placeholder="Pret/unit ex: 12.50"
                          onChange={(e) => {
                            const value = e.target.value;
                            const prevTotal = (item.quantity ?? 0) * (item.unit_price ?? 0);
                            const nextPrice = value === '' ? null : Number(value);
                            const nextTotal = (item.quantity ?? 0) * (nextPrice ?? 0);
                            const next = [...items];
                            next[idx] = {
                              ...item,
                              unit_price: nextPrice,
                              paid_amount:
                                item.paid_amount == null || item.paid_amount === prevTotal
                                  ? nextTotal || null
                                  : item.paid_amount,
                            };
                            setItems(next);
                          }}
                        />
                        <div className="flex flex-col gap-1">
                          <input
                            type="number"
                            step="0.01"
                            className="h-6 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-sm text-[var(--text)]"
                            value={item.paid_amount ?? ''}
                            placeholder="Total ex: 25.00"
                            onChange={(e) => {
                              const value = e.target.value;
                              const next = [...items];
                              next[idx] = { ...item, paid_amount: value === '' ? null : Number(value) };
                              setItems(next);
                            }}
                          />
                          <div className="text-[10px] text-[var(--muted)]">
                            Net:{' '}
                            {(() => {
                              const net = getItemNetAmount(item);
                              if (!net) return '—';
                              return net.toFixed(2);
                            })()}
                          </div>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          className="h-6 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-sm text-[var(--text)]"
                          value={item.discount ?? ''}
                          placeholder="Disc. ex: 0.50"
                          onChange={(e) => {
                            const value = e.target.value;
                            const next = [...items];
                            next[idx] = { ...item, discount: value === '' ? null : Number(value) };
                            setItems(next);
                          }}
                        />
                        <div className="flex flex-wrap items-center gap-1">
                          <div className="flex overflow-hidden rounded-md border border-[var(--border)] text-[10px]">
                            <button
                              type="button"
                              className={`px-2 py-1 ${isFood ? 'bg-[var(--panel)] text-[var(--text)]' : 'text-[var(--muted)]'}`}
                              onClick={() =>
                                updateItemFoodAt(idx, {
                                  is_food: true,
                                  food_quality: item.food_quality ?? null,
                                })
                              }
                            >
                              Food
                            </button>
                            <button
                              type="button"
                              className={`px-2 py-1 ${!isFood ? 'bg-[var(--panel)] text-[var(--text)]' : 'text-[var(--muted)]'}`}
                              onClick={() => updateItemFoodAt(idx, { is_food: false, food_quality: null })}
                            >
                              Non
                            </button>
                          </div>
                          <div className={`flex flex-wrap items-center gap-1 ${isFood ? '' : 'opacity-40'}`}>
                            {FOOD_QUALITY_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                disabled={!isFood}
                                className={`rounded-full border px-2 py-0.5 text-[10px] ${
                                  item.food_quality === opt.value && isFood
                                    ? 'border-[var(--accent)] bg-[var(--panel)] text-[var(--text)]'
                                    : 'border-[var(--border)] text-[var(--muted)]'
                                }`}
                                onClick={() =>
                                  updateItemFoodAt(idx, { is_food: true, food_quality: opt.value })
                                }
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-pressed={Boolean(item.needs_review)}
                            className={`rounded-md border border-[var(--border)] px-2 py-1 text-[10px] ${
                              item.needs_review
                                ? 'bg-amber-500/20 text-amber-200'
                                : 'bg-[var(--panel)] text-[var(--muted)]'
                            }`}
                            onClick={() => {
                              const next = [...items];
                              next[idx] = { ...item, needs_review: !item.needs_review };
                              setItems(next);
                            }}
                            title="Review"
                          >
                            Rv
                          </button>
                          <button
                            className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[10px] text-[var(--text)]"
                            onClick={() => {
                              const clone: ReceiptItemRow = {
                                ...item,
                                id: undefined,
                                receipt_id: selected?.id ?? '',
                              };
                              const next = [...items];
                              next.splice(idx + 1, 0, clone);
                              setItems(next);
                              setPendingDeleteKey(null);
                            }}
                            type="button"
                            title="Duplicate line"
                          >
                            ⧉
                          </button>
                          <button
                            className={`rounded-md border border-[var(--border)] px-2 py-1 text-[10px] ${
                              isDeleteArmed
                                ? 'bg-rose-500/20 text-rose-200'
                                : 'bg-[var(--panel)] text-[var(--text)]'
                            }`}
                            onClick={() => {
                              if (isDeleteArmed) {
                                const next = items.filter((_, i) => i !== idx);
                                setItems(next);
                                setPendingDeleteKey(null);
                              } else {
                                setPendingDeleteKey(itemKey);
                              }
                            }}
                            type="button"
                            title={isDeleteArmed ? 'Delete line' : 'Confirm delete'}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      );
                    })}
                    {!items.length ? (
                      <div className="text-sm text-[var(--muted)]">Nu există items pentru acest bon.</div>
                    ) : null}
                    <div className="hidden flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm lg:flex">
                      <div className="text-[var(--muted)]">
                        Items: <span className="font-semibold text-[var(--text)]">{items.length}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[var(--muted)]">
                        {!items.length ? null : selectedTotals.hasMatch ? (
                          <span title="Total ok">✅</span>
                        ) : (
                          <span title="Total diferit">⚠️</span>
                        )}
                        <span>
                          Receipt total:{' '}
                          <span className="font-semibold text-[var(--text)]">
                            {selectedTotals.receiptTotal.toFixed(2)} {selected?.currency ?? 'RON'}
                          </span>
                        </span>
                        <span>
                          Items sum:{' '}
                          <span className="font-semibold text-[var(--text)]">
                            {selectedTotals.itemsSubtotal.toFixed(2)} {selected?.currency ?? 'RON'}
                          </span>
                        </span>
                        <span>
                          Computed:{' '}
                          <span className="font-semibold text-[var(--text)]">
                            {selectedTotals.bestComputedTotal.toFixed(2)} {selected?.currency ?? 'RON'}
                          </span>
                        </span>
                        {!items.length || selectedTotals.hasMatch ? null : (
                          <span className="text-[var(--warning)]">
                            Delta:{' '}
                            <span className="font-semibold">
                              {formatSignedMoney(selectedTotals.delta)} {selected?.currency ?? 'RON'}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                    {!items.length || selectedTotals.hasMatch ? null : (
                      <div className="mt-2 hidden flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[var(--warning)]/25 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2 text-xs text-[var(--muted)] lg:flex">
                        <span>
                          Diferenta curenta este <span className="font-semibold text-[var(--text)]">{selectedTotals.absDelta.toFixed(2)} {selected?.currency ?? 'RON'}</span>.
                        </span>
                        {selectedTotals.likelySgrAdjustment != null ? (
                          <span className="text-[var(--warning)]">
                            Probabil e o diferență legată de <span className="font-semibold">SGR de {selectedTotals.likelySgrAdjustment.toFixed(2)} {selected?.currency ?? 'RON'}</span>
                            {selectedTotals.likelySgrBottleCount != null
                              ? ` (${selectedTotals.likelySgrBottleCount} x ${SGR_BOTTLE_PRICE.toFixed(2)})`
                              : ''}
                            . {selectedTotals.delta > 0 ? 'Verifică dacă lipsește SGR charge.' : 'Verifică SGR charge sau sticlele marcate cu garanție.'}
                          </span>
                        ) : (
                          <span>Nu pare un caz clar de SGR la multipli de 0.50.</span>
                        )}
                      </div>
                    )}
                    <div className="pt-2">
                      <button
                        className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-xs text-[var(--text)]"
                        onClick={() => {
                          if (!selected) return;
                          setItems([
                            ...items,
                            {
                              receipt_id: selected.id,
                              name: '',
                              quantity: 1,
                              unit: 'BUC',
                              unit_price: null,
                              paid_amount: null,
                              discount: 0,
                              needs_review: false,
                              is_food: true,
                              food_quality: null,
                              meta: {},
                            },
                          ]);
                        }}
                      >
                        + Add item
                      </button>
                    </div>
                    </div>
                  </div>
                </div>
              </fieldset>
            </div>
              </div>
            ) : null}
          </div>
        </div>
      </PageShell>
      {confirmDeleteReceipt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="surface-card surface-card--danger w-full max-w-md p-4 shadow-xl">
            <div className="text-lg font-semibold">Confirmare ștergere bon</div>
            <div className="mt-2 text-sm text-[var(--muted)]">
              Ești sigur că vrei să ștergi acest bon? Acțiunea este ireversibilă.
            </div>
            <div className="mt-3 space-y-1 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3 text-xs text-[var(--text)]">
              <div>
                <span className="text-[var(--muted)]">Magazin:</span> {confirmDeleteReceipt.store || '—'}
              </div>
              <div>
                <span className="text-[var(--muted)]">Data:</span> {fmtDate(confirmDeleteReceipt.receipt_date)}
              </div>
              <div>
                <span className="text-[var(--muted)]">Total:</span>{' '}
                {Number(confirmDeleteReceipt.total_amount || 0).toFixed(2)}{' '}
                {confirmDeleteReceipt.currency || 'RON'}
              </div>
              <div>
                <span className="text-[var(--muted)]">ID:</span> {confirmDeleteReceipt.id}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="btn-base btn-ghost"
                onClick={() => setConfirmDeleteReceipt(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="btn-base btn-danger disabled:opacity-50"
                disabled={deletingReceipt}
                onClick={deleteReceiptNow}
                type="button"
              >
                {deletingReceipt ? 'Se șterge…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
    );
}
