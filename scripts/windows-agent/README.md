# YouTube Guardian Windows agent

The agent runs continuously as SYSTEM and polls Life Dashboard approximately every 10 seconds. Blocked mode combines an exact-hosts block with a persistent Microsoft Defender Firewall wildcard FQDN rule for `*.googlevideo.com`. Allowed mode removes the managed hosts block and disables the firewall rule. After applying a state, it reports the result and prerequisite status to the dashboard; the dashboard marks stale reports offline. Apply `apps/dashboard/supabase/device_agent_status.sql` and deploy the corresponding API before installing this version.

It makes outbound HTTPS requests only, opens no inbound ports, and never changes DNS servers, Secure DNS, proxy, VPN, Defender, or unrelated firewall settings. When a new block command arrives or a temporary allowance expires, it restarts Chrome and Edge network-service processes and flushes the Windows DNS cache. Browser windows stay open, but downloads and other browser connections may be interrupted. Firefox and other browsers are not covered by this connection reset; buffered media may continue temporarily.

## Files

- `youtube-guardian.ps1`: polling, cached state, hosts management, and firewall state application.
- `firewall-guardian.ps1`: shared firewall reconciliation and diagnostics.
- `install-task.ps1`: idempotent installation of both scripts, firewall objects, and Scheduled Task.

## Firewall prerequisites

Microsoft documents dynamic FQDN keywords for Windows 10, Windows 11, Windows Server 2016, Windows Server 2019, Windows Server 2022, and Windows Server 2025. Effective FQDN enforcement requires:

- Microsoft Defender Antivirus enabled;
- Defender platform version 4.18.2209.7 or later;
- Network Protection in Enabled or Audit mode;
- Microsoft Defender Firewall enabled on the active profile;
- DNS over HTTPS disabled so Windows can observe the DNS response.

The installer reports these conditions but does not change them automatically.

## Configure

Edit only the placeholders in `youtube-guardian.ps1` before installation:

```powershell
$DASHBOARD_URL = "https://YOUR_DASHBOARD_HOST"
$DEVICE_ID = "YOUR_DEVICE_UUID"
$DEVICE_TOKEN = "YOUR_RANDOM_DEVICE_TOKEN"
```

Use the dashboard origin without `/api/device-controls/agent`. Keep the token only on the child PC. Keep repository copies as placeholders.

## Install or update

Place all three scripts in one directory. Open Windows PowerShell 5.1 as Administrator there:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\install-task.ps1 -InstallDirectory "C:\ProgramData\LifeDashboard\agent"
```

The same command is the reinstall/update command. It:

1. validates and copies both runtime scripts;
2. stops and replaces the existing task;
3. creates or repairs the stable `*.googlevideo.com` AutoResolve keyword;
4. removes duplicate managed rules and creates or repairs `LifeDashboard - Block YouTube Streams`;
5. starts the SYSTEM task and prints task, firewall, prerequisite, and log diagnostics.

Firewall objects persist across reboot. Reinstallation is idempotent and does not touch unrelated rules.

## Agent diagnostics

One remote poll and apply cycle requires stopping the singleton agent first:

```powershell
Stop-ScheduledTask -TaskName "YouTubeGuardian"
& "C:\ProgramData\LifeDashboard\agent\youtube-guardian.ps1" -Once
$LASTEXITCODE
Start-ScheduledTask -TaskName "YouTubeGuardian"
```

Firewall-only diagnostics are read-only and may run while the task is active:

```powershell
& "C:\ProgramData\LifeDashboard\agent\youtube-guardian.ps1" -FirewallDiagnostics
```

Direct inspection commands:

```powershell
Get-NetFirewallDynamicKeywordAddress -Id "{4d36f2d8-9ec5-4ce6-a8b7-70e5267f1b26}" | Format-List *
Get-NetFirewallRule -Name "LifeDashboard-BlockYouTubeStreams" | Format-List *
Get-NetFirewallProfile | Format-Table Name,Enabled,DefaultInboundAction,DefaultOutboundAction
Get-MpComputerStatus | Format-List AntivirusEnabled,AMServiceEnabled,AMProductVersion
Get-MpPreference | Select-Object EnableNetworkProtection
```

`Addresses` can be empty until an application performs a matching DNS query. Windows also clears learned dynamic addresses at restart and relearns them from observed DNS traffic.

## Manual firewall enable/disable test

These commands test only the already-installed Guardian rule:

```powershell
Set-NetFirewallRule -Name "LifeDashboard-BlockYouTubeStreams" -Enabled True
Get-NetFirewallRule -Name "LifeDashboard-BlockYouTubeStreams" | Select-Object Name,Enabled,Direction,Action
Get-NetFirewallDynamicKeywordAddress -Id "{4d36f2d8-9ec5-4ce6-a8b7-70e5267f1b26}" | Select-Object Id,Keyword,AutoResolve,Addresses
```

```powershell
Set-NetFirewallRule -Name "LifeDashboard-BlockYouTubeStreams" -Enabled False
Get-NetFirewallRule -Name "LifeDashboard-BlockYouTubeStreams" | Select-Object Name,Enabled
```

The agent will restore the rule to the effective dashboard state on its next poll.

## Task and log commands

```powershell
Get-ScheduledTask -TaskName "YouTubeGuardian" | Format-List TaskName,State,Actions,Principal,Settings
Get-ScheduledTaskInfo -TaskName "YouTubeGuardian" | Format-List *
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

## Apply behavior

Blocked:

- exact YouTube hosts resolve to IPv4 and IPv6 loopback;
- the persistent outbound firewall rule is enabled for `*.googlevideo.com`;
- a firewall failure is logged, hosts remain blocked as fallback, and polling continues.

Allowed:

- the managed hosts block is removed;
- the existing firewall rule is disabled, not deleted;
- the browser remains open; existing connections are not forcibly terminated.

The agent checks actual firewall state each cycle but invokes `Set-NetFirewallRule` only when the enabled state differs. It never recreates firewall objects during polling; repair is an installation responsibility.

## End-to-end test

1. Run the installer and confirm one keyword and one disabled or state-appropriate Guardian rule exist.
2. Run `-FirewallDiagnostics`; confirm Defender AV, platform, Network Protection, firewall profiles, and DoH results.
3. In Life Dashboard select Block now.
4. After the next poll confirm the managed hosts block exists and the Guardian rule is enabled.
5. Open a fresh browser tab and test normal YouTube, Shorts, an embedded player, and video playback. Do not rely on a stream that was already connected.
6. Inspect `Addresses` after a `googlevideo.com` DNS query and review the Guardian log.
7. Select Allow indefinitely.
8. After the next poll confirm the managed hosts block is absent and the Guardian rule is disabled; refresh or open a new connection to test playback.
9. Disconnect the network during a temporary allowance and confirm cached expiry reenables both blocking layers locally.
10. Temporarily rename the managed firewall rule, select Block, and confirm the error is logged while hosts blocking remains active. Rerun the installer to repair it.

## Known limitations

- DoH or browser Secure DNS can hide DNS responses from Defender Firewall FQDN inspection.
- VPNs, proxies, and some tunnels can bypass or change the traffic path.
- Previously cached IPs and direct-IP connections might not generate the DNS query required for dynamic matching.
- Connections established before the rule is enabled are not forcibly closed. Test with a new tab, refresh, or new playback request.
- Dynamic address learning is asynchronous, so the first connection can race rule hydration; applications normally retry.
- Defender or domain policy can override local firewall and Network Protection configuration.
- Third-party YouTube frontends that proxy media through their own servers are outside the YouTube domain list.

The diagnostic mode detects common Windows, Chrome, Edge, VPN, and WinHTTP proxy conditions, but no local diagnostic can prove that every browser profile, extension, tunnel, or user-level proxy is absent.

## Troubleshooting

- HTTP 401: verify the raw device token and UUID match the server-side credential hash.
- HTTP 404 or HTML: use the deployed dashboard origin, not Supabase or a URL already containing the API path.
- HTTP 500/503: inspect dashboard server logs; the agent uses valid cache or fails closed.
- Rule exists but streams work: run firewall diagnostics and check Network Protection, Defender platform, active firewall profile, DoH, VPN/proxy use, cached IPs, and existing connections.
- Task running without logs: inspect the task action/working directory, Task Scheduler Operational log, SYSTEM access to `C:\ProgramData\LifeDashboard`, and the singleton mutex startup entry.
- Hosts write failure: verify SYSTEM/highest privileges and endpoint-protection logs; failed writes preserve the original hosts file.

## Uninstall and firewall cleanup

```powershell
Stop-ScheduledTask -TaskName "YouTubeGuardian" -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "YouTubeGuardian" -Confirm:$false -ErrorAction SilentlyContinue
Remove-NetFirewallRule -Name "LifeDashboard-BlockYouTubeStreams" -ErrorAction SilentlyContinue
Remove-NetFirewallDynamicKeywordAddress -Id "{4d36f2d8-9ec5-4ce6-a8b7-70e5267f1b26}" -Confirm:$false -ErrorAction SilentlyContinue
```

Uninstall does not alter hosts automatically. Remove the marked block manually only if that is the intended final state.
