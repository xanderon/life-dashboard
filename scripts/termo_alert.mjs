import { createClient } from '@supabase/supabase-js';

const SOURCE_URL =
  process.env.TERMO_URL ??
  'https://cmteb.ro/functionare_sistem_termoficare.php';
const TARGET_STREET = process.env.TERMO_STREET ?? 'Str Alexandru cel Bun';
const TARGET_BLOCK = process.env.TERMO_BLOCK ?? 'T21B';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_OWNER_ID = process.env.SUPABASE_OWNER_ID ?? null;

const APP_SLUG = process.env.TERMO_APP_SLUG ?? 'termo-alert';
const APP_NAME = process.env.TERMO_APP_NAME ?? '🚿 Termo alert';
const APP_DESCRIPTION =
  process.env.TERMO_APP_DESCRIPTION ??
  'Alerta apa calda / status Termo (placeholder).';
const APP_GITHUB_URL = process.env.TERMO_GITHUB_URL ?? null;
const APP_HOME_URL = process.env.TERMO_HOME_URL ?? '/termo';
const APP_CHAT_URL = process.env.TERMO_CHAT_URL ?? null;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&bull;/g, '-');
}

function htmlToText(html, { keepNewlines = false } = {}) {
  const withBreaks = html.replace(/<br\s*\/?>/gi, keepNewlines ? '\n' : ' ');
  const withoutTags = withBreaks.replace(/<[^>]*>/g, '');
  const decoded = decodeEntities(withoutTags);
  if (keepNewlines) {
    return decoded
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');
  }
  return decoded.replace(/\s+/g, ' ').trim();
}

function extractTargetRow(html) {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  const streetRegex = new RegExp(escapeRegExp(TARGET_STREET), 'i');
  const blockRegex = new RegExp(`\\b${escapeRegExp(TARGET_BLOCK)}\\b`, 'i');

  for (const row of rows) {
    if (!streetRegex.test(row)) continue;
    const cells = row.match(/<td[\s\S]*?<\/td>/gi);
    if (!cells || cells.length < 5) continue;

    const zoneRaw = htmlToText(cells[1], { keepNewlines: true });
    const zoneCompact = zoneRaw.replace(/\s+/g, ' ').trim();
    if (!blockRegex.test(zoneCompact)) continue;

    return {
      sector: htmlToText(cells[0]),
      zone: zoneRaw,
      agent: htmlToText(cells[2]),
      cause: htmlToText(cells[3]),
      eta: htmlToText(cells[4]),
    };
  }

  return null;
}

async function fetchHtml() {
  const res = await fetch(SOURCE_URL, {
    method: 'GET',
    headers: {
      'User-Agent': 'life-dashboard-termo-alert/1.0',
    },
  });
  if (!res.ok) {
    throw new Error(`CMTEB request failed: ${res.status}`);
  }
  return await res.text();
}

async function getOrCreateApp(supabase) {
  if (!SUPABASE_OWNER_ID) {
    throw new Error('Missing SUPABASE_OWNER_ID (apps.owner_id is required).');
  }

  const { data: existing, error: selectErr } = await supabase
    .from('apps')
    .select('id,slug')
    .eq('slug', APP_SLUG)
    .maybeSingle();

  if (selectErr) {
    throw new Error(`Supabase select failed: ${selectErr.message}`);
  }

  if (existing?.id) return existing;

  const { data: inserted, error: insertErr } = await supabase
    .from('apps')
    .insert({
      owner_id: SUPABASE_OWNER_ID,
      slug: APP_SLUG,
      name: APP_NAME,
      description: APP_DESCRIPTION,
      status: 'unknown',
      last_run_at: null,
      github_url: APP_GITHUB_URL,
      chat_url: APP_CHAT_URL,
      home_url: APP_HOME_URL,
    })
    .select('id,slug')
    .single();

  if (insertErr) {
    throw new Error(`Supabase insert failed: ${insertErr.message}`);
  }

  return inserted;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const startedAt = new Date().toISOString();
  let status = 'unknown';
  let summary = 'Unknown';
  let metrics = {};

  try {
    const html = await fetchHtml();
    const match = extractTargetRow(html);
    const found = Boolean(match);
    const etaText = match?.eta || '-';
    const agentText = (match?.agent ?? '').toUpperCase();
    const affectsAcc = agentText.includes('ACC');
    const affectsInc = agentText.includes('INC') || agentText.includes('ÎNC');
    let hotWaterOk = !found;
    let heatOk = !found;
    if (found) {
      if (agentText) {
        hotWaterOk = !affectsAcc;
        heatOk = !affectsInc;
      } else {
        hotWaterOk = false;
        heatOk = false;
      }
    }
    const hotWaterLabel = hotWaterOk ? 'DA' : 'NU';
    const heatLabel = heatOk ? 'DA' : 'NU';
    const cardDescription = found
      ? `🚿 Apa calda: ${hotWaterLabel} | 🔥 Incalzire: ${heatLabel} | ETA ${etaText}`
      : '🚿 Apa calda: DA | 🔥 Incalzire: DA';

    status = found ? 'down' : 'ok';
    summary = found
      ? `Avarie gasita pentru ${TARGET_STREET} ${TARGET_BLOCK}.`
      : `Nicio avarie gasita pentru ${TARGET_STREET} ${TARGET_BLOCK}.`;

    metrics = {
      source_url: SOURCE_URL,
      target: {
        street: TARGET_STREET,
        block: TARGET_BLOCK,
      },
      found,
      data: match,
      service_state: found ? 'down' : 'ok',
      service: {
        hot_water: hotWaterOk ? 'ok' : 'down',
        heat: heatOk ? 'ok' : 'down',
      },
      fetched_at: startedAt,
    };

    const app = await getOrCreateApp(supabase);
    const endedAt = new Date().toISOString();

    const { error: runErr } = await supabase.from('app_runs').insert({
      app_id: app.id,
      created_at: endedAt,
      started_at: startedAt,
      ended_at: endedAt,
      success: true,
      summary,
      metrics,
    });

    if (runErr) {
      throw new Error(`Supabase run insert failed: ${runErr.message}`);
    }

    const { error: appErr } = await supabase
      .from('apps')
      .update({
        name: APP_NAME,
        status,
        last_run_at: endedAt,
        description: cardDescription,
        github_url: APP_GITHUB_URL,
        chat_url: APP_CHAT_URL,
        home_url: APP_HOME_URL,
      })
      .eq('id', app.id);

    if (appErr) {
      throw new Error(`Supabase app update failed: ${appErr.message}`);
    }
  } catch (err) {
    const endedAt = new Date().toISOString();
    summary = err instanceof Error ? err.message : 'Unknown error';

    const app = await getOrCreateApp(supabase);

    await supabase.from('app_runs').insert({
      app_id: app.id,
      created_at: endedAt,
      started_at: startedAt,
      ended_at: endedAt,
      success: false,
      summary,
      metrics: { error: summary, fetched_at: endedAt },
    });

    await supabase
      .from('apps')
      .update({ status: 'unknown', last_run_at: endedAt })
      .eq('id', app.id);

    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
