# Margin validation regression. Run against a LOCAL TEST database only.
$ErrorActionPreference = 'Stop'
$BaseUrl = 'http://localhost:4000/api/v1'
$passed = 0; $failed = 0
function Check([string]$name, [bool]$ok, [string]$details = '') {
  if ($ok) { $script:passed++; Write-Host "[PASS] $name" -ForegroundColor Green }
  else { $script:failed++; Write-Host "[FAIL] $name $details" -ForegroundColor Red }
}
function Api([string]$method, [string]$path, $body = $null) {
  $args = @{ Method=$method; Uri="$BaseUrl$path"; ErrorAction='Stop' }
  if ($script:headers) { $args.Headers = $script:headers }
  if ($null -ne $body) { $args.ContentType='application/json'; $args.Body=($body | ConvertTo-Json -Depth 10) }
  return Invoke-RestMethod @args
}
function Snapshot {
  $orders = Api 'GET' '/orders'
  $positions = Api 'GET' '/orders/positions'
  $trades = Api 'GET' '/orders/trades'
  $balance = Api 'GET' '/accounts/balance'
  # Count from response data arrays or data.items; fail rather than silently assuming zero.
  $counts = @()
  foreach ($response in @($orders,$positions,$trades)) {
    $data = $response.data
    if ($null -ne $data.items) { $counts += @($data.items).Count }
    elseif ($data -is [array]) { $counts += $data.Count }
    else { throw 'Unknown list response shape. Inspect /orders, /positions and /trades before running this test.' }
  }
  return [pscustomobject]@{ orders=$counts[0]; positions=$counts[1]; trades=$counts[2]; balance=[string]$balance.data.balance }
}
function Rejected([string]$name, [hashtable]$body, [string]$expectedCode) {
  $before = Snapshot
  $code = $null; $status = $null
  try { $null = Api 'POST' '/orders' $body; Check "$name rejected" $false 'Request unexpectedly succeeded' }
  catch {
    $status = [int]$_.Exception.Response.StatusCode
    $raw = $_.ErrorDetails.Message
    if (-not $raw -and $_.Exception.Response -and $_.Exception.Response.GetResponseStream) {
      try { $reader = [IO.StreamReader]::new($_.Exception.Response.GetResponseStream()); $raw = $reader.ReadToEnd() } catch {}
    }
    try { $errorResponse = $raw | ConvertFrom-Json; $code = $errorResponse.error.code; if (-not $code) { $code = $errorResponse.code } } catch {}
    Check "$name HTTP 400" ($status -eq 400) "status=$status"
    Check "$name error code" ($code -eq $expectedCode) "expected=$expectedCode actual=$code response=$raw"
  }
  $after = Snapshot
  Check "$name leaves orders unchanged" ($before.orders -eq $after.orders)
  Check "$name leaves positions unchanged" ($before.positions -eq $after.positions)
  Check "$name leaves trades unchanged" ($before.trades -eq $after.trades)
  Check "$name leaves balance unchanged" ($before.balance -eq $after.balance)
}
try {
  $null = Api 'GET' '/health'
  $stamp = Get-Date -Format 'yyyyMMddHHmmssfff'
  $email = "margin-regression-$stamp@example.com"
  $password = 'Test@123456'
  $register = Api 'POST' '/auth/register' @{email=$email; password=$password; fullName='Margin Regression'}
  Check 'Register success' ($register.success -eq $true)
  $login = Api 'POST' '/auth/login' @{email=$email; password=$password}
  $script:headers = @{ Authorization="Bearer $($login.data.accessToken)" }
  Check 'Login token' (-not [string]::IsNullOrWhiteSpace($login.data.accessToken))
  $account = Api 'POST' '/accounts/demo'
  Check 'Demo account created' ($account.success -eq $true)
  $base = @{symbol='XAUUSD'; side='BUY'; orderType='MARKET'; quantity='1'}
  Rejected 'Volume below minimum' @{symbol='XAUUSD';side='BUY';orderType='MARKET';quantity='0.001'} 'INVALID_ORDER_VOLUME'
  Rejected 'Invalid volume step' @{symbol='XAUUSD';side='BUY';orderType='MARKET';quantity='0.015'} 'INVALID_VOLUME_STEP'
  Rejected 'Volume above maximum' @{symbol='XAUUSD';side='BUY';orderType='MARKET';quantity='1001'} 'INVALID_ORDER_VOLUME'
  Rejected 'Limit order unsupported' @{symbol='XAUUSD';side='BUY';orderType='BUY_LIMIT';quantity='1';price='3500'} 'UNSUPPORTED_ORDER_TYPE'
  # 1000 lots at XAUUSD ~3650 and leverage 100 requires ~$3.65m > $100k.
  Rejected 'Insufficient margin' @{symbol='XAUUSD';side='BUY';orderType='MARKET';quantity='1000'} 'INSUFFICIENT_MARGIN'
  $beforeValid = Snapshot
  $buy = Api 'POST' '/orders' $base
  Check 'Valid market order succeeds' ($buy.success -eq $true)
  Check 'Valid order FILLED' ($buy.data.order.status -eq 'FILLED')
  $afterValid = Snapshot
  Check 'Valid order increments order count' ($afterValid.orders -eq ($beforeValid.orders + 1))
  $balanceBefore = [decimal]::Parse(
    $beforeValid.balance,
    [System.Globalization.CultureInfo]::InvariantCulture
)

$balanceAfter = [decimal]::Parse(
    $afterValid.balance,
    [System.Globalization.CultureInfo]::InvariantCulture
)

Check `
    'Opening position does not change balance' `
    ($balanceAfter -eq $balanceBefore) `
    "before=$balanceBefore after=$balanceAfter"


  $market = Api 'GET' '/market/price?symbol=XAUUSD'
  $accountBalance = Api 'GET' '/accounts/balance'
  $expectedPnl = ([double]$market.data.bid - [double]$buy.data.order.executedPrice) * [double]$buy.data.position.quantity * 100
  Check 'Live unrealized PnL includes contract size 100' ([Math]::Abs([double]$accountBalance.data.unrealizedPnl - $expectedPnl) -le 0.01) "expected=$expectedPnl actual=$($accountBalance.data.unrealizedPnl)"
  Check 'Live equity = balance + unrealized PnL' ([Math]::Abs([double]$accountBalance.data.equity - ([double]$accountBalance.data.balance + [double]$accountBalance.data.unrealizedPnl)) -le 0.01)
}
catch { $failed++; Write-Host "[FATAL] $($_.Exception.Message)" -ForegroundColor Red; if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message } }
Write-Host "RESULT: passed=$passed failed=$failed"
if ($failed -gt 0) { exit 1 }
exit 0
