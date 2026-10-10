import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/cutCoach';
import { SchoolCatalogError, fetchSchoolCatalogSummary, getSchoolCatalogAccounts } from '@/lib/scoalaNoua';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await requireUser(supabase);
    const ownerId = process.env.SUPABASE_OWNER_ID;
    if (ownerId && user.id !== ownerId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
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
