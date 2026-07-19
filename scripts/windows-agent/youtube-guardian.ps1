#Requires -RunAsAdministrator

# Life Dashboard YouTube Guardian. Windows PowerShell 5.1 compatible.
# This program changes only hosts-file YouTube entries. It never changes DNS settings.

$DASHBOARD_URL = "https://YOUR_DASHBOARD_HOST"
$DEVICE_ID = "YOUR_DEVICE_UUID"
$DEVICE_TOKEN = "YOUR_RANDOM_DEVICE_TOKEN"
$POLL_INTERVAL_SEC = 60

$DATA_DIR = "C:\ProgramData\LifeDashboard"
$STATE_FILE = Join-Path $DATA_DIR "last_state.json"
$LOG_FILE = Join-Path $DATA_DIR "guardian.log"
$HOSTS_FILE = Join-Path $env:SystemRoot "System32\drivers\etc\hosts"
$HOSTS_BACKUP = Join-Path (Split-Path $HOSTS_FILE) "hosts.youtube-guardian.original.bak"
$LOG_MAX_BYTES = 524288
$MUTEX_NAME = "Global\LifeDashboardYouTubeGuardian"
$MARKER_START = "# YouTube Guardian managed block - start"
$MARKER_END = "# YouTube Guardian managed block - end"
$YOUTUBE_ENTRIES = @(
    "127.0.0.1 youtube.com",
    "127.0.0.1 www.youtube.com",
    "127.0.0.1 m.youtube.com",
    "127.0.0.1 youtu.be"
)
$LEGACY_PATTERN = '^\s*127\.0\.0\.1\s+(youtube\.com|www\.youtube\.com|m\.youtube\.com|youtu\.be)\s*$'
$ASCII = New-Object System.Text.ASCIIEncoding($false)

function Get-HostsEncoding {
    $bytes = [System.IO.File]::ReadAllBytes($HOSTS_FILE)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        return New-Object System.Text.UTF8Encoding($true)
    }
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) { return [System.Text.Encoding]::Unicode }
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) { return [System.Text.Encoding]::BigEndianUnicode }
    return [System.Text.Encoding]::Default
}

function Ensure-DataDir {
    if (-not (Test-Path -LiteralPath $DATA_DIR)) {
        New-Item -ItemType Directory -Path $DATA_DIR -Force | Out-Null
    }
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    try {
        Ensure-DataDir
        if ((Test-Path -LiteralPath $LOG_FILE) -and (Get-Item -LiteralPath $LOG_FILE).Length -gt $LOG_MAX_BYTES) {
            $oldLog = "$LOG_FILE.old"
            if (Test-Path -LiteralPath $oldLog) { Remove-Item -LiteralPath $oldLog -Force }
            Move-Item -LiteralPath $LOG_FILE -Destination $oldLog -Force
        }
        $line = "[{0}] [{1}] {2}" -f (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"), $Level, $Message
        [System.IO.File]::AppendAllText($LOG_FILE, $line + [Environment]::NewLine, $ASCII)
    } catch { }
}

function Save-State {
    param([object]$State)
    try {
        Ensure-DataDir
        $temp = "$STATE_FILE.tmp"
        [System.IO.File]::WriteAllText($temp, ($State | ConvertTo-Json -Compress), $ASCII)
        Move-Item -LiteralPath $temp -Destination $STATE_FILE -Force
        return $true
    } catch {
        Write-Log "Could not save state: $($_.Exception.Message)" "WARN"
        return $false
    }
}

function Load-State {
    if (-not (Test-Path -LiteralPath $STATE_FILE)) { return $null }
    try { return [System.IO.File]::ReadAllText($STATE_FILE, $ASCII) | ConvertFrom-Json }
    catch {
        Write-Log "Could not read cached state: $($_.Exception.Message)" "WARN"
        return $null
    }
}

function Test-ControlState {
    param([object]$State)
    if ($null -eq $State -or $State.device_id -ne $DEVICE_ID) { return $false }
    if ($State.youtube_allowed -isnot [bool]) { return $false }
    if ($State.youtube_allowed_until) {
        $parsed = [datetimeoffset]::MinValue
        if (-not [datetimeoffset]::TryParse([string]$State.youtube_allowed_until, [ref]$parsed)) { return $false }
    }
    return $true
}

function Fetch-ControlState {
    try {
        $uri = $DASHBOARD_URL.TrimEnd('/') + "/api/device-controls/agent"
        $headers = @{ Authorization = "Bearer $DEVICE_TOKEN"; "X-Device-Id" = $DEVICE_ID; Accept = "application/json" }
        $response = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers -TimeoutSec 15 -ErrorAction Stop
        if (-not (Test-ControlState -State $response.data)) { throw "Endpoint returned invalid state" }
        return $response.data
    } catch {
        Write-Log "Control fetch failed: $($_.Exception.Message)" "WARN"
        return $null
    }
}

function Resolve-Allowed {
    param([object]$State)
    if ($null -eq $State -or -not $State.youtube_allowed) { return $false }
    if (-not $State.youtube_allowed_until) { return $true }
    try { return [datetimeoffset]::UtcNow -lt [datetimeoffset]::Parse([string]$State.youtube_allowed_until).ToUniversalTime() }
    catch { return $false }
}

function Get-DesiredHostsText {
    param([string]$CurrentText, [bool]$Block)
    $normalized = $CurrentText.Replace("`r`n", "`n").Replace("`r", "`n")
    $lines = $normalized.Split("`n")
    $kept = New-Object System.Collections.Generic.List[string]
    $inside = $false
    foreach ($line in $lines) {
        if ($line -eq $MARKER_START) { $inside = $true; continue }
        if ($line -eq $MARKER_END) { $inside = $false; continue }
        if ($inside) { continue }
        if ($line -match $LEGACY_PATTERN) { continue }
        $kept.Add($line)
    }
    while ($kept.Count -gt 0 -and $kept[$kept.Count - 1] -eq "") { $kept.RemoveAt($kept.Count - 1) }
    if ($Block) {
        if ($kept.Count -gt 0) { $kept.Add("") }
        $kept.Add($MARKER_START)
        foreach ($entry in $YOUTUBE_ENTRIES) { $kept.Add($entry) }
        $kept.Add($MARKER_END)
    }
    return ([string]::Join("`r`n", $kept.ToArray()) + "`r`n")
}

function Set-YouTubeBlocked {
    param([bool]$Block)
    $mutex = New-Object System.Threading.Mutex($false, $MUTEX_NAME)
    $locked = $false
    $tempPath = $null
    try {
        $locked = $mutex.WaitOne(30000)
        if (-not $locked) { throw "Timed out waiting for hosts-file mutex" }
        if (-not (Test-Path -LiteralPath $HOSTS_FILE)) { throw "Hosts file does not exist" }
        $hostsEncoding = Get-HostsEncoding
        $current = [System.IO.File]::ReadAllText($HOSTS_FILE, $hostsEncoding)
        $desired = Get-DesiredHostsText -CurrentText $current -Block $Block
        if ($current.Replace("`r`n", "`n").Replace("`r", "`n") -eq $desired.Replace("`r`n", "`n")) { return $false }

        if (-not (Test-Path -LiteralPath $HOSTS_BACKUP)) {
            [System.IO.File]::Copy($HOSTS_FILE, $HOSTS_BACKUP, $false)
        }
        $directory = Split-Path $HOSTS_FILE
        $tempPath = Join-Path $directory ("hosts.youtube-guardian.{0}.tmp" -f [guid]::NewGuid().ToString("N"))
        [System.IO.File]::WriteAllText($tempPath, $desired, $hostsEncoding)
        $validated = [System.IO.File]::ReadAllText($tempPath, $hostsEncoding)
        if ($validated -ne $desired -or $validated.Length -eq 0) { throw "Temporary hosts validation failed" }
        if ($Block -and (($validated.Split(@($MARKER_START), [System.StringSplitOptions]::None).Count - 1) -ne 1)) {
            throw "Managed block validation failed"
        }

        $replaceBackup = Join-Path $directory ("hosts.youtube-guardian.replace.{0}.bak" -f [guid]::NewGuid().ToString("N"))
        try {
            [System.IO.File]::Replace($tempPath, $HOSTS_FILE, $replaceBackup, $true)
            $tempPath = $null
            Remove-Item -LiteralPath $replaceBackup -Force -ErrorAction SilentlyContinue
        } catch {
            if (Test-Path -LiteralPath $replaceBackup) {
                Copy-Item -LiteralPath $replaceBackup -Destination $HOSTS_FILE -Force -ErrorAction SilentlyContinue
            }
            throw
        }
        & "$env:SystemRoot\System32\ipconfig.exe" /flushdns | Out-Null
        Write-Log ("Hosts update succeeded; YouTube is {0}" -f $(if ($Block) { "blocked" } else { "allowed" }))
        return $true
    } catch {
        Write-Log "Hosts update failed: $($_.Exception.Message)" "ERROR"
        return $false
    } finally {
        if ($tempPath -and (Test-Path -LiteralPath $tempPath)) { Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue }
        if ($locked) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}

Ensure-DataDir
Write-Log "YouTube Guardian started"
while ($true) {
    $state = Fetch-ControlState
    if ($null -ne $state) {
        [void](Save-State -State $state)
    } else {
        $state = Load-State
        if (-not (Test-ControlState -State $state)) { $state = $null }
    }
    # No valid remote or cached state fails closed. Cached timers still expire locally.
    $shouldBlock = -not (Resolve-Allowed -State $state)
    [void](Set-YouTubeBlocked -Block $shouldBlock)
    Start-Sleep -Seconds $POLL_INTERVAL_SEC
}
