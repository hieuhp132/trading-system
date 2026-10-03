# Run ONLY against an isolated local TEST database. Creates fresh users and demo orders.
$ErrorActionPreference = 'Stop'
$BaseUrl = 'http://localhost:4000/api/v1'
$script:passed = 0
$script:failed = 0
$script:headers = $null

function Check([string]$name, [bool]$ok, [string]$detail = '') {
  if ($ok) { $script:passed++; Write-Host "[PASS] $name" -ForegroundColor Green }
  else { $script:failed++; Write-Host "[FAIL] $name $detail" -ForegroundColor Red }
}
function Money($value) { return [decimal]::Parse([string]$value, [Globalization.CultureInfo]::InvariantCulture) }
function Near($actual, $expected, [decimal]$tolerance = 0.02) {
  return [decimal]::Abs((Money $actual) - (Money $expected)) -le $tolerance
}
function Api([string]$method, [string]$path, $body = $null) {
  $p = @{ Method=$method; Uri="$BaseUrl$path"; ErrorAction='Stop' }
  if ($script:headers) { $p.Headers=$script:headers }
  if ($null -ne $body) { $p.ContentType='application/json'; $p.Body=($body | ConvertTo-Json -Depth 12 -Compress) }
  Invoke-RestMethod @p
}
function Items([string]$path) {
  $r=Api 'GET' $path
  if ($null -eq $r.data.items -or $null -eq $r.data.total) { throw "Unexpected list response: $path" }
  return @($r.data.items)
}
function Snapshot {
  $b=(Api 'GET' '/accounts/balance').data
  return [pscustomobject]@{
    orders=@(Items '/orders'); positions=@(Items '/orders/positions'); trades=@(Items '/orders/trades')
    balance=Money $b.balance; equity=Money $b.equity
    usedMargin=Money $b.usedMargin; freeMargin=Money $b.freeMargin
  }
}
function New-TestAccount([string]$label) {
  $email="partial-$label-$([guid]::NewGuid().ToString('N'))@example.com"
  $password='Test@123456'
  $register=Api 'POST' '/auth/register' @{email=$email;password=$password;fullName="Partial Close $label"}
  Check "$label register" ($register.success -eq $true)
  $login=Api 'POST' '/auth/login' @{email=$email;password=$password}
  if (-not $login.data.accessToken) { throw "Login token missing: $label" }
  $script:headers=@{Authorization="Bearer $($login.data.accessToken)"}
  $account=Api 'POST' '/accounts/demo'
  Check "$label demo account" ($account.success -eq $true -and $account.data.status -eq 'ACTIVE')
}
function Rejected([string]$path, $body, [int[]]$allowedStatuses = @(400,422)) {
  try { $null=Api 'POST' $path $body; return $false }
  catch {
    $status=0
    if ($_.Exception.Response) { $status=[int]$_.Exception.Response.StatusCode }
    return $allowedStatuses -contains $status
  }
}
function Check-Unchanged([string]$label, $before, $after, [string]$id, [decimal]$quantity) {
  $p=@($after.positions | Where-Object id -eq $id)
  Check "$label orders unchanged" ($after.orders.Count -eq $before.orders.Count)
  Check "$label trades unchanged" ($after.trades.Count -eq $before.trades.Count)
  Check "$label balance unchanged" (Near $after.balance $before.balance)
  Check "$label quantity unchanged" ($p.Count -eq 1 -and (Money $p[0].quantity) -eq $quantity)
}
function Run-Side([string]$side) {
  $label=if ($side -eq 'BUY') {'LONG'} else {'SHORT'}
  $closingSide=if ($side -eq 'BUY') {'SELL'} else {'BUY'}
  New-TestAccount $label
  $beforeOpen=Snapshot
  $open=Api 'POST' '/orders' @{symbol='XAUUSD';side=$side;orderType='MARKET';quantity='0.05'}
  if (-not $open.data.position.id) { throw "$label opening response missing position ID" }
  $id=[string]$open.data.position.id
  $entry=Money $open.data.position.averageEntryPrice
  $afterOpen=Snapshot
  Check "$label opening success" ($open.success -eq $true -and $open.data.order.status -eq 'FILLED')
  Check "$label initial position 0.05 OPEN" ($open.data.position.status -eq 'OPEN' -and (Near $open.data.position.quantity 0.05))
  Check "$label initial margin reserved" ($afterOpen.usedMargin -gt $beforeOpen.usedMargin)
  $close=Api 'POST' "/orders/positions/$id/close" @{quantity='0.02'}
  $afterPartial=Snapshot
  $position=(Api 'GET' "/orders/positions/$id").data
  $exit=Money $close.data.order.executedPrice
  $expectedPnl=if ($side -eq 'BUY') { ($exit-$entry)*[decimal]0.02*100 } else { ($entry-$exit)*[decimal]0.02*100 }
  $expectedPnl=[decimal]::Round($expectedPnl,2,[MidpointRounding]::AwayFromZero)
  Check "$label partial success" ($close.success -eq $true -and $close.data.order.status -eq 'FILLED')
  Check "$label closing side opposite" ($close.data.order.side -eq $closingSide)
  Check "$label closing order quantity 0.02" (Near $close.data.order.quantity 0.02 0.00000001)
  Check "$label position ID preserved" ($close.data.position.id -eq $id -and $position.id -eq $id)
  Check "$label remains OPEN 0.03" ($position.status -eq 'OPEN' -and (Near $position.quantity 0.03 0.00000001) -and [string]::IsNullOrWhiteSpace([string]$position.closedAt))
  Check "$label partial realized PnL" (Near $close.data.realizedPnl $expectedPnl) "expected=$expectedPnl actual=$($close.data.realizedPnl)"
  Check "$label balance realizes partial PnL" (Near $afterPartial.balance ($afterOpen.balance+$expectedPnl))
  Check "$label partial adds one order" ($afterPartial.orders.Count -eq $afterOpen.orders.Count+1)
  Check "$label partial adds one trade" ($afterPartial.trades.Count -eq $afterOpen.trades.Count+1)
  Check "$label partial does not add position" ($afterPartial.positions.Count -eq $afterOpen.positions.Count)
  $partialTrades=@($afterPartial.trades | Where-Object orderId -eq $close.data.order.id)
  Check "$label partial trade exactly once" ($partialTrades.Count -eq 1)
  if ($partialTrades.Count -eq 1) {
    $trade=$partialTrades[0]
    Check "$label partial trade quantity/PnL" ($trade.positionId -eq $id -and $trade.side -eq $closingSide -and (Near $trade.quantity 0.02 0.00000001) -and (Near $trade.realizedPnl $expectedPnl))
  }
  Check "$label used margin decreases" ($afterPartial.usedMargin -lt $afterOpen.usedMargin -and $afterPartial.usedMargin -gt $beforeOpen.usedMargin) "before=$($afterOpen.usedMargin) after=$($afterPartial.usedMargin)"
  # Test invalid quantities without relying on undocumented validation error codes.
  foreach ($case in @(@{name='zero';qty='0'},@{name='negative';qty='-0.01'},@{name='bad step';qty='0.015'},@{name='exceeds remaining';qty='0.04'})) {
    $beforeInvalid=Snapshot
    $rejected=Rejected "/orders/positions/$id/close" @{quantity=$case.qty}
    Check "$label rejects $($case.name)" $rejected
    $afterInvalid=Snapshot
    Check-Unchanged "$label $($case.name)" $beforeInvalid $afterInvalid $id ([decimal]0.03)
  }
  $beforeFinal=Snapshot
  $final=Api 'POST' "/orders/positions/$id/close" @{}
  $afterFinal=Snapshot
  $finalPosition=(Api 'GET' "/orders/positions/$id").data
  $finalExit=Money $final.data.order.executedPrice
  $finalExpected=if ($side -eq 'BUY') { ($finalExit-$entry)*[decimal]0.03*100 } else { ($entry-$finalExit)*[decimal]0.03*100 }
  $finalExpected=[decimal]::Round($finalExpected,2,[MidpointRounding]::AwayFromZero)
  Check "$label final close succeeds with empty body" ($final.success -eq $true -and $final.data.order.status -eq 'FILLED')
  Check "$label final order quantity equals remaining" (Near $final.data.order.quantity 0.03 0.00000001)
  Check "$label final position CLOSED zero" ($finalPosition.status -eq 'CLOSED' -and (Near $finalPosition.quantity 0 0.00000001) -and -not [string]::IsNullOrWhiteSpace([string]$finalPosition.closedAt))
  Check "$label final unrealized PnL zero" (Near $finalPosition.unrealizedPnl 0)
  Check "$label final realized PnL" (Near $final.data.realizedPnl $finalExpected)
  Check "$label final balance realizes remaining PnL" (Near $afterFinal.balance ($beforeFinal.balance+$finalExpected))
  Check "$label final adds one order and trade" ($afterFinal.orders.Count -eq $beforeFinal.orders.Count+1 -and $afterFinal.trades.Count -eq $beforeFinal.trades.Count+1)
  Check "$label final margin released" (Near $afterFinal.usedMargin $beforeOpen.usedMargin)
  Check "$label final equity equals balance" (Near $afterFinal.equity $afterFinal.balance)
  $finalTrades=@($afterFinal.trades | Where-Object orderId -eq $final.data.order.id)
  Check "$label final trade quantity" ($finalTrades.Count -eq 1 -and (Near $finalTrades[0].quantity 0.03 0.00000001))
  $beforeDuplicate=Snapshot
  Check "$label duplicate final close rejected" (Rejected "/orders/positions/$id/close" @{} @(404))
  $afterDuplicate=Snapshot
  Check-Unchanged "$label duplicate" $beforeDuplicate $afterDuplicate $id ([decimal]0)
}
function Invoke-Pair([string]$url,[hashtable]$headers,[string]$jsonBody) {
  if (-not (Get-Command Start-ThreadJob -ErrorAction SilentlyContinue)) { throw 'Start-ThreadJob required (PowerShell 7 or ThreadJob module)' }
  $start=[DateTime]::UtcNow.AddSeconds(2).Ticks
  $jobs=@(1,2 | ForEach-Object {
    Start-ThreadJob -ArgumentList $url,$headers,$jsonBody,$start -ScriptBlock {
      param($url,$headers,$body,$ticks)
      while ([DateTime]::UtcNow.Ticks -lt $ticks) { Start-Sleep -Milliseconds 2 }
      try {
        $r=Invoke-RestMethod -Method POST -Uri $url -Headers $headers -ContentType 'application/json' -Body $body -ErrorAction Stop
        [pscustomobject]@{ok=$true;status=200;code='';data=$r.data}
      } catch {
        $status=0; if ($_.Exception.Response) { $status=[int]$_.Exception.Response.StatusCode }
        $code=''; try { $e=$_.ErrorDetails.Message | ConvertFrom-Json; $code=$e.error.code; if (-not $code) {$code=$e.code} } catch {}
        [pscustomobject]@{ok=$false;status=$status;code=$code;data=$null}
      }
    }
  })
  try {
    $null=$jobs | Wait-Job -Timeout 45
    if (@($jobs | Where-Object State -ne 'Completed').Count -gt 0) { throw 'Concurrent requests timed out' }
    $r=@($jobs | Receive-Job)
    if ($r.Count -ne 2) { throw "Expected 2 responses, got $($r.Count)" }
    return ,$r
  } finally { $jobs | Remove-Job -Force -ErrorAction SilentlyContinue }
}
function Run-Concurrency {
  New-TestAccount 'race'
  $open=Api 'POST' '/orders' @{symbol='XAUUSD';side='BUY';orderType='MARKET';quantity='0.03'}
  if (-not $open.data.position.id) { throw 'Concurrency opening response missing position ID' }
  $id=[string]$open.data.position.id
  $before=Snapshot
  $body=@{quantity='0.02'} | ConvertTo-Json -Compress
  $results=Invoke-Pair "$BaseUrl/orders/positions/$id/close" $script:headers $body
  $after=Snapshot
  $success=@($results | Where-Object ok)
  $rejected=@($results | Where-Object { -not $_.ok })
  $p=@($after.positions | Where-Object id -eq $id)
  Check 'Race exactly one partial close succeeds' ($success.Count -eq 1) "success=$($success.Count)"
  Check 'Race exactly one partial close rejected' ($rejected.Count -eq 1 -and $rejected[0].status -ge 400 -and $rejected[0].status -lt 500) "rejected=$($rejected.Count) status=$($rejected[0].status) code=$($rejected[0].code)"
  Check 'Race one order added' ($after.orders.Count -eq $before.orders.Count+1)
  Check 'Race one trade added' ($after.trades.Count -eq $before.trades.Count+1)
  Check 'Race no new position' ($after.positions.Count -eq $before.positions.Count)
  Check 'Race position OPEN quantity 0.01' ($p.Count -eq 1 -and $p[0].status -eq 'OPEN' -and (Near $p[0].quantity 0.01 0.00000001))
  if ($success.Count -eq 1) {
    Check 'Race balance credited once' (Near $after.balance ($before.balance+(Money $success[0].data.realizedPnl)))
    Check 'Race winner order quantity 0.02' (Near $success[0].data.order.quantity 0.02 0.00000001)
  } else {
    Check 'Race balance credited once' $false 'No unique winner'
    Check 'Race winner order quantity 0.02' $false 'No unique winner'
  }
  foreach ($r in $results) { Write-Host "  race result: success=$($r.ok) http=$($r.status) code=$($r.code)" }
}
try {
  $null=Api 'GET' '/health'
  Write-Host 'TEST 1: LONG partial close' -ForegroundColor Cyan
  Run-Side 'BUY'
  Write-Host 'TEST 2: SHORT partial close' -ForegroundColor Cyan
  Run-Side 'SELL'
  Write-Host 'TEST 3: Concurrent partial close' -ForegroundColor Cyan
  Run-Concurrency
} catch {
  $script:failed++
  Write-Host "[FATAL] $($_.Exception.Message)" -ForegroundColor Red
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
  Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
}
Write-Host "RESULT: passed=$script:passed failed=$script:failed"
if ($script:failed -gt 0) { exit 1 }
exit 0

