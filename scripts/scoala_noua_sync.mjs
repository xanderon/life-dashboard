#!/usr/bin/env node

// Runs on the owner's machine, where ȘcoalaNouă accepts the connection.
// It sends only the already-authenticated summary HTML to the dashboard's
// protected ingest endpoint; credentials never leave this computer.

const ORIGIN = 'https://www.scoalanoua.ro';
const BROWSER_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (compatible; LifeDashboard/1.0)',
};

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Lipsește ${name}.`);
  return value;
}

function inputValue(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<input\\b(?=[^>]*\\bname=["']${escaped}["'])[^>]*\\bvalue=["']([^"']*)["']`, 'i'));
  return match?.[1] ?? null;
}

function metaContent(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<meta\\b(?=[^>]*\\bname=["']${escaped}["'])[^>]*\\bcontent=["']([^"']*)["']`, 'i'));
  return match?.[1] ?? null;
}

function addCookies(response, jar) {
  const headers = response.headers;
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers.get('set-cookie')].filter(Boolean);
  for (const value of values) {
    const match = value.match(/^\s*([^=;]+)=([^;]*)/);
    if (match) jar.set(match[1], match[2]);
  }
}

function requestHeaders(jar, extra = {}) {
  return { ...BROWSER_HEADERS, ...extra, ...(jar.size ? { Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') } : {}) };
}

async function main() {
  const username = required('SCOALA_NOUA_USERNAME');
  const password = required('SCOALA_NOUA_PASSWORD');
  const syncUrl = required('CATALOG_SYNC_URL');
  const syncSecret = required('CATALOG_SYNC_SECRET');
  const catalogId = process.env.SCOALA_NOUA_CATALOG_ID?.trim() || 'principal';
  const catalogLabel = process.env.SCOALA_NOUA_CATALOG_LABEL?.trim() || 'Catalog principal';
  const jar = new Map();

  const loginPage = await fetch(`${ORIGIN}/login`, { headers: requestHeaders(jar), redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  if (!loginPage.ok) throw new Error(`Pagina de login a răspuns cu ${loginPage.status}.`);
  addCookies(loginPage, jar);
  const loginHtml = await loginPage.text();
  const formToken = inputValue(loginHtml, 'login[_token]');
  const csrfToken = metaContent(loginHtml, 'csrf-token');
  if (!formToken || !csrfToken) throw new Error('Formularul ȘcoalaNouă s-a schimbat.');

  const form = new URLSearchParams({
    'login[_token]': formToken,
    'login[username]': username,
    'login[password]': password,
    _csrf_token: csrfToken,
  });
  const login = await fetch(`${ORIGIN}/login`, {
    method: 'POST', redirect: 'manual',
    headers: requestHeaders(jar, { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Referer: `${ORIGIN}/login` }),
    body: form.toString(), signal: AbortSignal.timeout(15_000),
  });
  addCookies(login, jar);
  if (![301, 302, 303].includes(login.status) || !(login.headers.get('location') ?? '').startsWith('/elev')) {
    throw new Error('Utilizatorul sau parola nu au fost acceptate de ȘcoalaNouă.');
  }

  const summary = await fetch(`${ORIGIN}/elev?summary=1`, {
    headers: requestHeaders(jar, { Referer: `${ORIGIN}/elev` }), redirect: 'manual', signal: AbortSignal.timeout(15_000),
  });
  if (!summary.ok) throw new Error(`Sumarul catalogului a răspuns cu ${summary.status}.`);
  const summaryHtml = await summary.text();

  const ingest = await fetch(syncUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${syncSecret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ catalogId, catalogLabel, summaryHtml }),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await ingest.json().catch(() => null);
  if (!ingest.ok) throw new Error(result?.error || `Dashboardul a răspuns cu ${ingest.status}.`);
  console.log(JSON.stringify({ ok: true, ...result.result }));
}

main().catch((error) => {
  console.error(`Catalog sync failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
