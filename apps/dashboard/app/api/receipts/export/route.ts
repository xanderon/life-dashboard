import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { jsonError } from '@/lib/cutCoachRoute';

const TIME_ZONE = 'Europe/Bucharest';
const PAGE_SIZE = 1000;

type ReceiptRow = {
  id: string;
  store: string | null;
  receipt_date: string | null;
  currency: string | null;
  total_amount: number | null;
  discount_total: number | null;
  sgr_bottle_charge: number | null;
  sgr_recovered_amount: number | null;
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

type ReceiptItemRow = {
  receipt_id: string;
  name: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  paid_amount: number | null;
  discount: number | null;
  needs_review: boolean | null;
  is_food: boolean | null;
  food_quality: 'healthy' | 'balanced' | 'junk' | null;
  meta: Record<string, unknown> | null;
};

type ReceiptItemQueryRow = ReceiptItemRow & {
  receipt?: unknown;
};

function isDateOnly(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function parseDateParts(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

function addDays(date: string, days: number) {
  const { year, month, day } = parseDateParts(date);
  const base = new Date(Date.UTC(year, month - 1, day + days));
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, '0');
  const d = String(base.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getZonedParts(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(timestamp));

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

function zonedDateTimeToUtcIso(date: string, hour = 0, minute = 0, second = 0) {
  const { year, month, day } = parseDateParts(date);
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = target;

  for (let i = 0; i < 4; i += 1) {
    const zoned = getZonedParts(guess, TIME_ZONE);
    const zonedAsUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second
    );
    const diff = zonedAsUtc - target;
    if (diff === 0) break;
    guess -= diff;
  }

  return new Date(guess).toISOString();
}

function buildReceiptJson(receipt: ReceiptRow, items: ReceiptItemRow[]) {
  const normalizedItems = items.map((item) => ({
    ...(item.meta && typeof item.meta === 'object' && !Array.isArray(item.meta) ? item.meta : {}),
    name: item.name ?? '',
    quantity: item.quantity ?? 1,
    unit: item.unit ?? 'BUC',
    unit_price: item.unit_price ?? null,
    paid_amount: item.paid_amount ?? null,
    discount: Number(item.discount ?? 0),
    needs_review: Boolean(item.needs_review),
    is_food: item.is_food === null || item.is_food === undefined ? true : Boolean(item.is_food),
    food_quality:
      item.is_food === false ? null : item.food_quality ?? null,
  }));

  return {
    id: receipt.id,
    schema_version: Number(receipt.schema_version ?? 3),
    store: receipt.store ?? 'unknown',
    timestamp: receipt.receipt_date,
    currency: receipt.currency ?? 'RON',
    total: Number(receipt.total_amount ?? 0),
    discount_total: Number(receipt.discount_total ?? 0),
    sgr_bottle_charge: Number(receipt.sgr_bottle_charge ?? 0),
    sgr_recovered_amount: Number(receipt.sgr_recovered_amount ?? 0),
    merchant: {
      name: receipt.merchant_name ?? null,
      address: null,
      city: receipt.merchant_city ?? null,
      cif: receipt.merchant_cif ?? null,
    },
    items: normalizedItems,
    processing: {
      status: receipt.processing_status ?? 'ok',
      warnings: Array.isArray(receipt.processing_warnings) ? receipt.processing_warnings : [],
      error: null,
      ocr_engine: null,
    },
    source: {
      file_name: receipt.source_file_name ?? null,
      store_folder: receipt.store ?? null,
      rel_path: receipt.source_rel_path ?? null,
      source_hash: receipt.source_hash ?? null,
    },
    raw_text: null,
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if (!isDateOnly(start) || !isDateOnly(end)) {
      return jsonError('Parametrii start si end trebuie sa fie in format YYYY-MM-DD.', 400);
    }

    const startDate = start;
    const endDate = end;

    if (startDate > endDate) {
      return jsonError('Parametrul start trebuie sa fie mai mic sau egal cu end.', 400);
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const startIso = zonedDateTimeToUtcIso(startDate, 0, 0, 0);
    const endExclusiveIso = zonedDateTimeToUtcIso(addDays(endDate, 1), 0, 0, 0);

    const receiptFields =
      'id,store,receipt_date,currency,total_amount,discount_total,sgr_bottle_charge,sgr_recovered_amount,merchant_name,merchant_city,merchant_cif,processing_status,processing_warnings,source_file_name,source_rel_path,source_hash,schema_version';
    const receipts: ReceiptRow[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('receipts')
        .select(receiptFields)
        .eq('owner_id', user.id)
        .gte('receipt_date', startIso)
        .lt('receipt_date', endExclusiveIso)
        .order('receipt_date', { ascending: true })
        .range(from, to);

      if (error) throw error;

      const page = (data as ReceiptRow[] | null) ?? [];
      receipts.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    const itemFields =
      'receipt_id,name,quantity,unit,unit_price,paid_amount,discount,needs_review,is_food,food_quality,meta,receipt:receipts!inner(owner_id,receipt_date)';
    const itemsByReceipt = new Map<string, ReceiptItemRow[]>();
    let totalItems = 0;

    for (let from = 0; ; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('receipt_items')
        .select(itemFields)
        .eq('receipt.owner_id', user.id)
        .gte('receipt.receipt_date', startIso)
        .lt('receipt.receipt_date', endExclusiveIso)
        .order('receipt_id', { ascending: true })
        .range(from, to);

      if (error) throw error;

      const page = ((data as ReceiptItemQueryRow[] | null) ?? []).map((row) => ({
        receipt_id: row.receipt_id,
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        unit_price: row.unit_price,
        paid_amount: row.paid_amount,
        discount: row.discount,
        needs_review: row.needs_review,
        is_food: row.is_food,
        food_quality: row.food_quality,
        meta: row.meta,
      }));

      page.forEach((item) => {
        const list = itemsByReceipt.get(item.receipt_id) ?? [];
        list.push(item);
        itemsByReceipt.set(item.receipt_id, list);
      });
      totalItems += page.length;

      if (page.length < PAGE_SIZE) break;
    }

    const storesMap = new Map<
      string,
      {
        store: string;
        receipt_count: number;
        total_amount: number;
        currencies: string[];
        receipts: ReturnType<typeof buildReceiptJson>[];
      }
    >();

    receipts.forEach((receipt) => {
      const storeKey = receipt.store?.trim() || 'unknown';
      const group =
        storesMap.get(storeKey) ??
        {
          store: storeKey,
          receipt_count: 0,
          total_amount: 0,
          currencies: [],
          receipts: [],
        };

      const currency = receipt.currency?.trim();
      if (currency && !group.currencies.includes(currency)) {
        group.currencies.push(currency);
      }

      group.receipt_count += 1;
      group.total_amount += Number(receipt.total_amount ?? 0);
      group.receipts.push(buildReceiptJson(receipt, itemsByReceipt.get(receipt.id) ?? []));
      storesMap.set(storeKey, group);
    });

    const stores = Array.from(storesMap.values())
      .map((group) => ({
        ...group,
        total_amount: Number(group.total_amount.toFixed(2)),
        currencies: group.currencies.sort(),
      }))
      .sort((a, b) => a.store.localeCompare(b.store));

    return NextResponse.json({
      meta: {
        requested_range: {
          start_date: start,
          end_date: end,
          inclusive: true,
          timezone: TIME_ZONE,
          applied_filter: {
            from_utc: startIso,
            to_utc_exclusive: endExclusiveIso,
          },
        },
        generated_at: new Date().toISOString(),
        owner_id: user.id,
        store_count: stores.length,
        receipt_count: receipts.length,
        item_count: totalItems,
      },
      stores,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonError(message, 500);
  }
}
