# ============================================================
# Paper Trading MVP - SELL Integration Test
# XAUUSD / Demo Account / SELL MARKET / SHORT
# ============================================================

$ErrorActionPreference = "Stop"

# ============================================================
# Configuration
# ============================================================

$BaseUrl = "http://localhost:4001/api/v1"
$Password = "Test@123456"
$Quantity = "1"

$timestamp = Get-Date -Format "yyyyMMddHHmmssfff"

$UserEmail = "sell-test-$timestamp@example.com"


# ============================================================
# Helper Functions
# ============================================================

function Write-TestHeader {
    param(
        [string]$Message
    )

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
}

function Write-Success {
    param(
        [string]$Message
    )

    Write-Host "[PASS] $Message" -ForegroundColor Green
}

function Write-Info {
    param(
        [string]$Message
    )

    Write-Host "[INFO] $Message" -ForegroundColor Yellow
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Url,
        [hashtable]$Headers = @{},
        [object]$Body = $null
    )

    $params = @{
        Uri     = $Url
        Method  = $Method
        Headers = $Headers
    }

    if ($null -ne $Body) {
        $params.ContentType = "application/json"
        $params.Body = ($Body | ConvertTo-Json -Depth 10)
    }

    try {
        return Invoke-RestMethod @params
    }
    catch {
        Write-Host ""
        Write-Host "[FAIL] Request failed" -ForegroundColor Red
        Write-Host "$Method $Url" -ForegroundColor Red

        if ($_.ErrorDetails.Message) {
            Write-Host $_.ErrorDetails.Message -ForegroundColor Red
        }

        throw
    }
}

function Assert-Equal {
    param(
        [object]$Actual,
        [object]$Expected,
        [string]$Message
    )

    $actualNumber = 0
    $expectedNumber = 0

    $actualIsNumber = [decimal]::TryParse(
        [string]$Actual,
        [System.Globalization.NumberStyles]::Any,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [ref]$actualNumber
    )

    $expectedIsNumber = [decimal]::TryParse(
        [string]$Expected,
        [System.Globalization.NumberStyles]::Any,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [ref]$expectedNumber
    )

    if ($actualIsNumber -and $expectedIsNumber) {
        if ($actualNumber -ne $expectedNumber) {
            throw "$Message | Expected: $Expected | Actual: $Actual"
        }
    }
    elseif ([string]$Actual -ne [string]$Expected) {
        throw "$Message | Expected: $Expected | Actual: $Actual"
    }

    Write-Success $Message
}

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }

    Write-Success $Message
}


# ============================================================
# 1. TEST INFORMATION
# ============================================================

Write-TestHeader "1. SELL TEST INFORMATION"

Write-Info "Base URL : $BaseUrl"
Write-Info "User     : $UserEmail"
Write-Info "Quantity : $Quantity"


# ============================================================
# 2. REGISTER USER
# ============================================================

Write-TestHeader "2. REGISTER USER"

$register = Invoke-Api `
    -Method "Post" `
    -Url "$BaseUrl/auth/register" `
    -Body @{
        email = $UserEmail
        password = $Password
    }

$register | ConvertTo-Json -Depth 10

Write-Success "User registered"


# ============================================================
# 3. LOGIN USER
# ============================================================

Write-TestHeader "3. LOGIN USER"

$login = Invoke-Api `
    -Method "Post" `
    -Url "$BaseUrl/auth/login" `
    -Body @{
        email = $UserEmail
        password = $Password
    }

$token = $login.data.accessToken

Assert-True `
    -Condition (-not [string]::IsNullOrWhiteSpace($token)) `
    -Message "Access token received"

$headers = @{
    Authorization = "Bearer $token"
}


# ============================================================
# 4. CREATE DEMO ACCOUNT
# ============================================================

Write-TestHeader "4. CREATE DEMO ACCOUNT"

$account = Invoke-Api `
    -Method "Post" `
    -Url "$BaseUrl/accounts/demo" `
    -Headers $headers `
    -Body @{}

$account | ConvertTo-Json -Depth 10

Assert-True `
    -Condition ($null -ne $account.data) `
    -Message "Demo account created"

Assert-Equal `
    -Actual $account.data.balance `
    -Expected "100000" `
    -Message "Initial balance is 100000"


# ============================================================
# 5. GET XAUUSD MARKET PRICE
# ============================================================

Write-TestHeader "5. GET XAUUSD MARKET PRICE"

$market = Invoke-Api `
    -Method "Get" `
    -Url "$BaseUrl/market/price?symbol=XAUUSD"

$market | ConvertTo-Json -Depth 10

$marketData = $market.data

Assert-Equal `
    -Actual $marketData.symbol `
    -Expected "XAUUSD" `
    -Message "Market symbol is XAUUSD"

Assert-True `
    -Condition ([double]$marketData.bid -gt 0) `
    -Message "BID is greater than zero"

Assert-True `
    -Condition ([double]$marketData.ask -gt 0) `
    -Message "ASK is greater than zero"

Assert-True `
    -Condition ([double]$marketData.ask -ge [double]$marketData.bid) `
    -Message "ASK is greater than or equal to BID"

$initialBid = [double]$marketData.bid
$initialAsk = [double]$marketData.ask

Write-Info "Initial BID : $initialBid"
Write-Info "Initial ASK : $initialAsk"


# ============================================================
# 6. GET INITIAL PORTFOLIO
# ============================================================

Write-TestHeader "6. GET INITIAL PORTFOLIO"

$initialSummary = Invoke-Api `
    -Method "Get" `
    -Url "$BaseUrl/orders/portfolio/summary" `
    -Headers $headers

$initialSummary.data | ConvertTo-Json -Depth 10

Assert-Equal `
    -Actual $initialSummary.data.balance `
    -Expected "100000" `
    -Message "Initial balance is 100000"

Assert-Equal `
    -Actual $initialSummary.data.openPositions `
    -Expected 0 `
    -Message "Initial open positions is zero"

Assert-Equal `
    -Actual $initialSummary.data.openOrders `
    -Expected 0 `
    -Message "Initial open orders is zero"


# ============================================================
# 7. CREATE SELL MARKET ORDER
# ============================================================

Write-TestHeader "7. CREATE SELL MARKET ORDER"

$marketBeforeSell = Invoke-Api `
    -Method "Get" `
    -Url "$BaseUrl/market/price?symbol=XAUUSD"

$sellBid = [double]$marketBeforeSell.data.bid
$sellAsk = [double]$marketBeforeSell.data.ask

Write-Info "SELL BID : $sellBid"
Write-Info "SELL ASK : $sellAsk"

$sellOrder = Invoke-Api `
    -Method "Post" `
    -Url "$BaseUrl/orders" `
    -Headers $headers `
    -Body @{
        symbol = "XAUUSD"
        side = "SELL"
        type = "MARKET"
        quantity = $Quantity
    }

$sellOrder | ConvertTo-Json -Depth 10

Assert-True `
    -Condition ($null -ne $sellOrder.data) `
    -Message "SELL order created"

Assert-Equal `
    -Actual $sellOrder.data.order.side `
    -Expected "SELL" `
    -Message "Order side is SELL"

Assert-Equal `
    -Actual $sellOrder.data.order.status `
    -Expected "FILLED" `
    -Message "SELL order is FILLED"

$sellExecutedPrice = [double]$sellOrder.data.order.executedPrice

Assert-Equal `
    -Actual $sellExecutedPrice `
    -Expected $sellBid `
    -Message "SELL execution price uses BID"

Write-Info "SELL execution price : $sellExecutedPrice"


# ============================================================
# 8. PORTFOLIO AFTER SELL
# ============================================================

Write-TestHeader "8. PORTFOLIO AFTER SELL"

$afterSellSummary = Invoke-Api `
    -Method "Get" `
    -Url "$BaseUrl/orders/portfolio/summary" `
    -Headers $headers

$afterSellSummary.data | ConvertTo-Json -Depth 10

Assert-Equal `
    -Actual $afterSellSummary.data.openPositions `
    -Expected 1 `
    -Message "One open position exists after SELL"

Assert-True `
    -Condition ($afterSellSummary.data.positions.Count -eq 1) `
    -Message "Position list contains one position"

$shortPosition = $afterSellSummary.data.positions[0]

Assert-Equal `
    -Actual $shortPosition.symbol `
    -Expected "XAUUSD" `
    -Message "Position symbol is XAUUSD"

Assert-Equal `
    -Actual $shortPosition.side `
    -Expected "SHORT" `
    -Message "SELL creates SHORT position"

Assert-Equal `
    -Actual $shortPosition.quantity `
    -Expected "$Quantity" `
    -Message "SHORT quantity is correct"

$shortEntryPrice = [double]$shortPosition.averageEntryPrice

Assert-Equal `
    -Actual $shortEntryPrice `
    -Expected $sellBid `
    -Message "SHORT entry price uses BID"

Write-Info "SHORT entry price   : $shortEntryPrice"
Write-Info "SHORT current price : $($shortPosition.currentPrice)"
Write-Info "SHORT unrealized PnL: $($shortPosition.unrealizedPnl)"


# ============================================================
# 9. VALIDATE SHORT UNREALIZED PNL
# ============================================================

Write-TestHeader "9. VALIDATE SHORT UNREALIZED PNL"

# SHORT position is valued using ASK.
$shortCurrentAsk = [double]$shortPosition.currentPrice

$expectedShortPnl =
    ($shortEntryPrice - $shortCurrentAsk) * [double]$Quantity * 100

$actualShortPnl =
    [double]$shortPosition.unrealizedPnl

$roundedExpectedShortPnl =
    [math]::Round($expectedShortPnl, 2)

Assert-Equal `
    -Actual $actualShortPnl `
    -Expected $roundedExpectedShortPnl `
    -Message "SHORT unrealized PnL formula is correct"

$expectedShortEquity =
    [double]$afterSellSummary.data.balance + $actualShortPnl

$actualShortEquity =
    [double]$afterSellSummary.data.equity

$roundedExpectedShortEquity =
    [math]::Round($expectedShortEquity, 2)

Assert-Equal `
    -Actual $actualShortEquity `
    -Expected $roundedExpectedShortEquity `
    -Message "SHORT equity equals balance plus unrealized PnL"


# ============================================================
# 10. GET ORDERS
# ============================================================

Write-TestHeader "10. GET ORDERS"

$orders = Invoke-Api `
    -Method "Get" `
    -Url "$BaseUrl/orders" `
    -Headers $headers

$orders | ConvertTo-Json -Depth 10

Assert-True `
    -Condition ($null -ne $orders.data) `
    -Message "Orders endpoint returned data"

Assert-True `
    -Condition ($orders.data.items.Count -ge 1) `
    -Message "Orders contain SELL order"


# ============================================================
# 11. GET POSITIONS
# ============================================================

Write-TestHeader "11. GET POSITIONS"

$positions = Invoke-Api `
    -Method "Get" `
    -Url "$BaseUrl/orders/positions" `
    -Headers $headers

$positions | ConvertTo-Json -Depth 10

Assert-True `
    -Condition ($null -ne $positions.data) `
    -Message "Positions endpoint returned data"

Assert-True `
    -Condition ($positions.data.items.Count -ge 1) `
    -Message "Positions contain SHORT position"


# ============================================================
# 12. CLOSE SHORT POSITION
# ============================================================

Write-TestHeader "12. CLOSE SHORT POSITION"

$shortPositionId = $shortPosition.id

$marketBeforeClose = Invoke-Api `
    -Method "Get" `
    -Url "$BaseUrl/market/price?symbol=XAUUSD"

$closeBid = [double]$marketBeforeClose.data.bid
$closeAsk = [double]$marketBeforeClose.data.ask

Write-Info "Close BID : $closeBid"
Write-Info "Close ASK : $closeAsk"

$closeShort = Invoke-Api `
    -Method "Post" `
    -Url "$BaseUrl/orders/positions/$shortPositionId/close" `
    -Headers $headers `
    -Body @{}

$closeShort | ConvertTo-Json -Depth 10

Assert-True `
    -Condition ($null -ne $closeShort.data) `
    -Message "SHORT close request succeeded"

Assert-Equal `
    -Actual $closeShort.data.order.side `
    -Expected "BUY" `
    -Message "Closing SHORT creates BUY order"

Assert-Equal `
    -Actual $closeShort.data.order.status `
    -Expected "FILLED" `
    -Message "SHORT close order is FILLED"

$closeExecutedPrice =
    [double]$closeShort.data.order.executedPrice

Assert-Equal `
    -Actual $closeExecutedPrice `
    -Expected $closeAsk `
    -Message "SHORT close execution price uses ASK"


# ============================================================
# 13. VALIDATE SHORT REALIZED PNL
# ============================================================

Write-TestHeader "13. VALIDATE SHORT REALIZED PNL"

$actualRealizedPnl =
    [double]$closeShort.data.realizedPnl

$expectedRealizedPnl =
    ($shortEntryPrice - $closeAsk) * [double]$Quantity * 100

$roundedExpectedRealizedPnl =
    [math]::Round($expectedRealizedPnl, 2)

Assert-Equal `
    -Actual $actualRealizedPnl `
    -Expected $roundedExpectedRealizedPnl `
    -Message "SHORT realized PnL formula is correct"

Write-Info "SHORT entry price : $shortEntryPrice"
Write-Info "SHORT exit price  : $closeAsk"
Write-Info "Realized PnL      : $actualRealizedPnl"


# ============================================================
# 14. PORTFOLIO AFTER CLOSE SHORT
# ============================================================

Write-TestHeader "14. PORTFOLIO AFTER CLOSE SHORT"

$finalSummary = Invoke-Api `
    -Method "Get" `
    -Url "$BaseUrl/orders/portfolio/summary" `
    -Headers $headers

$finalSummary.data | ConvertTo-Json -Depth 10

Assert-Equal `
    -Actual $finalSummary.data.openPositions `
    -Expected 0 `
    -Message "Open positions is zero after CLOSE SHORT"

Assert-Equal `
    -Actual $finalSummary.data.unrealizedPnl `
    -Expected "0.00" `
    -Message "Unrealized PnL is zero after CLOSE SHORT"

Assert-True `
    -Condition ($null -ne $finalSummary.data.realizedPnl) `
    -Message "Realized PnL is available"

Write-Info "Final balance       : $($finalSummary.data.balance)"
Write-Info "Final equity        : $($finalSummary.data.equity)"
Write-Info "Final realized PnL  : $($finalSummary.data.realizedPnl)"


# ============================================================
# 15. VERIFY TRADE HISTORY
# ============================================================

Write-TestHeader "15. VERIFY TRADE HISTORY"

$trades = Invoke-Api `
    -Method "Get" `
    -Url "$BaseUrl/orders/trades" `
    -Headers $headers

$trades | ConvertTo-Json -Depth 10

Assert-True `
    -Condition ($null -ne $trades.data) `
    -Message "Trades endpoint returned data"

Assert-True `
    -Condition ($trades.data.items.Count -ge 1) `
    -Message "Trade history contains SHORT trade"

$shortTrade = $trades.data.items |
    Where-Object { $_.side -eq "BUY" } |
    Select-Object -Last 1

Assert-True `
    -Condition ($null -ne $shortTrade) `
    -Message "SHORT closing trade exists"

Assert-Equal `
    -Actual $shortTrade.exitPrice `
    -Expected "$closeAsk" `
    -Message "SHORT trade exit price uses ASK"


# ============================================================
# 16. VERIFY CLOSED SHORT POSITION
# ============================================================

Write-TestHeader "16. VERIFY CLOSED SHORT POSITION"

$finalPositions = Invoke-Api `
    -Method "Get" `
    -Url "$BaseUrl/orders/positions" `
    -Headers $headers

$finalPositions | ConvertTo-Json -Depth 10

Assert-True `
    -Condition ($null -ne $finalPositions.data) `
    -Message "Final positions endpoint returned data"

$closedShort = $finalPositions.data.items |
    Where-Object { $_.side -eq "SHORT" } |
    Select-Object -First 1

Assert-True `
    -Condition ($null -ne $closedShort) `
    -Message "Closed SHORT position exists"

Assert-Equal `
    -Actual $closedShort.status `
    -Expected "CLOSED" `
    -Message "SHORT position status is CLOSED"


# ============================================================
# 17. FINAL RESULT
# ============================================================

Write-TestHeader "SELL TEST COMPLETED SUCCESSFULLY"

Write-Host "User: $UserEmail" -ForegroundColor Green

Write-Host ""
Write-Host "REGISTER / LOGIN : PASS" -ForegroundColor Green
Write-Host "DEMO ACCOUNT     : PASS" -ForegroundColor Green
Write-Host "MARKET DATA      : PASS" -ForegroundColor Green
Write-Host "SELL MARKET      : PASS" -ForegroundColor Green
Write-Host "SHORT POSITION   : PASS" -ForegroundColor Green
Write-Host "SHORT PnL        : PASS" -ForegroundColor Green
Write-Host "CLOSE SHORT      : PASS" -ForegroundColor Green
Write-Host "REALIZED PnL     : PASS" -ForegroundColor Green
Write-Host "TRADE HISTORY    : PASS" -ForegroundColor Green

Write-Host ""
Write-Host "============================================================"
Write-Host "ALL SELL INTEGRATION TESTS PASSED" -ForegroundColor Green
Write-Host "============================================================"
