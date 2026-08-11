# =============================================================================
#  Construye el APK de Tu Garantia con Bubblewrap.
#
#  Uso:   powershell -ExecutionPolicy Bypass -File .\construir.ps1
#         powershell -ExecutionPolicy Bypass -File .\construir.ps1 -Url https://otro.sitio/
#
#  La primera vez descarga Java y el SDK de Android (~1,5 GB). Solo pasa una vez.
#  Ver LEEME.md al lado para las trampas: la llave de firma, Play Protect, y por
#  que WhatsApp no deja mandar .apk.
# =============================================================================

param(
  [string]$Url = "https://joanhispanista-star.github.io/Tugarantia/app/app.webmanifest"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Paso($n, $t) { Write-Output ""; Write-Output ("[" + $n + "] " + $t) }
function Mal($t)      { Write-Output ""; Write-Output ("X  " + $t); exit 1 }

Paso 1 "Comprobando que el sitio responda"
# Sin sitio no hay nada que envolver, y el error de Bubblewrap cuando falta es
# largo y no dice esto. Mejor caerse aqui, en una linea que se entiende.
try {
  $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 25
  Write-Output ("    OK - " + $Url + " responde " + $r.StatusCode)
} catch {
  Mal ("No pude leer " + $Url + "`n" +
       "   Si es GitHub Pages: Settings -> Pages -> rama main, carpeta / (root),`n" +
       "   y espera dos minutos. Sin HTTPS no se puede construir el APK.")
}

if ($Url -notlike "https://*") {
  Mal "La direccion tiene que ser https. Android no acepta http para esto."
}

Paso 2 "Comprobando Node"
try { $nv = (node --version) } catch { Mal "No encuentro Node. Instalalo desde nodejs.org" }
Write-Output ("    OK - Node " + $nv)

Paso 3 "Instalando Bubblewrap (si hace falta)"
$tieneBw = $false
try { & npx --no-install @bubblewrap/cli --version *> $null; $tieneBw = ($LASTEXITCODE -eq 0) } catch { }
if (-not $tieneBw) {
  Write-Output "    Instalando @bubblewrap/cli en este proyecto..."
  & npm install --no-save @bubblewrap/cli
  if ($LASTEXITCODE -ne 0) { Mal "No se pudo instalar Bubblewrap." }
}
Write-Output "    OK"

Paso 4 "Preparando el proyecto Android"
# `init` solo la primera vez: si ya hay proyecto, volver a correrlo pisa la
# configuracion de twa-manifest.json, que esta comentada a mano.
if (Test-Path ".\app\build.gradle") {
  Write-Output "    Ya existe el proyecto. Se salta init y se usa twa-manifest.json tal como esta."
} else {
  Write-Output "    Primera vez: esto descarga Java y el SDK de Android (~1,5 GB)."
  Write-Output "    Acepta las licencias cuando pregunte. Tarda unos 15 minutos."
  Write-Output ""
  Write-Output "    IMPORTANTE - cuando pida las contrasenas del keystore:"
  Write-Output "    inventate una, ANOTALA EN PAPEL y guardala fuera de este computador."
  Write-Output "    Si la pierdes no podras volver a actualizar la app nunca."
  Write-Output ""
  & npx @bubblewrap/cli init --manifest $Url
  if ($LASTEXITCODE -ne 0) { Mal "Fallo el init de Bubblewrap." }
}

Paso 5 "Construyendo el APK"
& npx @bubblewrap/cli build
if ($LASTEXITCODE -ne 0) { Mal "Fallo la construccion. Mira el error de arriba." }

Paso 6 "Generando assetlinks.json"
# Bubblewrap ya NO lo genera solo (cambio de 2026). Sin este archivo publicado,
# la app abre con la barra de direcciones de Chrome encima y parece rota.
& npx @bubblewrap/cli fingerprint generateAssetLinks --output ".\assetlinks.json"
if ($LASTEXITCODE -eq 0 -and (Test-Path ".\assetlinks.json")) {
  $destino = Join-Path (Split-Path $PSScriptRoot -Parent) ".well-known"
  if (-not (Test-Path $destino)) { New-Item -ItemType Directory -Path $destino | Out-Null }
  Copy-Item ".\assetlinks.json" (Join-Path $destino "assetlinks.json") -Force
  Write-Output ("    OK - copiado a " + (Join-Path $destino "assetlinks.json"))
  Write-Output "    FALTA SUBIRLO: git add .well-known && git commit && git push"
} else {
  Write-Output "    No se pudo generar solo. Sacalo a mano:"
  Write-Output "      npx @bubblewrap/cli fingerprint list"
  Write-Output "    y arma el archivo con la huella SHA-256."
}

Write-Output ""
Write-Output "================================================================"
Get-ChildItem -Path "." -Filter "*.apk" -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Output ("  APK:  " + $_.Name + "   (" + [math]::Round($_.Length/1MB,1) + " MB)")
}
Get-ChildItem -Path "." -Filter "*.aab" -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Output ("  AAB:  " + $_.Name + "   (" + [math]::Round($_.Length/1MB,1) + " MB)")
}
Write-Output "================================================================"
Write-Output ""
Write-Output "  Lo que sigue:"
Write-Output "   1. Sube .well-known/assetlinks.json al sitio (git push) o saldra"
Write-Output "      la barra del navegador encima de la app."
Write-Output "   2. Sube el .apk a GitHub -> Releases y manda ESE enlace."
Write-Output "      WhatsApp bloquea los archivos .apk: hay que mandar el enlace."
Write-Output "   3. Avisale al cliente que va a salir un aviso de app desconocida"
Write-Output "      ANTES de que le salga. Ver LEEME.md."
Write-Output "   4. Guarda android.keystore y su contrasena fuera de este equipo."
Write-Output ""
