$ErrorActionPreference = "Stop"

$BaseUrl = "http://localhost:4000/api/v1"

$Timestamp = Get-Date -Format "yyyyMMddHHmmssfff"

$UserAEmail = "edge-test-a-$Timestamp@example.com"
$UserBEmail = "edge-test-b-$Timestamp@example.com"

$Password = "Password123!"

$Quantity = "1"

Write-Host ""
Write-Host "============================================================"
Write-Host "PAPER TRADING EDGE CASE TEST"
Write-Host "============================================================"
Write-Host "[INFO] Base URL : $BaseUrl"
Write-Host "[INFO] User A   : $UserAEmail"
Write-Host "[INFO] User B   : $UserBEmail"
Write-Host ""

function Assert-Equal {
    param(
        [Parameter(Mandatory = $true)]
        $Actual,

        [Parameter(Mandatory = $true)]
        $Expected,

        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    if ($Actual -ne $Expected) {
        throw "[FAIL] $Message | Expected: $Expected | Actual: $Actual"
    }

    Write-Host "[PASS] $Message"
}

function Assert-NotEqual {
    param(
        [Parameter(Mandatory = $true)]
        $Actual,

        [Parameter(Mandatory = $true)]
        $Unexpected,

        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    if ($Actual -eq $Unexpected) {
        throw "[FAIL] $Message | Unexpected value: $Unexpected"
    }

    Write-Host "[PASS] $Message"
}

function Assert-True {
    param(
        [Parameter(Mandatory = $true)]
        $Condition,

        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    if (-not $Condition) {
        throw "[FAIL] $Message"
    }

    Write-Host "[PASS] $Message"
}

function Get-ResponseBody {
    param(
        [Parameter(Mandatory = $true)]
        $Exception
    )

    try {
        $response = $Exception.Response

        if ($null -eq $response) {
            return $null
        }

        $stream = $response.GetResponseStream()

        if ($null -eq $stream) {
            return $null
        }

        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        $reader.Dispose()
        $stream.Dispose()

        if ([string]::IsNullOrWhiteSpace($body)) {
            return $null
        }

        return ($body | ConvertFrom-Json)
    }
    catch {
        return $null
    }
}

function Invoke-Api {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("GET", "POST")]
        [string]$Method,

        [Parameter(Mandatory = $true)]
        [string]$Path,

        [string]$Token,

        $Body,

        [switch]$ExpectError
    )

    $uri = "$BaseUrl$Path"

    $headers = @{
        "Content-Type" = "application/json"
    }

    if ($Token) {
        $headers["Authorization"] = "Bearer $Token"
    }

    try {
        if ($null -ne $Body) {
            $json = $Body | ConvertTo-Json -Depth 10

            $response = Invoke-RestMethod `
                -Method $Method `
                -Uri $uri `
                -Headers $headers `
                -Body $json

        }
        else {
            $response = Invoke-RestMethod `
                -Method $Method `
                -Uri $uri `
                -Headers $headers
        }

        if ($ExpectError) {
            throw "[FAIL] Expected API error but request succeeded: $Method $Path"
        }

        return [PSCustomObject]@{
            Success    = $true
            StatusCode = 200
            Body       = $response
        }
    }
    catch {
        if (-not $ExpectError) {
            throw
        }

        $errorBody = Get-ResponseBody -Exception $_.Exception

        $statusCode = $null

        try {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }
        catch {
            $statusCode = $null
        }

        return [PSCustomObject]@{
            Success    = $false
            StatusCode = $statusCode
            Body       = $errorBody
        }
    }
}

# ============================================================
# 1. REGISTER USER A
# ============================================================

Write-Host "============================================================"
Write-Host "1. REGISTER USER A"
Write-Host "============================================================"

$registerA = Invoke-Api `
    -Method POST `
    -Path "/auth/register" `
    -Body @{
        email    = $UserAEmail
        password = $Password
    }

$tokenA = $registerA.Body.data.accessToken

Assert-True `
    ($null -ne $tokenA -and $tokenA.Length -gt 0) `
    "User A registration returned access token"

# ============================================================
# 2. REGISTER USER B
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "2. REGISTER USER B"
Write-Host "============================================================"

$registerB = Invoke-Api `
    -Method POST `
    -Path "/auth/register" `
    -Body @{
        email    = $UserBEmail
        password = $Password
    }

$tokenB = $registerB.Body.data.accessToken

Assert-True `
    ($null -ne $tokenB -and $tokenB.Length -gt 0) `
    "User B registration returned access token"

# ============================================================
# 3. CREATE DEMO ACCOUNTS
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "3. CREATE DEMO ACCOUNTS"
Write-Host "============================================================"

$accountA = Invoke-Api `
    -Method POST `
    -Path "/accounts/demo" `
    -Token $tokenA `
    -Body @{}

$accountB = Invoke-Api `
    -Method POST `
    -Path "/accounts/demo" `
    -Token $tokenB `
    -Body @{}

$accountAId = $accountA.Body.data.id
$accountBId = $accountB.Body.data.id

Assert-True `
    ($null -ne $accountAId) `
    "User A demo account created"

Assert-True `
    ($null -ne $accountBId) `
    "User B demo account created"

# ============================================================
# 4. INVALID QUANTITY = 0
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "4. INVALID QUANTITY = 0"
Write-Host "============================================================"

$response = Invoke-Api `
    -Method POST `
    -Path "/orders" `
    -Token $tokenA `
    -Body @{
        symbol   = "XAUUSD"
        side     = "BUY"
        quantity = "0"
    } `
    -ExpectError

Assert-Equal `
    $response.StatusCode `
    400 `
    "Quantity = 0 is rejected with HTTP 400"

# ============================================================
# 5. INVALID QUANTITY < 0
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "5. INVALID QUANTITY < 0"
Write-Host "============================================================"

$response = Invoke-Api `
    -Method POST `
    -Path "/orders" `
    -Token $tokenA `
    -Body @{
        symbol   = "XAUUSD"
        side     = "BUY"
        quantity = "-1"
    } `
    -ExpectError

Assert-Equal `
    $response.StatusCode `
    400 `
    "Negative quantity is rejected with HTTP 400"

# ============================================================
# 6. INVALID QUANTITY TYPE
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "6. INVALID QUANTITY TYPE"
Write-Host "============================================================"

$response = Invoke-Api `
    -Method POST `
    -Path "/orders" `
    -Token $tokenA `
    -Body @{
        symbol   = "XAUUSD"
        side     = "BUY"
        quantity = "abc"
    } `
    -ExpectError

Assert-Equal `
    $response.StatusCode `
    400 `
    "Non-numeric quantity is rejected with HTTP 400"

# ============================================================
# 7. UNSUPPORTED SYMBOL
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "7. UNSUPPORTED SYMBOL"
Write-Host "============================================================"

$response = Invoke-Api `
    -Method POST `
    -Path "/orders" `
    -Token $tokenA `
    -Body @{
        symbol   = "EURUSD"
        side     = "BUY"
        quantity = $Quantity
    } `
    -ExpectError

Assert-Equal `
    $response.StatusCode `
    400 `
    "Unsupported symbol is rejected with HTTP 400"

if ($response.Body -and $response.Body.error) {
    Assert-Equal `
        $response.Body.error.code `
        "UNSUPPORTED_SYMBOL" `
        "Unsupported symbol returns UNSUPPORTED_SYMBOL"
}

# ============================================================
# 8. INVALID SIDE
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "8. INVALID ORDER SIDE"
Write-Host "============================================================"

$response = Invoke-Api `
    -Method POST `
    -Path "/orders" `
    -Token $tokenA `
    -Body @{
        symbol   = "XAUUSD"
        side     = "HOLD"
        quantity = $Quantity
    } `
    -ExpectError

Assert-Equal `
    $response.StatusCode `
    400 `
    "Invalid order side is rejected with HTTP 400"

# ============================================================
# 9. MISSING AUTHENTICATION
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "9. MISSING AUTHENTICATION"
Write-Host "============================================================"

$response = Invoke-Api `
    -Method GET `
    -Path "/accounts" `
    -ExpectError

Assert-Equal `
    $response.StatusCode `
    401 `
    "GET /accounts without JWT returns HTTP 401"

$response = Invoke-Api `
    -Method GET `
    -Path "/orders/positions" `
    -ExpectError

Assert-Equal `
    $response.StatusCode `
    401 `
    "GET /orders/positions without JWT returns HTTP 401"

$response = Invoke-Api `
    -Method POST `
    -Path "/orders" `
    -Body @{
        symbol   = "XAUUSD"
        side     = "BUY"
        quantity = "1"
    } `
    -ExpectError

Assert-Equal `
    $response.StatusCode `
    401 `
    "POST /orders without JWT returns HTTP 401"

# ============================================================
# 10. INVALID JWT
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "10. INVALID JWT"
Write-Host "============================================================"

$response = Invoke-Api `
    -Method GET `
    -Path "/accounts" `
    -Token "invalid.jwt.token" `
    -ExpectError

Assert-Equal `
    $response.StatusCode `
    401 `
    "Invalid JWT returns HTTP 401"

# ============================================================
# 11. USER A CREATES A POSITION
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "11. USER A CREATES POSITION"
Write-Host "============================================================"

$buyA = Invoke-Api `
    -Method POST `
    -Path "/orders" `
    -Token $tokenA `
    -Body @{
        symbol   = "XAUUSD"
        side     = "BUY"
        quantity = "1"
    }

Assert-Equal `
    $buyA.Body.data.position.side `
    "LONG" `
    "User A BUY creates LONG position"

$positionAId = $buyA.Body.data.position.id

Assert-True `
    ($null -ne $positionAId) `
    "User A position ID exists"

# ============================================================
# 12. USER B CANNOT SEE USER A POSITION
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "12. USER ISOLATION - POSITIONS"
Write-Host "============================================================"

$positionsB = Invoke-Api `
    -Method GET `
    -Path "/orders/positions" `
    -Token $tokenB

$visiblePosition = $positionsB.Body.data.items |
    Where-Object {
        $_.id -eq $positionAId
    }

Assert-True `
    ($null -eq $visiblePosition) `
    "User B cannot see User A position"

# ============================================================
# 13. USER B CANNOT ACCESS USER A POSITION BY ID
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "13. USER ISOLATION - POSITION DETAIL"
Write-Host "============================================================"

$response = Invoke-Api `
    -Method GET `
    -Path "/orders/positions/$positionAId" `
    -Token $tokenB `
    -ExpectError

Assert-Equal `
    $response.StatusCode `
    404 `
    "User B cannot access User A position"

# ============================================================
# 14. USER B CANNOT CLOSE USER A POSITION
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "14. USER ISOLATION - CLOSE POSITION"
Write-Host "============================================================"

$response = Invoke-Api `
    -Method POST `
    -Path "/orders/positions/$positionAId/close" `
    -Token $tokenB `
    -Body @{} `
    -ExpectError

Assert-Equal `
    $response.StatusCode `
    404 `
    "User B cannot close User A position"

# ============================================================
# 15. USER B CANNOT ACCESS USER A ORDER
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "15. USER ISOLATION - ORDER DETAIL"
Write-Host "============================================================"

$orderAId = $buyA.Body.data.order.id

$response = Invoke-Api `
    -Method GET `
    -Path "/orders/$orderAId" `
    -Token $tokenB `
    -ExpectError

Assert-Equal `
    $response.StatusCode `
    404 `
    "User B cannot access User A order"

# ============================================================
# 16. USER B CANNOT SEE USER A TRADE
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "16. USER ISOLATION - TRADES"
Write-Host "============================================================"

$tradesB = Invoke-Api `
    -Method GET `
    -Path "/orders/trades" `
    -Token $tokenB

$visibleTrade = $tradesB.Body.data.items |
    Where-Object {
        $_.orderId -eq $orderAId
    }

Assert-True `
    ($null -eq $visibleTrade) `
    "User B cannot see User A trade"

# ============================================================
# 17. NON-EXISTENT POSITION
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "17. NON-EXISTENT POSITION"
Write-Host "============================================================"

$fakePositionId = "00000000-0000-0000-0000-000000000000"

$response = Invoke-Api `
    -Method GET `
    -Path "/orders/positions/$fakePositionId" `
    -Token $tokenA `
    -ExpectError

Assert-Equal `
    $response.StatusCode `
    404 `
    "Non-existent position returns HTTP 404"

$response = Invoke-Api `
    -Method POST `
    -Path "/orders/positions/$fakePositionId/close" `
    -Token $tokenA `
    -Body @{} `
    -ExpectError

Assert-Equal `
    $response.StatusCode `
    404 `
    "Closing non-existent position returns HTTP 404"

# ============================================================
# 18. CLOSE USER A POSITION
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "18. CLOSE USER A POSITION"
Write-Host "============================================================"

$closeA = Invoke-Api `
    -Method POST `
    -Path "/orders/positions/$positionAId/close" `
    -Token $tokenA `
    -Body @{}

Assert-Equal `
    $closeA.Body.data.position.status `
    "CLOSED" `
    "User A can close own position"

# ============================================================
# 19. CLOSE ALREADY CLOSED POSITION
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "19. CLOSE ALREADY CLOSED POSITION"
Write-Host "============================================================"

$response = Invoke-Api `
    -Method POST `
    -Path "/orders/positions/$positionAId/close" `
    -Token $tokenA `
    -Body @{} `
    -ExpectError

Assert-Equal `
    $response.StatusCode `
    404 `
    "Already closed position cannot be closed again"

# ============================================================
# 20. FINAL USER ISOLATION CHECK
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "20. FINAL USER ISOLATION CHECK"
Write-Host "============================================================"

$portfolioB = Invoke-Api `
    -Method GET `
    -Path "/orders/portfolio/summary" `
    -Token $tokenB

Assert-Equal `
    $portfolioB.Body.data.balance `
    "100000" `
    "User B balance remains 100000"

Assert-Equal `
    $portfolioB.Body.data.openPositions `
    0 `
    "User B has zero open positions"

Assert-Equal `
    $portfolioB.Body.data.realizedPnl `
    "0.00" `
    "User B realized PnL remains zero"

# ============================================================
# FINAL
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "EDGE CASE TEST COMPLETED SUCCESSFULLY"
Write-Host "============================================================"
Write-Host ""
Write-Host "AUTHENTICATION        : PASS"
Write-Host "VALIDATION            : PASS"
Write-Host "UNSUPPORTED SYMBOL    : PASS"
Write-Host "INVALID SIDE          : PASS"
Write-Host "POSITION NOT FOUND    : PASS"
Write-Host "CLOSED POSITION       : PASS"
Write-Host "USER ISOLATION        : PASS"
Write-Host "ORDER ISOLATION       : PASS"
Write-Host "TRADE ISOLATION       : PASS"
Write-Host ""
Write-Host "============================================================"
