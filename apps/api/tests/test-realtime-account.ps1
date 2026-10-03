$ErrorActionPreference = "Stop"

# ============================================================
# CONFIG
# ============================================================

$BaseUrl = "http://localhost:4000/api/v1"

$Email = "realtime-test-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())@example.com"
$Password = "realtime-test@123456"
$FullName = "Realtime Account Test User"

$Symbol = "XAUUSD"
$Quantity = "1"

# ============================================================
# TEST STATE
# ============================================================

$script:Passed = 0
$script:Failed = 0
$script:AccessToken = $null
$script:LongPositionId = $null
$script:ShortPositionId = $null

# ============================================================
# HELPERS
# ============================================================

function Write-TestHeader {
    param(
        [string]$Title
    )

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host $Title -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
}

function Write-Step {
    param(
        [string]$Message
    )

    Write-Host ""
    Write-Host "[STEP] $Message" -ForegroundColor Yellow
}

function Pass-Test {
    param(
        [string]$Message
    )

    $script:Passed++

    Write-Host "[PASS] $Message" -ForegroundColor Green
}

function Fail-Test {
    param(
        [string]$Message
    )

    $script:Failed++

    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Invoke-Api {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Method,

        [Parameter(Mandatory = $true)]
        [string]$Url,

        [object]$Body = $null,

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
            $params["Body"] = ($Body | ConvertTo-Json -Depth 20)
        }

        $response = Invoke-RestMethod @params

        return $response
    }
    catch {
        Write-Host ""
        Write-Host "API ERROR" -ForegroundColor Red
        Write-Host "Method : $Method" -ForegroundColor Red
        Write-Host "URL    : $Url" -ForegroundColor Red

        if ($_.ErrorDetails.Message) {
            Write-Host "Body   : $($_.ErrorDetails.Message)" -ForegroundColor Red
        }
        else {
            Write-Host "Error  : $($_.Exception.Message)" -ForegroundColor Red
        }

        throw
    }
}

function Assert-Equal {
    param(
        [string]$Name,
        [object]$Actual,
        [object]$Expected
    )

    if ($Actual -eq $Expected) {
        Pass-Test "$Name = $Actual"
        return $true
    }

    Fail-Test "$Name expected [$Expected] but got [$Actual]"
    return $false
}

function Assert-True {
    param(
        [string]$Name,
        [bool]$Condition
    )

    if ($Condition) {
        Pass-Test $Name
        return $true
    }

    Fail-Test $Name
    return $false
}

function Get-Number {
    param(
        [object]$Value
    )

    return [double]$Value
}

function Show-Json {
    param(
        [object]$Data
    )

    $Data | ConvertTo-Json -Depth 20
}

# ============================================================
# START
# ============================================================

Write-TestHeader "REALTIME ACCOUNT / POSITION / P&L TEST"

Write-Host "Base URL : $BaseUrl"
Write-Host "Email    : $Email"
Write-Host "Symbol   : $Symbol"
Write-Host "Quantity : $Quantity"

# ============================================================
# 1. REGISTER
# ============================================================

Write-Step "1. Register test user"

$registerBody = @{
    email    = $Email
    password = $Password
    fullName = $FullName
}

$register = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/auth/register" `
    -Body $registerBody

Show-Json $register

Assert-True `
    "Register success" `
    ($register.success -eq $true)

# ============================================================
# 2. LOGIN
# ============================================================

Write-Step "2. Login"

$loginBody = @{
    email    = $Email
    password = $Password
}

$login = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/auth/login" `
    -Body $loginBody

Show-Json $login

$script:AccessToken = $login.data.accessToken

Assert-True `
    "Access token exists" `
    (-not [string]::IsNullOrWhiteSpace($script:AccessToken))

$AuthHeaders = @{
    Authorization = "Bearer $script:AccessToken"
}

# ========================================
# AUTHORIZATION HEADER
# ========================================



# ========================================
# CREATE DEMO ACCOUNT
# ========================================

$demo = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/accounts/demo" `
    -Headers $AuthHeaders

Write-Host ""
Write-Host "Demo account:" -ForegroundColor Green

$demo.data


# ============================================================
# 3. ACCOUNT BALANCE - INITIAL
# ============================================================

Write-Step "3. Check initial account balance"

$initialBalanceResponse = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/accounts/balance" `
    -Headers $AuthHeaders

Show-Json $initialBalanceResponse

$initialBalance = Get-Number $initialBalanceResponse.data.balance
$initialEquity = Get-Number $initialBalanceResponse.data.equity
$initialUnrealized = Get-Number $initialBalanceResponse.data.unrealizedPnl

Assert-Equal `
    "Initial balance" `
    $initialBalance `
    100000

Assert-Equal `
    "Initial equity" `
    $initialEquity `
    100000

Assert-Equal `
    "Initial unrealized P&L" `
    $initialUnrealized `
    0

# ============================================================
# 4. MARKET PRICE
# ============================================================

Write-Step "4. Get XAUUSD market price"

$marketResponse = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/market/price?symbol=$Symbol"

Show-Json $marketResponse

$bid = Get-Number $marketResponse.data.bid
$ask = Get-Number $marketResponse.data.ask
$last = Get-Number $marketResponse.data.last

Assert-True `
    "BID > 0" `
    ($bid -gt 0)

Assert-True `
    "ASK > 0" `
    ($ask -gt 0)

Assert-True `
    "ASK >= BID" `
    ($ask -ge $bid)

Write-Host ""
Write-Host "Market:"
Write-Host "  BID  = $bid"
Write-Host "  ASK  = $ask"
Write-Host "  LAST = $last"

# ============================================================
# 5. BUY 1 XAUUSD
# ============================================================

Write-Step "5. Create BUY MARKET 1 XAUUSD"

$buyBody = @{
    symbol   = $Symbol
    side     = "BUY"
    type     = "MARKET"
    quantity = $Quantity
}

$buyResponse = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/orders" `
    -Headers $AuthHeaders `
    -Body $buyBody

Show-Json $buyResponse

Assert-Equal `
    "BUY order status" `
    $buyResponse.data.order.status `
    "FILLED"

Assert-Equal `
    "BUY order side" `
    $buyResponse.data.order.side `
    "BUY"

Assert-Equal `
    "BUY order quantity" `
    $buyResponse.data.order.quantity `
    $Quantity

Assert-True `
    "BUY executed price exists" `
    (-not [string]::IsNullOrWhiteSpace(
        [string]$buyResponse.data.order.executedPrice
    ))

# ============================================================
# 6. GET POSITIONS AFTER BUY
# ============================================================

Write-Step "6. Check positions after BUY"

$positionsAfterBuy = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/positions" `
    -Headers $AuthHeaders

Show-Json $positionsAfterBuy

$openPositionsAfterBuy = @(
    $positionsAfterBuy.data.items |
    Where-Object { $_.status -eq "OPEN" }
)

Assert-True `
    "At least one OPEN position after BUY" `
    ($openPositionsAfterBuy.Count -ge 1)

$longPosition = $openPositionsAfterBuy |
    Where-Object { $_.side -eq "LONG" } |
    Select-Object -First 1

Assert-True `
    "LONG position exists" `
    ($null -ne $longPosition)

if ($null -ne $longPosition) {
    $script:LongPositionId = $longPosition.id

    Assert-Equal `
        "LONG quantity" `
        $longPosition.quantity `
        $Quantity

    Assert-Equal `
        "LONG symbol" `
        $longPosition.symbol `
        $Symbol

    Assert-Equal `
        "LONG status" `
        $longPosition.status `
        "OPEN"
}

# ============================================================
# 7. ACCOUNT BALANCE REALTIME AFTER BUY
# ============================================================

Write-Step "7. Check realtime account metrics after BUY"

$afterBuyBalanceResponse = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/accounts/balance" `
    -Headers $AuthHeaders

Show-Json $afterBuyBalanceResponse

$afterBuyBalance = Get-Number $afterBuyBalanceResponse.data.balance
$afterBuyEquity = Get-Number $afterBuyBalanceResponse.data.equity
$afterBuyUnrealized = Get-Number $afterBuyBalanceResponse.data.unrealizedPnl

Assert-Equal `
    "Balance remains 100000 after opening position" `
    $afterBuyBalance `
    100000

# BUY opens LONG at ASK.
# LONG is valued at BID.
$expectedLongPnl = [math]::Round(
    ($bid - $ask) * [double]$Quantity,
    2
)

Write-Host ""
Write-Host "Expected LONG unrealized P&L:"
Write-Host "  Entry ASK = $ask"
Write-Host "  Value BID = $bid"
Write-Host "  Quantity  = $Quantity"
Write-Host "  Expected  = $expectedLongPnl"

Assert-Equal `
    "Realtime LONG unrealized P&L" `
    $afterBuyUnrealized `
    $expectedLongPnl

$expectedEquity = [math]::Round(
    100000 + $expectedLongPnl,
    2
)

Assert-Equal `
    "Realtime equity after BUY" `
    $afterBuyEquity `
    $expectedEquity

# ============================================================
# 8. PORTFOLIO SUMMARY
# ============================================================

Write-Step "8. Check portfolio summary"

$portfolioResponse = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/portfolio/summary" `
    -Headers $AuthHeaders

Show-Json $portfolioResponse

$portfolioBalance = Get-Number $portfolioResponse.data.balance
$portfolioEquity = Get-Number $portfolioResponse.data.equity
$portfolioUnrealized = Get-Number $portfolioResponse.data.unrealizedPnl

Assert-Equal `
    "Portfolio balance" `
    $portfolioBalance `
    100000

Assert-Equal `
    "Portfolio unrealized P&L" `
    $portfolioUnrealized `
    $expectedLongPnl

Assert-Equal `
    "Portfolio equity" `
    $portfolioEquity `
    $expectedEquity

Assert-True `
    "Portfolio has open position" `
    ($portfolioResponse.data.openPositions -ge 1)

# ============================================================
# 9. SELL 1 XAUUSD
# ============================================================

Write-Step "9. Create SELL MARKET 1 XAUUSD"

$sellBody = @{
    symbol   = $Symbol
    side     = "SELL"
    type     = "MARKET"
    quantity = $Quantity
}

$sellResponse = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/orders" `
    -Headers $AuthHeaders `
    -Body $sellBody

Show-Json $sellResponse

Assert-Equal `
    "SELL order status" `
    $sellResponse.data.order.status `
    "FILLED"

Assert-Equal `
    "SELL order side" `
    $sellResponse.data.order.side `
    "SELL"

Assert-Equal `
    "SELL order quantity" `
    $sellResponse.data.order.quantity `
    $Quantity

# ============================================================
# 10. CHECK BOTH LONG + SHORT
# ============================================================

Write-Step "10. Check LONG + SHORT positions"

$positionsAfterSell = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/positions" `
    -Headers $AuthHeaders

Show-Json $positionsAfterSell

$openPositionsAfterSell = @(
    $positionsAfterSell.data.items |
    Where-Object { $_.status -eq "OPEN" }
)

$longPositionAfterSell = $openPositionsAfterSell |
    Where-Object { $_.side -eq "LONG" } |
    Select-Object -First 1

$shortPositionAfterSell = $openPositionsAfterSell |
    Where-Object { $_.side -eq "SHORT" } |
    Select-Object -First 1

Assert-True `
    "LONG remains OPEN after SELL" `
    ($null -ne $longPositionAfterSell)

Assert-True `
    "SHORT exists after SELL" `
    ($null -ne $shortPositionAfterSell)

if ($null -ne $shortPositionAfterSell) {
    $script:ShortPositionId = $shortPositionAfterSell.id

    Assert-Equal `
        "SHORT quantity" `
        $shortPositionAfterSell.quantity `
        $Quantity

    Assert-Equal `
        "SHORT status" `
        $shortPositionAfterSell.status `
        "OPEN"
}

# ============================================================
# 11. REALTIME P&L WITH LONG + SHORT
# ============================================================

Write-Step "11. Check realtime P&L with LONG + SHORT"

$afterHedgeBalanceResponse = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/accounts/balance" `
    -Headers $AuthHeaders

Show-Json $afterHedgeBalanceResponse

$afterHedgeBalance = Get-Number $afterHedgeBalanceResponse.data.balance
$afterHedgeEquity = Get-Number $afterHedgeBalanceResponse.data.equity
$afterHedgeUnrealized = Get-Number $afterHedgeBalanceResponse.data.unrealizedPnl

# LONG:
# Entry = ASK
# Current = BID
$expectedLongPnl2 = ($bid - $ask) * [double]$Quantity

# SHORT:
# Entry = BID
# Current = ASK
$expectedShortPnl2 = ($bid - $ask) * [double]$Quantity

$expectedCombinedPnl = [math]::Round(
    $expectedLongPnl2 + $expectedShortPnl2,
    2
)

$expectedCombinedEquity = [math]::Round(
    100000 + $expectedCombinedPnl,
    2
)

Write-Host ""
Write-Host "Expected:"
Write-Host "  LONG P&L  = $expectedLongPnl2"
Write-Host "  SHORT P&L = $expectedShortPnl2"
Write-Host "  TOTAL     = $expectedCombinedPnl"
Write-Host "  EQUITY    = $expectedCombinedEquity"

Assert-Equal `
    "Balance after LONG + SHORT" `
    $afterHedgeBalance `
    100000

Assert-Equal `
    "Combined unrealized P&L" `
    $afterHedgeUnrealized `
    $expectedCombinedPnl

Assert-Equal `
    "Combined equity" `
    $afterHedgeEquity `
    $expectedCombinedEquity

# ============================================================
# 12. CLOSE LONG
# ============================================================

Write-Step "12. Close LONG position"

Assert-True `
    "LONG position ID exists before close" `
    (-not [string]::IsNullOrWhiteSpace($script:LongPositionId))

$closeLongResponse = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/orders/positions/$script:LongPositionId/close" `
    -Headers $AuthHeaders

Show-Json $closeLongResponse

Assert-True `
    "Close LONG API success" `
    ($closeLongResponse.success -eq $true)

# ============================================================
# 13. CHECK LONG CLOSED
# ============================================================

Write-Step "13. Verify LONG is CLOSED"

$positionsAfterLongClose = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/positions" `
    -Headers $AuthHeaders

Show-Json $positionsAfterLongClose

$longAfterClose = @(
    $positionsAfterLongClose.data.items |
    Where-Object {
        $_.id -eq $script:LongPositionId
    }
) | Select-Object -First 1

Assert-True `
    "LONG position still exists in history" `
    ($null -ne $longAfterClose)

if ($null -ne $longAfterClose) {
    Assert-Equal `
        "LONG position status after close" `
        $longAfterClose.status `
        "CLOSED"
}

# ============================================================
# 14. ACCOUNT AFTER LONG CLOSE
# ============================================================

Write-Step "14. Check account after LONG close"

$afterLongCloseBalanceResponse = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/accounts/balance" `
    -Headers $AuthHeaders

Show-Json $afterLongCloseBalanceResponse

$afterLongCloseBalance =
    Get-Number $afterLongCloseBalanceResponse.data.balance

$afterLongCloseEquity =
    Get-Number $afterLongCloseBalanceResponse.data.equity

$afterLongCloseUnrealized =
    Get-Number $afterLongCloseBalanceResponse.data.unrealizedPnl

Assert-True `
    "Balance changed after LONG close" `
    ($afterLongCloseBalance -ne 100000)

# Only SHORT remains OPEN.
# SHORT entry = BID.
# SHORT current = ASK.
$expectedRemainingShortPnl = [math]::Round(
    ($bid - $ask) * [double]$Quantity,
    2
)

$expectedEquityAfterLongClose = [math]::Round(
    $afterLongCloseBalance + $expectedRemainingShortPnl,
    2
)

Assert-Equal `
    "Remaining SHORT unrealized P&L" `
    $afterLongCloseUnrealized `
    $expectedRemainingShortPnl

Assert-Equal `
    "Equity after LONG close" `
    $afterLongCloseEquity `
    $expectedEquityAfterLongClose

# ============================================================
# 15. CLOSE SHORT
# ============================================================

Write-Step "15. Close SHORT position"

Assert-True `
    "SHORT position ID exists before close" `
    (-not [string]::IsNullOrWhiteSpace($script:ShortPositionId))

$closeShortResponse = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/orders/positions/$script:ShortPositionId/close" `
    -Headers $AuthHeaders

Show-Json $closeShortResponse

Assert-True `
    "Close SHORT API success" `
    ($closeShortResponse.success -eq $true)

# ============================================================
# 16. FINAL POSITIONS
# ============================================================

Write-Step "16. Verify all positions are CLOSED"

$finalPositionsResponse = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/positions" `
    -Headers $AuthHeaders

Show-Json $finalPositionsResponse

$finalOpenPositions = @(
    $finalPositionsResponse.data.items |
    Where-Object { $_.status -eq "OPEN" }
)

Assert-Equal `
    "Final open positions" `
    $finalOpenPositions.Count `
    0

# ============================================================
# 17. FINAL ACCOUNT
# ============================================================

Write-Step "17. Final account balance"

$finalBalanceResponse = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/accounts/balance" `
    -Headers $AuthHeaders

Show-Json $finalBalanceResponse

$finalBalance = Get-Number $finalBalanceResponse.data.balance
$finalEquity = Get-Number $finalBalanceResponse.data.equity
$finalUnrealized = Get-Number $finalBalanceResponse.data.unrealizedPnl

Assert-Equal `
    "Final unrealized P&L" `
    $finalUnrealized `
    0

Assert-Equal `
    "Final equity equals balance" `
    $finalEquity `
    $finalBalance

# ============================================================
# 18. FINAL PORTFOLIO
# ============================================================

Write-Step "18. Final portfolio summary"

$finalPortfolioResponse = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/portfolio/summary" `
    -Headers $AuthHeaders

Show-Json $finalPortfolioResponse

Assert-Equal `
    "Final portfolio open positions" `
    $finalPortfolioResponse.data.openPositions `
    0

Assert-Equal `
    "Final portfolio unrealized P&L" `
    (Get-Number $finalPortfolioResponse.data.unrealizedPnl) `
    0

Assert-Equal `
    "Final portfolio equity = balance" `
    (Get-Number $finalPortfolioResponse.data.equity) `
    $finalBalance

# ============================================================
# SUMMARY
# ============================================================

Write-TestHeader "TEST RESULT"

Write-Host ""
Write-Host "User:" -ForegroundColor White
Write-Host "  $Email"

Write-Host ""
Write-Host "Final Account:" -ForegroundColor White
Write-Host "  Balance       = $finalBalance"
Write-Host "  Equity        = $finalEquity"
Write-Host "  Unrealized P&L = $finalUnrealized"

Write-Host ""
Write-Host "Passed: $script:Passed" -ForegroundColor Green
Write-Host "Failed: $script:Failed" -ForegroundColor Red

if ($script:Failed -eq 0) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "ALL REALTIME ACCOUNT TESTS PASSED" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green

    exit 0
}
else {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host "REALTIME ACCOUNT TEST FAILED" -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red

    exit 1
}
