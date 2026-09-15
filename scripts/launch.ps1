$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$RunDir = Join-Path $Root ".run"
$EnvFile = Join-Path $Root ".env"
$EnvExample = Join-Path $Root ".env.example"
$PostgresContainer = "msp-crm-postgres"
$PostgresVolume = "msp_crm_postgres_data"

Set-Location -LiteralPath $Root
New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

function Write-Step([string]$Message) {
    Write-Host "[MSP CRM] $Message" -ForegroundColor Cyan
}

function Fail([string]$Message) {
    throw $Message
}

function Get-CommandPath([string]$Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    return $null
}

function Normalize-CommandOutput($Value) {
    if ($null -eq $Value) { return "" }
    return $Value.ToString().Trim()
}

function Set-DotEnvValue([string]$Key, [string]$Value) {
    $lines = @()
    if (Test-Path -LiteralPath $EnvFile) { $lines = @(Get-Content -LiteralPath $EnvFile) }
    $pattern = "^" + [Regex]::Escape($Key) + "="
    $found = $false
    $updated = foreach ($line in $lines) {
        if ($line -match $pattern) {
            $found = $true
            "$Key=$Value"
        } else {
            $line
        }
    }
    if (-not $found) { $updated += "$Key=$Value" }
    Set-Content -LiteralPath $EnvFile -Value $updated -Encoding ASCII
}

function Load-DotEnv {
    foreach ($raw in Get-Content -LiteralPath $EnvFile) {
        $line = $raw.Trim()
        if (-not $line -or $line.StartsWith("#")) { continue }
        $parts = $line -split "=", 2
        if ($parts.Count -ne 2) { continue }
        [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1], "Process")
    }
}

function Stop-TrackedProcess([string]$Name) {
    $pidFile = Join-Path $RunDir "$Name.pid"
    if (-not (Test-Path -LiteralPath $pidFile)) { return }
    $savedPid = (Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($savedPid -and (Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue)) {
        Write-Step "Stopping previous $Name process tree..."
        & taskkill.exe /PID $savedPid /T /F *> $null
    }
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

function Invoke-Pnpm([string[]]$PnpmArgs) {
    if ($script:PnpmExe) {
        & $script:PnpmExe @PnpmArgs
    } else {
        & $script:CorepackExe pnpm @PnpmArgs
    }
    if ($LASTEXITCODE -ne 0) {
        Fail "pnpm command failed: pnpm $($PnpmArgs -join ' ')"
    }
}

function Start-AppWindow([string]$Name, [string]$ScriptName) {
    $title = "MSP CRM - $Name"
    $pnpmCommand = if ($script:PnpmExe) { "pnpm $ScriptName" } else { "corepack pnpm $ScriptName" }
    $command = "title $title && cd /d `"$Root`" && $pnpmCommand"
    $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $command -PassThru
    Set-Content -LiteralPath (Join-Path $RunDir "$Name.pid") -Value $process.Id -Encoding ASCII
    Write-Step "$Name started in a separate window (PID $($process.Id))."
}

function Test-Http([string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch {
        return $false
    }
}

function Test-DockerEngine {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "SilentlyContinue"
        & $script:DockerExe version --format "{{.Server.Version}}" 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Ensure-DockerEngine {
    if (Test-DockerEngine) {
        Write-Step "Docker engine is running."
        return
    }

    $candidates = @(
        (Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"),
        (Join-Path $env:LOCALAPPDATA "Docker\Docker Desktop.exe")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    $dockerDesktop = $candidates | Select-Object -First 1
    if (-not $dockerDesktop) {
        Fail "Docker is installed, but the Docker engine is not running and Docker Desktop could not be located. Start Docker Desktop manually, wait for it to report that the engine is running, then run LAUNCH.bat again."
    }

    Write-Step "Docker engine is not running. Starting Docker Desktop..."
    Start-Process -FilePath $dockerDesktop | Out-Null

    for ($attempt = 1; $attempt -le 60; $attempt++) {
        if (Test-DockerEngine) {
            Write-Step "Docker Desktop is ready."
            return
        }
        if ($attempt -eq 1) { Write-Step "Waiting for Docker Desktop to initialize..." }
        Start-Sleep -Seconds 2
    }

    Fail "Docker Desktop was started but the Docker engine did not become ready within 2 minutes. Open Docker Desktop, resolve any startup/WSL error it shows, then run LAUNCH.bat again."
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor DarkCyan
Write-Host "        MSP CRM + Help Desk Launcher" -ForegroundColor White
Write-Host "===============================================" -ForegroundColor DarkCyan
Write-Host ""

Write-Step "Checking prerequisites..."
$NodeExe = Get-CommandPath "node"
if (-not $NodeExe) { Fail "Node.js is not installed or is not in PATH. Install Node.js 24.11 or newer." }
$nodeVersion = (& $NodeExe -p "process.versions.node").Trim()
if ([version]$nodeVersion -lt [version]"24.11.0") {
    Fail "Node.js $nodeVersion is installed, but this project requires Node.js 24.11 or newer."
}

$script:PnpmExe = Get-CommandPath "pnpm"
$script:CorepackExe = Get-CommandPath "corepack"
if (-not $script:PnpmExe -and -not $script:CorepackExe) {
    Fail "pnpm is not installed and Corepack is unavailable. Install pnpm 10.34.5 or enable Corepack."
}
if (-not $script:PnpmExe) {
    & $script:CorepackExe pnpm --version *> $null
    if ($LASTEXITCODE -ne 0) { Fail "Corepack could not start pnpm." }
}

$script:DockerExe = Get-CommandPath "docker"
if (-not $script:DockerExe) { Fail "Docker Desktop is not installed or docker.exe is not in PATH." }
Ensure-DockerEngine

if (-not (Test-Path -LiteralPath $EnvFile)) {
    if (-not (Test-Path -LiteralPath $EnvExample)) { Fail ".env.example is missing." }
    Copy-Item -LiteralPath $EnvExample -Destination $EnvFile
    Write-Step "Created .env from .env.example."
}

$existingKeyLine = Get-Content -LiteralPath $EnvFile | Where-Object { $_ -match '^APP_ENCRYPTION_KEY=' } | Select-Object -First 1
$existingKey = if ($existingKeyLine) { ($existingKeyLine -split '=', 2)[1].Trim() } else { "" }
if (-not $existingKey) {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $hexKey = -join ($bytes | ForEach-Object { $_.ToString("x2") })
    Set-DotEnvValue "APP_ENCRYPTION_KEY" $hexKey
    Write-Step "Generated a local encryption key for integration secrets."
}

Load-DotEnv
if (-not $env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD = "change-me-local" }
if (-not $env:DATABASE_URL) { $env:DATABASE_URL = "postgresql://msp_crm:$($env:POSTGRES_PASSWORD)@localhost:5432/msp_crm" }
if (-not $env:NEXT_PUBLIC_API_URL) { $env:NEXT_PUBLIC_API_URL = "http://localhost:3001/api" }
if (-not $env:PUBLIC_API_URL) { $env:PUBLIC_API_URL = "http://localhost:3001/api" }
if (-not $env:CORS_ORIGINS) { $env:CORS_ORIGINS = "http://localhost:3000" }

Write-Step "Restarting any previously tracked app processes..."
Stop-TrackedProcess "web"
Stop-TrackedProcess "api"
Stop-TrackedProcess "worker"

Write-Step "Preparing local PostgreSQL..."
$containerName = @(& $script:DockerExe ps -a --filter "name=^/$PostgresContainer$" --format "{{.Names}}") | Select-Object -First 1
$containerName = Normalize-CommandOutput $containerName
if ($containerName -ne $PostgresContainer) {
    & $script:DockerExe run --name $PostgresContainer `
        -e "POSTGRES_DB=msp_crm" `
        -e "POSTGRES_USER=msp_crm" `
        -e "POSTGRES_PASSWORD=$($env:POSTGRES_PASSWORD)" `
        -p "5432:5432" `
        -v "$PostgresVolume`:/var/lib/postgresql/data" `
        -d "postgres:18-alpine" *> $null
    if ($LASTEXITCODE -ne 0) { Fail "Could not create the local PostgreSQL Docker container. Port 5432 may already be in use." }
    Write-Step "Created PostgreSQL container."
} else {
    $running = @(& $script:DockerExe ps --filter "name=^/$PostgresContainer$" --filter "status=running" --format "{{.Names}}") | Select-Object -First 1
    $running = Normalize-CommandOutput $running
    if ($running -ne $PostgresContainer) {
        & $script:DockerExe start $PostgresContainer *> $null
        if ($LASTEXITCODE -ne 0) { Fail "Could not start the local PostgreSQL Docker container." }
        Write-Step "Started PostgreSQL container."
    }
}

$databaseReady = $false
for ($attempt = 1; $attempt -le 40; $attempt++) {
    & $script:DockerExe exec $PostgresContainer pg_isready -U msp_crm -d msp_crm *> $null
    if ($LASTEXITCODE -eq 0) {
        $databaseReady = $true
        break
    }
    Start-Sleep -Seconds 1
}
if (-not $databaseReady) { Fail "PostgreSQL did not become ready within 40 seconds." }
Write-Step "PostgreSQL is ready."

Write-Step "Installing/updating project dependencies..."
Invoke-Pnpm @("install", "--no-frozen-lockfile")

Write-Step "Generating Prisma client..."
Invoke-Pnpm @("db:generate")

Write-Step "Applying the current database schema..."
Invoke-Pnpm @("--filter", "@msp-crm/database", "exec", "prisma", "db", "push")

Write-Step "Applying idempotent seed data..."
Invoke-Pnpm @("db:seed")

Write-Step "Starting application services..."
Start-AppWindow "api" "dev:api"
Start-AppWindow "worker" "dev:worker"
Start-AppWindow "web" "dev:web"

Write-Step "Waiting for the web application..."
$webReady = $false
for ($attempt = 1; $attempt -le 60; $attempt++) {
    if (Test-Http "http://localhost:3000") {
        $webReady = $true
        break
    }
    Start-Sleep -Seconds 1
}

if ($webReady) {
    Write-Step "MSP CRM is running at http://localhost:3000"
    Start-Process "http://localhost:3000"
} else {
    Write-Warning "The service windows were started, but the web UI did not respond within 60 seconds. Check the MSP CRM - Web and MSP CRM - API windows for an error."
}

Write-Host ""
Write-Host "Launch complete. You can close this launcher window." -ForegroundColor Green
Write-Host "Use STOP.bat when you want to shut down the local stack." -ForegroundColor DarkGray
exit 0
