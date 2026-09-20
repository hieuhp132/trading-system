function Get-AccountSnapshot {
    $orders = Invoke-RestMethod `
        -Method GET `
        -Uri "$BaseUrl/orders" `
        -Headers $headers

    $positions = Invoke-RestMethod `
        -Method GET `
        -Uri "$BaseUrl/orders/positions" `
        -Headers $headers

    $trades = Invoke-RestMethod `
        -Method GET `
        -Uri "$BaseUrl/orders/trades" `
        -Headers $headers

    $account = Invoke-RestMethod `
        -Method GET `
        -Uri "$BaseUrl/accounts" `
        -Headers $headers

    function Get-ItemCount($response) {
        if ($null -ne $response.data.items) {
            return @($response.data.items).Count
        }

        if ($response.data -is [array]) {
            return $response.data.Count
        }

        throw "Unknown response structure."
    }

    return [pscustomobject]@{
        Orders    = Get-ItemCount $orders
        Positions = Get-ItemCount $positions
        Trades    = Get-ItemCount $trades
        Balance   = [decimal]::Parse(
            [string]$account.data.balance,
            [System.Globalization.CultureInfo]::InvariantCulture
        )
    }
}

$before = Get-AccountSnapshot

$rejected = $false

try {
    $null = Invoke-RestMethod `
        -Method POST `
        -Uri "$BaseUrl/orders" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $body
}
catch {
    $status = [int]$_.Exception.Response.StatusCode
    $raw = $_.ErrorDetails.Message

    if ($raw) {
        $response = $raw | ConvertFrom-Json

        $rejected = (
            $status -eq 400 -and
            $response.error.code -eq "DEMO_ACCOUNT_NOT_ACTIVE"
        )
    }
}

$after = Get-AccountSnapshot

$checks = [ordered]@{
    "Suspended order rejected" = $rejected
    "Orders unchanged"        = $before.Orders -eq $after.Orders
    "Positions unchanged"     = $before.Positions -eq $after.Positions
    "Trades unchanged"        = $before.Trades -eq $after.Trades
    "Balance unchanged"       = $before.Balance -eq $after.Balance
}

$failed = 0

foreach ($check in $checks.GetEnumerator()) {
    if ($check.Value) {
        Write-Host "[PASS] $($check.Key)" -ForegroundColor Green
    }
    else {
        $failed++
        Write-Host "[FAIL] $($check.Key)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "BEFORE:"
$before | Format-List

Write-Host "AFTER:"
$after | Format-List

Write-Host "RESULT: passed=$($checks.Count - $failed) failed=$failed"
