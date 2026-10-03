$ErrorActionPreference = "Stop"

$BaseUrl = "http://localhost:4000/api/v1"

$timestamp = Get-Date -Format "yyyyMMddHHmmssfff"
$UserAEmail = "portfolio-test-a-$timestamp@example.com"
$UserBEmail = "portfolio-test-b-$timestamp@example.com"
$Password = "Test@123456"

$Passed = 0
$Failed = 0

function Write-Test {
    param([string]$Message)

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor DarkGray
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor DarkGray
}

function Assert-Equal {
    param(
        [string]$Name,
        $Actual,
        $Expected
    )

    if ("$Actual" -eq "$Expected") {
        Write-Host "[PASS] $Name = $Actual" -ForegroundColor Green
        $script:Passed++
    }
    else {
        Write-Host "[FAIL] $Name" -ForegroundColor Red
        Write-Host "       Expected: $Expected" -ForegroundColor Yellow
        Write-Host "       Actual:   $Actual" -ForegroundColor Yellow
        $script:Failed++
    }
}

function Assert-NumericEqual {
    param(
        [string]$Name,
        $Actual,
        $Expected,
        [double]$Tolerance = 0.000001
    )

    $actualNumber = [double]$Actual
    $expectedNumber = [double]$Expected
    $difference = [Math]::Abs($actualNumber - $expectedNumber)

    if ($difference -le $Tolerance) {
        Write-Host "[PASS] $Name = $Actual" -ForegroundColor Green
        $script:Passed++
    }
    else {
        Write-Host "[FAIL] $Name" -ForegroundColor Red
        Write-Host "       Expected: $Expected" -ForegroundColor Yellow
        Write-Host "       Actual:   $Actual" -ForegroundColor Yellow
        Write-Host "       Difference: $difference" -ForegroundColor Yellow
        $script:Failed++
    }
}

function Assert-True {
    param(
        [string]$Name,
        [bool]$Condition
    )

    if ($Condition) {
        Write-Host "[PASS] $Name" -ForegroundColor Green
        $script:Passed++
    }
    else {
        Write-Host "[FAIL] $Name" -ForegroundColor Red
        $script:Failed++
    }
}

function Assert-StatusCode {
    param(
        [string]$Name,
        [int]$Actual,
        [int]$Expected
    )

    if ($Actual -eq $Expected) {
        Write-Host "[PASS] $Name = HTTP $Actual" -ForegroundColor Green
        $script:Passed++
    }
    else {
        Write-Host "[FAIL] $Name" -ForegroundColor Red
        Write-Host "       Expected HTTP: $Expected" -ForegroundColor Yellow
        Write-Host "       Actual HTTP:   $Actual" -ForegroundColor Yellow
        $script:Failed++
    }
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Url,
        $Body = $null,
        [hashtable]$Headers = @{}
    )

    try {
        $params = @{
            Method  = $Method
            Uri     = $Url
            Headers = $Headers
        }

        if ($null -ne $Body) {
            $params["ContentType"] = "application/json"
            $params["Body"] = ($Body | ConvertTo-Json -Depth 10)
        }

        return Invoke-RestMethod @params
    }
    catch {
        Write-Host ""
        Write-Host "[API ERROR]" -ForegroundColor Red
        Write-Host "Method : $Method" -ForegroundColor Red
        Write-Host "URL    : $Url" -ForegroundColor Red

        if ($_.ErrorDetails.Message) {
            Write-Host "Response:" -ForegroundColor Yellow
            Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
        }

        throw
    }
}

function Invoke-ApiExpectedError {
    param(
        [string]$Method,
        [string]$Url,
        [int]$ExpectedStatusCode,
        [hashtable]$Headers = @{}
    )

    try {
        Invoke-WebRequest `
            -Method $Method `
            -Uri $Url `
            -Headers $Headers `
            -UseBasicParsing `
            -ErrorAction Stop | Out-Null

        Write-Host "[FAIL] Expected HTTP $ExpectedStatusCode but request succeeded" -ForegroundColor Red
        $script:Failed++
        return
    }
    catch {
        $statusCode = $null

        if ($_.Exception.Response) {
            try {
                $statusCode = [int]$_.Exception.Response.StatusCode
            }
            catch {
                $statusCode = $null
            }
        }

        if ($null -eq $statusCode) {
            Write-Host "[FAIL] Could not determine HTTP status code" -ForegroundColor Red
            Write-Host "       $($_.Exception.Message)" -ForegroundColor Yellow
            $script:Failed++
            return
        }

        Assert-StatusCode `
            "Unauthorized resource access rejected" `
            $statusCode `
            $ExpectedStatusCode
    }
}

function Create-User {
    param([string]$Email)

    $body = @{
        email    = $Email
        password = $Password
        fullName = "Portfolio Test User"
    }

    return Invoke-Api `
        -Method "POST" `
        -Url "$BaseUrl/auth/register" `
        -Body $body
}

function Login-User {
    param([string]$Email)

    $body = @{
        email    = $Email
        password = $Password
    }

    return Invoke-Api `
        -Method "POST" `
        -Url "$BaseUrl/auth/login" `
        -Body $body
}

function Create-DemoAccount {
    param([hashtable]$Headers)

    return Invoke-Api `
        -Method "POST" `
        -Url "$BaseUrl/accounts/demo" `
        -Headers $Headers
}

function Create-Order {
    param(
        [hashtable]$Headers,
        [string]$Side,
        [string]$Quantity
    )

    $body = @{
        symbol    = "XAUUSD"
        side      = $Side
        quantity  = $Quantity
        orderType = "MARKET"
    }

    return Invoke-Api `
        -Method "POST" `
        -Url "$BaseUrl/orders" `
        -Headers $Headers `
        -Body $body
}

# ============================================================
# 0. CHECK API
# ============================================================

Write-Test "0. CHECK API SERVER"

try {
    Invoke-Api `
        -Method "GET" `
        -Url "$BaseUrl/health" | Out-Null

    Write-Host "[PASS] API server is reachable" -ForegroundColor Green
    $Passed++
}
catch {
    Write-Host "[FAIL] API server is not reachable" -ForegroundColor Red
    Write-Host "Make sure backend is running with: pnpm dev" -ForegroundColor Yellow
    exit 1
}

# ============================================================
# USER A
# ============================================================

Write-Test "1. REGISTER USER A"

$registerA = Create-User -Email $UserAEmail

Assert-True "User A register success" ($registerA.success -eq $true)
Assert-True "User A register returned data" ($null -ne $registerA.data)

Write-Host "User A: $UserAEmail" -ForegroundColor Gray

Write-Test "2. LOGIN USER A"

$loginA = Login-User -Email $UserAEmail

Assert-True "User A login success" ($loginA.success -eq $true)

$tokenA = $loginA.data.accessToken

Assert-True `
    "User A access token exists" `
    (-not [string]::IsNullOrWhiteSpace($tokenA))

$HeadersA = @{
    Authorization = "Bearer $tokenA"
}

# ============================================================
# DEMO ACCOUNT A
# ============================================================

Write-Test "3. CREATE DEMO ACCOUNT FOR USER A"

$demoA = Create-DemoAccount -Headers $HeadersA

Assert-True "User A demo account creation success" ($demoA.success -eq $true)

$accountA = $demoA.data
$AccountAId = $accountA.id
$AccountANumber = $accountA.accountNumber

Assert-True `
    "User A account ID exists" `
    (-not [string]::IsNullOrWhiteSpace($AccountAId))

Assert-True `
    "User A account number exists" `
    (-not [string]::IsNullOrWhiteSpace($AccountANumber))

Assert-NumericEqual "User A initial balance" $accountA.balance 100000
Assert-NumericEqual "User A initial equity" $accountA.equity 100000

Write-Host "Account A: $AccountANumber" -ForegroundColor Gray

# ============================================================
# INITIAL PORTFOLIO
# ============================================================

Write-Test "4. INITIAL ORDERS / POSITIONS / TRADES"

$ordersInitial = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders" `
    -Headers $HeadersA

Assert-True "GET orders success" ($ordersInitial.success -eq $true)
Assert-NumericEqual "Initial orders total" $ordersInitial.data.total 0
Assert-True "Initial orders items empty" ($ordersInitial.data.items.Count -eq 0)

$positionsInitial = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/positions" `
    -Headers $HeadersA

Assert-True "GET positions success" ($positionsInitial.success -eq $true)
Assert-NumericEqual "Initial positions total" $positionsInitial.data.total 0
Assert-True "Initial positions items empty" ($positionsInitial.data.items.Count -eq 0)

$tradesInitial = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/trades" `
    -Headers $HeadersA

Assert-True "GET trades success" ($tradesInitial.success -eq $true)
Assert-NumericEqual "Initial trades total" $tradesInitial.data.total 0
Assert-True "Initial trades items empty" ($tradesInitial.data.items.Count -eq 0)

# ============================================================
# BUY 2
# ============================================================

Write-Test "5. BUY 2 XAUUSD"

$buy = Create-Order `
    -Headers $HeadersA `
    -Side "BUY" `
    -Quantity "2"

Assert-True "BUY order success" ($buy.success -eq $true)

$buyOrder = $buy.data.order
$buyPosition = $buy.data.position

Assert-Equal "BUY order side" $buyOrder.side "BUY"
Assert-Equal "BUY order status" $buyOrder.status "FILLED"
Assert-Equal "BUY symbol" $buyOrder.symbol "XAUUSD"
Assert-NumericEqual "BUY quantity" $buyOrder.quantity 2
Assert-NumericEqual "BUY executed price" $buyOrder.executedPrice 3650.40

Assert-True "BUY returned position" ($null -ne $buyPosition)
Assert-Equal "Position side after BUY" $buyPosition.side "LONG"
Assert-NumericEqual "Position quantity after BUY" $buyPosition.quantity 2
Assert-NumericEqual "Position average entry" $buyPosition.averageEntryPrice 3650.40
Assert-NumericEqual "Position unrealized PnL after BUY" $buyPosition.unrealizedPnl 0

Assert-NumericEqual "Balance after BUY" $buy.data.account.balance 100000
Assert-NumericEqual "Equity after BUY" $buy.data.account.equity 100000
Assert-NumericEqual "Realized PnL after BUY" $buy.data.realizedPnl 0

$BuyOrderId = $buyOrder.id
$BuyPositionId = $buyPosition.id

# ============================================================
# ORDERS AFTER BUY
# ============================================================

Write-Test "6. VERIFY ORDERS AFTER BUY"

$ordersAfterBuy = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders" `
    -Headers $HeadersA

Assert-True "Orders after BUY request success" ($ordersAfterBuy.success -eq $true)
Assert-NumericEqual "Orders total after BUY" $ordersAfterBuy.data.total 1

$orderFromList = $ordersAfterBuy.data.items |
    Where-Object { $_.id -eq $BuyOrderId } |
    Select-Object -First 1

Assert-True "BUY order exists in order history" ($null -ne $orderFromList)

if ($null -ne $orderFromList) {
    Assert-Equal "History BUY side" $orderFromList.side "BUY"
    Assert-Equal "History BUY status" $orderFromList.status "FILLED"
    Assert-NumericEqual "History BUY quantity" $orderFromList.quantity 2
    Assert-NumericEqual "History BUY executed price" $orderFromList.executedPrice 3650.40
}

# ============================================================
# SINGLE ORDER
# ============================================================

Write-Test "7. VERIFY SINGLE ORDER"

$singleOrder = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/$BuyOrderId" `
    -Headers $HeadersA

Assert-True "GET single order success" ($singleOrder.success -eq $true)
Assert-Equal "Single order ID" $singleOrder.data.id $BuyOrderId
Assert-Equal "Single order symbol" $singleOrder.data.symbol "XAUUSD"
Assert-Equal "Single order side" $singleOrder.data.side "BUY"
Assert-Equal "Single order status" $singleOrder.data.status "FILLED"

# ============================================================
# POSITIONS AFTER BUY
# ============================================================

Write-Test "8. VERIFY POSITIONS AFTER BUY"

$positionsAfterBuy = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/positions" `
    -Headers $HeadersA

Assert-True "Positions after BUY request success" ($positionsAfterBuy.success -eq $true)
Assert-NumericEqual "Positions total after BUY" $positionsAfterBuy.data.total 1

$positionFromList = $positionsAfterBuy.data.items |
    Where-Object { $_.id -eq $BuyPositionId } |
    Select-Object -First 1

Assert-True "LONG position exists" ($null -ne $positionFromList)

if ($null -ne $positionFromList) {
    Assert-Equal "Position list side" $positionFromList.side "LONG"
    Assert-NumericEqual "Position list quantity" $positionFromList.quantity 2
    Assert-NumericEqual "Position list average entry" $positionFromList.averageEntryPrice 3650.40
    Assert-NumericEqual "Position list current price" $positionFromList.currentPrice 3650.40
    Assert-NumericEqual "Position list unrealized PnL" $positionFromList.unrealizedPnl 0
    Assert-Equal "Position list status" $positionFromList.status "OPEN"
}

# ============================================================
# SINGLE POSITION
# ============================================================

Write-Test "9. VERIFY SINGLE POSITION"

$singlePosition = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/positions/$BuyPositionId" `
    -Headers $HeadersA

Assert-True "GET single position success" ($singlePosition.success -eq $true)
Assert-Equal "Single position ID" $singlePosition.data.id $BuyPositionId
Assert-Equal "Single position side" $singlePosition.data.side "LONG"
Assert-NumericEqual "Single position quantity" $singlePosition.data.quantity 2
Assert-Equal "Single position status" $singlePosition.data.status "OPEN"

# ============================================================
# TRADES AFTER BUY
# ============================================================

Write-Test "10. VERIFY TRADES AFTER BUY"

$tradesAfterBuy = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/trades" `
    -Headers $HeadersA

Assert-True "Trades after BUY request success" ($tradesAfterBuy.success -eq $true)
Assert-NumericEqual "Trades total after BUY" $tradesAfterBuy.data.total 1

$tradeAfterBuy = $tradesAfterBuy.data.items |
    Where-Object { $_.orderId -eq $BuyOrderId } |
    Select-Object -First 1

Assert-True "BUY trade exists" ($null -ne $tradeAfterBuy)

if ($null -ne $tradeAfterBuy) {
    Assert-Equal "BUY trade side" $tradeAfterBuy.side "BUY"
    Assert-NumericEqual "BUY trade quantity" $tradeAfterBuy.quantity 2
    Assert-NumericEqual "BUY trade entry price" $tradeAfterBuy.entryPrice 3650.40
    Assert-True "BUY trade has no exit price" ($null -eq $tradeAfterBuy.exitPrice)
    Assert-True "BUY trade has no realized PnL" ($null -eq $tradeAfterBuy.realizedPnl)
}

# ============================================================
# SELL 1
# ============================================================

Write-Test "11. SELL 1 XAUUSD"

$sell = Create-Order `
    -Headers $HeadersA `
    -Side "SELL" `
    -Quantity "1"

Assert-True "SELL order success" ($sell.success -eq $true)

$sellOrder = $sell.data.order
$sellPosition = $sell.data.position

Assert-Equal "SELL order side" $sellOrder.side "SELL"
Assert-Equal "SELL order status" $sellOrder.status "FILLED"
Assert-NumericEqual "SELL quantity" $sellOrder.quantity 1
Assert-NumericEqual "SELL executed price" $sellOrder.executedPrice 3650.20

Assert-True "Remaining LONG position exists" ($null -ne $sellPosition)
Assert-Equal "Remaining position side" $sellPosition.side "LONG"
Assert-NumericEqual "Remaining position quantity" $sellPosition.quantity 1
Assert-NumericEqual "Remaining position average entry" $sellPosition.averageEntryPrice 3650.40
Assert-NumericEqual "Remaining position unrealized PnL" $sellPosition.unrealizedPnl -0.20

Assert-NumericEqual "SELL realized PnL" $sell.data.realizedPnl -0.20
Assert-NumericEqual "SELL balance" $sell.data.account.balance 99999.80
Assert-NumericEqual "SELL equity" $sell.data.account.equity 99999.60
Assert-NumericEqual "SELL unrealized PnL" $sell.data.account.unrealizedPnl -0.20

$SellOrderId = $sellOrder.id

# ============================================================
# HISTORY AFTER SELL
# ============================================================

Write-Test "12. VERIFY HISTORY AFTER SELL"

$ordersAfterSell = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders" `
    -Headers $HeadersA

Assert-True "Orders after SELL request success" ($ordersAfterSell.success -eq $true)
Assert-NumericEqual "Orders total after SELL" $ordersAfterSell.data.total 2

$sellOrderFromHistory = $ordersAfterSell.data.items |
    Where-Object { $_.id -eq $SellOrderId } |
    Select-Object -First 1

Assert-True "SELL order exists in history" ($null -ne $sellOrderFromHistory)

if ($null -ne $sellOrderFromHistory) {
    Assert-Equal "History SELL side" $sellOrderFromHistory.side "SELL"
    Assert-Equal "History SELL status" $sellOrderFromHistory.status "FILLED"
    Assert-NumericEqual "History SELL quantity" $sellOrderFromHistory.quantity 1
    Assert-NumericEqual "History SELL executed price" $sellOrderFromHistory.executedPrice 3650.20
}

$positionsAfterSell = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/positions" `
    -Headers $HeadersA

Assert-True "Positions after SELL request success" ($positionsAfterSell.success -eq $true)
Assert-NumericEqual "Positions total after SELL" $positionsAfterSell.data.total 1

$remainingPosition = $positionsAfterSell.data.items |
    Where-Object { $_.status -eq "OPEN" } |
    Select-Object -First 1

Assert-True "Open LONG remains after SELL" ($null -ne $remainingPosition)

if ($null -ne $remainingPosition) {
    Assert-Equal "Remaining position side" $remainingPosition.side "LONG"
    Assert-NumericEqual "Remaining position quantity" $remainingPosition.quantity 1
    Assert-NumericEqual "Remaining position unrealized PnL" $remainingPosition.unrealizedPnl -0.20
}

$tradesAfterSell = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/trades" `
    -Headers $HeadersA

Assert-True "Trades after SELL request success" ($tradesAfterSell.success -eq $true)
Assert-NumericEqual "Trades total after SELL" $tradesAfterSell.data.total 2

$sellTrade = $tradesAfterSell.data.items |
    Where-Object { $_.orderId -eq $SellOrderId } |
    Select-Object -First 1

Assert-True "SELL closing trade exists" ($null -ne $sellTrade)

if ($null -ne $sellTrade) {
    Assert-Equal "SELL trade side" $sellTrade.side "SELL"
    Assert-NumericEqual "SELL trade quantity" $sellTrade.quantity 1
    Assert-NumericEqual "SELL trade entry price" $sellTrade.entryPrice 3650.40
    Assert-NumericEqual "SELL trade exit price" $sellTrade.exitPrice 3650.20
    Assert-NumericEqual "SELL trade realized PnL" $sellTrade.realizedPnl -0.20
    Assert-Equal "SELL trade position ID" $sellTrade.positionId $BuyPositionId
}

# ============================================================
# ACCOUNT BALANCE
# ============================================================

Write-Test "13. VERIFY ACCOUNT BALANCE"

$balanceA = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/accounts/balance" `
    -Headers $HeadersA

Assert-True "Account balance request success" ($balanceA.success -eq $true)
Assert-Equal "Balance account ID" $balanceA.data.accountId $AccountAId
Assert-Equal "Balance account number" $balanceA.data.accountNumber $AccountANumber
Assert-NumericEqual "Final balance" $balanceA.data.balance 99999.80
Assert-NumericEqual "Final equity" $balanceA.data.equity 99999.60
Assert-NumericEqual "Final unrealized PnL" $balanceA.data.unrealizedPnl -0.20

# ============================================================
# USER B
# ============================================================

Write-Test "14. REGISTER USER B"

$registerB = Create-User -Email $UserBEmail

Assert-True "User B register success" ($registerB.success -eq $true)
Assert-True "User B register returned data" ($null -ne $registerB.data)

Write-Host "User B: $UserBEmail" -ForegroundColor Gray

Write-Test "15. LOGIN USER B"

$loginB = Login-User -Email $UserBEmail

Assert-True "User B login success" ($loginB.success -eq $true)

$tokenB = $loginB.data.accessToken

Assert-True `
    "User B access token exists" `
    (-not [string]::IsNullOrWhiteSpace($tokenB))

$HeadersB = @{
    Authorization = "Bearer $tokenB"
}

Write-Test "16. CREATE DEMO ACCOUNT FOR USER B"

$demoB = Create-DemoAccount -Headers $HeadersB

Assert-True "User B demo account creation success" ($demoB.success -eq $true)

$accountB = $demoB.data
$AccountBId = $accountB.id
$AccountBNumber = $accountB.accountNumber

Assert-True `
    "User B account ID exists" `
    (-not [string]::IsNullOrWhiteSpace($AccountBId))

Assert-True `
    "User B account number exists" `
    (-not [string]::IsNullOrWhiteSpace($AccountBNumber))

Assert-True `
    "User A and User B have different accounts" `
    ($AccountAId -ne $AccountBId)

# ============================================================
# USER ISOLATION
# ============================================================

Write-Test "17. USER B MUST NOT SEE USER A DATA"

$ordersB = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders" `
    -Headers $HeadersB

Assert-True "User B orders request success" ($ordersB.success -eq $true)
Assert-NumericEqual "User B orders total" $ordersB.data.total 0

$positionsB = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/positions" `
    -Headers $HeadersB

Assert-True "User B positions request success" ($positionsB.success -eq $true)
Assert-NumericEqual "User B positions total" $positionsB.data.total 0

$tradesB = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/trades" `
    -Headers $HeadersB

Assert-True "User B trades request success" ($tradesB.success -eq $true)
Assert-NumericEqual "User B trades total" $tradesB.data.total 0

# ============================================================
# CROSS-USER ORDER ACCESS
# ============================================================

Write-Test "18. USER B ACCESS USER A ORDER"

Invoke-ApiExpectedError `
    -Method "GET" `
    -Url "$BaseUrl/orders/$BuyOrderId" `
    -Headers $HeadersB `
    -ExpectedStatusCode 404

# ============================================================
# CROSS-USER POSITION ACCESS
# ============================================================

Write-Test "19. USER B ACCESS USER A POSITION"

Invoke-ApiExpectedError `
    -Method "GET" `
    -Url "$BaseUrl/orders/positions/$BuyPositionId" `
    -Headers $HeadersB `
    -ExpectedStatusCode 404

# ============================================================
# FINAL
# ============================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "PORTFOLIO API TEST SUMMARY" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "User A:" -ForegroundColor Gray
Write-Host "  $UserAEmail"

Write-Host ""
Write-Host "Account A:" -ForegroundColor Gray
Write-Host "  $AccountANumber"

Write-Host ""
Write-Host "User B:" -ForegroundColor Gray
Write-Host "  $UserBEmail"

Write-Host ""
Write-Host "Account B:" -ForegroundColor Gray
Write-Host "  $AccountBNumber"

Write-Host ""
Write-Host "Expected User A final state:" -ForegroundColor Gray
Write-Host "  Balance        = 99999.80"
Write-Host "  Equity         = 99999.60"
Write-Host "  Unrealized PnL = -0.20"
Write-Host "  Position       = LONG 1 XAUUSD @ 3650.40"
Write-Host "  Orders         = 2"
Write-Host "  Trades         = 2"

Write-Host ""
Write-Host "Expected User B final state:" -ForegroundColor Gray
Write-Host "  Balance        = 100000.00"
Write-Host "  Equity         = 100000.00"
Write-Host "  Orders         = 0"
Write-Host "  Positions      = 0"
Write-Host "  Trades         = 0"

Write-Host ""
Write-Host "Tests passed: $Passed" -ForegroundColor Green
Write-Host "Tests failed: $Failed" -ForegroundColor Red
Write-Host ""

if ($Failed -gt 0) {
    Write-Host "❌ PORTFOLIO API TEST FAILED" -ForegroundColor Red
    exit 1
}

Write-Host "✅ ALL PORTFOLIO API TESTS PASSED" -ForegroundColor Green
exit 0

