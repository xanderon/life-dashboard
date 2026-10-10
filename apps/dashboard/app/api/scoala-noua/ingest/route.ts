import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { parseSchoolCatalogSummary, type SchoolCatalogSummary } from '@/lib/scoalaNoua';
import { recordSchoolCatalogSummary, type ServiceDatabase } from '@/lib/schoolCatalogMonitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CATALOG_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

type IngestBody = { catalogId?: unknown; catalogLabel?: unknown; summaryHtml?: unknown };

export async function POST(request: NextRequest) {
  const secret = process.env.CATALOG_SYNC_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let body: IngestBody;
  try {
    body = await request.json() as IngestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const catalogId = typeof body.catalogId === 'string' ? body.catalogId : 'principal';
  const catalogLabel = typeof body.catalogLabel === 'string' ? body.catalogLabel.trim() : 'Catalog principal';
  if (!CATALOG_ID_PATTERN.test(catalogId) || !catalogLabel || catalogLabel.length > 100) {
    return NextResponse.json({ error: 'Invalid catalog identity.' }, { status: 400 });
  }
  if (typeof body.summaryHtml !== 'string' || !body.summaryHtml || body.summaryHtml.length > 500_000) {
    return NextResponse.json({ error: 'Invalid catalog summary.' }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerId = process.env.SUPABASE_OWNER_ID;
  if (!url || !serviceRoleKey || !ownerId) {
    return NextResponse.json({ error: 'Missing Supabase configuration.' }, { status: 500 });
  }

  try {
    const parsed = parseSchoolCatalogSummary(body.summaryHtml);
    const summary: SchoolCatalogSummary = {
      ...parsed,
      catalogId,
      catalogLabel,
      fetchedAt: new Date().toISOString(),
    };
    const supabase = createClient<ServiceDatabase>(url, serviceRoleKey, { auth: { persistSession: false } });
    const result = await recordSchoolCatalogSummary({ supabase, ownerId, summary });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Catalog ingest failed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
