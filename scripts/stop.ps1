param(
    [switch]$StopDatabase
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$RunDir = Join-Path $Root ".run"
$PostgresContainer = "msp-crm-postgres"

Set-Location -LiteralPath $Root

function Write-Step([string]$Message) {
    Write-Host "[MSP CRM] $Message" -ForegroundColor Cyan
}

function Stop-TrackedProcess([string]$Name) {
    $pidFile = Join-Path $RunDir "$Name.pid"
    if (-not (Test-Path -LiteralPath $pidFile)) {
        Write-Step "$Name is not tracked as running."
        return
    }

    $savedPid = (Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($savedPid -and (Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue)) {
        Write-Step "Stopping $Name process tree..."
        & taskkill.exe /PID $savedPid /T /F *> $null
    } else {
        Write-Step "$Name was already stopped."
    }

    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor DarkCyan
Write-Host "          MSP CRM + Help Desk Stop" -ForegroundColor White
Write-Host "===============================================" -ForegroundColor DarkCyan
Write-Host ""

Stop-TrackedProcess "web"
Stop-TrackedProcess "api"
Stop-TrackedProcess "worker"

if ($StopDatabase) {
    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if ($docker) {
        $running = @(& $docker.Source ps --filter "name=^/$PostgresContainer$" --filter "status=running" --format "{{.Names}}") | Select-Object -First 1
        $running = ([string]$running).Trim()
        if ($running -eq $PostgresContainer) {
            Write-Step "Stopping PostgreSQL container..."
            & $docker.Source stop $PostgresContainer *> $null
        }
    }
}

Write-Host ""
Write-Host "MSP CRM local services are stopped." -ForegroundColor Green
exit 0
