# Run ONLY against a local test database. Creates a fresh test user/account.
$ErrorActionPreference = 'Stop'
$BaseUrl = 'http://localhost:4000/api/v1'
$script:headers = $null
$script:passed = 0
$script:failed = 0

function Check([string]$name, [bool]$ok, [string]$details = '') {
    if ($ok) { $script:passed++; Write-Host "[PASS] $name" -ForegroundColor Green }
    else { $script:failed++; Write-Host "[FAIL] $name $details" -ForegroundColor Red }
}
function Api([string]$method, [string]$path, $body = $null) {
    $params = @{ Method = $method; Uri = "$BaseUrl$path"; ErrorAction = 'Stop' }
    if ($script:headers) { $params.Headers = $script:headers }
    if ($null -ne $body) {
        $params.ContentType = 'application/json'
        $params.Body = ($body | ConvertTo-Json -Depth 10)
    }
    Invoke-RestMethod @params
}
function Money($value) {
    return [decimal]::Parse([string]$value, [System.Globalization.CultureInfo]::InvariantCulture)
}
function ApproximatelyEqual($actual, $expected, [decimal]$tolerance = 0.01) {
    return ([decimal]::Abs((Money $actual) - (Money $expected)) -le $tolerance)
}
function Items([string]$path) {
    $response = Api 'GET' $path
    if ($null -eq $response.data -or $null -eq $response.data.items) {
        throw "Unexpected list response from $path"
    }
    return ,@($response.data.items)
}
function Snapshot {
    $orders = Items '/orders'
    $positions = Items '/orders/positions'
    $trades = Items '/orders/trades'
    $balance = (Api 'GET' '/accounts/balance').data
    return [pscustomobject]@{
        orders = @($orders).Count
        positions = @($positions).Count
        trades = @($trades).Count
        balance = Money $balance.balance
        equity = Money $balance.equity
        usedMargin = Money $balance.usedMargin
        unrealizedPnl = Money $balance.unrealizedPnl
    }
}
function Run-CloseCase([string]$side) {
    $positionSide = if ($side -eq 'BUY') { 'LONG' } else { 'SHORT' }
    $closeSide = if ($side -eq 'BUY') { 'SELL' } else { 'BUY' }
    $quantity = [decimal]0.01
    $beforeOpen = Snapshot
    $open = Api 'POST' '/orders' @{symbol='XAUUSD';side=$side;orderType='MARKET';quantity='0.01'}
    Check "$positionSide open success" ($open.success -eq $true -and $open.data.order.status -eq 'FILLED')
    if (-not $open.data.position.id) { throw "$positionSide opening response missing position ID" }
    $positionId = [string]$open.data.position.id
    $entry = Money $open.data.position.averageEntryPrice
    $afterOpen = Snapshot
    Check "$positionSide opening does not change balance" (ApproximatelyEqual $afterOpen.balance $beforeOpen.balance) "before=$($beforeOpen.balance) after=$($afterOpen.balance)"
    Check "$positionSide opening creates order" ($afterOpen.orders -eq $beforeOpen.orders + 1)
    Check "$positionSide opening creates trade" ($afterOpen.trades -eq $beforeOpen.trades + 1)
    Check "$positionSide opening reserves margin" ($afterOpen.usedMargin -gt $beforeOpen.usedMargin) "before=$($beforeOpen.usedMargin) after=$($afterOpen.usedMargin)"
    $close = Api 'POST' "/orders/positions/$positionId/close"
    Check "$positionSide close success" ($close.success -eq $true -and $close.data.order.status -eq 'FILLED')
    Check "$positionSide close uses opposite order side" ($close.data.order.side -eq $closeSide)
    Check "$positionSide close preserves position ID" ($close.data.position.id -eq $positionId)
    Check "$positionSide position CLOSED" ($close.data.position.status -eq 'CLOSED' -and (Money $close.data.position.quantity) -eq 0)
    Check "$positionSide closed position unrealized PnL zero" ((Money $close.data.position.unrealizedPnl) -eq 0)
    $exit = Money $close.data.order.executedPrice
    $expectedPnl = if ($positionSide -eq 'LONG') { ($exit - $entry) * $quantity * 100 } else { ($entry - $exit) * $quantity * 100 }
    $expectedPnl = [decimal]::Round($expectedPnl, 2, [MidpointRounding]::AwayFromZero)
    Check "$positionSide realized PnL formula" (ApproximatelyEqual $close.data.realizedPnl $expectedPnl) "expected=$expectedPnl actual=$($close.data.realizedPnl)"
    Check "$positionSide closing order executed at position close price" (ApproximatelyEqual $close.data.order.executedPrice $close.data.position.currentPrice)
    $afterClose = Snapshot
    Check "$positionSide closing creates one order" ($afterClose.orders -eq $afterOpen.orders + 1)
    Check "$positionSide closing creates one trade" ($afterClose.trades -eq $afterOpen.trades + 1)
    Check "$positionSide closing does not create position" ($afterClose.positions -eq $afterOpen.positions)
    Check "$positionSide balance includes realized PnL" (ApproximatelyEqual $afterClose.balance ($afterOpen.balance + $expectedPnl)) "expected=$($afterOpen.balance + $expectedPnl) actual=$($afterClose.balance)"
    Check "$positionSide margin fully released" (ApproximatelyEqual $afterClose.usedMargin $beforeOpen.usedMargin) "expected=$($beforeOpen.usedMargin) actual=$($afterClose.usedMargin)"
    Check "$positionSide equity equals balance without open positions" (ApproximatelyEqual $afterClose.equity $afterClose.balance)
    Check "$positionSide unrealized PnL zero after close" (ApproximatelyEqual $afterClose.unrealizedPnl 0)
    $position = (Api 'GET' "/orders/positions/$positionId").data
    Check "$positionSide GET position CLOSED" ($position.status -eq 'CLOSED' -and (Money $position.quantity) -eq 0 -and -not [string]::IsNullOrWhiteSpace($position.closedAt))
    $trades = Items '/orders/trades'
    $closingTrades = @($trades | Where-Object { $_.orderId -eq $close.data.order.id })
    Check "$positionSide closing trade exists exactly once" ($closingTrades.Count -eq 1)
    if ($closingTrades.Count -eq 1) {
        $trade = $closingTrades[0]
        Check "$positionSide closing trade details" ($trade.positionId -eq $positionId -and $trade.side -eq $closeSide -and (ApproximatelyEqual $trade.exitPrice $exit) -and (ApproximatelyEqual $trade.realizedPnl $expectedPnl) -and -not [string]::IsNullOrWhiteSpace($trade.closedAt))
    }
    # A second close must be rejected and leave all state unchanged.
    $duplicateRejected = $false
    try { $null = Api 'POST' "/orders/positions/$positionId/close" }
    catch {
        $status = [int]$_.Exception.Response.StatusCode
        $raw = $_.ErrorDetails.Message
        if ($raw) {
            try { $errorBody = $raw | ConvertFrom-Json; $duplicateRejected = ($status -eq 404 -and $errorBody.error.code -eq 'POSITION_NOT_FOUND') } catch {}
        }
    }
    Check "$positionSide duplicate close rejected" $duplicateRejected
    $afterDuplicate = Snapshot
    Check "$positionSide duplicate close leaves orders unchanged" ($afterDuplicate.orders -eq $afterClose.orders)
    Check "$positionSide duplicate close leaves trades unchanged" ($afterDuplicate.trades -eq $afterClose.trades)
    Check "$positionSide duplicate close leaves balance unchanged" (ApproximatelyEqual $afterDuplicate.balance $afterClose.balance)
}
try {
    $null = Api 'GET' '/health'
    $stamp = Get-Date -Format 'yyyyMMddHHmmssfff'
    $email = "close-regression-$stamp@example.com"
    $password = 'Test@123456'
    $register = Api 'POST' '/auth/register' @{email=$email;password=$password;fullName='Close Regression'}
    Check 'Register success' ($register.success -eq $true)
    $login = Api 'POST' '/auth/login' @{email=$email;password=$password}
    if ([string]::IsNullOrWhiteSpace($login.data.accessToken)) { throw 'Login did not return accessToken' }
    $script:headers = @{Authorization="Bearer $($login.data.accessToken)"}
    Check 'Login token' $true
    $account = Api 'POST' '/accounts/demo'
    Check 'Demo account created' ($account.success -eq $true -and $account.data.status -eq 'ACTIVE')
    Run-CloseCase 'BUY'
    Run-CloseCase 'SELL'
}
catch {
    $script:failed++
    Write-Host "[FATAL] $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
}
Write-Host "RESULT: passed=$script:passed failed=$script:failed"
if ($script:failed -gt 0) { exit 1 }
exit 0
