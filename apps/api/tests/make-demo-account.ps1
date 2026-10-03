$BaseUrl = "http://localhost:4000/api/v1"

$Email = "demo-user-3@example.com"
$Password = "demo-user@123456"
$FullName = "Test User"


# ========================================
# API HELPER
# ========================================

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


# ========================================
# REGISTER
# ========================================

$registerBody = @{
    email    = $Email
    password = $Password
    fullName = $FullName
}

$register = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/auth/register" `
    -Body $registerBody

$register


# ========================================
# LOGIN
# ========================================

$loginBody = @{
    email    = $Email
    password = $Password
}

$login = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/auth/login" `
    -Body $loginBody

$login


# ========================================
# GET ACCESS TOKEN
# ========================================

$token = $login.data.accessToken

if ([string]::IsNullOrWhiteSpace($token)) {
    throw "Login thành công nhưng không nhận được accessToken"
}

Write-Host ""
Write-Host "Access token received successfully." -ForegroundColor Green


# ========================================
# AUTHORIZATION HEADER
# ========================================

$headers = @{
    Authorization = "Bearer $token"
}


# ========================================
# CREATE DEMO ACCOUNT
# ========================================

$demo = Invoke-Api `
    -Method "POST" `
    -Url "$BaseUrl/accounts/demo" `
    -Headers $headers

Write-Host ""
Write-Host "Demo account:" -ForegroundColor Green

$demo.data


# ========================================
# GET ACCOUNT BALANCE
# ========================================

$balance = Invoke-Api `
    -Method "GET" `
    -Url "$BaseUrl/accounts/balance" `
    -Headers $headers

Write-Host ""
Write-Host "Account balance:" -ForegroundColor Green

$balance.data


# ========================================
# END
# ========================================

Write-Host ""
Write-Host "End make demo user!" -ForegroundColor Cyan
