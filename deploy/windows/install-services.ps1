# Enregistre PostgREST comme service Windows (via NSSM).
# Usage :
#   .\install-services.ps1 -NssmPath C:\AeroTeam\nssm\nssm.exe
param(
  [string]$NssmPath = 'C:\AeroTeam\nssm\nssm.exe',
  [string]$PostgrestDir = 'C:\AeroTeam\postgrest',
  [string]$ServiceName = 'AeroTeamPostgREST'
)

if (-not (Test-Path -LiteralPath $NssmPath)) {
  Write-Error "NSSM introuvable : $NssmPath (télécharger sur https://nssm.cc/download)"
  exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $PostgrestDir 'postgrest.exe'))) {
  Write-Error "postgrest.exe introuvable dans $PostgrestDir"
  exit 1
}

# (Re)création du service
& $NssmPath stop $ServiceName 2>$null | Out-Null
& $NssmPath remove $ServiceName confirm 2>$null | Out-Null

& $NssmPath install $ServiceName (Join-Path $PostgrestDir 'postgrest.exe')
& $NssmPath set $ServiceName AppParameters (Join-Path $PostgrestDir 'postgrest.conf')
& $NssmPath set $ServiceName AppDirectory $PostgrestDir
& $NssmPath set $ServiceName AppStdout (Join-Path $PostgrestDir 'postgrest.log')
& $NssmPath set $ServiceName AppStderr (Join-Path $PostgrestDir 'postgrest.err.log')
& $NssmPath set $ServiceName AppRotateFiles 1
& $NssmPath set $ServiceName Start SERVICE_AUTO_START
& $NssmPath start $ServiceName

Write-Host "Service '$ServiceName' installé et démarré." -ForegroundColor Green
Write-Host "Test : http://localhost:3000/ (liste des routes PostgREST)"
