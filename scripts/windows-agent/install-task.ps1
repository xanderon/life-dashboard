#Requires -Version 5.1
#Requires -RunAsAdministrator

[CmdletBinding()]
param(
    [string]$InstallDirectory = "C:\ProgramData\LifeDashboard\agent"
)

$ErrorActionPreference = "Stop"
$TaskName = "YouTubeGuardian"
$SourceScript = Join-Path $PSScriptRoot "youtube-guardian.ps1"
$InstalledScript = Join-Path $InstallDirectory "youtube-guardian.ps1"
$LogFile = "C:\ProgramData\LifeDashboard\guardian.log"

function Fail-Install {
    param([string]$Message)
    Write-Error "INSTALL FAILED: $Message"
    exit 1
}

try {
    if (-not (Test-Path -LiteralPath $SourceScript -PathType Leaf)) { Fail-Install "Cannot find $SourceScript" }
    $scriptText = [System.IO.File]::ReadAllText($SourceScript)
    if ($scriptText -match 'YOUR_DASHBOARD_HOST|YOUR_DEVICE_UUID|YOUR_RANDOM_DEVICE_TOKEN') {
        Fail-Install "Configure DASHBOARD_URL, DEVICE_ID, and DEVICE_TOKEN before installing"
    }
    if ($scriptText.ToCharArray() | Where-Object { [int]$_ -gt 127 } | Select-Object -First 1) {
        Fail-Install "youtube-guardian.ps1 contains non-ASCII characters"
    }
    if (-not (Test-Path -LiteralPath $InstallDirectory)) {
        New-Item -ItemType Directory -Path $InstallDirectory -Force | Out-Null
    }
    $sourceFull = [System.IO.Path]::GetFullPath($SourceScript)
    $installedFull = [System.IO.Path]::GetFullPath($InstalledScript)
    if (-not $sourceFull.Equals($installedFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        Copy-Item -LiteralPath $SourceScript -Destination $InstalledScript -Force
    }
    if (-not (Test-Path -LiteralPath $InstalledScript -PathType Leaf)) { Fail-Install "Installed script was not created at $InstalledScript" }

    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        $deadline = (Get-Date).AddSeconds(10)
        while ((Get-ScheduledTask -TaskName $TaskName).State -eq "Running" -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }

    $arguments = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $InstalledScript
    $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments -WorkingDirectory $InstallDirectory
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -RestartCount 999 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -StartWhenAvailable `
        -RunOnlyIfNetworkAvailable:$false `
        -MultipleInstances IgnoreNew
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Life Dashboard YouTube Guardian continuous agent" -Force | Out-Null
    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 5

    $task = Get-ScheduledTask -TaskName $TaskName
    $info = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Host "INSTALL SUCCEEDED"
    Write-Host "Task name:       $TaskName"
    Write-Host "Task state:      $($task.State)"
    Write-Host "Last task result: $($info.LastTaskResult)"
    Write-Host "Last run time:   $($info.LastRunTime)"
    Write-Host "Next run time:   $($info.NextRunTime)"
    Write-Host "Action execute:  $($task.Actions[0].Execute)"
    Write-Host "Action arguments: $($task.Actions[0].Arguments)"
    Write-Host "Working dir:     $($task.Actions[0].WorkingDirectory)"
    Write-Host "Principal:       $($task.Principal.UserId)"
    Write-Host "Run level:       $($task.Principal.RunLevel)"
    Write-Host "Installed script: $InstalledScript"
    Write-Host "Recent log lines:"
    if (Test-Path -LiteralPath $LogFile) { Get-Content -LiteralPath $LogFile -Tail 20 } else { Write-Host "No log file exists yet: $LogFile" }
    if ($task.State -ne "Running") { Fail-Install "Task did not remain running; inspect LastTaskResult and the log above" }
} catch {
    Fail-Install "$($_.Exception.GetType().FullName): $($_.Exception.Message)"
}
