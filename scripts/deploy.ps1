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

$arguments = @('scripts/deploy.mjs', '--port', [string]$Port)
if ($NoStart) { $arguments += '--no-start' }
Push-Location $projectRoot
try {
  & $bun.Source @arguments
  if ($LASTEXITCODE -ne 0) { throw "Deployment failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
}
