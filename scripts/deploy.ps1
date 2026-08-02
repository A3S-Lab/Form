[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 4176,
  [switch]$NoStart
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$bun = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bun) {
  throw 'Bun was not found. Run: winget install --id Oven-sh.Bun --exact'
}
$arguments = @('scripts/deploy.mjs', '--port', [string]$Port, '--no-start')
Push-Location $projectRoot
try {
  & $bun.Source @arguments
  if ($LASTEXITCODE -ne 0) { throw "Deployment failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
}

if ($NoStart) { return }

function Test-A3SFormHealth {
  try {
    $response = Invoke-RestMethod -UseBasicParsing -Uri "http://127.0.0.1:$Port/.well-known/a3s-health" -TimeoutSec 2
    return $response.ok -eq $true -and $response.service -eq 'a3s-form-playground'
  } catch {
    return $false
  }
}

if (Test-A3SFormHealth) {
  Write-Host "A3S Form is already running: http://127.0.0.1:$Port"
  return
}

$runtimeRoot = Join-Path $projectRoot '.a3s-form'
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
$stdoutPath = Join-Path $runtimeRoot 'playground.out.log'
$stderrPath = Join-Path $runtimeRoot 'playground.err.log'
$pidPath = Join-Path $runtimeRoot 'playground.pid'
$previousPid = if (Test-Path -LiteralPath $pidPath) { Get-Content -LiteralPath $pidPath -Raw } else { $null }
if ($previousPid -and (Get-Process -Id ([int]$previousPid) -ErrorAction SilentlyContinue)) {
  throw "A stale A3S Form process is still running with PID $previousPid. Use scripts\stop.ps1 first."
}

$server = Start-Process `
  -FilePath $bun.Source `
  -ArgumentList 'scripts/serve-playground.mjs' `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -PassThru
Set-Content -LiteralPath $pidPath -Value $server.Id -Encoding Ascii

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
  Start-Sleep -Milliseconds 200
  if ($server.HasExited) { break }
  if (Test-A3SFormHealth) {
    $ready = $true
    break
  }
}
if (-not $ready) {
  if (-not $server.HasExited) { Stop-Process -Id $server.Id }
  throw "The playground did not start. Review $stderrPath"
}

Write-Host "Deployment complete: http://127.0.0.1:$Port"
Write-Host "The local service is running in a hidden process (PID $($server.Id))."
