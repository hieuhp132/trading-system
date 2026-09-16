$ErrorActionPreference = "Stop"

# ============================================================
# Paper Trading - Order Integration Test
#
# Flow:
# Register
# Login
# Create Demo Account
# Get Market Price
# BUY 1
# BUY 1
# SELL 1
# SELL 2
# Verify Balance / Equity / Position / PnL
# ============================================================

$BaseUrl = "http://localhost:4000/api/v1"

$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$Email = "order-test-$timestamp@example.com"
$Password = "Test@123456"
$FullName = "Order Test User"

$Passed = 0
$Failed = 0

function Write-Test {
    param(
        [string]$Message
    )

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

# ============================================================
# 0. SERVER CHECK
# ============================================================

Write-Test "0. CHECK API SERVER"

try {
    $health = Invoke-Api `
        -Method "GET" `
        -Url "$BaseUrl/health"

    Write-Host "[PASS] API server is reachable" -ForegroundColor Green
    $Passed++
}
catch {
    Write-Host "[FAIL] API server is not reachable" -ForegroundColor Red
    Write-Host "Make sure backend is running with: pnpm dev" -ForegroundColor Yellow
    exit 1
}

# ============================================================
# 1. REGISTER
# ============================================================

Write-Test "1. REGISTER USER"

$registerBody = @{
    email    = $Email
    password = $Password
    fullName = $FullName
}

$register = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/auth/register" `
    -Body $registerBody

Assert-True `
    "Register success" `
    ($register.success -eq $true)

Assert-True `
    "Register returned data" `
    ($null -ne $register.data)

Write-Host ""
Write-Host "Email: $Email" -ForegroundColor Gray

if ($register.data.id) {
    Write-Host "User ID: $($register.data.id)" -ForegroundColor Gray
}
else {
    Write-Host "User ID: Register API does not return user ID" -ForegroundColor DarkGray
}

# ============================================================
# 2. LOGIN
# ============================================================

Write-Test "2. LOGIN"

$loginBody = @{
    email    = $Email
    password = $Password
}

$login = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/auth/login" `
    -Body $loginBody

Assert-True `
    "Login success" `
    ($login.success -eq $true)

$accessToken = $login.data.accessToken

Assert-True `
    "Access token exists" `
    (-not [string]::IsNullOrWhiteSpace($accessToken))

$Headers = @{
    Authorization = "Bearer $accessToken"
}

Write-Host ""
Write-Host "Access token received" -ForegroundColor Gray

# ============================================================
# 3. CREATE DEMO ACCOUNT
# ============================================================

Write-Test "3. CREATE DEMO ACCOUNT"

$demoAccount = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/accounts/demo" `
    -Headers $Headers

Assert-True `
    "Create demo account success" `
    ($demoAccount.success -eq $true)

$account = $demoAccount.data

$AccountId = $account.id
$AccountNumber = $account.accountNumber

Assert-True `
    "Account ID exists" `
    (-not [string]::IsNullOrWhiteSpace($AccountId))

Assert-True `
    "Account number exists" `
    (-not [string]::IsNullOrWhiteSpace($AccountNumber))

Assert-NumericEqual `
    "Initial balance" `
    $account.initialBalance `
    100000

Assert-NumericEqual `
    "Initial account balance" `
    $account.balance `
    100000

Assert-NumericEqual `
    "Initial equity" `
    $account.equity `
    100000

Write-Host ""
Write-Host "Account: $AccountNumber" -ForegroundColor Gray

# ============================================================
# 4. MARKET PRICE
# ============================================================

Write-Test "4. GET XAUUSD MARKET PRICE"

$market = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/market/price?symbol=XAUUSD" `
    -Headers $Headers

Assert-True `
    "Market price request success" `
    ($market.success -eq $true)

$price = $market.data

Assert-Equal `
    "Symbol" `
    $price.symbol `
    "XAUUSD"

Assert-NumericEqual `
    "Bid" `
    $price.bid `
    3650.20

Assert-NumericEqual `
    "Ask" `
    $price.ask `
    3650.40

$Bid = [double]$price.bid
$Ask = [double]$price.ask

Write-Host ""
Write-Host "XAUUSD" -ForegroundColor Gray
Write-Host "Bid: $Bid" -ForegroundColor Gray
Write-Host "Ask: $Ask" -ForegroundColor Gray

# ============================================================
# ORDER HELPER
# ============================================================

function Create-Order {
    param(
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
# 5. BUY 1
# ============================================================

Write-Test "5. BUY 1 XAUUSD"

$buy1 = Create-Order `
    -Side "BUY" `
    -Quantity "1"

Assert-True `
    "BUY order success" `
    ($buy1.success -eq $true)

$order1 = $buy1.data.order
$position1 = $buy1.data.position

Assert-Equal `
    "Order 1 side" `
    $order1.side `
    "BUY"

Assert-Equal `
    "Order 1 status" `
    $order1.status `
    "FILLED"

Assert-NumericEqual `
    "Order 1 executed price" `
    $order1.executedPrice `
    3650.40

Assert-Equal `
    "Position side after BUY 1" `
    $position1.side `
    "LONG"

Assert-NumericEqual `
    "Position quantity after BUY 1" `
    $position1.quantity `
    1

Assert-NumericEqual `
    "Position average entry after BUY 1" `
    $position1.averageEntryPrice `
    3650.40

Assert-NumericEqual `
    "Position unrealized PnL after BUY 1" `
    $position1.unrealizedPnl `
    0

Assert-NumericEqual `
    "Realized PnL after BUY 1" `
    $buy1.data.realizedPnl `
    0

Assert-NumericEqual `
    "Balance after BUY 1" `
    $buy1.data.account.balance `
    100000

Assert-NumericEqual `
    "Equity after BUY 1" `
    $buy1.data.account.equity `
    100000

# ============================================================
# 6. BUY 1 AGAIN
# ============================================================

Write-Test "6. BUY 1 XAUUSD AGAIN"

$buy2 = Create-Order `
    -Side "BUY" `
    -Quantity "1"

Assert-True `
    "Second BUY order success" `
    ($buy2.success -eq $true)

$order2 = $buy2.data.order
$position2 = $buy2.data.position

Assert-Equal `
    "Order 2 side" `
    $order2.side `
    "BUY"

Assert-Equal `
    "Order 2 status" `
    $order2.status `
    "FILLED"

Assert-NumericEqual `
    "Order 2 executed price" `
    $order2.executedPrice `
    3650.40

Assert-NumericEqual `
    "LONG quantity after second BUY" `
    $position2.quantity `
    2

Assert-NumericEqual `
    "LONG average entry after second BUY" `
    $position2.averageEntryPrice `
    3650.40

Assert-NumericEqual `
    "LONG unrealized PnL after second BUY" `
    $position2.unrealizedPnl `
    0

Assert-NumericEqual `
    "Balance after second BUY" `
    $buy2.data.account.balance `
    100000

Assert-NumericEqual `
    "Equity after second BUY" `
    $buy2.data.account.equity `
    100000

# ============================================================
# 7. SELL 1
# ============================================================

Write-Test "7. SELL 1 XAUUSD"

$sell1 = Create-Order `
    -Side "SELL" `
    -Quantity "1"

Assert-True `
    "SELL order success" `
    ($sell1.success -eq $true)

$order3 = $sell1.data.order
$position3 = $sell1.data.position

Assert-Equal `
    "Order 3 side" `
    $order3.side `
    "SELL"

Assert-Equal `
    "Order 3 status" `
    $order3.status `
    "FILLED"

Assert-NumericEqual `
    "Order 3 executed price" `
    $order3.executedPrice `
    3650.20

Assert-NumericEqual `
    "Remaining LONG quantity" `
    $position3.quantity `
    1

Assert-Equal `
    "Remaining LONG side" `
    $position3.side `
    "LONG"

Assert-NumericEqual `
    "Remaining LONG average entry" `
    $position3.averageEntryPrice `
    3650.40

# Realized PnL:
#
# (3650.20 - 3650.40) * 1
# = -0.20
#
# Remaining LONG unrealized:
#
# (3650.20 - 3650.40) * 1
# = -0.20
#
# Balance = 100000 - 0.20 = 99999.80
# Equity  = 99999.80 - 0.20 = 99999.60

Assert-NumericEqual `
    "Realized PnL after SELL 1" `
    $sell1.data.realizedPnl `
    -0.20

Assert-NumericEqual `
    "Balance after SELL 1" `
    $sell1.data.account.balance `
    99999.80

Assert-NumericEqual `
    "Equity after SELL 1" `
    $sell1.data.account.equity `
    99999.60

Assert-NumericEqual `
    "Unrealized PnL after SELL 1" `
    $sell1.data.account.unrealizedPnl `
    -0.20

# ============================================================
# 8. SELL 2
# ============================================================

Write-Test "8. SELL 2 XAUUSD"

$sell2 = Create-Order `
    -Side "SELL" `
    -Quantity "2"

Assert-True `
    "Second SELL order success" `
    ($sell2.success -eq $true)

$order4 = $sell2.data.order
$position4 = $sell2.data.position

Assert-Equal `
    "Order 4 side" `
    $order4.side `
    "SELL"

Assert-Equal `
    "Order 4 status" `
    $order4.status `
    "FILLED"

Assert-NumericEqual `
    "Order 4 executed price" `
    $order4.executedPrice `
    3650.20

# Existing LONG = 1
#
# SELL 2:
#   close LONG 1
#   open SHORT 1

Assert-True `
    "New position exists after SELL 2" `
    ($null -ne $position4)

Assert-Equal `
    "New position side" `
    $position4.side `
    "SHORT"

Assert-NumericEqual `
    "New SHORT quantity" `
    $position4.quantity `
    1

Assert-NumericEqual `
    "SHORT average entry" `
    $position4.averageEntryPrice `
    3650.20

Assert-NumericEqual `
    "SHORT unrealized PnL" `
    $position4.unrealizedPnl `
    0

Assert-NumericEqual `
    "Realized PnL from SELL 2" `
    $sell2.data.realizedPnl `
    -0.20

# Total realized PnL:
#
# SELL 1 = -0.20
# SELL 2 = -0.20
# Total  = -0.40
#
# Final balance = 100000 - 0.40
#              = 99999.60

Assert-NumericEqual `
    "Final balance" `
    $sell2.data.account.balance `
    99999.60

Assert-NumericEqual `
    "Final equity" `
    $sell2.data.account.equity `
    99999.60

Assert-NumericEqual `
    "Final unrealized PnL" `
    $sell2.data.account.unrealizedPnl `
    0

# ============================================================
# 9. VERIFY ACCOUNT BALANCE
# ============================================================

Write-Test "9. VERIFY ACCOUNT BALANCE FROM API"

$finalBalance = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/accounts/balance" `
    -Headers $Headers

Assert-True `
    "Balance API success" `
    ($finalBalance.success -eq $true)

Assert-NumericEqual `
    "Final API balance" `
    $finalBalance.data.balance `
    99999.60

Assert-NumericEqual `
    "Final API equity" `
    $finalBalance.data.equity `
    99999.60

Assert-NumericEqual `
    "Final API unrealized PnL" `
    $finalBalance.data.unrealizedPnl `
    0

# ============================================================
# 10. SUMMARY
# ============================================================

Write-Host ""
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "User:" -ForegroundColor Gray
Write-Host "  $Email"

Write-Host ""
Write-Host "Account:" -ForegroundColor Gray
Write-Host "  $AccountNumber"

Write-Host ""
Write-Host "Expected final state:" -ForegroundColor Gray
Write-Host "  Balance        = 99999.60"
Write-Host "  Equity         = 99999.60"
Write-Host "  Unrealized PnL = 0.00"
Write-Host "  Position       = SHORT 1 XAUUSD @ 3650.20"

Write-Host ""
Write-Host "Tests passed: $Passed" -ForegroundColor Green
Write-Host "Tests failed: $Failed" -ForegroundColor Red

Write-Host ""

if ($Failed -gt 0) {
    Write-Host "❌ ORDER TEST FAILED" -ForegroundColor Red
    exit 1
}

Write-Host "✅ ALL ORDER TESTS PASSED" -ForegroundColor Green
exit 0
