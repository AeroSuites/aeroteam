# Sauvegarde quotidienne AeroTeam (dump PostgreSQL compressé + purge > 30 jours).
# Tâche planifiée : voir README.md section 8.
# Le mot de passe de postgres doit être disponible : définir PGPASSWORD
# au niveau système, ou créer %APPDATA%\postgresql\pgpass.conf (recommandé).
param(
  [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin',
  [string]$Db = 'aeroteam',
  [string]$User = 'postgres',
  [string]$OutDir = 'C:\AeroTeam\backups',
  [int]$KeepDays = 30
)

if (-not (Test-Path -LiteralPath $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$file = Join-Path $OutDir "aeroteam_$stamp.dump"

& (Join-Path $PgBin 'pg_dump.exe') -U $User -Fc -f $file $Db
if ($LASTEXITCODE -ne 0) {
  Write-Error "Échec du dump PostgreSQL (code $LASTEXITCODE)"
  exit 1
}

Get-ChildItem -LiteralPath $OutDir -Filter '*.dump' |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
  Remove-Item -Force

Write-Host "Sauvegarde OK : $file" -ForegroundColor Green
