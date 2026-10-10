const SCOALA_NOUA_ORIGIN = 'https://www.scoalanoua.ro';

export type SchoolSubject = {
  name: string;
  grades: number[];
  average: number | null;
  unexcusedAbsences: number;
  excusedAbsences: number;
};

export type SchoolCatalogSummary = {
  catalogId: string;
  catalogLabel: string;
  studentName: string | null;
  subjects: SchoolSubject[];
  gradeCount: number;
  unexcusedAbsences: number;
  excusedAbsences: number;
  fetchedAt: string;
};

export type SchoolCatalogAccount = {
  id: string;
  label: string;
  username: string;
  password: string;
};

export class SchoolCatalogError extends Error {
  public readonly kind: 'configuration' | 'authentication' | 'upstream';

  constructor(
    message: string,
    kind: 'configuration' | 'authentication' | 'upstream' = 'upstream',
  ) {
    super(message);
    this.kind = kind;
  }
}

type CookieJar = Map<string, string>;

const CATALOG_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const BROWSER_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (compatible; LifeDashboard/1.0; +https://github.com/xanderon/life-dashboard)',
};

/**
 * `SCOALA_NOUA_CATALOGS` is an optional server-only JSON list for future
 * accounts. Until then, the existing username/password variables define the
 * default `principal` catalog.
 */
export function getSchoolCatalogAccounts(): SchoolCatalogAccount[] {
  const configured = process.env.SCOALA_NOUA_CATALOGS;
  if (configured) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(configured);
    } catch {
      throw new SchoolCatalogError('SCOALA_NOUA_CATALOGS nu este JSON valid.', 'configuration');
    }
    if (!Array.isArray(parsed) || !parsed.length) {
      throw new SchoolCatalogError('SCOALA_NOUA_CATALOGS trebuie să conțină cel puțin un catalog.', 'configuration');
    }
    const accounts = parsed.map((value): SchoolCatalogAccount => {
      const item = value as Partial<SchoolCatalogAccount>;
      if (
        !item.id || !CATALOG_ID_PATTERN.test(item.id) || !item.label ||
        !item.username || !item.password
      ) {
        throw new SchoolCatalogError('Un catalog configurat este incomplet.', 'configuration');
      }
      return { id: item.id, label: item.label, username: item.username, password: item.password };
    });
    if (new Set(accounts.map((account) => account.id)).size !== accounts.length) {
      throw new SchoolCatalogError('Fiecare catalog trebuie să aibă un id unic.', 'configuration');
    }
    return accounts;
  }

  const username = process.env.SCOALA_NOUA_USERNAME;
  const password = process.env.SCOALA_NOUA_PASSWORD;
  if (!username || !password) {
    throw new SchoolCatalogError('Lipsește configurarea catalogului.', 'configuration');
  }
  return [{
    id: 'principal',
    label: process.env.SCOALA_NOUA_CATALOG_LABEL ?? 'Catalog principal',
    username,
    password,
  }];
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&([a-z]+);/gi, (_match, name: string) => {
      const entities: Record<string, string> = {
        acirc: 'â',
        Acirc: 'Â',
        abreve: 'ă',
        Abreve: 'Ă',
        icirc: 'î',
        Icirc: 'Î',
        scedil: 'ș',
        Scedil: 'Ș',
        tcedil: 'ț',
        Tcedil: 'Ț',
      };
      return entities[name] ?? `&${name};`;
    })
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function textFromHtml(value: string) {
  return decodeHtml(value.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function cellsFromRow(rowHtml: string) {
  return [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => match[1]);
}

function numberFromCell(cell: string) {
  const value = textFromHtml(cell).replace(',', '.');
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function gradesFromCell(cell: string) {
  const matches = [...cell.matchAll(/class=["'][^"']*gradeBoxNr[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)];
  return matches
    .map((match) => Number(textFromHtml(match[1]).replace(',', '.')))
    .filter((grade) => Number.isFinite(grade));
}

function findInputValue(html: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<input\\b(?=[^>]*\\bname=["']${escapedName}["'])[^>]*\\bvalue=["']([^"']*)["']`, 'i'));
  return match ? decodeHtml(match[1]) : null;
}

function metaContent(html: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<meta\\b(?=[^>]*\\bname=["']${escapedName}["'])[^>]*\\bcontent=["']([^"']*)["']`, 'i'));
  return match ? decodeHtml(match[1]) : null;
}

function readResponseCookies(response: Response, jar: CookieJar) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter((value): value is string => Boolean(value));

  for (const cookie of cookies) {
    const match = cookie.match(/^\s*([^=;]+)=([^;]*)/);
    if (match) jar.set(match[1], match[2]);
  }
}

function cookieHeader(jar: CookieJar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function requestHeaders(jar: CookieJar, extra: HeadersInit = {}) {
  return {
    ...BROWSER_HEADERS,
    ...extra,
    ...(jar.size ? { Cookie: cookieHeader(jar) } : {}),
  };
}

function parseStudentName(html: string) {
  const heading = html.match(/<h3\b[^>]*\bid=["']bigTITle["'][^>]*>([\s\S]*?)<\/h3>/i);
  return heading ? textFromHtml(heading[1]).replace(/\s+/g, ' ').trim() || null : null;
}

export function parseSchoolCatalogSummary(html: string): Omit<SchoolCatalogSummary, 'catalogId' | 'catalogLabel' | 'fetchedAt'> {
  const table = html.match(/<table\b(?=[^>]*\bid=["']summary["'])[^>]*>([\s\S]*?)<\/table>/i);
  if (!table) {
    throw new SchoolCatalogError('Răspunsul catalogului nu conține sumarul elevului.');
  }

  const subjects: SchoolSubject[] = [];
  for (const row of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = cellsFromRow(row[1]);
    if (cells.length < 5) continue;

    const name = textFromHtml(cells[0]);
    if (!name || name === 'Materia' || name === 'Total') continue;
    const averageText = textFromHtml(cells[2]).replace(',', '.');
    const averageMatch = averageText.match(/\d+(?:\.\d+)?/);

    subjects.push({
      name,
      grades: gradesFromCell(cells[1]),
      average: averageMatch ? Number(averageMatch[0]) : null,
      unexcusedAbsences: numberFromCell(cells[3]),
      excusedAbsences: numberFromCell(cells[4]),
    });
  }

  if (!subjects.length) {
    throw new SchoolCatalogError('Sumarul catalogului nu a putut fi citit.');
  }

  return {
    studentName: parseStudentName(html),
    subjects,
    gradeCount: subjects.reduce((total, subject) => total + subject.grades.length, 0),
    unexcusedAbsences: subjects.reduce((total, subject) => total + subject.unexcusedAbsences, 0),
    excusedAbsences: subjects.reduce((total, subject) => total + subject.excusedAbsences, 0),
  };
}

/**
 * Authenticates only on the server. ScoalaNoua uses a normal 302 redirect after
 * POST /login; that redirect is the expected successful login flow.
 */
export async function fetchSchoolCatalogSummary(catalogId?: string): Promise<SchoolCatalogSummary> {
  const accounts = getSchoolCatalogAccounts();
  const account = catalogId
    ? accounts.find((candidate) => candidate.id === catalogId)
    : accounts[0];
  if (!account) throw new SchoolCatalogError('Catalogul selectat nu există.', 'configuration');

  const jar: CookieJar = new Map();
  let loginPage: Response;
  try {
    loginPage = await fetch(`${SCOALA_NOUA_ORIGIN}/login`, {
      cache: 'no-store',
      redirect: 'manual',
      headers: requestHeaders(jar),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SchoolCatalogError('Catalogul ȘcoalaNouă nu poate fi contactat acum.');
  }

  if (!loginPage.ok) {
    throw new SchoolCatalogError(`Catalogul a refuzat cererea serverului (${loginPage.status}).`);
  }
  readResponseCookies(loginPage, jar);
  const loginHtml = await loginPage.text();
  const formToken = findInputValue(loginHtml, 'login[_token]');
  const csrfToken = metaContent(loginHtml, 'csrf-token');
  if (!formToken || !csrfToken) {
    throw new SchoolCatalogError('Catalogul a schimbat formularul de autentificare.');
  }

  const form = new URLSearchParams({
    'login[_token]': formToken,
    'login[username]': account.username,
    'login[password]': account.password,
    _csrf_token: csrfToken,
  });

  let loginResponse: Response;
  try {
    loginResponse = await fetch(`${SCOALA_NOUA_ORIGIN}/login`, {
      method: 'POST',
      cache: 'no-store',
      redirect: 'manual',
      headers: requestHeaders(jar, {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: SCOALA_NOUA_ORIGIN,
        Referer: `${SCOALA_NOUA_ORIGIN}/login`,
      }),
      body: form.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SchoolCatalogError('Autentificarea în catalog nu a putut fi finalizată.');
  }

  readResponseCookies(loginResponse, jar);
  const location = loginResponse.headers.get('location') ?? '';
  if (![301, 302, 303].includes(loginResponse.status) || !location.startsWith('/elev')) {
    throw new SchoolCatalogError('Utilizatorul sau parola catalogului nu au fost acceptate.', 'authentication');
  }

  let summaryResponse: Response;
  try {
    summaryResponse = await fetch(`${SCOALA_NOUA_ORIGIN}/elev?summary=1`, {
      cache: 'no-store',
      redirect: 'manual',
      headers: requestHeaders(jar, { Referer: `${SCOALA_NOUA_ORIGIN}/elev` }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SchoolCatalogError('Sumarul catalogului nu poate fi încărcat acum.');
  }

  if (!summaryResponse.ok) {
    throw new SchoolCatalogError('Sumarul catalogului nu este disponibil.');
  }
  const summaryHtml = await summaryResponse.text();
  if (summaryHtml.includes('data-testid="login-form"')) {
    throw new SchoolCatalogError('Sesiunea catalogului nu a fost acceptată.', 'authentication');
  }

  return {
    ...parseSchoolCatalogSummary(summaryHtml),
    catalogId: account.id,
    catalogLabel: account.label,
    fetchedAt: new Date().toISOString(),
  };
}
