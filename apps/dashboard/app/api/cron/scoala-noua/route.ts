import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { fetchSchoolCatalogSummary, getSchoolCatalogAccounts } from '@/lib/scoalaNoua';
import { recordSchoolCatalogSummary, type ServiceDatabase } from '@/lib/schoolCatalogMonitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerId = process.env.SUPABASE_OWNER_ID;
  if (!url || !serviceRoleKey || !ownerId) {
    return NextResponse.json({ error: 'Missing Supabase cron configuration.' }, { status: 500 });
  }

  try {
    const supabase = createClient<ServiceDatabase>(url, serviceRoleKey, { auth: { persistSession: false } });
    const results = [];
    for (const account of getSchoolCatalogAccounts()) {
      const summary = await fetchSchoolCatalogSummary(account.id);
      results.push(await recordSchoolCatalogSummary({ supabase, ownerId, summary }));
    }
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Catalog check failed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
