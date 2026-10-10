import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/cutCoach';
import { SchoolCatalogError, fetchSchoolCatalogSummary, getSchoolCatalogAccounts, type SchoolCatalogSummary } from '@/lib/scoalaNoua';
import { type ServiceDatabase, type StoredCatalog } from '@/lib/schoolCatalogMonitor';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SnapshotRow = { catalog_id: string; catalog: StoredCatalog; checked_at: string };

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await requireUser(supabase);
    const ownerId = process.env.SUPABASE_OWNER_ID;
    if (ownerId && user.id !== ownerId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    // Vercel's IP range is rejected by ȘcoalaNouă. When a local sync secret is
    // configured, serve the latest summary sent securely by the local agent.
    if (process.env.CATALOG_SYNC_SECRET) {
      const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !serviceRoleKey) return NextResponse.json({ error: 'Catalog sync is not configured.' }, { status: 500 });

      const service = createClient<ServiceDatabase>(url, serviceRoleKey, { auth: { persistSession: false } });
      const { data, error } = await service
        .from('school_catalog_snapshots')
        .select('catalog_id,catalog,checked_at')
        .eq('owner_id', user.id)
        .order('catalog_id');
      if (error) throw new Error(`Could not load catalog snapshot: ${error.message}`);
      const snapshots = (data as SnapshotRow[] | null) ?? [];
      const requestedCatalogId = request.nextUrl.searchParams.get('catalog') ?? undefined;
      const snapshot = requestedCatalogId
        ? snapshots.find((item) => item.catalog_id === requestedCatalogId)
        : snapshots[0];
      if (!snapshot) {
        return NextResponse.json({ error: 'Catalogul nu a fost sincronizat încă de pe laptop.' }, { status: 503 });
      }
      const summary: SchoolCatalogSummary = {
        ...snapshot.catalog,
        studentName: null,
        catalogId: snapshot.catalog_id,
        catalogLabel: snapshot.catalog.catalogLabel ?? snapshot.catalog_id,
        fetchedAt: snapshot.checked_at,
      };
      return NextResponse.json({
        ...summary,
        catalogs: snapshots.map((item) => ({ id: item.catalog_id, label: item.catalog.catalogLabel ?? item.catalog_id })),
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    const summary = await fetchSchoolCatalogSummary(request.nextUrl.searchParams.get('catalog') ?? undefined);
    return NextResponse.json({
      ...summary,
      catalogs: getSchoolCatalogAccounts().map(({ id, label }) => ({ id, label })),
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof SchoolCatalogError) {
      const status = error.kind === 'configuration' ? 503 : error.kind === 'authentication' ? 401 : 502;
      return NextResponse.json({ error: error.message, kind: error.kind }, { status });
    }
    const message = error instanceof Error && error.message === 'Unauthorized' ? 'Unauthorized.' : 'Catalog unavailable.';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized.' ? 401 : 500 });
  }
}
