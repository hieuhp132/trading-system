$ErrorActionPreference = 'Stop'

# ============================================================
# PROJECT ROOT
# ============================================================

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# ============================================================
# LOAD .env.test
# ============================================================

$envFile = Join-Path $ProjectRoot '.env.test'

if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    throw "[STOP] Missing .env.test: $envFile"
}

Get-Content $envFile | ForEach-Object {

    $line = $_.Trim()

    if (
        [string]::IsNullOrWhiteSpace($line) -or
        $line.StartsWith('#')
    ) {
        return
    }

    $parts = $line -split '=', 2

    if ($parts.Count -ne 2) {
        return
    }

    $name = $parts[0].Trim()
    $value = $parts[1].Trim()

    # Remove surrounding quotes
    if (
        ($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
        $value = $value.Substring(1, $value.Length - 2)
    }

    [Environment]::SetEnvironmentVariable(
        $name,
        $value,
        'Process'
    )
}

Write-Host "[ENV] Loaded .env.test" -ForegroundColor DarkGray

# ============================================================
# TEST LIST
# ============================================================

$tests = @(
    '../src/tests/test-limit-order-e2e.ts'
    '../src/tests/test-limit-execution-e2e.ts'
    '../src/tests/test-limit-worker-integration.ts'
    '../src/tests/test-automatic-stops.ts'
    '../src/tests/test-cancel-order-concurrency.ts'
    '../src/tests/test-partial-close-e2e.ts'
    '../src/tests/test-partial-close-concurrency.ts'
    '../src/tests/test-stop-partial-close-concurrency.ts'
    '../src/tests/test-limit-stop-concurrency.ts'
)

# ============================================================
# SAFETY
# ============================================================

function Assert-SafeEnvironment {

    if (
        [string]::IsNullOrWhiteSpace($env:DATABASE_URL) -or
        [string]::IsNullOrWhiteSpace($env:TEST_DATABASE_URL) -or
        $env:DATABASE_URL -cne $env:TEST_DATABASE_URL
    ) {
        throw '[STOP] DATABASE_URL must equal TEST_DATABASE_URL.'
    }

    $databaseName = ([uri]$env:DATABASE_URL).AbsolutePath.TrimStart('/')

    if ($databaseName -cne 'gold_trading_test') {
        throw "[STOP] Unexpected database: $databaseName"
    }

    if ($env:NODE_ENV -cne 'test') {
        throw '[STOP] NODE_ENV must be test.'
    }

    if ($env:PORT -cne '4001') {
        throw '[STOP] PORT must be 4001.'
    }

    if ($env:TEST_BASE_URL -cne 'http://localhost:4001/api/v1') {
        throw '[STOP] TEST_BASE_URL must be http://localhost:4001/api/v1.'
    }

    if (
        $env:MARKET_DATA_PROVIDER -cne 'demo' -or
        $env:STOP_WORKER_ENABLED -cne 'false' -or
        $env:LIMIT_WORKER_ENABLED -cne 'false'
    ) {
        throw '[STOP] Demo provider and disabled workers are required.'
    }
}

# ============================================================
# CHECK PORT
# ============================================================

function Assert-TestPortFree {

    $connection = Get-NetTCPConnection `
        -LocalPort 4001 `
        -State Listen `
        -ErrorAction SilentlyContinue

    if ($connection) {

        $pids = $connection |
            Select-Object -ExpandProperty OwningProcess -Unique

        throw "[STOP] Port 4001 is already in use by PID(s): $($pids -join ', ')"
    }
}

# ============================================================
# WAIT FOR API
# ============================================================

function Wait-ForTestApi {

    $healthUrl = 'http://localhost:4001/api/v1/health'

    Write-Host ""
    Write-Host "[API] Waiting for test API..." -ForegroundColor Yellow

    for ($attempt = 1; $attempt -le 30; $attempt++) {

        # Detect API process crash while waiting.
        if ($script:apiProcess -and $script:apiProcess.HasExited) {
            throw "[STOP] Test API exited before becoming healthy. ExitCode=$($script:apiProcess.ExitCode)"
        }

        try {

            $response = Invoke-RestMethod `
                -Uri $healthUrl `
                -Method Get `
                -TimeoutSec 2

            if (
                $response.status -eq 'ok' -and
                $response.database -eq 'connected'
            ) {
                Write-Host "[API] Test API is ready." -ForegroundColor Green

                Write-Host "[API] Health:" -ForegroundColor DarkGray
                $response |
                    ConvertTo-Json -Depth 10 |
                    Write-Host

                return
            }
        }
        catch {
            # API may still be starting.
        }

        Write-Host "[API] Waiting... attempt $attempt/30" -ForegroundColor DarkGray
        Start-Sleep -Seconds 1
    }

    throw '[STOP] Test API did not become healthy within 30 seconds.'
}

# ============================================================
# VARIABLES
# ============================================================

$passed = 0
$failed = 0

$apiProcess = $null

$apiStdout = Join-Path $ProjectRoot 'tests\.e2e-api.stdout.log'
$apiStderr = Join-Path $ProjectRoot 'tests\.e2e-api.stderr.log'

# ============================================================
# RUN
# ============================================================

try {

    # --------------------------------------------------------
    # 1. Safety
    # --------------------------------------------------------

    Assert-SafeEnvironment
    Assert-TestPortFree

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host " E2E REGRESSION TEST" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan

    Write-Host ""
    Write-Host "[ENV] NODE_ENV            = $env:NODE_ENV"
    Write-Host "[ENV] PORT                = $env:PORT"
    Write-Host "[ENV] DATABASE            = gold_trading_test"
    Write-Host "[ENV] TEST_BASE_URL       = $env:TEST_BASE_URL"
    Write-Host "[ENV] MARKET_DATA_PROVIDER= $env:MARKET_DATA_PROVIDER"
    Write-Host "[ENV] STOP_WORKER_ENABLED = $env:STOP_WORKER_ENABLED"
    Write-Host "[ENV] LIMIT_WORKER_ENABLED= $env:LIMIT_WORKER_ENABLED"

    # --------------------------------------------------------
    # 2. Validate test files before starting API
    # --------------------------------------------------------

    foreach ($test in $tests) {

        $path = Join-Path $PSScriptRoot $test

        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "[STOP] Missing test file: $path"
        }
    }

    # --------------------------------------------------------
    # 3. Remove old API logs
    # --------------------------------------------------------

    Remove-Item $apiStdout -Force -ErrorAction SilentlyContinue
    Remove-Item $apiStderr -Force -ErrorAction SilentlyContinue

    # --------------------------------------------------------
    # 4. Start isolated test API
    #
    # Environment variables loaded above are inherited by the
    # child process.
    # --------------------------------------------------------

    Write-Host ""
    Write-Host "[API] Starting isolated API on port 4001..." -ForegroundColor Yellow

    $apiProcess = Start-Process `
        -FilePath "pnpm.cmd" `
        -ArgumentList @(
            'exec',
            'tsx',
            'src/main.ts'
        ) `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $apiStdout `
        -RedirectStandardError $apiStderr `
        -PassThru `
        -NoNewWindow

    Write-Host "[API] Process started. PID=$($apiProcess.Id)" -ForegroundColor DarkGray

    # --------------------------------------------------------
    # 5. Wait for API
    # --------------------------------------------------------

    Wait-ForTestApi

    # Safety again after API startup.
    Assert-SafeEnvironment

    # --------------------------------------------------------
    # 6. Run tests
    # --------------------------------------------------------

    foreach ($test in $tests) {

        Assert-SafeEnvironment

        $path = Join-Path $PSScriptRoot $test

        Write-Host ""
        Write-Host "========== RUN: $test ==========" -ForegroundColor Cyan

        & pnpm exec tsx $path

        if ($LASTEXITCODE -ne 0) {

            $failed++

            throw "[FAIL] $test exited with code $LASTEXITCODE"
        }

        $passed++

        Write-Host "[PASS] $test" -ForegroundColor Green
    }

    # --------------------------------------------------------
    # SUCCESS
    # --------------------------------------------------------

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host " REGRESSION RESULT" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "passed=$passed failed=$failed" -ForegroundColor Green

    exit 0
}
catch {

    if ($failed -eq 0) {
        $failed = 1
    }

    Write-Host ""
    Write-Host $_.Exception.Message -ForegroundColor Red

    if (Test-Path $apiStderr) {

        $stderr = Get-Content $apiStderr -ErrorAction SilentlyContinue

        if ($stderr) {

            Write-Host ""
            Write-Host "========== API STDERR ==========" -ForegroundColor Red

            $stderr | Select-Object -Last 50 | Write-Host
        }
    }

    Write-Host ""
    Write-Host "REGRESSION RESULT: passed=$passed failed=$failed" -ForegroundColor Red

    exit 1
}
finally {

    # --------------------------------------------------------
    # ALWAYS STOP TEST API
    # --------------------------------------------------------

    if ($apiProcess) {

        Write-Host ""
        Write-Host "[API] Stopping test API..." -ForegroundColor Yellow

        try {

            # pnpm may spawn Node as a child process.
            # taskkill /T terminates the complete process tree.
            & taskkill.exe `
                /PID $apiProcess.Id `
                /T `
                /F 2>$null | Out-Null
        }
        catch {
            Write-Host "[WARN] Failed to stop API process tree cleanly." -ForegroundColor Yellow
        }
    }

    Start-Sleep -Milliseconds 500

    $remaining = Get-NetTCPConnection `
        -LocalPort 4001 `
        -State Listen `
        -ErrorAction SilentlyContinue

    if ($remaining) {

        Write-Host "[WARN] Port 4001 is still in use." -ForegroundColor Yellow
    }
    else {

        Write-Host "[API] Port 4001 released." -ForegroundColor Green
    }
}