Set-Location $PSScriptRoot

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "Node.js was not found on this computer." -ForegroundColor Red
    Write-Host "Run install.bat (in this same folder) first, then try again."
    Read-Host "Press Enter to close this window"
    exit 1
}

$sevenZipPaths = @(
    "$env:ProgramFiles\7-Zip\7z.exe",
    "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
)
$sevenZip = $sevenZipPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $sevenZip) { $sevenZip = (Get-Command 7z -ErrorAction SilentlyContinue).Source }
if (-not $sevenZip) {
    Write-Host "7-Zip was not found on this computer." -ForegroundColor Red
    Write-Host "Run install.bat (in this same folder) first, then try again."
    Read-Host "Press Enter to close this window"
    exit 1
}

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Keep this window open while you use the app in your browser." -ForegroundColor Cyan
Write-Host " To stop the server when you're done, do ANY of these:" -ForegroundColor Cyan
Write-Host "   - Press Ctrl+C in this window" -ForegroundColor Cyan
Write-Host "   - Click the X to close this window" -ForegroundColor Cyan
Write-Host "   - Run stop.bat (from anywhere)" -ForegroundColor Cyan
Write-Host " All three shut it down the same safe way." -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$port = 4173
Start-Process "http://localhost:$port"
node server.js

Write-Host ""
Read-Host "Server stopped. Press Enter to close this window"
