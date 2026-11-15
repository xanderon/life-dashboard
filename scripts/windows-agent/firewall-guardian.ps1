# Life Dashboard YouTube Guardian firewall support.
# Windows PowerShell 5.1 compatible. This file must remain ASCII-only.

$GUARDIAN_FIREWALL_KEYWORD_ID = "{4d36f2d8-9ec5-4ce6-a8b7-70e5267f1b26}"
$GUARDIAN_FIREWALL_KEYWORD = "*.googlevideo.com"
$GUARDIAN_FIREWALL_RULE_NAME = "LifeDashboard-BlockYouTubeStreams"
$GUARDIAN_FIREWALL_RULE_DISPLAY_NAME = "LifeDashboard - Block YouTube Streams"

function Test-GuardianDynamicFqdnSupport {
    return ($null -ne (Get-Command Get-NetFirewallDynamicKeywordAddress -ErrorAction SilentlyContinue) -and
        $null -ne (Get-Command New-NetFirewallDynamicKeywordAddress -ErrorAction SilentlyContinue) -and
        $null -ne (Get-Command Remove-NetFirewallDynamicKeywordAddress -ErrorAction SilentlyContinue) -and
        $null -ne (Get-Command Get-NetFirewallRule -ErrorAction SilentlyContinue) -and
        $null -ne (Get-Command New-NetFirewallRule -ErrorAction SilentlyContinue) -and
        $null -ne (Get-Command Set-NetFirewallRule -ErrorAction SilentlyContinue))
}

function Get-GuardianFirewallState {
    $supported = Test-GuardianDynamicFqdnSupport
    $keywordObject = $null
    $rules = @()
    if ($supported) {
        try { $keywordObject = Get-NetFirewallDynamicKeywordAddress -Id $GUARDIAN_FIREWALL_KEYWORD_ID -ErrorAction SilentlyContinue }
        catch { $keywordObject = $null }
        try {
            $rules = @(Get-NetFirewallRule -DisplayName $GUARDIAN_FIREWALL_RULE_DISPLAY_NAME -ErrorAction SilentlyContinue)
            $namedRule = Get-NetFirewallRule -Name $GUARDIAN_FIREWALL_RULE_NAME -ErrorAction SilentlyContinue
            if ($null -ne $namedRule -and @($rules | Where-Object { $_.Name -eq $namedRule.Name }).Count -eq 0) { $rules += $namedRule }
        }
        catch { $rules = @() }
    }
    $canonicalRule = @($rules | Where-Object { $_.Name -eq $GUARDIAN_FIREWALL_RULE_NAME } | Select-Object -First 1)
    if ($canonicalRule.Count -eq 0) { $canonicalRule = $null } else { $canonicalRule = $canonicalRule[0] }
    return [pscustomobject]@{
        Supported = $supported
        KeywordObject = $keywordObject
        KeywordExists = ($null -ne $keywordObject)
        KeywordId = $GUARDIAN_FIREWALL_KEYWORD_ID
        Keyword = $GUARDIAN_FIREWALL_KEYWORD
        Rule = $canonicalRule
        RuleExists = ($null -ne $canonicalRule)
        RuleCount = $rules.Count
        RuleEnabled = $(if ($null -ne $canonicalRule) { [string]$canonicalRule.Enabled -eq "True" } else { $false })
    }
}

function Repair-GuardianFirewallObjects {
    param([scriptblock]$Log = { param($Message, $Level) Write-Host "[$Level] $Message" })
    if (-not (Test-GuardianDynamicFqdnSupport)) { throw "Windows Firewall dynamic FQDN cmdlets are unavailable" }

    $keywordObject = Get-NetFirewallDynamicKeywordAddress -Id $GUARDIAN_FIREWALL_KEYWORD_ID -ErrorAction SilentlyContinue
    $keywordValid = ($null -ne $keywordObject -and [string]$keywordObject.Keyword -eq $GUARDIAN_FIREWALL_KEYWORD -and [bool]$keywordObject.AutoResolve)
    if (-not $keywordValid) {
        if ($null -ne $keywordObject) {
            & $Log "Removing malformed Guardian dynamic keyword id=$GUARDIAN_FIREWALL_KEYWORD_ID keyword=$($keywordObject.Keyword) autoresolve=$($keywordObject.AutoResolve)" "WARN"
            Remove-NetFirewallDynamicKeywordAddress -Id $GUARDIAN_FIREWALL_KEYWORD_ID -Confirm:$false -ErrorAction Stop
        }
        New-NetFirewallDynamicKeywordAddress -Id $GUARDIAN_FIREWALL_KEYWORD_ID -Keyword $GUARDIAN_FIREWALL_KEYWORD -AutoResolve $true -ErrorAction Stop | Out-Null
        & $Log "Created Guardian dynamic keyword id=$GUARDIAN_FIREWALL_KEYWORD_ID keyword=$GUARDIAN_FIREWALL_KEYWORD" "INFO"
    } else {
        & $Log "Guardian dynamic keyword is valid id=$GUARDIAN_FIREWALL_KEYWORD_ID keyword=$GUARDIAN_FIREWALL_KEYWORD" "INFO"
    }

    $displayRules = @(Get-NetFirewallRule -DisplayName $GUARDIAN_FIREWALL_RULE_DISPLAY_NAME -ErrorAction SilentlyContinue)
    $namedRule = Get-NetFirewallRule -Name $GUARDIAN_FIREWALL_RULE_NAME -ErrorAction SilentlyContinue
    if ($null -ne $namedRule -and @($displayRules | Where-Object { $_.Name -eq $namedRule.Name }).Count -eq 0) { $displayRules += $namedRule }
    $canonicalRules = @($displayRules | Where-Object { $_.Name -eq $GUARDIAN_FIREWALL_RULE_NAME })
    $canonicalRule = $canonicalRules | Select-Object -First 1
    $preserveEnabled = $false
    if ($null -ne $canonicalRule) { $preserveEnabled = ([string]$canonicalRule.Enabled -eq "True") }
    foreach ($duplicate in $displayRules) {
        if ($duplicate.Name -ne $GUARDIAN_FIREWALL_RULE_NAME -or $duplicate -ne $canonicalRule) {
            & $Log "Removing duplicate Guardian firewall rule name=$($duplicate.Name)" "WARN"
            Remove-NetFirewallRule -Name $duplicate.Name -ErrorAction Stop
        }
    }

    $ruleValid = ($null -ne $canonicalRule -and
        [string]$canonicalRule.DisplayName -eq $GUARDIAN_FIREWALL_RULE_DISPLAY_NAME -and
        [string]$canonicalRule.Direction -eq "Outbound" -and
        [string]$canonicalRule.Action -eq "Block" -and
        [string]$canonicalRule.Profile -eq "Any" -and
        @($canonicalRule.RemoteDynamicKeywordAddresses) -contains $GUARDIAN_FIREWALL_KEYWORD_ID)
    if (-not $ruleValid) {
        if ($null -ne $canonicalRule) {
            & $Log "Replacing malformed Guardian firewall rule name=$GUARDIAN_FIREWALL_RULE_NAME" "WARN"
            Remove-NetFirewallRule -Name $GUARDIAN_FIREWALL_RULE_NAME -ErrorAction Stop
        }
        New-NetFirewallRule -Name $GUARDIAN_FIREWALL_RULE_NAME `
            -DisplayName $GUARDIAN_FIREWALL_RULE_DISPLAY_NAME `
            -Description "Managed by Life Dashboard YouTube Guardian. Blocks YouTube stream CDN FQDNs." `
            -Direction Outbound `
            -Action Block `
            -Enabled $(if ($preserveEnabled) { "True" } else { "False" }) `
            -Profile Any `
            -RemoteDynamicKeywordAddresses $GUARDIAN_FIREWALL_KEYWORD_ID `
            -ErrorAction Stop | Out-Null
        & $Log "Created Guardian firewall rule name=$GUARDIAN_FIREWALL_RULE_NAME enabled=$preserveEnabled" "INFO"
    } else {
        & $Log "Guardian firewall rule is valid name=$GUARDIAN_FIREWALL_RULE_NAME enabled=$preserveEnabled" "INFO"
    }
    return Get-GuardianFirewallState
}

function Set-GuardianFirewallBlocked {
    param([bool]$Block, [scriptblock]$Log = { param($Message, $Level) Write-Host "[$Level] $Message" })
    try {
        $state = Get-GuardianFirewallState
        & $Log "Firewall apply supported=$($state.Supported) keyword_id=$($state.KeywordId) keyword_exists=$($state.KeywordExists) rule_exists=$($state.RuleExists) desired_enabled=$Block actual_enabled_before=$($state.RuleEnabled)" "INFO"
        if (-not $state.Supported) { throw "Windows Firewall dynamic FQDN support is unavailable" }
        if (-not $state.KeywordExists) { throw "Guardian dynamic keyword is missing; rerun install-task.ps1" }
        if (-not $state.RuleExists -or $state.RuleCount -ne 1) { throw "Guardian firewall rule is missing or duplicated; rerun install-task.ps1" }
        if ([string]$state.KeywordObject.Keyword -ne $GUARDIAN_FIREWALL_KEYWORD -or -not [bool]$state.KeywordObject.AutoResolve) {
            throw "Guardian dynamic keyword is malformed; rerun install-task.ps1"
        }
        if ([string]$state.Rule.DisplayName -ne $GUARDIAN_FIREWALL_RULE_DISPLAY_NAME -or
            [string]$state.Rule.Direction -ne "Outbound" -or
            [string]$state.Rule.Action -ne "Block" -or
            -not (@($state.Rule.RemoteDynamicKeywordAddresses) -contains $GUARDIAN_FIREWALL_KEYWORD_ID)) {
            throw "Guardian firewall rule is malformed; rerun install-task.ps1"
        }
        if ($state.RuleEnabled -ne $Block) {
            Set-NetFirewallRule -Name $GUARDIAN_FIREWALL_RULE_NAME -Enabled $(if ($Block) { "True" } else { "False" }) -ErrorAction Stop
            $changed = $true
        } else { $changed = $false }
        $after = Get-GuardianFirewallState
        & $Log "Firewall result desired_enabled=$Block actual_enabled_after=$($after.RuleEnabled) change_required=$changed" "INFO"
        if ($after.RuleEnabled -ne $Block) { throw "Firewall rule state did not match the requested state after apply" }
        return [pscustomobject]@{ Success = $true; Changed = $changed; Enabled = $after.RuleEnabled }
    } catch {
        & $Log "Firewall apply failed desired_enabled=$Block exception_type=$($_.Exception.GetType().FullName) message=$($_.Exception.Message)" "ERROR"
        return [pscustomobject]@{ Success = $false; Changed = $false; Enabled = $null }
    }
}

function Get-GuardianFirewallDiagnostics {
    $lines = New-Object System.Collections.Generic.List[string]
    $state = Get-GuardianFirewallState
    $null = & {
    $lines.Add("Dynamic FQDN support available: $($state.Supported)")
    $lines.Add("Dynamic keyword ID: $GUARDIAN_FIREWALL_KEYWORD_ID")
    $lines.Add("Dynamic keyword exists: $($state.KeywordExists)")
    if ($state.KeywordExists) {
        $lines.Add("Dynamic keyword value: $($state.KeywordObject.Keyword)")
        $lines.Add("Dynamic keyword AutoResolve: $($state.KeywordObject.AutoResolve)")
        $lines.Add("Resolved addresses: $($state.KeywordObject.Addresses)")
    }
    $lines.Add("Guardian rule exists: $($state.RuleExists)")
    $lines.Add("Guardian rule count: $($state.RuleCount)")
    $lines.Add("Guardian rule enabled: $($state.RuleEnabled)")
    if ($state.RuleExists) {
        $lines.Add("Guardian rule direction/action: $($state.Rule.Direction)/$($state.Rule.Action)")
        $lines.Add("Guardian rule dynamic IDs: $($state.Rule.RemoteDynamicKeywordAddresses -join ',')")
    }
    try {
        $profiles = Get-NetFirewallProfile -ErrorAction Stop
        $lines.Add("Defender Firewall profiles: " + (($profiles | ForEach-Object { "$($_.Name)=$($_.Enabled)" }) -join "; "))
    } catch { $lines.Add("Defender Firewall profile query failed: $($_.Exception.Message)") }
    try {
        $mpStatus = Get-MpComputerStatus -ErrorAction Stop
        $lines.Add("Defender AV enabled/service/platform: $($mpStatus.AntivirusEnabled)/$($mpStatus.AMServiceEnabled)/$($mpStatus.AMProductVersion)")
        $platformVersion = [version]([string]$mpStatus.AMProductVersion)
        $minimumVersion = [version]"4.18.2209.7"
        $avPrerequisite = ([bool]$mpStatus.AntivirusEnabled -and [bool]$mpStatus.AMServiceEnabled -and $platformVersion -ge $minimumVersion)
        $lines.Add("Defender AV FQDN prerequisite satisfied: $avPrerequisite")
    } catch { $lines.Add("Defender AV status unavailable: $($_.Exception.Message)") }
    try {
        $mpPreference = Get-MpPreference -ErrorAction Stop
        $networkValue = [int]$mpPreference.EnableNetworkProtection
        $networkMode = switch ($networkValue) { 1 { "Enabled" } 2 { "Audit" } default { "Disabled" } }
        $lines.Add("Network Protection mode: $networkMode ($($mpPreference.EnableNetworkProtection))")
        $lines.Add("Network Protection FQDN prerequisite satisfied: $($networkValue -in @(1, 2))")
    } catch { $lines.Add("Network Protection status unavailable: $($_.Exception.Message)") }
    try {
        $autoDoh = (Get-ItemProperty -LiteralPath "HKLM:\SYSTEM\CurrentControlSet\Services\Dnscache\Parameters" -Name "EnableAutoDoh" -ErrorAction Stop).EnableAutoDoh
        $lines.Add("Windows automatic DoH policy value: $autoDoh (nonzero may bypass FQDN inspection)")
    } catch { $lines.Add("Windows automatic DoH policy value: not configured") }
    try {
        $dohCommand = Get-Command Get-DnsClientDohServerAddress -ErrorAction SilentlyContinue
        if ($null -ne $dohCommand) {
            $dohServers = @(Get-DnsClientDohServerAddress -ErrorAction Stop)
            $lines.Add("Windows DoH server registrations: $($dohServers.Count)")
        } else { $lines.Add("Windows DoH cmdlet unavailable on this OS") }
    } catch { $lines.Add("Windows DoH query failed: $($_.Exception.Message)") }
    foreach ($browser in @(
        @{ Name = "Chrome"; Path = "HKLM:\SOFTWARE\Policies\Google\Chrome" },
        @{ Name = "Edge"; Path = "HKLM:\SOFTWARE\Policies\Microsoft\Edge" }
    )) {
        try {
            $mode = (Get-ItemProperty -LiteralPath $browser.Path -Name "DnsOverHttpsMode" -ErrorAction Stop).DnsOverHttpsMode
            $lines.Add("$($browser.Name) managed Secure DNS mode: $mode")
        } catch { $lines.Add("$($browser.Name) managed Secure DNS mode: not configured") }
    }
    try {
        $vpnAdapters = @(Get-NetAdapter -ErrorAction Stop | Where-Object { $_.Status -eq "Up" -and ($_.Name -match 'VPN|Tunnel|TAP|WireGuard|Tailscale|OpenVPN' -or $_.InterfaceDescription -match 'VPN|Tunnel|TAP|WireGuard|Tailscale|OpenVPN') })
        $lines.Add("Potential active VPN/tunnel adapters: " + $(if ($vpnAdapters.Count) { ($vpnAdapters.Name -join ',') } else { "none detected" }))
    } catch { $lines.Add("VPN adapter query failed: $($_.Exception.Message)") }
    try {
        $proxy = (& "$env:SystemRoot\System32\netsh.exe" winhttp show proxy 2>&1 | Out-String).Trim() -replace '[\r\n]+', ' | '
        $lines.Add("WinHTTP proxy: $proxy")
    } catch { $lines.Add("WinHTTP proxy query failed: $($_.Exception.Message)") }
    }
    return $lines.ToArray()
}
