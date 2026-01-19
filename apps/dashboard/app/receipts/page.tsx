'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
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
  processing_warnings: any[] | null;
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
  meta: any;
};

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

function monthKey(ts: string | null) {
  if (!ts) return 'unknown';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
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

function buildSourceHash({
  store,
  receiptDate,
  sourceFileName,
}: {
  store?: string | null;
  receiptDate?: string | null;
  sourceFileName?: string | null;
}) {
  const base = [store, receiptDate, sourceFileName].filter(Boolean).join('|');
  if (!base) return null;
  return `auto_${hashString(base)}`;
}

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [items, setItems] = useState<ReceiptItemRow[]>([]);
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [storeOptions, setStoreOptions] = useState<string[]>(['all']);
  const [itemNameOptions, setItemNameOptions] = useState<string[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReceiptRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [populatingFood, setPopulatingFood] = useState(false);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [metaLocked, setMetaLocked] = useState(true);
  const itemPrefillCache = useRef<Record<string, Partial<ReceiptItemRow>>>({});
  const prevSelectionRef = useRef<ReceiptRow | null>(null);

  const stores = useMemo(() => storeOptions, [storeOptions]);
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

      const set = new Set((data as any[]).map((row) => row.store).filter(Boolean));
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

    let data: any[] | null = null;
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
      data = fallback.data as any[];
    } else {
      data = primary.data as any[];
    }

    if (!data?.length) return;
    const latest = data[0] as any;

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
    (data as any[] | null)?.forEach((row) => {
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

  async function applyJsonToEditor(payload: any) {
    const store = payload?.store ?? 'lidl';
    const timestamp = payload?.timestamp ?? new Date().toISOString();
    const merchant = payload?.merchant ?? {};
    const processing = payload?.processing ?? {};
    const source = payload?.source ?? {};
    const fallbackHash =
      source?.source_hash ||
      buildSourceHash({
        store,
        receiptDate: timestamp,
        sourceFileName: source?.file_name,
      });

    setSelected({
      id: '',
      owner_id: ownerId ?? '',
      store,
      receipt_date: timestamp,
      currency: payload?.currency ?? 'RON',
      total_amount: Number(payload?.total ?? 0),
      discount_total: Number(payload?.discount_total ?? 0),
      sgr_bottle_charge: Number(payload?.sgr_bottle_charge ?? 0),
      sgr_recovered_amount: Number(payload?.sgr_recovered_amount ?? 0),
      merchant_name: merchant?.name ?? '',
      merchant_city: merchant?.city ?? '',
      merchant_cif: merchant?.cif ?? '',
      processing_status: processing?.status ?? 'ok',
      processing_warnings: processing?.warnings ?? [],
      source_file_name: source?.file_name ?? '',
      source_rel_path: source?.rel_path ?? '',
      source_hash: fallbackHash ?? '',
      schema_version: Number(payload?.schema_version ?? 3),
    });

    const parsedItems = Array.isArray(payload?.items) ? payload.items : [];
    const nextItems: ReceiptItemRow[] = parsedItems.map((item: any) => {
      const quantity = item?.quantity ?? 1;
      const paidAmount = item?.paid_amount ?? null;
      const unitPrice =
        item?.unit_price ?? (paidAmount != null && quantity ? Number(paidAmount) / Number(quantity) : null);
      const isFood = item?.is_food === false ? false : true;
      const foodQuality =
        isFood && item?.food_quality ? (item.food_quality as FoodQuality) : null;
      return {
      receipt_id: '',
      name: item?.name ?? '',
      quantity,
      unit: item?.unit ?? 'BUC',
      unit_price: unitPrice,
      paid_amount: paidAmount,
      discount: item?.discount ?? 0,
      needs_review: Boolean(item?.needs_review),
      is_food: isFood,
      food_quality: foodQuality,
      meta: {},
      };
    });
    setItems(nextItems);
    setMetaLocked(false);
    await populateFoodFromHistory(nextItems, { silent: true });
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
    setReceipts((data as any) ?? []);
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
        (data as any[])
          .map((row) => row.name)
          .filter((name) => typeof name === 'string' && name.trim().length)
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
        (data as any[])
          .map((row) => row.unit)
          .filter((unit) => typeof unit === 'string' && unit.trim().length)
      );
      setUnitOptions(Array.from(set).sort());
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      setItems([]);
      return;
    }
    if (!selected.id) {
      return;
    }
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('receipt_items')
        .select(
          'id,receipt_id,name,quantity,unit,unit_price,paid_amount,discount,needs_review,is_food,food_quality,meta'
        )
        .eq('receipt_id', selected.id)
        .order('id', { ascending: true });

      if (!alive) return;
      if (error) {
        setErr(error.message);
        return;
      }
      setItems((data as any) ?? []);
    })();

    return () => {
      alive = false;
    };
  }, [selected?.id]);

  async function saveChanges() {
    if (!selected) return;
    setSaving(true);
    setErr(null);
    setSuccess(null);

    const computedSourceHash =
      (selected.source_hash && selected.source_hash.trim()) ||
      buildSourceHash({
        store: selected.store,
        receiptDate: selected.receipt_date,
        sourceFileName: selected.source_file_name,
      }) ||
      '';

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
      processing_warnings: selected.processing_warnings ?? [],
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
        setErr(insertErr.message);
        setSaving(false);
        return;
      }
      receiptId = inserted.id;
      setSelected({ ...selected, id: receiptId, owner_id: ownerId });
    }

    const existingItems = items.map((item) => {
      if (item.unit_price == null && item.quantity && item.paid_amount != null) {
        return {
          ...item,
          unit_price: Number(item.paid_amount) / Number(item.quantity),
        };
      }
      return item;
    });
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

    setSaving(false);
    setSuccess('Salvat.');

    const { data: refreshedItems } = await supabase
      .from('receipt_items')
      .select(
        'id,receipt_id,name,quantity,unit,unit_price,paid_amount,discount,needs_review,is_food,food_quality,meta'
      )
      .eq('receipt_id', receiptId)
      .order('id', { ascending: true });
    setItems((refreshedItems as any) ?? []);
    await loadReceipts(storeFilter);
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between gap-4">
          <Link className="text-sm underline" href="/">
            ← Înapoi
          </Link>
          <Link
            className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-xs text-[var(--text)]"
            href="/receipts/charts"
          >
            🧠 Charts
          </Link>
        </div>

        <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xl font-bold">🧾 Receipts</div>
              <div className="mt-1 text-sm text-[var(--muted)]">
                Listă bonuri, filtrare după magazin, editare detalii și produse.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--muted)]">Magazin</label>
              <select
                className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm"
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
              >
                {stores.map((store) => (
                  <option key={store} value={store}>
                    {store === 'all' ? 'Toate' : store}
                  </option>
                ))}
              </select>
              <button
                className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-xs text-[var(--text)]"
                onClick={() => {
                  prevSelectionRef.current = selected;
                  const nowIso = new Date().toISOString();
                  setSelected({
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
                    source_hash: '',
                    schema_version: 3,
                  });
                  setItems([]);
                  setSuccess(null);
                  setMetaLocked(false);
                }}
              >
                + Add receipt
              </button>
              <button
                className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-xs text-[var(--text)]"
                onClick={() => setShowJsonImport((v) => !v)}
              >
                + Add via JSON
              </button>
            </div>
          </div>
          {showJsonImport ? (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Import JSON</div>
                <button
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--text)]"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      setJsonInput(text);
                    } catch {
                      setErr('Nu pot citi din clipboard.');
                    }
                  }}
                  type="button"
                >
                  Paste
                </button>
              </div>
              <textarea
                className="mt-2 h-36 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--text)]"
                placeholder="Pune aici JSON-ul de la parser (schema v3)"
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--text)]"
                  onClick={async () => {
                    setErr(null);
                    try {
                      const parsed = JSON.parse(jsonInput);
                      await applyJsonToEditor(parsed);
                      setSuccess('JSON importat.');
                    } catch {
                      setErr('JSON invalid.');
                    }
                  }}
                  type="button"
                >
                  Parse
                </button>
                <button
                  className="text-xs text-[var(--muted)]"
                  onClick={() => {
                    setJsonInput('');
                    setShowJsonImport(false);
                  }}
                  type="button"
                >
                  Închide
                </button>
              </div>
            </div>
          ) : null}
          {err ? (
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              {err}
            </div>
          ) : null}
          {success ? (
            <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {success}
            </div>
          ) : null}
        </div>

        <div
          className={`mt-4 grid grid-cols-1 gap-4 ${
            selected ? 'lg:grid-cols-[0.3fr_1.7fr]' : ''
          }`}
        >
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-sm">
            <div className="text-base font-semibold">Bonuri</div>
            {!groupedReceipts.length ? (
              <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4 text-sm text-[var(--muted)]">
                Nu există bonuri.
              </div>
            ) : null}
            {groupedReceipts.map((group) => (
              <div key={group.key} className="mt-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                  <span>{group.label}</span>
                  <span className="h-px flex-1 bg-[var(--border)]/60" />
                  <span className="text-[10px] font-semibold text-[var(--muted)]">
                    {Math.round(group.total)} {group.currency ?? 'RON'}
                  </span>
                </div>
                <div
                  className={`mt-2 ${
                    selected
                      ? 'space-y-2'
                      : 'grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
                  }`}
                >
                  {group.items.map((r) => (
                    <button
                      key={r.id}
                      className={`w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-1 text-left text-[11px] leading-tight transition hover:bg-[#1b4a45] ${
                        selected?.id === r.id
                          ? 'border-white bg-[#1f504a] ring-2 ring-white/90'
                          : ''
                      }`}
                      onClick={() => {
                        setSelected(r);
                        setSuccess(null);
                        setMetaLocked(true);
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
                          <div className="text-[9px] uppercase tracking-wide text-[var(--muted)]">
                            Total
                          </div>
                          <div className="text-sm font-semibold text-[var(--text)]">
                            {r.total_amount?.toFixed(2)} {r.currency}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {selected ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-xl font-semibold">Editor bon</div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-xs text-[var(--text)]"
                  onClick={() => setMetaLocked((prev) => !prev)}
                  type="button"
                >
                  {metaLocked ? '🔒 Unlock' : '✏️ Lock'}
                </button>
                <button
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-sm text-[var(--text)] disabled:opacity-50"
                  disabled={!selected || saving}
                  onClick={saveChanges}
                >
                  {saving ? 'Se salvează…' : 'Save'}
                </button>
                <button
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm text-[var(--text)]"
                  onClick={() => {
                    if (selected?.id === '' && prevSelectionRef.current) {
                      setSelected(prevSelectionRef.current);
                    } else {
                      setSelected(null);
                    }
                    setItems([]);
                    setSuccess(null);
                    setMetaLocked(true);
                  }}
                  title="Închide editor"
                  type="button"
                >
                  ✕
                </button>
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
                        step="0.01"
                        className="h-6 w-24 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-[11px] text-[var(--text)]"
                        value={selected.sgr_bottle_charge ?? 0}
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
                              const paid = item.paid_amount;
                              if (paid != null && !Number.isNaN(Number(paid))) {
                                return Number(paid).toFixed(2);
                              }
                              const qty = Number(item.quantity) || 0;
                              const unit = Number(item.unit_price) || 0;
                              const disc = Number(item.discount) || 0;
                              const net = Math.max(0, qty * unit - disc);
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
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm">
                      <div className="text-[var(--muted)]">
                        Items: <span className="font-semibold text-[var(--text)]">{items.length}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[var(--muted)]">
                        {(() => {
                          const itemsSubtotal = items.reduce((sum, item) => {
                            const paid = item.paid_amount;
                            if (paid != null && !Number.isNaN(Number(paid))) {
                              return sum + Number(paid);
                            }
                            const qty = Number(item.quantity) || 0;
                            const unit = Number(item.unit_price) || 0;
                            const disc = Number(item.discount) || 0;
                            return sum + Math.max(0, qty * unit - disc);
                          }, 0);
                          const sgrCharge = Number(selected?.sgr_bottle_charge || 0);
                          const sgrRecovered = Number(selected?.sgr_recovered_amount || 0);
                          const discountTotal = Number(selected?.discount_total || 0);
                          const itemsTotal = itemsSubtotal + sgrCharge - sgrRecovered - discountTotal;
                          const receiptTotal = Number(selected?.total_amount || 0);
                          if (!items.length) return null;
                          if (Math.abs(itemsTotal - receiptTotal) < 0.01) {
                            return <span title="Total ok">✅</span>;
                          }
                          return <span title="Total diferit">⚠️</span>;
                        })()}
                        <span>
                          Total items:{" "}
                          <span className="font-semibold text-[var(--text)]">
                            {(
                              items.reduce((sum, item) => {
                                const paid = item.paid_amount;
                                if (paid != null && !Number.isNaN(Number(paid))) {
                                  return sum + Number(paid);
                                }
                                const qty = Number(item.quantity) || 0;
                                const unit = Number(item.unit_price) || 0;
                                const disc = Number(item.discount) || 0;
                                return sum + Math.max(0, qty * unit - disc);
                              }, 0) +
                              Number(selected?.sgr_bottle_charge || 0) -
                              Number(selected?.sgr_recovered_amount || 0) -
                              Number(selected?.discount_total || 0)
                            ).toFixed(2)}{" "}
                            {selected?.currency ?? "RON"}
                          </span>
                        </span>
                      </div>
                    </div>
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
    </main>
  );
}
