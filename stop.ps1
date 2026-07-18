$port = 4173

try {
    Invoke-RestMethod -Uri "http://localhost:$port/api/shutdown" -Method Post -TimeoutSec 5 | Out-Null
    Write-Host "Server stopped." -ForegroundColor Green
}
catch {
    Write-Host "No server responding at http://localhost:$port (already stopped?)." -ForegroundColor Yellow
}

Read-Host "Press Enter to close this window"
