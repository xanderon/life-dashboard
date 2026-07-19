# YouTube Guardian Windows agent

The agent runs continuously as SYSTEM and polls the Life Dashboard every 30 seconds. It makes outbound HTTPS requests only, opens no inbound ports, and never changes Windows DNS server configuration.

## Configure

Edit these placeholders in `youtube-guardian.ps1` before installation:

```powershell
$DASHBOARD_URL = "https://YOUR_DASHBOARD_HOST"
$DEVICE_ID = "YOUR_DEVICE_UUID"
$DEVICE_TOKEN = "YOUR_RANDOM_DEVICE_TOKEN"
```

Use the dashboard origin only, without `/api/device-controls/agent`. Keep the token only on the child PC. The repository must retain placeholders.

## Install

Open Windows PowerShell 5.1 as Administrator in the directory containing both scripts:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\install-task.ps1
```

The installer copies the configured guardian to `C:\ProgramData\LifeDashboard\agent`, replaces an existing `YouTubeGuardian` task, starts it, waits five seconds, and prints the state, result, action, principal, and recent logs.

## Reinstall or update

Configure the new `youtube-guardian.ps1`, then run from its directory in an elevated Windows PowerShell 5.1 prompt:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\install-task.ps1 -InstallDirectory "C:\ProgramData\LifeDashboard\agent"
```

This stops and unregisters the previous task before replacing it. It does not change the device token or other configuration unless the configured source script is copied over it.

## One-cycle diagnostic

Stop the continuous task first because the singleton mutex intentionally prevents two agents from running:

```powershell
Stop-ScheduledTask -TaskName "YouTubeGuardian"
& "C:\ProgramData\LifeDashboard\agent\youtube-guardian.ps1" -Once
$LASTEXITCODE
Start-ScheduledTask -TaskName "YouTubeGuardian"
```

Exit `0` means the remote poll and safe hosts evaluation/application succeeded. A nonzero result indicates configuration, duplicate-instance, HTTP, JSON, or hosts failure. Detailed diagnostic output is printed and appended to the log. Offline cached-state enforcement remains safe but `-Once` returns nonzero because the remote health check failed.

## Inspect and operate the task

```powershell
Get-ScheduledTask -TaskName "YouTubeGuardian" | Format-List TaskName,State,Actions,Principal,Settings
Get-ScheduledTaskInfo -TaskName "YouTubeGuardian" | Format-List *
```

```powershell
Get-Content "C:\ProgramData\LifeDashboard\guardian.log" -Tail 100
Get-Content "C:\ProgramData\LifeDashboard\guardian.log" -Wait -Tail 20
```

```powershell
Stop-ScheduledTask -TaskName "YouTubeGuardian"
Start-ScheduledTask -TaskName "YouTubeGuardian"
Stop-ScheduledTask -TaskName "YouTubeGuardian"
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName "YouTubeGuardian"
```

Also inspect the Task Scheduler Operational log:

```powershell
Get-WinEvent -LogName "Microsoft-Windows-TaskScheduler/Operational" -MaxEvents 50 |
    Where-Object { $_.Message -like "*YouTubeGuardian*" } |
    Format-List TimeCreated,Id,LevelDisplayName,Message
```

## Expected safety behavior

- Unrelated hosts lines are preserved.
- Only the marked Guardian block and exact legacy YouTube entries are managed.
- A permanent original backup is created before the first hosts modification.
- Same-directory temporary content is validated and atomically replaced.
- Only changed content is written, and DNS is flushed only following a successful hosts replacement.
- A process-lifetime global mutex prevents duplicate agents and concurrent hosts editing.
- Cached temporary permissions expire locally while offline.
- No valid cache plus a failed request blocks YouTube.
- One failed cycle is logged and cannot terminate the continuous loop.

## Troubleshooting

### Works manually but not as Scheduled Task

Compare the startup log fields `identity`, `is_system`, `script_path`, `dashboard_host`, and `mutex_acquired`. Verify the task action uses the installed script, its working directory is `C:\ProgramData\LifeDashboard\agent`, and the log receives a new poll entry every 30 seconds. SYSTEM can have different proxy and certificate trust behavior than your user account. Use `-Once` after stopping the task, then test as SYSTEM with an approved administration tool if the environments still differ.

### HTTP 401

The device token or device ID does not match the server-side credential hash. Re-enter the raw token without quotes or whitespace changes and confirm the configured UUID. Authorization headers and tokens are never logged.

### HTTP 404 or HTML instead of JSON

Confirm `DASHBOARD_URL` is the deployed dashboard origin, not Supabase and not a URL containing the API path. Confirm the deployed application contains `/api/device-controls/agent`. The log reports endpoint, HTTP status, content type, JSON validity, and a truncated response body.

### HTTP 500 or 503

Inspect the dashboard server logs and confirm its server-only Supabase environment variables are configured. The Windows agent will use valid cache or fail closed until the server recovers.

### Task says Running but no new log entries

Check `Get-ScheduledTaskInfo`, the Task Scheduler Operational log, action path/arguments, and whether another process owns the Guardian mutex. Confirm SYSTEM can create and append files under `C:\ProgramData\LifeDashboard`. Re-run `install-task.ps1`; it prints the installed action and recent log lines.

### SYSTEM permission or hosts write failures

Confirm the task principal is `SYSTEM` with `Highest` run level. Check antivirus or endpoint-protection logs for blocked writes. Verify the hosts file exists and is not locked by security software. The agent logs the exception type/message, preserves the existing file on failure, and does not flush DNS after a failed replacement.

## Uninstall

```powershell
Stop-ScheduledTask -TaskName "YouTubeGuardian" -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "YouTubeGuardian" -Confirm:$false
```

Uninstalling does not alter hosts automatically. Remove the marked block manually only if that is the intended final state.
