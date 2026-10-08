# Génère un secret JWT et la clé anon (JWT HS256) pour PostgREST / AeroTeam.
# Usage :
#   .\make-anon-key.ps1 -Secret "SECRET_TRES_LONG_A_CONSERVER"
# ou pour générer un secret aléatoire :
#   .\make-anon-key.ps1 -GenerateSecret
param(
  [string]$Secret = '',
  [int]$Years = 10,
  [switch]$GenerateSecret
)

if ($GenerateSecret) {
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $Secret = [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
  Write-Host "Secret généré (à conserver) :" -ForegroundColor Yellow
  Write-Host $Secret
  Write-Host ""
}

if ([string]::IsNullOrWhiteSpace($Secret)) {
  Write-Error "Fournir -Secret ... ou utiliser -GenerateSecret"
  exit 1
}

function ConvertTo-B64Url([byte[]]$bytes) {
  [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$exp = [DateTimeOffset]::UtcNow.AddYears($Years).ToUnixTimeSeconds()

$header = '{"alg":"HS256","typ":"JWT"}'
$payload = '{"role":"anon","iss":"aeroteam","iat":' + $now + ',"exp":' + $exp + '}'

$h = ConvertTo-B64Url ([Text.Encoding]::UTF8.GetBytes($header))
$p = ConvertTo-B64Url ([Text.Encoding]::UTF8.GetBytes($payload))

$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($Secret)
$sig = ConvertTo-B64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$h.$p")))

Write-Host ""
Write-Host "1) postgrest.conf :" -ForegroundColor Cyan
Write-Host ('   jwt-secret = "' + $Secret + '"')
Write-Host ""
Write-Host "2) .env du front (build) :" -ForegroundColor Cyan
Write-Host ('   VITE_SUPABASE_ANON_KEY=' + "$h.$p.$sig")
