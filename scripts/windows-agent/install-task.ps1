# ==============================================================================
#  install-task.ps1
#  Registers youtube-guardian.ps1 as a Windows Scheduled Task.
#
#  Run this script ONCE as Administrator on your son's PC.
#  After installation the task:
#    - Starts automatically at system boot
#    - Runs as SYSTEM (required to edit the hosts file)
#    - Restarts automatically if it crashes
#    - Runs silently with no window
# ==============================================================================

#Requires -RunAsAdministrator

$TaskName    = "YouTubeGuardian"
$ScriptPath  = "$PSScriptRoot\youtube-guardian.ps1"
$Description = "Life Dashboard - remote YouTube parental control agent"

# Verify the guardian script exists
if (-not (Test-Path $ScriptPath)) {
    Write-Error "Cannot find youtube-guardian.ps1 at: $ScriptPath"
    exit 1
}

$scriptText = [System.IO.File]::ReadAllText($ScriptPath)
if ($scriptText -match 'YOUR_DASHBOARD_HOST|YOUR_DEVICE_UUID|YOUR_RANDOM_DEVICE_TOKEN') {
    Write-Error "Configure DASHBOARD_URL, DEVICE_ID, and DEVICE_TOKEN in youtube-guardian.ps1 before installing."
    exit 1
}
if ($scriptText.ToCharArray() | Where-Object { [int]$_ -gt 127 } | Select-Object -First 1) {
    Write-Error "youtube-guardian.ps1 contains non-ASCII characters. Save it as ASCII before installing."
    exit 1
}

Write-Host "Installing Scheduled Task: $TaskName"

# Remove any existing task with this name
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Build the action: run PowerShell, hidden, no profile, with the guardian script
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""

# Trigger: start at boot
$trigger = New-ScheduledTaskTrigger -AtStartup

# Settings: restart on failure, run whether user is logged on or not
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 99 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable:$false `
    -MultipleInstances IgnoreNew

# Principal: SYSTEM account (needed to write hosts file)
$principal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest

# Register the task
Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description $Description `
    -Force | Out-Null

Write-Host ""
Write-Host "OK - Task '$TaskName' registered successfully."
Write-Host ""
Write-Host "You can manage it via Task Scheduler or with:"
Write-Host "  Start-ScheduledTask   -TaskName '$TaskName'"
Write-Host "  Stop-ScheduledTask    -TaskName '$TaskName'"
Write-Host "  Get-ScheduledTaskInfo -TaskName '$TaskName'"
Write-Host ""
Write-Host "Starting the task now..."
Start-ScheduledTask -TaskName $TaskName
Write-Host "OK - Task is running. Logs: C:\ProgramData\LifeDashboard\guardian.log"
