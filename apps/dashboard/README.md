This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Termo alert (CMTEB)

Dashboard-ul citeste statusul din Supabase. Scriptul `termo_alert.mjs` ruleaza pe Mac si scrie in tabelele `apps` si `app_runs`. Cardul din dashboard afiseaza un rezumat, iar `Open UI` merge la pagina interna `/termo` cu toate detaliile.

### Unde este scriptul

- Script: `scripts/termo_alert.mjs`
- Comanda locala: `npm run termo:check` (citeste variabilele din `/.env`)

### Schema minima Supabase (public)

Ruleaza SQL-ul de mai jos o singura data in Supabase:

```sql
create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  slug text unique not null,
  name text not null,
  description text not null default '',
  status text not null default 'unknown',
  last_run_at timestamptz,
  github_url text,
  chat_url text,
  home_url text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.app_runs (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  created_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  success boolean,
  summary text,
  metrics jsonb not null default '{}'::jsonb
);
```

Recomandare: un singur DB Supabase (schema `public`) pentru tot dashboard-ul. Scriptul foloseste service role key, iar UI-ul foloseste anon key pentru read.

Daca activezi RLS, adauga politici de read:

```sql
alter table public.apps enable row level security;
alter table public.app_runs enable row level security;

create policy "apps_read" on public.apps
  for select using (true);

create policy "app_runs_read" on public.app_runs
  for select using (true);
```

### Rulare manuala (Mac)

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
SUPABASE_OWNER_ID=... \
npm run termo:check
```

Optional:

- `TERMO_STREET` (default: `Str Alexandru cel Bun`)
- `TERMO_BLOCK` (default: `T21B`)
- `TERMO_HOME_URL` (default: `/termo`)
- `TERMO_GITHUB_URL`, `TERMO_CHAT_URL`

### Programare la 5 minute

Cron:

```bash
*/5 * * * * cd "/Users/xan/Documents/Github repos/life-dashboard" && /opt/homebrew/bin/node --env-file .env scripts/termo_alert.mjs >> ~/termo_alert.log 2>&1
```

Daca folosesti alt path pentru Node, afla cu `which node` si inlocuieste in linia de mai sus.

Launchd (macOS):

1) Creezi fisierul `~/Library/LaunchAgents/ro.life-dashboard.termo.plist`
2) Incarci job-ul cu `launchctl load ~/Library/LaunchAgents/ro.life-dashboard.termo.plist`

Exemplu plist (interval 300 sec):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>ro.life-dashboard.termo</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/zsh</string>
      <string>-lc</string>
      <string>cd "/Users/xan/Documents/Github repos/life-dashboard" && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run termo:check</string>
    </array>
    <key>StartInterval</key>
    <integer>300</integer>
    <key>StandardOutPath</key>
    <string>/Users/xan/termo_alert.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/xan/termo_alert.err.log</string>
  </dict>
</plist>
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
