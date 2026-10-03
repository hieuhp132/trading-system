# ============================================================
# SL/TP INTEGRATION + REGRESSION TEST
#
# Run ONLY against a local API connected to an isolated TEST DB.
# Requires MARKET_DATA_PROVIDER=demo.
#
# Workflow:
#   Health -> Register -> Login -> Create demo account
#   -> LONG tests -> SHORT tests -> Authorization tests
#   -> Close positions -> Final summary
#
# No existing accounts or positions are deleted.
# ============================================================

param(
    [string]$BaseUrl = "http://localhost:4000/api/v1"
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")

$script:passed = 0
$script:failed = 0
$script:headers = @{}
$script:createdPositions = @()
$script:primaryAccount = $null
$script:secondaryAccount = $null

# ------------------------------------------------------------
# HTTP helpers
# ------------------------------------------------------------

function Api {
    param(
        [string]$Method,
        [string]$Path,
        $Body = $null,
        [hashtable]$Headers = $script:headers
    )

    $params = @{
        Method      = $Method
        Uri         = "$BaseUrl$Path"
        ErrorAction = "Stop"
    }

    if ($Headers -and $Headers.Count -gt 0) {
        $params.Headers = $Headers
    }

    if ($null -ne $Body) {
        $params.ContentType = "application/json"
        $params.Body = $Body | ConvertTo-Json -Depth 12 -Compress
    }

    Invoke-RestMethod @params
}

function Get-HttpStatus {
    param($ErrorRecord)

    if ($null -ne $ErrorRecord.Exception.Response) {
        return [int]$ErrorRecord.Exception.Response.StatusCode
    }

    return 0
}

function Assert-True {
    param(
        [string]$Name,
        [bool]$Condition,
        [string]$Details = ""
    )

    if ($Condition) {
        $script:passed++
        Write-Host "[PASS] $Name" -ForegroundColor Green
    }
    else {
        $script:failed++
        Write-Host "[FAIL] $Name" -ForegroundColor Red

        if ($Details) {
            Write-Host "       $Details" -ForegroundColor Yellow
        }
    }
}

function Assert-Equal {
    param(
        [string]$Name,
        $Actual,
        $Expected
    )

    # Numeric comparison permits "3641.20" and "3641.2".
    $actualNumber = 0.0
    $expectedNumber = 0.0

    $actualIsNumber =
        $null -ne $Actual -and
        [double]::TryParse(
            [string]$Actual,
            [ref]$actualNumber
        )

    $expectedIsNumber =
        $null -ne $Expected -and
        [double]::TryParse(
            [string]$Expected,
            [ref]$expectedNumber
        )

    if ($null -eq $Actual -and $null -eq $Expected) {
        $equal = $true
    }
    elseif ($actualIsNumber -and $expectedIsNumber) {
        $equal = [Math]::Abs(
            $actualNumber - $expectedNumber
        ) -lt 0.000001
    }
    else {
        $equal = [string]$Actual -ceq [string]$Expected
    }

    Assert-True `
        -Name $Name `
        -Condition $equal `
        -Details "Expected=[$Expected] Actual=[$Actual]"
}

function Assert-HttpError {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Path,
        $Body = $null,
        [int[]]$ExpectedStatuses = @(400, 404, 409, 422),
        [hashtable]$Headers = $script:headers
    )

    try {
        $null = Api `
            -Method $Method `
            -Path $Path `
            -Body $Body `
            -Headers $Headers

        Assert-True `
            -Name $Name `
            -Condition $false `
            -Details "Request succeeded unexpectedly"
    }
    catch {
        $status = Get-HttpStatus $_

        $valid = $status -in $ExpectedStatuses

        Assert-True `
            -Name "$Name (HTTP $status)" `
            -Condition $valid `
            -Details "Expected HTTP: $($ExpectedStatuses -join ', ')"

        if (-not $valid) {
            if ($_.ErrorDetails.Message) {
                Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
            }
        }
    }
}

# ------------------------------------------------------------
# Test account setup
# ------------------------------------------------------------

function New-TestAccount {
    param([string]$Label)

    $email = "sltp-$Label-$([guid]::NewGuid().ToString('N'))@example.com"
    $password = "Test@123456"

    Write-Host ""
    Write-Host "Creating test user: $email" -ForegroundColor Cyan

    $register = Api `
        -Method "POST" `
        -Path "/auth/register" `
        -Body @{
            email    = $email
            password = $password
            fullName = "SLTP Test $Label"
        } `
        -Headers @{}

    Assert-True `
        -Name "$Label registration" `
        -Condition ($register.success -eq $true)

    $login = Api `
        -Method "POST" `
        -Path "/auth/login" `
        -Body @{
            email    = $email
            password = $password
        } `
        -Headers @{}

    Assert-True `
        -Name "$Label login" `
        -Condition (
            $login.success -eq $true -and
            -not [string]::IsNullOrWhiteSpace(
                [string]$login.data.accessToken
            )
        )

    if (-not $login.data.accessToken) {
        throw "Login did not return accessToken for $Label"
    }

    $headers = @{
        Authorization = "Bearer $($login.data.accessToken)"
    }

    $account = Api `
        -Method "POST" `
        -Path "/accounts/demo" `
        -Headers $headers

    Assert-True `
        -Name "$Label demo account created" `
        -Condition (
            $account.success -eq $true -and
            $account.data.status -eq "ACTIVE" -and
            -not [string]::IsNullOrWhiteSpace(
                [string]$account.data.id
            )
        )

    if (-not $account.data.id) {
        throw "Demo account ID missing for $Label"
    }

    Write-Host "Account ID: $($account.data.id)"

    return @{
        Email     = $email
        AccountId = $account.data.id
        Headers   = $headers
    }
}

# ------------------------------------------------------------
# Position helpers
# ------------------------------------------------------------

function Get-Position {
    param([string]$PositionId)

    $response = Api `
        -Method "GET" `
        -Path "/orders/positions/$PositionId"

    if ($response.success -ne $true) {
        throw "GET position failed: $PositionId"
    }

    return $response.data
}

function New-TestPosition {
    param(
        [string]$Side,
        [string]$StopLoss,
        [string]$TakeProfit
    )

    $response = Api `
        -Method "POST" `
        -Path "/orders" `
        -Body @{
            symbol     = "XAUUSD"
            side       = $Side
            orderType  = "MARKET"
            quantity   = "0.01"
            stopLoss   = $StopLoss
            takeProfit = $TakeProfit
        }

    Assert-True `
        -Name "$Side create order" `
        -Condition (
            $response.success -eq $true -and
            $response.data.order.status -eq "FILLED"
        )

    $positionId = $response.data.position.id

    if (-not $positionId) {
        throw "$Side create response missing data.position.id"
    }

    # Register immediately for cleanup.
    $script:createdPositions += $positionId

    Assert-Equal `
        -Name "$Side order SL saved" `
        -Actual $response.data.order.stopLoss `
        -Expected $StopLoss

    Assert-Equal `
        -Name "$Side order TP saved" `
        -Actual $response.data.order.takeProfit `
        -Expected $TakeProfit

Assert-Equal `
    -Name "$Side execution position SL" `
    -Actual $response.data.position.stopLoss `
    -Expected $StopLoss

Assert-Equal `
    -Name "$Side execution position TP" `
    -Actual $response.data.position.takeProfit `
    -Expected $TakeProfit

    $position = Get-Position $positionId

    Assert-Equal `
        -Name "$Side position SL persisted" `
        -Actual $position.stopLoss `
        -Expected $StopLoss

    Assert-Equal `
        -Name "$Side position TP persisted" `
        -Actual $position.takeProfit `
        -Expected $TakeProfit

    Assert-Equal `
        -Name "$Side position OPEN" `
        -Actual $position.status `
        -Expected "OPEN"

    return $positionId
}

function Close-TestPosition {
    param([string]$PositionId)

    $current = Get-Position $PositionId

    if ($current.status -eq "CLOSED") {
        return
    }

    $close = Api `
        -Method "POST" `
        -Path "/orders/positions/$PositionId/close" `
        -Body @{}

    Assert-True `
        -Name "Close position $PositionId" `
        -Condition ($close.success -eq $true)

    $after = Get-Position $PositionId

    Assert-Equal `
        -Name "Position CLOSED $PositionId" `
        -Actual $after.status `
        -Expected "CLOSED"
}

# ------------------------------------------------------------
# Main SL/TP scenario
# ------------------------------------------------------------

function Test-PositionStops {
    param(
        [string]$Side,
        [string]$InitialSL,
        [string]$InitialTP,
        [string]$UpdatedSL,
        [string]$UpdatedTP,
        [string]$InvalidSL,
        [string]$InvalidTP
    )

    Write-Host ""
    Write-Host "========================================"
    Write-Host "TESTING $Side"
    Write-Host "========================================" -ForegroundColor Cyan

    $positionId = New-TestPosition `
        -Side $Side `
        -StopLoss $InitialSL `
        -TakeProfit $InitialTP

    $path = "/orders/positions/$positionId/stops"

    # --------------------------------------------------------
    # Update SL only. TP must remain unchanged.
    # --------------------------------------------------------

    $updateSL = Api `
        -Method "PATCH" `
        -Path $path `
        -Body @{
            stopLoss = $UpdatedSL
        }

    Assert-Equal `
        -Name "$Side update SL" `
        -Actual $updateSL.data.stopLoss `
        -Expected $UpdatedSL

    Assert-Equal `
        -Name "$Side preserve TP after SL update" `
        -Actual $updateSL.data.takeProfit `
        -Expected $InitialTP

    $position = Get-Position $positionId

    Assert-Equal `
        -Name "$Side SL update persisted" `
        -Actual $position.stopLoss `
        -Expected $UpdatedSL

    # --------------------------------------------------------
    # Update TP only. SL must remain unchanged.
    # --------------------------------------------------------

    $updateTP = Api `
        -Method "PATCH" `
        -Path $path `
        -Body @{
            takeProfit = $UpdatedTP
        }

    Assert-Equal `
        -Name "$Side update TP" `
        -Actual $updateTP.data.takeProfit `
        -Expected $UpdatedTP

    Assert-Equal `
        -Name "$Side preserve SL after TP update" `
        -Actual $updateTP.data.stopLoss `
        -Expected $UpdatedSL

    # --------------------------------------------------------
    # Reject invalid SL / TP.
    # --------------------------------------------------------

    Assert-HttpError `
        -Name "$Side reject invalid SL" `
        -Method "PATCH" `
        -Path $path `
        -Body @{
            stopLoss = $InvalidSL
        }

    Assert-HttpError `
        -Name "$Side reject invalid TP" `
        -Method "PATCH" `
        -Path $path `
        -Body @{
            takeProfit = $InvalidTP
        }

    # Failed updates must not change persisted values.
    $afterInvalid = Get-Position $positionId

    Assert-Equal `
        -Name "$Side invalid SL leaves state unchanged" `
        -Actual $afterInvalid.stopLoss `
        -Expected $UpdatedSL

    Assert-Equal `
        -Name "$Side invalid TP leaves state unchanged" `
        -Actual $afterInvalid.takeProfit `
        -Expected $UpdatedTP

    # --------------------------------------------------------
    # Reject empty body.
    # --------------------------------------------------------

    Assert-HttpError `
        -Name "$Side reject empty update" `
        -Method "PATCH" `
        -Path $path `
        -Body @{}

    # --------------------------------------------------------
    # Reject new SL/TP when adding volume to existing position.
    # --------------------------------------------------------

    $beforeAdd = Get-Position $positionId

    Assert-HttpError `
        -Name "$Side reject stops when adding volume" `
        -Method "POST" `
        -Path "/orders" `
        -Body @{
            symbol     = "XAUUSD"
            side       = $Side
            orderType  = "MARKET"
            quantity   = "0.01"
            stopLoss   = $InitialSL
            takeProfit = $InitialTP
        }

    $afterAdd = Get-Position $positionId

    Assert-Equal `
        -Name "$Side rejected add preserves quantity" `
        -Actual $afterAdd.quantity `
        -Expected $beforeAdd.quantity

    # --------------------------------------------------------
    # Remove SL with explicit JSON null.
    # --------------------------------------------------------

    $clearSL = Api `
        -Method "PATCH" `
        -Path $path `
        -Body @{
            stopLoss = $null
        }

    Assert-Equal `
        -Name "$Side clear SL" `
        -Actual $clearSL.data.stopLoss `
        -Expected $null

    Assert-Equal `
        -Name "$Side preserve TP after clearing SL" `
        -Actual $clearSL.data.takeProfit `
        -Expected $UpdatedTP

    # --------------------------------------------------------
    # Remove TP with explicit JSON null.
    # --------------------------------------------------------

    $clearTP = Api `
        -Method "PATCH" `
        -Path $path `
        -Body @{
            takeProfit = $null
        }

    Assert-Equal `
        -Name "$Side clear TP" `
        -Actual $clearTP.data.takeProfit `
        -Expected $null

    $afterClear = Get-Position $positionId

    Assert-Equal `
        -Name "$Side SL null persisted" `
        -Actual $afterClear.stopLoss `
        -Expected $null

    Assert-Equal `
        -Name "$Side TP null persisted" `
        -Actual $afterClear.takeProfit `
        -Expected $null

    # --------------------------------------------------------
    # Close and reject updates on CLOSED position.
    # --------------------------------------------------------

    Close-TestPosition $positionId

    Assert-HttpError `
        -Name "$Side reject SL update after close" `
        -Method "PATCH" `
        -Path $path `
        -Body @{
            stopLoss = $UpdatedSL
        }

    return $positionId
}

# ------------------------------------------------------------
# Execute
# ------------------------------------------------------------

try {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "SL/TP REGRESSION TEST"
    Write-Host "========================================" -ForegroundColor Cyan

    # Safety: never run this script against an external host.
    $uri = [uri]$BaseUrl

    if ($uri.Host -notin @("localhost", "127.0.0.1", "::1")) {
        throw "Safety check: BaseUrl must point to localhost."
    }

    Write-Host "Base URL: $BaseUrl"

    # 2. Primary user and account
    $script:primaryAccount = New-TestAccount "primary"
    $script:headers = $script:primaryAccount.Headers

    # 3. Verify provider quote.
    $quoteResponse = Api `
        -Method "GET" `
        -Path "/market/price?symbol=XAUUSD"

    $quote = $quoteResponse.data

    Assert-True `
        -Name "Market quote available" `
        -Condition (
            $quoteResponse.success -eq $true -and
            $null -ne $quote.bid -and
            $null -ne $quote.ask
        )

    # This test is intentionally tied to the demo quote.
    Assert-Equal `
        -Name "Demo BID" `
        -Actual $quote.bid `
        -Expected "3651.20"

    Assert-Equal `
        -Name "Demo ASK" `
        -Actual $quote.ask `
        -Expected "3651.40"

    if (
        [Math]::Abs([double]$quote.bid - 3651.20) -gt 0.000001 -or
        [Math]::Abs([double]$quote.ask - 3651.40) -gt 0.000001
    ) {
        throw "Demo quote mismatch. Set MARKET_DATA_PROVIDER=demo."
    }

    # 4. LONG: trigger price is BID.
    $longId = Test-PositionStops `
        -Side "BUY" `
        -InitialSL "3641.20" `
        -InitialTP "3661.20" `
        -UpdatedSL "3646.20" `
        -UpdatedTP "3656.20" `
        -InvalidSL "3661.20" `
        -InvalidTP "3641.20"

    # 5. SHORT: trigger price is ASK.
    $shortId = Test-PositionStops `
        -Side "SELL" `
        -InitialSL "3661.40" `
        -InitialTP "3641.40" `
        -UpdatedSL "3656.40" `
        -UpdatedTP "3646.40" `
        -InvalidSL "3641.40" `
        -InvalidTP "3661.40"

    # 6. Create second user/account for authorization tests.
    $script:secondaryAccount = New-TestAccount "secondary"

    $otherHeaders = $script:secondaryAccount.Headers

    Assert-HttpError `
        -Name "Other user cannot update LONG" `
        -Method "PATCH" `
        -Path "/orders/positions/$longId/stops" `
        -Body @{
            stopLoss = "3640.00"
        } `
        -ExpectedStatuses @(403, 404) `
        -Headers $otherHeaders

    Assert-HttpError `
        -Name "Other user cannot read LONG" `
        -Method "GET" `
        -Path "/orders/positions/$longId" `
        -ExpectedStatuses @(403, 404) `
        -Headers $otherHeaders

    Write-Host ""
    Write-Host "All test scenarios completed." -ForegroundColor Cyan
}
catch {
    $script:failed++

    Write-Host ""
    Write-Host "[FATAL] $($_.Exception.Message)" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
    }
}
finally {
    # Restore primary user's token for cleanup.
    if ($null -ne $script:primaryAccount) {
        $script:headers = $script:primaryAccount.Headers
    }

    # Best-effort cleanup: close only positions created by this script.
    foreach ($positionId in $script:createdPositions) {
        try {
            $position = Get-Position $positionId

            if ($position.status -eq "OPEN") {
                Write-Host ""
                Write-Host "Cleanup: closing $positionId" -ForegroundColor Yellow

                Close-TestPosition $positionId
            }
        }
        catch {
            $script:failed++

            Write-Host `
                "[CLEANUP FAIL] $positionId : $($_.Exception.Message)" `
                -ForegroundColor Red
        }
    }

    Write-Host ""
    Write-Host "========================================"
    Write-Host "FINAL RESULT"
    Write-Host "========================================"

    Write-Host "Passed: $script:passed" -ForegroundColor Green
    Write-Host "Failed: $script:failed" -ForegroundColor $(if ($script:failed -eq 0) {
        "Green"
    } else {
        "Red"
    })

    if ($null -ne $script:primaryAccount) {
        Write-Host "Primary user: $($script:primaryAccount.Email)"
    }

    if ($null -ne $script:secondaryAccount) {
        Write-Host "Secondary user: $($script:secondaryAccount.Email)"
    }

    Write-Host "Created positions: $($script:createdPositions.Count)"
}

if ($script:failed -gt 0) {
    exit 1
}

exit 0
