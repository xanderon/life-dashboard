$repo = Split-Path $PSScriptRoot -Parent
$envContent = Get-Content "$repo\.env"
$envContent | ForEach-Object {
  if ($_ -match '^(.*?)=(.*)$') {
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
  }
}
& (Get-Command node).Path "$repo\scripts\device_heartbeat.mjs"
