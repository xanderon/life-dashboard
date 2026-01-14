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
  meta: any;
};

function fmtDate(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ro-RO');
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
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const itemPrefillCache = useRef<Record<string, Partial<ReceiptItemRow>>>({});
  const prevSelectionRef = useRef<ReceiptRow | null>(null);

  const stores = useMemo(() => storeOptions, [storeOptions]);

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

  async function prefillItemFromName(index: number, name: string) {
    const cleaned = name.trim();
    if (cleaned.length < 3) return;
    const exactMatch = itemNameOptions.some(
      (opt) => opt.toLowerCase() === cleaned.toLowerCase()
    );
    if (!exactMatch) return;
    if (itemPrefillCache.current[cleaned]) {
      const cached = itemPrefillCache.current[cleaned];
      updateItemAt(index, cached);
      return;
    }

    let data: any[] | null = null;
    const primary = await supabase
      .from('receipt_items')
      .select('name,quantity,unit,unit_price,paid_amount,discount,needs_review,meta,created_at')
      .ilike('name', cleaned)
      .order('created_at', { ascending: false })
      .limit(1);

    if (primary.error) {
      const fallback = await supabase
        .from('receipt_items')
        .select('name,quantity,unit,unit_price,paid_amount,discount,needs_review,meta')
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

    itemPrefillCache.current[cleaned] = suggested;
    updateItemAt(index, suggested);
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
    if (!selected?.id) {
      setItems([]);
      return;
    }
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('receipt_items')
        .select('id,receipt_id,name,quantity,unit,unit_price,paid_amount,discount,needs_review,meta')
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
      source_hash: selected.source_hash,
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

    const existingItems = items.filter((item) => item.id);
    const newItems = items.filter((item) => !item.id);

    for (const item of existingItems) {
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
        meta: item.meta ?? {},
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
      .select('id,receipt_id,name,quantity,unit,unit_price,paid_amount,discount,needs_review,meta')
      .eq('receipt_id', receiptId)
      .order('id', { ascending: true });
    setItems((refreshedItems as any) ?? []);
    await loadReceipts(storeFilter);
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <Link className="text-sm underline" href="/">
            ← Înapoi
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
                }}
              >
                + Add receipt
              </button>
            </div>
          </div>
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

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
            <div className="text-base font-semibold">Bonuri</div>
            <div className="mt-3 space-y-3">
              {receipts.map((r) => (
                <button
                  key={r.id}
                  className={`w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4 text-left transition hover:bg-[#1b4a45] ${
                    selected?.id === r.id ? 'outline outline-2 outline-[var(--accent)]/40' : ''
                  }`}
                  onClick={() => {
                    setSelected(r);
                    setSuccess(null);
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                        {r.store}
                      </div>
                      <div className="mt-2 text-sm text-[var(--muted)]">
                        {fmtDate(r.receipt_date)}
                      </div>
                      <div className="mt-2 text-sm text-[var(--text)]/90">
                        {r.merchant_name ?? '—'}
                      </div>
                      {r.merchant_city ? (
                        <div className="text-xs text-[var(--muted)]">{r.merchant_city}</div>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-[var(--muted)]">Total</div>
                      <div className="mt-1 text-2xl font-semibold text-[var(--text)]">
                        {r.total_amount?.toFixed(2)} {r.currency}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
              {!receipts.length ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4 text-sm text-[var(--muted)]">
                  Nu există bonuri.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold">Editor bon</div>
              <div className="flex items-center gap-2">
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
                  }}
                  title="Închide editor"
                  type="button"
                >
                  ✕
                </button>
              </div>
            </div>

            {!selected ? (
              <div className="mt-3 text-sm text-[var(--muted)]">
                Selectează un bon din tabel.
              </div>
            ) : (
              <div className="mt-3 space-y-3 text-sm">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-[var(--muted)]">
                    Magazin
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text)]"
                      value={selected.store}
                      onChange={(e) => setSelected({ ...selected, store: e.target.value })}
                    />
                  </label>
                  <label className="space-y-1 text-[var(--muted)]">
                    Data bon
                    <input
                      type="datetime-local"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text)]"
                      value={toInputDateTime(selected.receipt_date)}
                      onChange={(e) =>
                        setSelected({
                          ...selected,
                          receipt_date: fromInputDateTime(e.target.value) ?? selected.receipt_date,
                        })
                      }
                    />
                  </label>
                  <label className="space-y-1 text-[var(--muted)]">
                    Total
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text)]"
                      value={selected.total_amount ?? 0}
                      onChange={(e) => setSelected({ ...selected, total_amount: Number(e.target.value) })}
                    />
                  </label>
                  <label className="space-y-1 text-[var(--muted)]">
                    Monedă
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text)]"
                      value={selected.currency ?? 'RON'}
                      onChange={(e) => setSelected({ ...selected, currency: e.target.value })}
                    />
                  </label>
                  <label className="space-y-1 text-[var(--muted)]">
                    Discount total
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text)]"
                      value={selected.discount_total ?? 0}
                      onChange={(e) => setSelected({ ...selected, discount_total: Number(e.target.value) })}
                    />
                  </label>
                  <label className="space-y-1 text-[var(--muted)]">
                    SGR charge
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text)]"
                      value={selected.sgr_bottle_charge ?? 0}
                      onChange={(e) => setSelected({ ...selected, sgr_bottle_charge: Number(e.target.value) })}
                    />
                  </label>
                  <label className="space-y-1 text-[var(--muted)]">
                    SGR recovered
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text)]"
                      value={selected.sgr_recovered_amount ?? 0}
                      onChange={(e) => setSelected({ ...selected, sgr_recovered_amount: Number(e.target.value) })}
                    />
                  </label>
                  <label className="space-y-1 text-[var(--muted)]">
                    Merchant
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text)]"
                      value={selected.merchant_name ?? ''}
                      onChange={(e) => setSelected({ ...selected, merchant_name: e.target.value })}
                    />
                  </label>
                  <label className="space-y-1 text-[var(--muted)]">
                    Oraș
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text)]"
                      value={selected.merchant_city ?? ''}
                      onChange={(e) => setSelected({ ...selected, merchant_city: e.target.value })}
                    />
                  </label>
                  <label className="space-y-1 text-[var(--muted)]">
                    CIF
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text)]"
                      value={selected.merchant_cif ?? ''}
                      onChange={(e) => setSelected({ ...selected, merchant_cif: e.target.value })}
                    />
                  </label>
                  <label className="space-y-1 text-[var(--muted)]">
                    Status procesare
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text)]"
                      value={selected.processing_status ?? ''}
                      onChange={(e) => setSelected({ ...selected, processing_status: e.target.value })}
                    />
                  </label>
                  <label className="space-y-1 text-[var(--muted)]">
                    Warnings (JSON)
                    <textarea
                      className="h-20 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text)]"
                      value={JSON.stringify(selected.processing_warnings ?? [])}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          setSelected({ ...selected, processing_warnings: parsed });
                        } catch {
                          setSelected({ ...selected, processing_warnings: selected.processing_warnings });
                        }
                      }}
                    />
                  </label>
                  <label className="space-y-1 text-[var(--muted)]">
                    Source file
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text)]"
                      value={selected.source_file_name ?? ''}
                      onChange={(e) => setSelected({ ...selected, source_file_name: e.target.value })}
                    />
                  </label>
                  <label className="space-y-1 text-[var(--muted)]">
                    Source path
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text)]"
                      value={selected.source_rel_path ?? ''}
                      onChange={(e) => setSelected({ ...selected, source_rel_path: e.target.value })}
                    />
                  </label>
                  <label className="space-y-1 text-[var(--muted)]">
                    Source hash
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text)]"
                      value={selected.source_hash ?? ''}
                      onChange={(e) => setSelected({ ...selected, source_hash: e.target.value })}
                    />
                  </label>
                  <label className="space-y-1 text-[var(--muted)]">
                    Schema version
                    <input
                      type="number"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text)]"
                      value={selected.schema_version ?? 3}
                      onChange={(e) => setSelected({ ...selected, schema_version: Number(e.target.value) })}
                    />
                  </label>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Items</div>
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
                            meta: {},
                          },
                        ]);
                      }}
                    >
                      + Add item
                    </button>
                  </div>
                  <div className="mt-2 space-y-2">
                    <datalist id="receipt-item-names">
                      {itemNameOptions.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                    <div className="hidden grid-cols-[1.2fr_0.6fr_0.7fr_0.7fr_0.7fr_0.6fr_auto] gap-2 px-1 text-[10px] uppercase tracking-wide text-[var(--muted)] sm:grid">
                      <span>Produs</span>
                      <span>Cantitate</span>
                      <span>Unit (ex. BUC)</span>
                      <span>Pret/unit</span>
                      <span>Total</span>
                      <span>Disc.</span>
                      <span>Review</span>
                    </div>
                    <datalist id="receipt-item-units">
                      {unitOptions.map((unit) => (
                        <option key={unit} value={unit} />
                      ))}
                    </datalist>
                    {items.map((item, idx) => (
                      <div
                        key={item.id ?? `new-${idx}`}
                        className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 sm:grid-cols-[1.2fr_0.6fr_0.7fr_0.7fr_0.7fr_0.6fr_auto]"
                      >
                        <input
                          className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[var(--text)]"
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
                          className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[var(--text)]"
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
                          className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[var(--text)]"
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
                          className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[var(--text)]"
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
                        <input
                          type="number"
                          step="0.01"
                          className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[var(--text)]"
                          value={item.paid_amount ?? ''}
                          placeholder="Total ex: 25.00"
                          onChange={(e) => {
                            const value = e.target.value;
                            const next = [...items];
                            next[idx] = { ...item, paid_amount: value === '' ? null : Number(value) };
                            setItems(next);
                          }}
                        />
                        <input
                          type="number"
                          step="0.01"
                          className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[var(--text)]"
                          value={item.discount ?? ''}
                          placeholder="Disc. ex: 0.50"
                          onChange={(e) => {
                            const value = e.target.value;
                            const next = [...items];
                            next[idx] = { ...item, discount: value === '' ? null : Number(value) };
                            setItems(next);
                          }}
                        />
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                            <input
                              type="checkbox"
                              checked={Boolean(item.needs_review)}
                              onChange={(e) => {
                                const next = [...items];
                                next[idx] = { ...item, needs_review: e.target.checked };
                                setItems(next);
                              }}
                            />
                            Review
                          </label>
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
                            }}
                            type="button"
                            title="Duplicate line"
                          >
                            ⧉
                          </button>
                          <button
                            className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[10px] text-[var(--text)]"
                            onClick={() => {
                              const next = items.filter((_, i) => i !== idx);
                              setItems(next);
                            }}
                            type="button"
                            title="Delete line"
                          >
                            🗑️
                          </button>
                        </div>
                        <textarea
                          className="col-span-full h-20 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--text)]"
                          value={JSON.stringify(item.meta ?? {})}
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value);
                              const next = [...items];
                              next[idx] = { ...item, meta: parsed };
                              setItems(next);
                            } catch {
                              setItems(items);
                            }
                          }}
                          placeholder="meta (JSON)"
                        />
                      </div>
                    ))}
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
                            const paid = Number(item.paid_amount) || 0;
                            const disc = Number(item.discount) || 0;
                            return sum + (paid - disc);
                          }, 0);
                          const sgrCharge = Number(selected?.sgr_bottle_charge || 0);
                          const sgrRecovered = Number(selected?.sgr_recovered_amount || 0);
                          const itemsTotal = itemsSubtotal + sgrCharge - sgrRecovered;
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
                                const paid = Number(item.paid_amount) || 0;
                                const disc = Number(item.discount) || 0;
                                return sum + (paid - disc);
                              }, 0) +
                              Number(selected?.sgr_bottle_charge || 0) -
                              Number(selected?.sgr_recovered_amount || 0)
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
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
