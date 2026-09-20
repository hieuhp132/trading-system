$ErrorActionPreference = "Continue"

# ============================================================
# FINAL REGRESSION TEST
# Paper Trading MVP - XAUUSD
# ============================================================

$BaseUrl = "http://localhost:4000/api/v1"

$Email = "demo-user-2@example.com"
$Password = "demo-user@123456"

$Passed = 0
$Failed = 0
$Skipped = 0

$AccessToken = $null

$LongPositionId = $null
$ShortPositionId = $null

$FirstBuyOrderId = $null
$SecondBuyOrderId = $null
$SellOrderId = $null

$InitialBalance = $null
$FinalBalance = $null

# ============================================================
# OUTPUT HELPERS
# ============================================================

function Write-Test {
    param(
        [string]$Name
    )

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor DarkGray
    Write-Host $Name -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor DarkGray
}

function Pass {
    param(
        [string]$Message
    )

    $script:Passed++

    Write-Host "[PASS] $Message" -ForegroundColor Green
}

function Fail {
    param(
        [string]$Message
    )

    $script:Failed++

    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Skip {
    param(
        [string]$Message
    )

    $script:Skipped++

    Write-Host "[SKIP] $Message" -ForegroundColor Yellow
}

function Show-Json {
    param(
        $Data
    )

    if ($null -eq $Data) {
        return
    }

    try {
        $Data | ConvertTo-Json -Depth 20
    }
    catch {
        Write-Host $Data
    }
}

# ============================================================
# API HELPER
# Compatible with Windows PowerShell 5.1
# ============================================================

function Invoke-Api {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("GET", "POST", "PUT", "PATCH", "DELETE")]
        [string]$Method,

        [Parameter(Mandatory = $true)]
        [string]$Url,

        $Body = $null,

        [hashtable]$Headers = @{}
    )

    $requestHeaders = @{}

    foreach ($key in $Headers.Keys) {
        $requestHeaders[$key] = $Headers[$key]
    }

    $jsonBody = $null

    if ($null -ne $Body) {
        $jsonBody = $Body | ConvertTo-Json -Depth 20
    }

    try {
        $params = @{
            Method      = $Method
            Uri         = $Url
            Headers     = $requestHeaders
            ErrorAction = "Stop"
        }

        if ($null -ne $jsonBody) {
            $params["ContentType"] = "application/json"
            $params["Body"] = $jsonBody
        }

        $response = Invoke-WebRequest @params

        $parsedBody = $null

        if ($response.Content) {
            try {
                $parsedBody = $response.Content | ConvertFrom-Json
            }
            catch {
                $parsedBody = $response.Content
            }
        }

        return [PSCustomObject]@{
            Success    = $true
            StatusCode = [int]$response.StatusCode
            Body       = $parsedBody
            RawBody    = $response.Content
            Error      = $null
        }
    }
    catch {
        $statusCode = 0
        $rawBody = $null
        $parsedBody = $null

        if ($null -ne $_.Exception.Response) {
            try {
                $statusCode = [int]$_.Exception.Response.StatusCode
            }
            catch {
                $statusCode = 0
            }

            try {
                $stream = $_.Exception.Response.GetResponseStream()

                if ($null -ne $stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $rawBody = $reader.ReadToEnd()
                    $reader.Close()

                    if ($rawBody) {
                        try {
                            $parsedBody = $rawBody | ConvertFrom-Json
                        }
                        catch {
                            $parsedBody = $rawBody
                        }
                    }
                }
            }
            catch {
                $rawBody = $null
            }
        }

        return [PSCustomObject]@{
            Success    = $false
            StatusCode = $statusCode
            Body       = $parsedBody
            RawBody    = $rawBody
            Error      = $_.Exception.Message
        }
    }
}

function Get-AuthHeaders {
    return @{
        Authorization = "Bearer $AccessToken"
    }
}

function Assert-Status {
    param(
        [string]$Name,
        $Response,
        [int]$Expected
    )

    if ($Response.StatusCode -eq $Expected) {
        Pass "$Name -> HTTP $($Response.StatusCode)"
        return $true
    }

    Fail "$Name -> expected HTTP $Expected, received HTTP $($Response.StatusCode)"

    if ($Response.Body) {
        Write-Host "Response:" -ForegroundColor Yellow
        Show-Json $Response.Body
    }
    elseif ($Response.RawBody) {
        Write-Host "Response:" -ForegroundColor Yellow
        Write-Host $Response.RawBody
    }
    elseif ($Response.Error) {
        Write-Host "Error: $($Response.Error)" -ForegroundColor Yellow
    }

    return $false
}

function Get-Data {
    param(
        $Response
    )

    if ($null -eq $Response) {
        return $null
    }

    if ($null -ne $Response.Body -and $null -ne $Response.Body.data) {
        return $Response.Body.data
    }

    return $Response.Body
}

function Get-PropertyValue {
    param(
        $Object,
        [string]$Name
    )

    if ($null -eq $Object) {
        return $null
    }

    $property = $Object.PSObject.Properties[$Name]

    if ($null -ne $property) {
        return $property.Value
    }

    return $null
}

# ============================================================
# 01. SERVER
# ============================================================

Write-Test "01. SERVER HEALTH"

$health = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/health"

Assert-Status `
    -Name "GET /health" `
    -Response $health `
    -Expected 200 | Out-Null

# ============================================================
# 02. LOGIN
# ============================================================

Write-Test "02. AUTHENTICATION"

$loginBody = @{
    email    = $Email
    password = $Password
}

$login = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/auth/login" `
    -Body $loginBody

if (Assert-Status "POST /auth/login" $login 200) {
    $loginData = Get-Data $login

    $AccessToken = Get-PropertyValue $loginData "accessToken"

    if ($AccessToken) {
        Pass "Access token received"
    }
    else {
        Fail "Access token missing"
    }
}

if (-not $AccessToken) {
    Write-Host ""
    Write-Host "Cannot continue without access token." -ForegroundColor Red
    Write-Host "Final regression aborted." -ForegroundColor Red
    exit 1
}

$AuthHeaders = Get-AuthHeaders

# ============================================================
# 03. AUTH / ME
# ============================================================

Write-Test "03. AUTH / ME"

$me = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/auth/me" `
    -Headers $AuthHeaders

Assert-Status `
    -Name "GET /auth/me" `
    -Response $me `
    -Expected 200 | Out-Null

# ============================================================
# 04. ACCOUNT
# ============================================================

<#
Write-Test "04. DEMO ACCOUNT"

$accounts = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/accounts" `
    -Headers $AuthHeaders

Assert-Status `
    -Name "GET /accounts" `
    -Response $accounts `
    -Expected 200 | Out-Null

$demoAccount = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/accounts/demo" `
    -Headers $AuthHeaders

Assert-Status `
    -Name "GET /accounts/demo" `
    -Response $demoAccount `
    -Expected 200 | Out-Null
#>

$balanceResponse = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/accounts/balance" `
    -Headers $AuthHeaders

if (Assert-Status "GET /accounts/balance" $balanceResponse 200) {
    $balanceData = Get-Data $balanceResponse

    $InitialBalance = Get-PropertyValue $balanceData "balance"

    Write-Host "Initial balance: $InitialBalance"
}

# ============================================================
# 05. MARKET
# ============================================================

Write-Test "05. XAUUSD MARKET"

$market = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/market/price?symbol=XAUUSD"

if (Assert-Status "GET /market/price?symbol=XAUUSD" $market 200) {
    $marketData = Get-Data $market

    Write-Host "Market price:"
    Show-Json $marketData
}

# ============================================================
# 06. ORDERS INITIAL
# ============================================================

Write-Test "06. INITIAL ORDERS"

$ordersBefore = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders" `
    -Headers $AuthHeaders

Assert-Status `
    -Name "GET /orders" `
    -Response $ordersBefore `
    -Expected 200 | Out-Null

# ============================================================
# 07. POSITIONS INITIAL
# ============================================================

Write-Test "07. INITIAL POSITIONS"

$positionsBefore = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/positions" `
    -Headers $AuthHeaders

Assert-Status `
    -Name "GET /orders/positions" `
    -Response $positionsBefore `
    -Expected 200 | Out-Null

# ============================================================
# 08. TRADES INITIAL
# ============================================================

Write-Test "08. INITIAL TRADES"

$tradesBefore = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/trades" `
    -Headers $AuthHeaders

Assert-Status `
    -Name "GET /orders/trades" `
    -Response $tradesBefore `
    -Expected 200 | Out-Null

# ============================================================
# 09. PORTFOLIO INITIAL
# ============================================================

Write-Test "09. INITIAL PORTFOLIO"

$portfolioBefore = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/portfolio/summary" `
    -Headers $AuthHeaders

Assert-Status `
    -Name "GET /orders/portfolio/summary" `
    -Response $portfolioBefore `
    -Expected 200 | Out-Null

# ============================================================
# 10. BUY 1
# ============================================================

Write-Test "10. BUY MARKET -> LONG"

$buyBody1 = @{
    symbol    = "XAUUSD"
    side      = "BUY"
    orderType = "MARKET"
    quantity  = "1"
}

$buy1 = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/orders" `
    -Body $buyBody1 `
    -Headers $AuthHeaders

if (Assert-Status "POST /orders BUY 1" $buy1 201) {
    $buy1Data = Get-Data $buy1

    $FirstBuyOrderId = Get-PropertyValue `
        (Get-PropertyValue $buy1Data "order") `
        "id"

    $buy1Position = Get-PropertyValue $buy1Data "position"

    if ($null -ne $buy1Position) {
        $LongPositionId = Get-PropertyValue $buy1Position "id"

        $positionSide = Get-PropertyValue $buy1Position "side"

        if ($positionSide -eq "LONG") {
            Pass "BUY created LONG position"
        }
        else {
            Fail "BUY should create LONG, received $positionSide"
        }
    }
    else {
        Fail "BUY response did not contain position"
    }
}

# ============================================================
# 11. VERIFY LONG
# ============================================================

Write-Test "11. VERIFY LONG POSITION"

$positionsAfterBuy1 = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/positions" `
    -Headers $AuthHeaders

if (Assert-Status "GET /orders/positions after BUY" $positionsAfterBuy1 200) {
    $positionData = Get-Data $positionsAfterBuy1
    $positionItems = Get-PropertyValue $positionData "items"

    $openLong = @(
        $positionItems | Where-Object {
            $_.side -eq "LONG" -and $_.status -eq "OPEN"
        }
    )

    if ($openLong.Count -ge 1) {
        Pass "OPEN LONG position exists"

        $LongPositionId = $openLong[0].id

        Write-Host "LONG position:"
        Show-Json $openLong[0]
    }
    else {
        Fail "OPEN LONG position not found"
    }
}

# ============================================================
# 12. BUY 2
# ============================================================

Write-Test "12. BUY MARKET -> INCREASE LONG"

$buyBody2 = @{
    symbol    = "XAUUSD"
    side      = "BUY"
    orderType = "MARKET"
    quantity  = "2"
}

$buy2 = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/orders" `
    -Body $buyBody2 `
    -Headers $AuthHeaders

if (Assert-Status "POST /orders BUY 2" $buy2 201) {
    $buy2Data = Get-Data $buy2

    $SecondBuyOrderId = Get-PropertyValue `
        (Get-PropertyValue $buy2Data "order") `
        "id"

    $buy2Position = Get-PropertyValue $buy2Data "position"

    if ($null -ne $buy2Position) {
        $quantity = [decimal](Get-PropertyValue $buy2Position "quantity")
        $side = Get-PropertyValue $buy2Position "side"

        if ($side -eq "LONG") {
            Pass "Second BUY kept LONG direction"
        }
        else {
            Fail "Second BUY returned unexpected side: $side"
        }

        if ($quantity -eq 3) {
            Pass "LONG quantity aggregated correctly: 1 + 2 = 3"
        }
        else {
            Fail "Expected LONG quantity 3, received $quantity"
        }
    }
}

# ============================================================
# 13. SELL 1 -> SHORT
# ============================================================

Write-Test "13. SELL MARKET -> SHORT"

$sellBody = @{
    symbol    = "XAUUSD"
    side      = "SELL"
    orderType = "MARKET"
    quantity  = "1"
}

$sell = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/orders" `
    -Body $sellBody `
    -Headers $AuthHeaders

if (Assert-Status "POST /orders SELL 1" $sell 201) {
    $sellData = Get-Data $sell

    $SellOrderId = Get-PropertyValue `
        (Get-PropertyValue $sellData "order") `
        "id"

    $sellPosition = Get-PropertyValue $sellData "position"

    if ($null -ne $sellPosition) {
        $ShortPositionId = Get-PropertyValue $sellPosition "id"

        $side = Get-PropertyValue $sellPosition "side"

        if ($side -eq "SHORT") {
            Pass "SELL created SHORT position"
        }
        else {
            Fail "SELL should create SHORT, received $side"
        }
    }
}

# ============================================================
# 14. VERIFY LONG + SHORT
# ============================================================

Write-Test "14. VERIFY LONG + SHORT"

$positionsAfterSell = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/positions" `
    -Headers $AuthHeaders

if (Assert-Status "GET /orders/positions after SELL" $positionsAfterSell 200) {
    $positionData = Get-Data $positionsAfterSell
    $positionItems = @(Get-PropertyValue $positionData "items")

    $openLong = @(
        $positionItems | Where-Object {
            $_.side -eq "LONG" -and $_.status -eq "OPEN"
        }
    )

    $openShort = @(
        $positionItems | Where-Object {
            $_.side -eq "SHORT" -and $_.status -eq "OPEN"
        }
    )

    if ($openLong.Count -ge 1) {
        Pass "OPEN LONG exists"

        $LongPositionId = $openLong[0].id
    }
    else {
        Fail "OPEN LONG not found"
    }

    if ($openShort.Count -ge 1) {
        Pass "OPEN SHORT exists"

        $ShortPositionId = $openShort[0].id
    }
    else {
        Fail "OPEN SHORT not found"
    }

    Write-Host ""
    Write-Host "OPEN POSITIONS:" -ForegroundColor Cyan

    foreach ($position in @($openLong + $openShort)) {
        Show-Json $position
    }
}

# ============================================================
# 15. PORTFOLIO
# ============================================================

Write-Test "15. PORTFOLIO SUMMARY"

$portfolio = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/portfolio/summary" `
    -Headers $AuthHeaders

if (Assert-Status "GET /orders/portfolio/summary" $portfolio 200) {
    $portfolioData = Get-Data $portfolio

    Write-Host "Portfolio:"
    Show-Json $portfolioData

    $openPositionsCount = Get-PropertyValue $portfolioData "openPositions"

    if ([int]$openPositionsCount -ge 2) {
        Pass "Portfolio reports at least 2 open positions"
    }
    else {
        Fail "Portfolio expected at least 2 open positions, received $openPositionsCount"
    }
}

# ============================================================
# 16. ORDER HISTORY
# ============================================================

Write-Test "16. ORDER HISTORY"

$orders = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders" `
    -Headers $AuthHeaders

if (Assert-Status "GET /orders" $orders 200) {
    $ordersData = Get-Data $orders
    $orderItems = @(Get-PropertyValue $ordersData "items")

    $buyCount = @(
        $orderItems | Where-Object {
            $_.side -eq "BUY"
        }
    ).Count

    $sellCount = @(
        $orderItems | Where-Object {
            $_.side -eq "SELL"
        }
    ).Count

    if ($buyCount -ge 2) {
        Pass "Order history contains BUY orders"
    }
    else {
        Fail "Expected at least 2 BUY orders"
    }

    if ($sellCount -ge 1) {
        Pass "Order history contains SELL order"
    }
    else {
        Fail "Expected at least 1 SELL order"
    }
}

# ============================================================
# 17. TRADE HISTORY
# ============================================================

Write-Test "17. TRADE HISTORY"

$trades = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/trades" `
    -Headers $AuthHeaders

if (Assert-Status "GET /orders/trades" $trades 200) {
    $tradesData = Get-Data $trades
    $tradeItems = @(Get-PropertyValue $tradesData "items")

    if ($tradeItems.Count -ge 3) {
        Pass "Trade history contains opening trades"
    }
    else {
        Fail "Expected at least 3 trades before closing positions"
    }
}

# ============================================================
# 18. CLOSE LONG
# ============================================================

Write-Test "18. CLOSE LONG"

if ($LongPositionId) {
    $closeLong = Invoke-Api `
        -Method "POST" `
        -Url "$BaseUrl/orders/positions/$LongPositionId/close" `
        -Headers $AuthHeaders

    if (Assert-Status "POST close LONG" $closeLong 200) {
        $closeLongData = Get-Data $closeLong

        $closedPosition = Get-PropertyValue $closeLongData "position"

        if ($null -ne $closedPosition) {
            $status = Get-PropertyValue $closedPosition "status"

            if ($status -eq "CLOSED") {
                Pass "LONG position closed"
            }
            else {
                Fail "LONG close returned status $status"
            }
        }

        $realized = Get-PropertyValue $closeLongData "realizedPnl"

        Write-Host "LONG realized P&L: $realized"
    }
}
else {
    Skip "LONG position ID unavailable"
}

# ============================================================
# 19. CLOSE SHORT
# ============================================================

Write-Test "19. CLOSE SHORT"

if ($ShortPositionId) {
    $closeShort = Invoke-Api `
        -Method "POST" `
        -Url "$BaseUrl/orders/positions/$ShortPositionId/close" `
        -Headers $AuthHeaders

    if (Assert-Status "POST close SHORT" $closeShort 200) {
        $closeShortData = Get-Data $closeShort

        $closedPosition = Get-PropertyValue $closeShortData "position"

        if ($null -ne $closedPosition) {
            $status = Get-PropertyValue $closedPosition "status"

            if ($status -eq "CLOSED") {
                Pass "SHORT position closed"
            }
            else {
                Fail "SHORT close returned status $status"
            }
        }

        $realized = Get-PropertyValue $closeShortData "realizedPnl"

        Write-Host "SHORT realized P&L: $realized"
    }
}
else {
    Skip "SHORT position ID unavailable"
}

# ============================================================
# 20. FINAL POSITIONS
# ============================================================

Write-Test "20. FINAL POSITIONS"

$finalPositions = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/positions" `
    -Headers $AuthHeaders

if (Assert-Status "GET final positions" $finalPositions 200) {
    $finalPositionData = Get-Data $finalPositions
    $finalItems = @(Get-PropertyValue $finalPositionData "items")

    $openFinal = @(
        $finalItems | Where-Object {
            $_.status -eq "OPEN"
        }
    )

    $closedFinal = @(
        $finalItems | Where-Object {
            $_.status -eq "CLOSED"
        }
    )

    if ($openFinal.Count -eq 0) {
        Pass "No OPEN positions remain"
    }
    else {
        Fail "Expected 0 OPEN positions, found $($openFinal.Count)"
    }

    if ($closedFinal.Count -ge 2) {
        Pass "Closed LONG + SHORT positions exist"
    }
    else {
        Fail "Expected at least 2 CLOSED positions"
    }

    Write-Host ""
    Write-Host "FINAL POSITIONS:" -ForegroundColor Cyan

    foreach ($position in $finalItems) {
        Show-Json $position
    }
}

# ============================================================
# 21. FINAL TRADES
# ============================================================

Write-Test "21. FINAL TRADES"

$finalTrades = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/trades" `
    -Headers $AuthHeaders

if (Assert-Status "GET final trades" $finalTrades 200) {
    $finalTradesData = Get-Data $finalTrades
    $finalTradeItems = @(Get-PropertyValue $finalTradesData "items")

    if ($finalTradeItems.Count -ge 5) {
        Pass "Opening + closing trades recorded"
    }
    else {
        Fail "Expected at least 5 trades, found $($finalTradeItems.Count)"
    }
}

# ============================================================
# 22. FINAL PORTFOLIO
# ============================================================

Write-Test "22. FINAL PORTFOLIO"

$finalPortfolio = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders/portfolio/summary" `
    -Headers $AuthHeaders

if (Assert-Status "GET final portfolio" $finalPortfolio 200) {
    $finalPortfolioData = Get-Data $finalPortfolio

    Write-Host "FINAL PORTFOLIO:"
    Show-Json $finalPortfolioData

    $finalOpenPositions = Get-PropertyValue `
        $finalPortfolioData `
        "openPositions"

    if ([int]$finalOpenPositions -eq 0) {
        Pass "Final portfolio has 0 open positions"
    }
    else {
        Fail "Final portfolio still has $finalOpenPositions open positions"
    }
}

# ============================================================
# 23. FINAL BALANCE
# ============================================================

Write-Test "23. FINAL ACCOUNT"

$finalBalanceResponse = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/accounts/balance" `
    -Headers $AuthHeaders

if (Assert-Status "GET final account balance" $finalBalanceResponse 200) {
    $finalBalanceData = Get-Data $finalBalanceResponse

    $FinalBalance = Get-PropertyValue `
        $finalBalanceData `
        "balance"

    $finalEquity = Get-PropertyValue `
        $finalBalanceData `
        "equity"

    $finalUnrealized = Get-PropertyValue `
        $finalBalanceData `
        "unrealizedPnl"

    Write-Host "Final balance: $FinalBalance"
    Write-Host "Final equity: $finalEquity"
    Write-Host "Final unrealized P&L: $finalUnrealized"
}

# ============================================================
# 24. ERROR CASES
# ============================================================

Write-Test "24. ERROR CASES"

# Invalid symbol

$invalidSymbol = @{
    symbol    = "BTCUSD"
    side      = "BUY"
    orderType = "MARKET"
    quantity  = "1"
}

$response = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/orders" `
    -Body $invalidSymbol `
    -Headers $AuthHeaders

Assert-Status `
    -Name "Invalid symbol" `
    -Response $response `
    -Expected 400 | Out-Null

# Invalid quantity

$invalidQuantity = @{
    symbol    = "XAUUSD"
    side      = "BUY"
    orderType = "MARKET"
    quantity  = "0"
}

$response = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/orders" `
    -Body $invalidQuantity `
    -Headers $AuthHeaders

Assert-Status `
    -Name "Invalid quantity" `
    -Response $response `
    -Expected 400 | Out-Null

# Invalid side

$invalidSide = @{
    symbol    = "XAUUSD"
    side      = "HOLD"
    orderType = "MARKET"
    quantity  = "1"
}

$response = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/orders" `
    -Body $invalidSide `
    -Headers $AuthHeaders

Assert-Status `
    -Name "Invalid side" `
    -Response $response `
    -Expected 400 | Out-Null

# Unsupported order type

$invalidOrderType = @{
    symbol    = "XAUUSD"
    side      = "BUY"
    orderType = "LIMIT"
    quantity  = "1"
}

$response = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/orders" `
    -Body $invalidOrderType `
    -Headers $AuthHeaders

Assert-Status `
    -Name "Unsupported order type" `
    -Response $response `
    -Expected 400 | Out-Null

# Unauthenticated

$response = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/orders"

Assert-Status `
    -Name "Unauthenticated GET /orders" `
    -Response $response `
    -Expected 401 | Out-Null

# ============================================================
# FINAL RESULT
# ============================================================

Write-Host ""
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "FINAL REGRESSION RESULT" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "PASS : $Passed" -ForegroundColor Green
Write-Host "FAIL : $Failed" -ForegroundColor Red
Write-Host "SKIP : $Skipped" -ForegroundColor Yellow

Write-Host ""

if ($Failed -eq 0) {
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "FINAL REGRESSION PASSED" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green

    exit 0
}
else {
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host "FINAL REGRESSION FAILED" -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red

    exit 1
}
