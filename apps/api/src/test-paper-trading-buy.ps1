# ============================================================
# Paper Trading MVP - Integration Test
# XAUUSD / Demo Account / Market Order
# ============================================================

$ErrorActionPreference = "Stop"

# ------------------------------------------------------------
# Configuration
# ------------------------------------------------------------

$BaseUrl = "http://localhost:4000/api/v1"
$Password = "Test@123456"
$Quantity = "1"

$timestamp = Get-Date -Format "yyyyMMddHHmmssfff"

$UserAEmail = "portfolio-test-a-$timestamp@example.com"
$UserBEmail = "portfolio-test-b-$timestamp@example.com"

# ------------------------------------------------------------
# Helper functions
# ------------------------------------------------------------

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
    Uri = $Url
    Method = $Method
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
    Write-Host "[FAIL] Request failed:" -ForegroundColor Red
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

  if ("$Actual" -ne "$Expected") {
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

# ------------------------------------------------------------
# 1. Print test information
# ------------------------------------------------------------

Write-TestHeader "1. TEST INFORMATION"

Write-Info "Base URL: $BaseUrl"
Write-Info "User A:   $UserAEmail"
Write-Info "User B:   $UserBEmail"
Write-Info "Quantity: $Quantity"

# ------------------------------------------------------------
# 2. Register User A
# ------------------------------------------------------------

Write-TestHeader "2. REGISTER USER A"

$registerA = Invoke-Api `
  -Method "Post" `
  -Url "$BaseUrl/auth/register" `
  -Body @{
    email = $UserAEmail
    password = $Password
  }

$registerA | ConvertTo-Json -Depth 10

Write-Success "User A registered"

# ------------------------------------------------------------
# 3. Register User B
# ------------------------------------------------------------

Write-TestHeader "3. REGISTER USER B"

$registerB = Invoke-Api `
  -Method "Post" `
  -Url "$BaseUrl/auth/register" `
  -Body @{
    email = $UserBEmail
    password = $Password
  }

$registerB | ConvertTo-Json -Depth 10

Write-Success "User B registered"

# ------------------------------------------------------------
# 4. Login User A
# ------------------------------------------------------------

Write-TestHeader "4. LOGIN USER A"

$loginA = Invoke-Api `
  -Method "Post" `
  -Url "$BaseUrl/auth/login" `
  -Body @{
    email = $UserAEmail
    password = $Password
  }

$tokenA = $loginA.data.accessToken

Assert-True `
  -Condition (-not [string]::IsNullOrWhiteSpace($tokenA)) `
  -Message "User A access token received"

$headersA = @{
  Authorization = "Bearer $tokenA"
}

# ------------------------------------------------------------
# 5. Login User B
# ------------------------------------------------------------

Write-TestHeader "5. LOGIN USER B"

$loginB = Invoke-Api `
  -Method "Post" `
  -Url "$BaseUrl/auth/login" `
  -Body @{
    email = $UserBEmail
    password = $Password
  }

$tokenB = $loginB.data.accessToken

Assert-True `
  -Condition (-not [string]::IsNullOrWhiteSpace($tokenB)) `
  -Message "User B access token received"

$headersB = @{
  Authorization = "Bearer $tokenB"
}

# ------------------------------------------------------------
# 6. Create Demo Account for User A
# ------------------------------------------------------------

Write-TestHeader "6. CREATE DEMO ACCOUNT FOR USER A"

$accountA = Invoke-Api `
  -Method "Post" `
  -Url "$BaseUrl/accounts/demo" `
  -Headers $headersA `
  -Body @{}

$accountA | ConvertTo-Json -Depth 10

Assert-True `
  -Condition ($null -ne $accountA.data) `
  -Message "User A demo account created"

# ------------------------------------------------------------
# 7. Create Demo Account for User B
# ------------------------------------------------------------

Write-TestHeader "7. CREATE DEMO ACCOUNT FOR USER B"

$accountB = Invoke-Api `
  -Method "Post" `
  -Url "$BaseUrl/accounts/demo" `
  -Headers $headersB `
  -Body @{}

$accountB | ConvertTo-Json -Depth 10

Assert-True `
  -Condition ($null -ne $accountB.data) `
  -Message "User B demo account created"

# ------------------------------------------------------------
# 8. Get market price
# ------------------------------------------------------------

Write-TestHeader "8. GET XAUUSD MARKET PRICE"

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

$initialAsk = [double]$marketData.ask
$initialBid = [double]$marketData.bid

Write-Info "Initial BID: $initialBid"
Write-Info "Initial ASK: $initialAsk"

# ------------------------------------------------------------
# 9. Get initial portfolio summary
# ------------------------------------------------------------

Write-TestHeader "9. GET INITIAL PORTFOLIO SUMMARY"

$initialSummary = Invoke-Api `
  -Method "Get" `
  -Url "$BaseUrl/orders/portfolio/summary" `
  -Headers $headersA

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

# ------------------------------------------------------------
# 10. Create BUY MARKET order
# ------------------------------------------------------------

Write-TestHeader "10. CREATE BUY MARKET ORDER"

$buyOrder = Invoke-Api `
  -Method "Post" `
  -Url "$BaseUrl/orders" `
  -Headers $headersA `
  -Body @{
    symbol = "XAUUSD"
    side = "BUY"
    type = "MARKET"
    quantity = $Quantity
  }

$buyOrder | ConvertTo-Json -Depth 10

Assert-True `
  -Condition ($null -ne $buyOrder.data) `
  -Message "BUY order created"

# ------------------------------------------------------------
# 11. Get portfolio after BUY
# ------------------------------------------------------------

Write-TestHeader "11. PORTFOLIO AFTER BUY"

$afterBuySummary = Invoke-Api `
  -Method "Get" `
  -Url "$BaseUrl/orders/portfolio/summary" `
  -Headers $headersA

$afterBuySummary.data | ConvertTo-Json -Depth 10

Assert-Equal `
  -Actual $afterBuySummary.data.openPositions `
  -Expected 1 `
  -Message "One open position exists after BUY"

Assert-True `
  -Condition ($afterBuySummary.data.positions.Count -eq 1) `
  -Message "Position list contains one position"

$position = $afterBuySummary.data.positions[0]

Assert-Equal `
  -Actual $position.symbol `
  -Expected "XAUUSD" `
  -Message "Position symbol is XAUUSD"

Assert-Equal `
  -Actual $position.side `
  -Expected "LONG" `
  -Message "BUY creates LONG position"

Assert-Equal `
  -Actual $position.quantity `
  -Expected "$Quantity" `
  -Message "Position quantity is correct"

$entryPrice = [double]$position.averageEntryPrice

Assert-Equal `
  -Actual $entryPrice `
  -Expected $initialAsk `
  -Message "LONG entry price uses ASK"

Write-Info "Entry price: $entryPrice"
Write-Info "Current price: $($position.currentPrice)"
Write-Info "Unrealized PnL: $($position.unrealizedPnl)"

# ------------------------------------------------------------
# 12. Validate LONG unrealized PnL
# ------------------------------------------------------------

Write-TestHeader "12. VALIDATE LONG UNREALIZED PNL"

$currentBid = [double]$position.currentPrice
$expectedLongPnl = ($currentBid - $entryPrice) * $Quantity
$actualLongPnl = [double]$position.unrealizedPnl

$roundedExpectedLongPnl = [math]::Round($expectedLongPnl, 2)

Assert-Equal `
  -Actual $actualLongPnl `
  -Expected $roundedExpectedLongPnl `
  -Message "LONG unrealized PnL formula is correct"

$expectedEquity = [double]$afterBuySummary.data.balance + $actualLongPnl
$actualEquity = [double]$afterBuySummary.data.equity

$roundedExpectedEquity = [math]::Round($expectedEquity, 2)

Assert-Equal `
  -Actual $actualEquity `
  -Expected $roundedExpectedEquity `
  -Message "Equity equals balance plus unrealized PnL"

# ------------------------------------------------------------
# 13. Get orders
# ------------------------------------------------------------

Write-TestHeader "13. GET ORDERS"

$orders = Invoke-Api `
  -Method "Get" `
  -Url "$BaseUrl/orders" `
  -Headers $headersA

$orders | ConvertTo-Json -Depth 10

Assert-True `
  -Condition ($null -ne $orders.data) `
  -Message "Orders endpoint returned data"

# ------------------------------------------------------------
# 14. Get positions
# ------------------------------------------------------------

Write-TestHeader "14. GET POSITIONS"

$positions = Invoke-Api `
  -Method "Get" `
  -Url "$BaseUrl/orders/positions" `
  -Headers $headersA

$positions | ConvertTo-Json -Depth 10

Assert-True `
  -Condition ($null -ne $positions.data) `
  -Message "Positions endpoint returned data"

# ------------------------------------------------------------
# 15. Close LONG position
# ------------------------------------------------------------

Write-TestHeader "15. CLOSE LONG POSITION"

$positionId = $position.id

$closePosition = Invoke-Api `
  -Method "Post" `
  -Url "$BaseUrl/orders/positions/$positionId/close" `
  -Headers $headersA `
  -Body @{}

$closePosition | ConvertTo-Json -Depth 10

Assert-True `
  -Condition ($null -ne $closePosition.data) `
  -Message "Position close request succeeded"

# ------------------------------------------------------------
# 16. Get portfolio after CLOSE
# ------------------------------------------------------------

Write-TestHeader "16. PORTFOLIO AFTER CLOSE"

$afterCloseSummary = Invoke-Api `
  -Method "Get" `
  -Url "$BaseUrl/orders/portfolio/summary" `
  -Headers $headersA

$afterCloseSummary.data | ConvertTo-Json -Depth 10

Assert-Equal `
  -Actual $afterCloseSummary.data.openPositions `
  -Expected 0 `
  -Message "Open positions is zero after CLOSE"

Assert-Equal `
  -Actual $afterCloseSummary.data.unrealizedPnl `
  -Expected "0.00" `
  -Message "Unrealized PnL is zero after CLOSE"

Assert-True `
  -Condition ($null -ne $afterCloseSummary.data.realizedPnl) `
  -Message "Realized PnL is available after CLOSE"

Write-Info "Final balance: $($afterCloseSummary.data.balance)"
Write-Info "Realized PnL: $($afterCloseSummary.data.realizedPnl)"
Write-Info "Equity: $($afterCloseSummary.data.equity)"

# ------------------------------------------------------------
# 17. Get trades
# ------------------------------------------------------------

Write-TestHeader "17. GET TRADES"

$trades = Invoke-Api `
  -Method "Get" `
  -Url "$BaseUrl/orders/trades" `
  -Headers $headersA

$trades | ConvertTo-Json -Depth 10

Assert-True `
  -Condition ($null -ne $trades.data) `
  -Message "Trades endpoint returned data"

# ------------------------------------------------------------
# 18. Verify User B isolation
# ------------------------------------------------------------

Write-TestHeader "18. VERIFY USER DATA ISOLATION"

$userBSummary = Invoke-Api `
  -Method "Get" `
  -Url "$BaseUrl/orders/portfolio/summary" `
  -Headers $headersB

$userBSummary.data | ConvertTo-Json -Depth 10

Assert-Equal `
  -Actual $userBSummary.data.openPositions `
  -Expected 0 `
  -Message "User B has no positions from User A"

Assert-Equal `
  -Actual $userBSummary.data.balance `
  -Expected "100000" `
  -Message "User B balance remains 100000"

# ------------------------------------------------------------
# 19. Final result
# ------------------------------------------------------------

Write-TestHeader "TEST COMPLETED SUCCESSFULLY"

Write-Host "User A: $UserAEmail" -ForegroundColor Green
Write-Host "User B: $UserBEmail" -ForegroundColor Green
Write-Host "Account A: $($accountA.data.accountNumber)" -ForegroundColor Green
Write-Host "Account B: $($accountB.data.accountNumber)" -ForegroundColor Green
Write-Host ""
Write-Host "All integration tests passed." -ForegroundColor Green
