# YouTube Guardian Windows agent

The agent makes outbound HTTPS requests once per minute. It opens no inbound port and never changes the Windows DNS server configuration. It only manages its marked YouTube block plus four exact legacy hosts entries.

## 1. Apply the database migration

Run `apps/dashboard/supabase/device_controls.sql` in Supabase. Ensure the deployed dashboard has `SUPABASE_SERVICE_ROLE_KEY`; it is server-only and must never use a `NEXT_PUBLIC_` name.

## 2. Create a device token

On a trusted machine, generate a random token and its SHA-256 hash:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = [Convert]::ToBase64String($bytes)
$sha = [Security.Cryptography.SHA256]::Create()
$hash = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($token)) | ForEach-Object { $_.ToString("x2") })
"TOKEN=$token"
"HASH=$hash"
```

Store only the hash in Supabase, replacing both values:

```sql
insert into public.device_agent_credentials (device_id, token_hash)
values ('DEVICE_UUID', 'LOWERCASE_SHA256_HASH')
on conflict (device_id) do update
set token_hash = excluded.token_hash, rotated_at = now();
```

Put the raw token only in `youtube-guardian.ps1` on the Windows PC. Rotating this row immediately revokes the old token.

## 3. Configure and install

Set `DASHBOARD_URL`, `DEVICE_ID`, and `DEVICE_TOKEN` at the top of `youtube-guardian.ps1`. Copy both scripts to a permanent directory such as `C:\ProgramData\LifeDashboard\agent`, then run an elevated Windows PowerShell 5.1 prompt:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
Set-Location "C:\ProgramData\LifeDashboard\agent"
.\install-task.ps1
```

The scheduled task runs as SYSTEM at startup. Logs are in `C:\ProgramData\LifeDashboard\guardian.log`; the cached state is `last_state.json`. Before its first hosts change, it creates `hosts.youtube-guardian.original.bak` beside the hosts file.

## Tests

1. Click Block now; within 60 seconds the marked block appears and unrelated hosts lines remain byte-for-line equivalent after newline normalization.
2. Click Allow indefinitely; the marked block and exact legacy entries disappear.
3. Try 15, 30, and 60 minutes; the dashboard counts down and the PC blocks after local expiry.
4. Stop network access during a temporary allowance; it blocks when the cached UTC deadline passes.
5. Remove the cache and deny network access; it fails closed and blocks.
6. Use a wrong token or device ID; the endpoint returns 401 without revealing whether another device exists.
7. Start two agent instances; the mutex serializes hosts edits and only one managed block remains.
8. Confirm `Get-DnsClientServerAddress` is unchanged before and after all tests.

Uninstall with `Unregister-ScheduledTask -TaskName "YouTubeGuardian" -Confirm:$false`. Uninstalling does not alter hosts automatically.
