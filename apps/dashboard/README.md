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
- `TERMO_APP_POSITION` (default: `-10`, ca sa fie primul in lista)

### Programare la 5 minute

Cron:

```bash
*/5 * * * * cd "/Users/xan/Documents/Github repos/life-dashboard" && /opt/homebrew/bin/node --env-file .env scripts/termo_alert.mjs >> ~/termo_alert.log 2>&1
```

Daca folosesti alt path pentru Node, afla cu `which node` si inlocuieste in linia de mai sus.

### Notificari push (iOS / web)

Mecanism: PWA + Web Push. Necesita chei VAPID + tabela `push_subscriptions`.

SQL (Supabase):

```sql
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  app_slug text not null,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);
```

Env vars (pe mac pentru script + pe dashboard pentru API):

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
TERMO_PUSH_URL=https://your-domain/termo
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_OWNER_ID=...
```

Client (dashboard):

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
```

Optional (protecție API subscribe):

```
PUSH_SUBSCRIBE_TOKEN=...
NEXT_PUBLIC_PUSH_SUBSCRIBE_TOKEN=...
```

Pe iOS: trebuie instalat PWA (“Add to Home Screen”) ca sa functioneze push.

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

## Device heartbeat (PC-uri / laptopuri)

Scop: fiecare device trimite un ping la 10-20 minute, iar dashboard-ul afiseaza status + snapshot minimal.

### Schema minima Supabase (public)

Ruleaza SQL-ul de mai jos o singura data in Supabase:

```sql
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  slug text unique not null,
  name text not null,
  os text not null default 'unknown',
  user_name text,
  status text not null default 'unknown',
  ip_address text,
  last_seen_at timestamptz,
  uptime_sec int,
  mem_total_mb int,
  mem_used_mb int,
  storage_total_gb int,
  storage_used_gb int,
  storage_volumes jsonb not null default '[]'::jsonb,
  alerts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Optional (RLS read-only):

```sql
alter table public.devices enable row level security;
create policy "devices_read" on public.devices
  for select using (true);
```

Daca ai creat deja tabela, adauga coloana user_name:

```sql
alter table public.devices add column if not exists user_name text;
alter table public.devices add column if not exists storage_volumes jsonb default '[]'::jsonb;
```

### Script local (toate OS-urile)

Script: `scripts/device_heartbeat.mjs`

Comanda locala (citeste variabilele din `/.env`):

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
SUPABASE_OWNER_ID=... \
DEVICE_SLUG=macbook-xan \
DEVICE_NAME="Mac-ul lui Xan" \
DEVICE_DISK="/" \
npm run device:ping
```

Variabile:
- `DEVICE_SLUG` (unic)
- `DEVICE_NAME` (afisat in UI)
- `DEVICE_DISK` (default `/` pe linux, `C:` pe Windows; pe mac recomand `/System/Volumes/Data`)
- `DEVICE_DISKS` (lista separata prin virgula, ex: `C:,D:,J:,K:`)
- `LOW_STORAGE_WARN_PCT` (default `10`)
- `LOW_STORAGE_CRIT_PCT` (default `5`)

### Programare la 10-20 minute

macOS (launchd): similar cu `termo_alert.mjs`, rulezi scriptul la 600-1200 sec.

Linux (cron):

```bash
*/10 * * * * cd "/path/to/life-dashboard" && /usr/bin/node --env-file .env scripts/device_heartbeat.mjs >> ~/device_heartbeat.log 2>&1
```

Daca Node nu suporta `--env-file` (versiuni vechi), foloseste:

```bash
*/10 * * * * cd "/path/to/life-dashboard" && /bin/bash -lc 'set -a; . .env; set +a; /usr/bin/node scripts/device_heartbeat.mjs' >> ~/device_heartbeat.log 2>&1
```

Windows (Task Scheduler):
- Action: `node --env-file .env scripts/device_heartbeat.mjs`
- Trigger: every 10-20 minutes
- Start in: folderul repo-ului

PowerShell (Task Scheduler, 30 min):

```powershell
$vbs = "C:\Users\Alexandru\Documents\GitHub\life-dashboard\scripts\device_heartbeat_hidden.vbs"
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbs`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 1)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "life-dashboard-device-heartbeat" -Action $action -Trigger $trigger -Settings $settings
```

Node fara `--env-file` (manual sau Task Scheduler):

```powershell
$repo = "C:\Users\Alexandru\Documents\GitHub\life-dashboard"
$envContent = Get-Content "$repo\.env"
$envContent | % { if($_ -match '^(.*?)=(.*)$'){[Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')} }
node scripts\device_heartbeat.mjs
```

### macOS (Xan) - setup curent

- Repo path: `/Users/xan/Documents/Github repos/life-dashboard`
- Plist: `/Users/xan/Library/LaunchAgents/ro.life-dashboard.device-heartbeat.plist`
- Logs:
  - `/Users/xan/device_heartbeat.log`
  - `/Users/xan/device_heartbeat.err`
- Interval: 30 min (`StartInterval` = 1800)
- Env in `/.env`:
  - `DEVICE_SLUG=mac`
  - `DEVICE_NAME=Mac`
  - `DEVICE_DISK=/System/Volumes/Data`

### Linux (ThinkPad W530) - setup curent

- Repo path: `/home/xan/github/life-dashboard`
- Cron:
  - `*/30 * * * * cd "/home/xan/github/life-dashboard" && /bin/bash -lc 'set -a; . .env; set +a; /usr/bin/node scripts/device_heartbeat.mjs' >> ~/device_heartbeat.log 2>&1`
- Logs:
  - `/home/xan/device_heartbeat.log`
- Env in `/.env`:
  - `DEVICE_SLUG=linux-xan`
  - `DEVICE_NAME=Linux`
  - `DEVICE_DISK=/`

### Windows (Alexandru) - setup curent

- Repo path: `C:\Users\Alexandru\Documents\GitHub\life-dashboard`
- Task Scheduler (30 min):
  - Task name: `life-dashboard-device-heartbeat`
  - Script: `C:\Users\Alexandru\Documents\GitHub\life-dashboard\scripts\device_heartbeat_hidden.vbs`
- Env in `\.env`:
  - `DEVICE_SLUG=win-xan`
  - `DEVICE_NAME=Windows`
  - `DEVICE_DISK=C:`

### Inventar device-uri (de completat)

| Device | OS | Repo path | Scheduler | Interval |
| --- | --- | --- | --- | --- |
| Mac (Xan) | macOS | /path/to/life-dashboard | launchd | 10-20m |
| Laptop fiica | Windows | ... | Task Scheduler | 10-20m |
| Desktop fiu | Windows | ... | Task Scheduler | 10-20m |
| Mini server | Linux | ... | cron/systemd | 10-20m |

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
