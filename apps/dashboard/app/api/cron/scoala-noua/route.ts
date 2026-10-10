import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import webpush, { type WebPushError } from 'web-push';
import { NextRequest, NextResponse } from 'next/server';
import { fetchSchoolCatalogSummary, getSchoolCatalogAccounts, type SchoolCatalogSummary, type SchoolSubject } from '@/lib/scoalaNoua';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const APP_SLUG = 'scoala-noua';
type ServiceDatabase = {
  public: {
    Tables: Record<string, {
      Row: Record<string, unknown>;
      Insert: Record<string, unknown>;
      Update: Record<string, unknown>;
      Relationships: [];
    }>;
    Views: Record<string, {
      Row: Record<string, unknown>;
      Insert: Record<string, unknown>;
      Update: Record<string, unknown>;
      Relationships: [];
    }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
  };
};
type ServiceSupabase = SupabaseClient<ServiceDatabase>;

type StoredSnapshot = {
  fingerprint: string;
  catalog: Pick<SchoolCatalogSummary, 'subjects' | 'gradeCount' | 'unexcusedAbsences' | 'excusedAbsences'>;
};

type Change = { subject: string; detail: string };
type PushSubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };
type CheckResult = { catalogId: string; initialized: boolean; changed: boolean; notified: number; changes: Change[] };

function asStoredCatalog(summary: SchoolCatalogSummary): StoredSnapshot['catalog'] {
  return {
    subjects: [...summary.subjects]
      .sort((left, right) => left.name.localeCompare(right.name, 'ro'))
      .map((subject) => ({
        name: subject.name,
        grades: subject.grades,
        average: subject.average,
        unexcusedAbsences: subject.unexcusedAbsences,
        excusedAbsences: subject.excusedAbsences,
      })),
    gradeCount: summary.gradeCount,
    unexcusedAbsences: summary.unexcusedAbsences,
    excusedAbsences: summary.excusedAbsences,
  };
}

function fingerprint(value: StoredSnapshot['catalog']) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function subjectChanges(before: SchoolSubject | undefined, after: SchoolSubject): Change[] {
  if (!before) return [{ subject: after.name, detail: 'materie nouă în sumar' }];
  const changes: Change[] = [];
  if (after.grades.length > before.grades.length) {
    changes.push({ subject: after.name, detail: `notă nouă: ${after.grades.slice(before.grades.length).join(', ')}` });
  }
  if (after.average !== before.average) {
    changes.push({ subject: after.name, detail: `media: ${before.average ?? '—'} → ${after.average ?? '—'}` });
  }
  if (after.unexcusedAbsences !== before.unexcusedAbsences) {
    changes.push({ subject: after.name, detail: `absențe nemotivate: ${before.unexcusedAbsences} → ${after.unexcusedAbsences}` });
  }
  if (after.excusedAbsences !== before.excusedAbsences) {
    changes.push({ subject: after.name, detail: `absențe motivate: ${before.excusedAbsences} → ${after.excusedAbsences}` });
  }
  return changes;
}

function findChanges(before: StoredSnapshot['catalog'], after: StoredSnapshot['catalog']) {
  const beforeByName = new Map(before.subjects.map((subject) => [subject.name, subject]));
  return after.subjects.flatMap((subject) => subjectChanges(beforeByName.get(subject.name), subject));
}

async function sendPushNotifications(args: {
  supabase: ServiceSupabase;
  ownerId: string;
  catalogLabel: string;
  changes: Change[];
}) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return 0;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const { data, error } = await args.supabase
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .eq('owner_id', args.ownerId)
    .eq('app_slug', APP_SLUG)
    .eq('enabled', true);
  if (error) throw new Error(`Could not load push subscriptions: ${error.message}`);
  const subscriptions = data as PushSubscriptionRow[] | null;

  const visibleChanges = args.changes.slice(0, 3).map((change) => `${change.subject}: ${change.detail}`);
  const body = visibleChanges.length
    ? visibleChanges.join('\n')
    : 'Situația școlară a fost actualizată.';
  let sent = 0;
  for (const subscription of subscriptions ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify({
          title: `${args.catalogLabel} actualizat`,
          body,
          tag: 'scoala-noua-catalog',
          url: '/catalog',
          data: { changes: args.changes },
        }),
      );
      sent += 1;
    } catch (error) {
      const status = (error as WebPushError).statusCode ?? (error as WebPushError).status;
      if (status === 404 || status === 410) {
        await args.supabase.from('push_subscriptions').delete().eq('id', subscription.id);
      }
    }
  }
  return sent;
}

async function checkCatalog(args: {
  supabase: ServiceSupabase;
  ownerId: string;
  catalogId: string;
}): Promise<CheckResult> {
  const summary = await fetchSchoolCatalogSummary(args.catalogId);
  const catalog = asStoredCatalog(summary);
  const nextFingerprint = fingerprint(catalog);
  const { data: previous, error: previousError } = await args.supabase
    .from('school_catalog_snapshots')
    .select('fingerprint,catalog')
    .eq('owner_id', args.ownerId)
    .eq('catalog_id', args.catalogId)
    .maybeSingle<StoredSnapshot>();
  if (previousError) throw new Error(`Could not load catalog snapshot: ${previousError.message}`);

  const now = new Date().toISOString();
  if (!previous) {
    const { error } = await args.supabase.from('school_catalog_snapshots').insert({
      owner_id: args.ownerId,
      catalog_id: args.catalogId,
      fingerprint: nextFingerprint,
      catalog,
      checked_at: now,
      updated_at: now,
    });
    if (error) throw new Error(`Could not save initial catalog snapshot: ${error.message}`);
    return { catalogId: args.catalogId, initialized: true, changed: false, notified: 0, changes: [] };
  }

  const rawChanges = previous.fingerprint === nextFingerprint ? [] : findChanges(previous.catalog, catalog);
  const changes = previous.fingerprint !== nextFingerprint && !rawChanges.length
    ? [{ subject: 'Catalog', detail: 'situația școlară a fost actualizată' }]
    : rawChanges;
  let notified = 0;
  if (changes.length) {
    const { data: events, error: eventError } = await args.supabase
      .from('school_catalog_notification_events')
      .upsert(
        {
          owner_id: args.ownerId,
          catalog_id: args.catalogId,
          previous_fingerprint: previous.fingerprint,
          fingerprint: nextFingerprint,
          observed_on: now.slice(0, 10),
          change_summary: changes,
        },
        { onConflict: 'owner_id,catalog_id,fingerprint,observed_on', ignoreDuplicates: true },
      )
      .select('id');
    if (eventError) throw new Error(`Could not record catalog change: ${eventError.message}`);
    if (events?.length) {
      notified = await sendPushNotifications({
        supabase: args.supabase,
        ownerId: args.ownerId,
        catalogLabel: summary.catalogLabel,
        changes,
      });
    }
  }

  const { error: updateError } = await args.supabase.from('school_catalog_snapshots').upsert({
    owner_id: args.ownerId,
    catalog_id: args.catalogId,
    fingerprint: nextFingerprint,
    catalog,
    checked_at: now,
    updated_at: now,
  });
  if (updateError) throw new Error(`Could not update catalog snapshot: ${updateError.message}`);

  return { catalogId: args.catalogId, initialized: false, changed: changes.length > 0, changes, notified };
}

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
      results.push(await checkCatalog({ supabase, ownerId, catalogId: account.id }));
    }
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Catalog check failed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
