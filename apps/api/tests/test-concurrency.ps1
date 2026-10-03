# Run ONLY against an isolated local TEST database. Creates two new demo users.
$ErrorActionPreference = 'Stop'
$BaseUrl = 'http://localhost:4000/api/v1'
$passed = 0; $failed = 0
function Check([string]$name, [bool]$ok, [string]$detail = '') {
  if ($ok) { $script:passed++; Write-Host "[PASS] $name" -ForegroundColor Green }
  else { $script:failed++; Write-Host "[FAIL] $name $detail" -ForegroundColor Red }
}
function Api([string]$method, [string]$path, $body = $null, [hashtable]$headers = $null) {
  $p = @{ Method=$method; Uri="$BaseUrl$path"; ErrorAction='Stop' }
  if ($headers) { $p.Headers=$headers }
  if ($null -ne $body) { $p.ContentType='application/json'; $p.Body=($body | ConvertTo-Json -Depth 12 -Compress) }
  Invoke-RestMethod @p
}
function New-TestAccount([string]$label) {
  $email = "concurrency-$label-$([guid]::NewGuid().ToString('N'))@example.com"
  $password = 'Test@123456'
  $null = Api 'POST' '/auth/register' @{email=$email;password=$password;fullName="Concurrency $label"}
  $login = Api 'POST' '/auth/login' @{email=$email;password=$password}
  if (-not $login.data.accessToken) { throw "No login token for $label" }
  $headers = @{Authorization="Bearer $($login.data.accessToken)"}
  $account = Api 'POST' '/accounts/demo' $null $headers
  if (-not $account.success -or -not $account.data.id) { throw "Account creation failed for $label" }
  return @{ headers=$headers; id=$account.data.id; email=$email }
}
function Get-Snapshot([hashtable]$headers) {
  $o=Api 'GET' '/orders' $null $headers
  $p=Api 'GET' '/orders/positions' $null $headers
  $t=Api 'GET' '/orders/trades' $null $headers
  $b=Api 'GET' '/accounts/balance' $null $headers
  foreach ($r in @($o,$p,$t)) { if ($null -eq $r.data.items -or $null -eq $r.data.total) { throw 'Unexpected list response shape' } }
  return [pscustomobject]@{orders=@($o.data.items); positions=@($p.data.items); trades=@($t.data.items); balance=$b.data}
}
# Start requests in independent runspaces via Start-ThreadJob if available; jobs wait at a shared future UTC timestamp.
function Invoke-Pair([string]$url, [hashtable]$headers, [string]$jsonBody = '') {
  if (-not (Get-Command Start-ThreadJob -ErrorAction SilentlyContinue)) { throw 'Start-ThreadJob is required (PowerShell 7 or ThreadJob module).' }
  $start=[DateTime]::UtcNow.AddSeconds(2).Ticks
  $jobs=@(1,2 | ForEach-Object {
    Start-ThreadJob -ArgumentList $url,$headers,$jsonBody,$start -ScriptBlock {
      param($url,$headers,$body,$ticks)
      while ([DateTime]::UtcNow.Ticks -lt $ticks) { Start-Sleep -Milliseconds 2 }
      try {
        $p=@{Method='POST';Uri=$url;Headers=$headers;ErrorAction='Stop'}
        if ($body) { $p.ContentType='application/json';$p.Body=$body }
        $response=Invoke-RestMethod @p
        [pscustomobject]@{ok=$true;status=200;code='';data=$response.data;message=''}
      } catch {
        $status=0; if ($_.Exception.Response) { $status=[int]$_.Exception.Response.StatusCode }
        $raw=$_.ErrorDetails.Message; $code=''
        try { $err=$raw|ConvertFrom-Json; $code=$err.error.code; if (-not $code) {$code=$err.code} } catch {}
        [pscustomobject]@{ok=$false;status=$status;code=$code;data=$null;message=$raw}
      }
    }
  })
  try {
    $null=$jobs | Wait-Job -Timeout 45
    if (@($jobs | Where-Object State -ne 'Completed').Count -gt 0) { throw 'Concurrent requests timed out' }
    $results=@($jobs | Receive-Job)
    if ($results.Count -ne 2) { throw "Expected 2 results, got $($results.Count)" }
    return ,$results
  } finally { $jobs | Remove-Job -Force -ErrorAction SilentlyContinue }
}
try {
  $null=Api 'GET' '/health'
  Write-Host 'TEST 1: Double close' -ForegroundColor Cyan
  $a=New-TestAccount 'close'
  $open=Api 'POST' '/orders' @{symbol='XAUUSD';side='BUY';orderType='MARKET';quantity='0.01'} $a.headers
  if (-not $open.data.position.id) {throw 'Open did not return position id'}
  $positionId=$open.data.position.id
  $before=Get-Snapshot $a.headers
  $results=Invoke-Pair "$BaseUrl/orders/positions/$positionId/close" $a.headers
  $after=Get-Snapshot $a.headers
  $success=@($results | Where-Object ok).Count
  $rejected=@($results | Where-Object { -not $_.ok }).Count
  $closed=@($after.positions | Where-Object {$_.id -eq $positionId -and $_.status -eq 'CLOSED'})
  $closeTrades=@($after.trades | Where-Object {$_.positionId -eq $positionId -and $null -ne $_.realizedPnl})
  Check 'Double close exactly one success' ($success -eq 1) "success=$success"
  Check 'Double close exactly one rejection' ($rejected -eq 1) "rejected=$rejected"
  Check 'Double close adds exactly one order' ($after.orders.Count -eq $before.orders.Count+1)
  Check 'Double close adds exactly one trade' ($after.trades.Count -eq $before.trades.Count+1)
  Check 'Double close keeps one position' ($after.positions.Count -eq $before.positions.Count)
  Check 'Double close position CLOSED once' ($closed.Count -eq 1 -and [decimal]$closed[0].quantity -eq 0)
  Check 'Double close one realized trade' ($closeTrades.Count -eq 1)
  if ($success -eq 1) {
    $winner=@($results | Where-Object ok)[0]
    $expected=[decimal]$before.balance.balance+[decimal]$winner.data.realizedPnl
    Check 'Double close balance credited once' ([math]::Abs([double]([decimal]$after.balance.balance-$expected)) -le 0.01) "expected=$expected actual=$($after.balance.balance)"
  } else {Check 'Double close balance credited once' $false 'No unique successful response'}
  Check 'Double close margin released' ([decimal]$after.balance.usedMargin -eq 0)
  foreach ($r in $results) {Write-Host "  close result: success=$($r.ok) http=$($r.status) code=$($r.code)"}

  Write-Host 'TEST 2: Margin race' -ForegroundColor Cyan
  $m=New-TestAccount 'margin'
  $conditions=Api 'GET' '/accounts/trading-conditions' $null $m.headers
  $market=Api 'GET' '/market/price?symbol=XAUUSD'
  $acct=Api 'GET' '/accounts/balance' $null $m.headers
  $contract=[double]$conditions.data.contractSize
  $leverage=[double]$conditions.data.maxLeverage
  $ask=[double]$market.data.ask
  $free=[double]$acct.data.freeMargin
  $step=[double]$conditions.data.volumeStep
  $max=[double]$conditions.data.maxVolume
  if ($contract -le 0 -or $leverage -le 0 -or $ask -le 0 -or $free -le 0 -or $step -le 0) {throw 'Invalid trading conditions or market data'}
  # Choose quantity with required margin > half free margin but < free margin; allow spread/slippage headroom.
  $target=0.65*$free*$leverage/($contract*$ask)
  $quantity=[math]::Floor($target/$step)*$step
  $quantity=[math]::Round([math]::Min($quantity,$max),8)
  $required=$quantity*$contract*$ask/$leverage
  if ($quantity -lt [double]$conditions.data.minVolume -or $required -le $free/2 -or $required -ge $free*0.9) {throw "Cannot construct safe margin race: qty=$quantity required=$required free=$free"}
  $qtyText=$quantity.ToString('0.########',[Globalization.CultureInfo]::InvariantCulture)
  Write-Host "  qty=$qtyText estimatedRequired=$([math]::Round($required,2)) free=$free"
  $body=@{symbol='XAUUSD';side='BUY';orderType='MARKET';quantity=$qtyText}|ConvertTo-Json -Compress
  $beforeM=Get-Snapshot $m.headers
  $mr=Invoke-Pair "$BaseUrl/orders" $m.headers $body
  $afterM=Get-Snapshot $m.headers
  $mSuccess=@($mr | Where-Object ok).Count
  Check 'Margin race at most one success' ($mSuccess -le 1) "success=$mSuccess"
  Check 'Margin race one success' ($mSuccess -eq 1) "success=$mSuccess"
  Check 'Margin race order count consistent' ($afterM.orders.Count -eq $beforeM.orders.Count+$mSuccess)
  Check 'Margin race trade count consistent' ($afterM.trades.Count -eq $beforeM.trades.Count+$mSuccess)
  $openPositions=@($afterM.positions | Where-Object status -eq 'OPEN')
  $totalQty=0.0; foreach($p in $openPositions){$totalQty += [double]$p.quantity}
  Check 'Margin race position volume consistent' ([math]::Abs($totalQty-$quantity*$mSuccess) -lt 0.000001) "actual=$totalQty expected=$($quantity*$mSuccess)"
  Check 'Margin race balance unchanged' ([decimal]$afterM.balance.balance -eq [decimal]$beforeM.balance.balance)
  Check 'Margin race free margin nonnegative' ([double]$afterM.balance.freeMargin -ge -0.01) "free=$($afterM.balance.freeMargin)"
  foreach ($r in $mr) {Write-Host "  margin result: success=$($r.ok) http=$($r.status) code=$($r.code)"}
} catch {
  $failed++; Write-Host "[FATAL] $($_.Exception.Message)" -ForegroundColor Red
  if ($_.ErrorDetails.Message) {Write-Host $_.ErrorDetails.Message}
}
Write-Host "RESULT: passed=$passed failed=$failed"
if ($failed -gt 0) {exit 1}
exit 0
