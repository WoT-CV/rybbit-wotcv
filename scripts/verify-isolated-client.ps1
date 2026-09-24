param([switch]$Offline)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$validationRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('rybbit-client-check-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $validationRoot | Out-Null
$paths = & git -C $repoRoot ls-files -- client shared package.json pnpm-lock.yaml pnpm-workspace.yaml server/package.json
if ($LASTEXITCODE -ne 0) { throw 'Cannot enumerate isolated build inputs' }
foreach ($relativePath in $paths) {
    # Never copy local secrets or build output/dependencies; git paths only.
    if ($relativePath -match '(^|/)\.env($|\.)') { continue }
    $destination = Join-Path $validationRoot $relativePath
    New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
    Copy-Item -LiteralPath (Join-Path $repoRoot $relativePath) -Destination $destination
}
if (Test-Path -LiteralPath (Join-Path $validationRoot 'server/src')) { throw 'Server sources leaked into validation root' }
Write-Output "Isolated client validation: $validationRoot"
Push-Location $validationRoot
try {
    $installArgs = @('pnpm', '--filter', 'client...', 'install', '--frozen-lockfile')
    if ($Offline) { $installArgs += '--offline' }
    & corepack @installArgs
    if ($LASTEXITCODE -ne 0) { throw 'Isolated frozen install failed' }
    $env:NEXT_TELEMETRY_DISABLED = '1'
    & corepack pnpm run build:client
    if ($LASTEXITCODE -ne 0) { throw 'Isolated client build failed' }
    Write-Output 'PASS: client/shared build without server/src. This is not an Alpine Docker validation.'
} finally {
    Pop-Location
    # Retained for inspection; no automatic recursive deletion.
    Write-Output "Validation artifacts retained: $validationRoot"
}
