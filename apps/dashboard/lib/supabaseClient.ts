import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function parseCookies(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  return document.cookie
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, c) => {
      const idx = c.indexOf('=');
      if (idx === -1) return acc;
      const name = decodeURIComponent(c.slice(0, idx));
      const value = decodeURIComponent(c.slice(idx + 1));
      acc[name] = value;
      return acc;
    }, {});
}

function setCookie(name: string, value: string, options?: any) {
  if (typeof document === 'undefined') return;

  const parts: string[] = [];
  parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);

  // options poate conține: path, maxAge, expires, sameSite, secure, domain
  const path = options?.path ?? '/';
  parts.push(`Path=${path}`);

  if (options?.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  if (options?.expires) parts.push(`Expires=${options.expires.toUTCString?.() ?? options.expires}`);
  if (options?.domain) parts.push(`Domain=${options.domain}`);

  // SameSite
  const sameSite = options?.sameSite;
  if (sameSite) parts.push(`SameSite=${String(sameSite)}`);

  // Secure
  if (options?.secure) parts.push(`Secure`);

  document.cookie = parts.join('; ');
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  cookies: {
    getAll() {
      const all = parseCookies();
      return Object.entries(all).map(([name, value]) => ({ name, value }));
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value, options }) => setCookie(name, value, options));
    },
  },
});
