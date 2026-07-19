#Requires -Version 5.1
#Requires -RunAsAdministrator

[CmdletBinding()]
param(
    [switch]$Once
)

# Life Dashboard YouTube Guardian. Windows PowerShell 5.1 compatible.
# This program changes only hosts-file YouTube entries. It never changes DNS settings.

$AGENT_VERSION = "2.0.0"
$DASHBOARD_URL = "https://YOUR_DASHBOARD_HOST"
$DEVICE_ID = "YOUR_DEVICE_UUID"
$DEVICE_TOKEN = "YOUR_RANDOM_DEVICE_TOKEN"
$POLL_INTERVAL_SEC = 30

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
$script:ConsoleLogging = [bool]$Once

function Ensure-DataDir {
    if (-not (Test-Path -LiteralPath $DATA_DIR)) {
        New-Item -ItemType Directory -Path $DATA_DIR -Force -ErrorAction Stop | Out-Null
    }
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $line = "[{0}] [{1}] {2}" -f [datetimeoffset]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"), $Level, $Message
    if ($script:ConsoleLogging) { Write-Host $line }
    try {
        Ensure-DataDir
        if ((Test-Path -LiteralPath $LOG_FILE) -and (Get-Item -LiteralPath $LOG_FILE).Length -gt $LOG_MAX_BYTES) {
            $oldLog = "$LOG_FILE.old"
            if (Test-Path -LiteralPath $oldLog) { Remove-Item -LiteralPath $oldLog -Force -ErrorAction Stop }
            Move-Item -LiteralPath $LOG_FILE -Destination $oldLog -Force -ErrorAction Stop
        }
        [System.IO.File]::AppendAllText($LOG_FILE, $line + [Environment]::NewLine, $ASCII)
    } catch {
        if (-not $script:ConsoleLogging) { Write-Error $line }
    }
}

function Get-SafeEndpoint {
    try {
        $baseUri = New-Object System.Uri($DASHBOARD_URL)
        return $baseUri.GetLeftPart([System.UriPartial]::Authority) + "/api/device-controls/agent"
    } catch { return "invalid-endpoint" }
}

function Write-FatalAndExit {
    param([string]$Message, [int]$Code)
    Write-Log $Message "FATAL"
    exit $Code
}

function Test-Configuration {
    try { Ensure-DataDir } catch { Write-Error "FATAL: Cannot create data directory: $($_.Exception.Message)"; return $false }
    $uri = $null
    if (-not [System.Uri]::TryCreate($DASHBOARD_URL, [System.UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne "https") {
        Write-Log "DASHBOARD_URL must be a valid absolute HTTPS URL" "FATAL"; return $false
    }
    $parsedId = [guid]::Empty
    if (-not [guid]::TryParse($DEVICE_ID, [ref]$parsedId) -or $parsedId -eq [guid]::Empty) {
        Write-Log "DEVICE_ID must be a valid non-empty UUID" "FATAL"; return $false
    }
    if ([string]::IsNullOrWhiteSpace($DEVICE_TOKEN) -or $DEVICE_TOKEN -eq "YOUR_RANDOM_DEVICE_TOKEN" -or $DEVICE_TOKEN.Length -lt 32) {
        Write-Log "DEVICE_TOKEN must be configured and at least 32 characters" "FATAL"; return $false
    }
    if (-not (Test-Path -LiteralPath $HOSTS_FILE -PathType Leaf)) {
        Write-Log "Hosts file does not exist: $HOSTS_FILE" "FATAL"; return $false
    }
    return $true
}

function Save-State {
    param([object]$State)
    $temp = "$STATE_FILE.$PID.tmp"
    try {
        [System.IO.File]::WriteAllText($temp, ($State | ConvertTo-Json -Compress), $ASCII)
        Move-Item -LiteralPath $temp -Destination $STATE_FILE -Force -ErrorAction Stop
        return $true
    } catch {
        Write-Log "Cache write failed exception_type=$($_.Exception.GetType().FullName) message=$($_.Exception.Message)" "WARN"
        return $false
    } finally {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
    }
}

function Load-State {
    if (-not (Test-Path -LiteralPath $STATE_FILE)) { return $null }
    try { return [System.IO.File]::ReadAllText($STATE_FILE, $ASCII) | ConvertFrom-Json -ErrorAction Stop }
    catch {
        Write-Log "Cache read failed exception_type=$($_.Exception.GetType().FullName) message=$($_.Exception.Message)" "WARN"
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

function Get-HttpFailureDetails {
    param([System.Management.Automation.ErrorRecord]$ErrorRecord)
    $status = "none"
    $contentType = "unknown"
    $body = ""
    try {
        $response = $ErrorRecord.Exception.Response
        if ($null -ne $response) {
            $status = [int]$response.StatusCode
            $contentType = [string]$response.ContentType
            $stream = $response.GetResponseStream()
            if ($null -ne $stream) {
                $reader = New-Object System.IO.StreamReader($stream)
                try { $body = $reader.ReadToEnd() } finally { $reader.Dispose() }
            }
        }
    } catch { $body = "Unable to read failure response: $($_.Exception.Message)" }
    $body = ($body -replace '[\r\n]+', ' ').Trim()
    if ($body.Length -gt 512) { $body = $body.Substring(0, 512) + "..." }
    return @{ Status = $status; ContentType = $contentType; Body = $body }
}

function Fetch-ControlState {
    $endpoint = Get-SafeEndpoint
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $headers = @{ Authorization = "Bearer $DEVICE_TOKEN"; "X-Device-Id" = $DEVICE_ID; Accept = "application/json" }
        $response = Invoke-WebRequest -Uri $endpoint -Method Get -Headers $headers -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
        $stopwatch.Stop()
        $contentType = [string]$response.Headers["Content-Type"]
        $validJson = $false
        $payload = $null
        try { $payload = $response.Content | ConvertFrom-Json -ErrorAction Stop; $validJson = $true } catch { }
        Write-Log "Poll response endpoint=$endpoint duration_ms=$($stopwatch.ElapsedMilliseconds) http_status=$([int]$response.StatusCode) content_type=$contentType valid_json=$validJson"
        if (-not $validJson -or -not (Test-ControlState -State $payload.data)) {
            throw "Endpoint returned invalid JSON control state"
        }
        Write-Log "Remote state youtube_allowed=$($payload.data.youtube_allowed) youtube_allowed_until=$($payload.data.youtube_allowed_until)"
        return @{ Success = $true; State = $payload.data }
    } catch {
        $stopwatch.Stop()
        $details = Get-HttpFailureDetails -ErrorRecord $_
        Write-Log "Poll failed endpoint=$endpoint duration_ms=$($stopwatch.ElapsedMilliseconds) exception_type=$($_.Exception.GetType().FullName) message=$($_.Exception.Message) http_status=$($details.Status) content_type=$($details.ContentType) response_body=$($details.Body)" "ERROR"
        return @{ Success = $false; State = $null }
    }
}

function Resolve-Allowed {
    param([object]$State)
    if ($null -eq $State -or -not $State.youtube_allowed) { return $false }
    if (-not $State.youtube_allowed_until) { return $true }
    try { return [datetimeoffset]::UtcNow -lt [datetimeoffset]::Parse([string]$State.youtube_allowed_until).ToUniversalTime() }
    catch { return $false }
}

function Get-HostsEncoding {
    $bytes = [System.IO.File]::ReadAllBytes($HOSTS_FILE)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { return New-Object System.Text.UTF8Encoding($true) }
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) { return [System.Text.Encoding]::Unicode }
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) { return [System.Text.Encoding]::BigEndianUnicode }
    return [System.Text.Encoding]::Default
}

function Get-DesiredHostsText {
    param([string]$CurrentText, [bool]$Block)
    $lines = $CurrentText.Replace("`r`n", "`n").Replace("`r", "`n").Split("`n")
    $startCount = @($lines | Where-Object { $_ -eq $MARKER_START }).Count
    $endCount = @($lines | Where-Object { $_ -eq $MARKER_END }).Count
    if ($startCount -ne $endCount -or $startCount -gt 1) {
        throw "Managed hosts markers are unbalanced or duplicated"
    }
    $kept = New-Object System.Collections.Generic.List[string]
    $inside = $false
    foreach ($line in $lines) {
        if ($line -eq $MARKER_START) { $inside = $true; continue }
        if ($line -eq $MARKER_END) { $inside = $false; continue }
        if ($inside -or $line -match $LEGACY_PATTERN) { continue }
        $kept.Add($line)
    }
    while ($kept.Count -gt 0 -and $kept[$kept.Count - 1] -eq "") { $kept.RemoveAt($kept.Count - 1) }
    if ($Block) {
        if ($kept.Count -gt 0) { $kept.Add("") }
        $kept.Add($MARKER_START)
        foreach ($entry in $YOUTUBE_ENTRIES) { $kept.Add($entry) }
        $kept.Add($MARKER_END)
    }
    return [string]::Join("`r`n", $kept.ToArray()) + "`r`n"
}

function Set-YouTubeBlocked {
    param([bool]$Block)
    $tempPath = $null
    try {
        $encoding = Get-HostsEncoding
        $current = [System.IO.File]::ReadAllText($HOSTS_FILE, $encoding)
        $desired = Get-DesiredHostsText -CurrentText $current -Block $Block
        $requiresChange = $current.Replace("`r`n", "`n").Replace("`r", "`n") -ne $desired.Replace("`r`n", "`n")
        Write-Log "Hosts evaluation desired_state=$(if ($Block) { 'blocked' } else { 'allowed' }) requires_change=$requiresChange"
        if (-not $requiresChange) {
            Write-Log "Hosts unchanged dns_flush=not_required"
            return @{ Success = $true; Changed = $false; DnsFlushed = $false }
        }
        if (-not (Test-Path -LiteralPath $HOSTS_BACKUP)) { [System.IO.File]::Copy($HOSTS_FILE, $HOSTS_BACKUP, $false) }
        $directory = Split-Path $HOSTS_FILE
        $tempPath = Join-Path $directory ("hosts.youtube-guardian.{0}.tmp" -f [guid]::NewGuid().ToString("N"))
        [System.IO.File]::WriteAllText($tempPath, $desired, $encoding)
        $validated = [System.IO.File]::ReadAllText($tempPath, $encoding)
        if ($validated -ne $desired -or $validated.Length -eq 0) { throw "Temporary hosts validation failed" }
        if ($Block -and (($validated.Split(@($MARKER_START), [System.StringSplitOptions]::None).Count - 1) -ne 1)) { throw "Managed block validation failed" }
        $replaceBackup = Join-Path $directory ("hosts.youtube-guardian.replace.{0}.bak" -f [guid]::NewGuid().ToString("N"))
        try {
            [System.IO.File]::Replace($tempPath, $HOSTS_FILE, $replaceBackup, $true)
            $tempPath = $null
            Remove-Item -LiteralPath $replaceBackup -Force -ErrorAction SilentlyContinue
        } catch {
            if (Test-Path -LiteralPath $replaceBackup) { Copy-Item -LiteralPath $replaceBackup -Destination $HOSTS_FILE -Force -ErrorAction SilentlyContinue }
            throw
        }
        $dnsFlushed = $false
        try { & "$env:SystemRoot\System32\ipconfig.exe" /flushdns | Out-Null; $dnsFlushed = ($LASTEXITCODE -eq 0) } catch { }
        Write-Log "Hosts updated desired_state=$(if ($Block) { 'blocked' } else { 'allowed' }) dns_flush_succeeded=$dnsFlushed"
        return @{ Success = $dnsFlushed; Changed = $true; DnsFlushed = $dnsFlushed }
    } catch {
        Write-Log "Hosts update failed exception_type=$($_.Exception.GetType().FullName) message=$($_.Exception.Message)" "ERROR"
        return @{ Success = $false; Changed = $false; DnsFlushed = $false }
    } finally {
        if ($tempPath -and (Test-Path -LiteralPath $tempPath)) { Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue }
    }
}

function Invoke-PollCycle {
    $fetch = Fetch-ControlState
    $state = $fetch.State
    $usedCache = $false
    $failClosed = $false
    if ($fetch.Success) {
        [void](Save-State -State $state)
    } else {
        $state = Load-State
        if (Test-ControlState -State $state) { $usedCache = $true } else { $state = $null; $failClosed = $true }
    }
    $allowed = Resolve-Allowed -State $state
    $shouldBlock = -not $allowed
    Write-Log "Effective state cached_state_used=$usedCache fail_closed=$failClosed effectively_allowed=$allowed should_block=$shouldBlock"
    $hostsResult = Set-YouTubeBlocked -Block $shouldBlock
    return @{ Success = ($fetch.Success -and $hostsResult.Success); RemoteSuccess = $fetch.Success; HostsSuccess = $hostsResult.Success }
}

if (-not (Test-Configuration)) { exit 2 }
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$isSystem = $identity.Name -eq "NT AUTHORITY\SYSTEM"
$mutex = New-Object System.Threading.Mutex($false, $MUTEX_NAME)
$mutexAcquired = $false
try { $mutexAcquired = $mutex.WaitOne(0, $false) } catch { }
Write-Log "Startup version=$AGENT_VERSION identity=$($identity.Name) is_system=$isSystem pid=$PID script_path=$PSCommandPath powershell_version=$($PSVersionTable.PSVersion) dashboard_host=$((New-Object System.Uri($DASHBOARD_URL)).Host) device_id=$DEVICE_ID poll_interval_sec=$POLL_INTERVAL_SEC hosts_path=$HOSTS_FILE state_path=$STATE_FILE log_path=$LOG_FILE mutex_acquired=$mutexAcquired once=$([bool]$Once)"
if (-not $mutexAcquired) { Write-FatalAndExit "Another YouTube Guardian instance already owns mutex=$MUTEX_NAME" 3 }

try {
    if ($Once) {
        try {
            $result = Invoke-PollCycle
            if ($result.Success) { exit 0 }
            exit 4
        } catch {
            Write-Log "Diagnostic cycle failed exception_type=$($_.Exception.GetType().FullName) message=$($_.Exception.Message)" "ERROR"
            exit 5
        }
    }
    while ($true) {
        try { [void](Invoke-PollCycle) }
        catch {
            Write-Log "Unexpected poll-cycle exception exception_type=$($_.Exception.GetType().FullName) message=$($_.Exception.Message); continuing after 5 seconds" "ERROR"
            Start-Sleep -Seconds 5
        }
        Start-Sleep -Seconds $POLL_INTERVAL_SEC
    }
} finally {
    if ($mutexAcquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
