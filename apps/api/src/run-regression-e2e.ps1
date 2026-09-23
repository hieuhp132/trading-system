$ErrorActionPreference = 'Stop'

Set-Location (Split-Path -Parent $PSScriptRoot)

$tests = @(
    'test-limit-order-e2e.ts'
    'test-limit-execution-e2e.ts'
    'test-limit-worker-integration.ts'
    'test-automatic-stops.ts'
    'test-cancel-order-concurrency.ts'
    'test-partial-close-e2e.ts'
    'test-partial-close-concurrency.ts'
    'test-stop-partial-close-concurrency.ts'
    'test-limit-stop-concurrency.ts'
)

function Assert-SafeEnvironment {
    if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL) -or
        [string]::IsNullOrWhiteSpace($env:TEST_DATABASE_URL) -or
        $env:DATABASE_URL -cne $env:TEST_DATABASE_URL) {
        throw '[STOP] DATABASE_URL must equal TEST_DATABASE_URL.'
    }

    $databaseName = ([uri]$env:DATABASE_URL).AbsolutePath.TrimStart('/')

    if ($databaseName -cne 'gold_trading_test') {
        throw "[STOP] Unexpected database: $databaseName"
    }

    if ($env:TEST_BASE_URL -cne 'http://localhost:4001/api/v1') {
        throw '[STOP] TEST_BASE_URL must be http://localhost:4001/api/v1.'
    }

    if ($env:MARKET_DATA_PROVIDER -cne 'demo' -or
        $env:STOP_WORKER_ENABLED -cne 'false' -or
        $env:LIMIT_WORKER_ENABLED -cne 'false') {
        throw '[STOP] Demo provider and disabled workers are required.'
    }
}

$passed = 0
$failed = 0
$completed = @()

try {
    Assert-SafeEnvironment

    foreach ($test in $tests) {
        Assert-SafeEnvironment

        $path = Join-Path $PSScriptRoot $test

        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "[STOP] Missing test file: $path"
        }

        Write-Host ""
        Write-Host "========== RUN: $test ==========" -ForegroundColor Cyan

        & pnpm exec tsx $path

        if ($LASTEXITCODE -ne 0) {
            $failed++
            throw "[FAIL] $test exited with code $LASTEXITCODE"
        }

        $passed++
        $completed += $test

        Write-Host "[PASS] $test" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "REGRESSION RESULT: passed=$passed failed=$failed" -ForegroundColor Green
    exit 0
}
catch {
    if ($failed -eq 0) {
        $failed = 1
    }

    Write-Host ""
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "REGRESSION RESULT: passed=$passed failed=$failed" -ForegroundColor Red
    exit 1
}