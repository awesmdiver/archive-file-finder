Set-Location $PSScriptRoot

Write-Host "Archive File Finder - Setup" -ForegroundColor Cyan
Write-Host "Checking for what this tool needs: Node.js and 7-Zip (required),"
Write-Host "and PowerShell 7 (optional, but recommended)."
Write-Host ""

function Refresh-Path {
    # Picks up PATH changes from an install that just ran, without needing
    # to close and reopen this window.
    $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

$haveWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)

# ---- Node.js ----
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $nodeVersion = (node --version)
    Write-Host "[OK] Node.js is already installed ($nodeVersion)." -ForegroundColor Green
}
elseif ($haveWinget) {
    Write-Host "[MISSING] Node.js was not found."
    $answer = Read-Host "Install Node.js (LTS) now via winget? (Y/N)"
    if ($answer -match '^[Yy]') {
        Write-Host "Installing Node.js..."
        winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        Refresh-Path
        $node = Get-Command node -ErrorAction SilentlyContinue
        if ($node) {
            Write-Host "[OK] Node.js installed." -ForegroundColor Green
        }
        else {
            Write-Host "[!] Node.js was installed but this window can't see it yet." -ForegroundColor Yellow
            Write-Host "    Close this window and run install.bat again to confirm." -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "Skipped. Download it yourself from https://nodejs.org (LTS) and run install.bat again."
    }
}
else {
    Write-Host "[MISSING] Node.js was not found, and winget isn't available to install it automatically."
    Write-Host "Opening the Node.js download page - install the LTS version, then run install.bat again."
    Start-Process "https://nodejs.org/"
}
Write-Host ""

# ---- 7-Zip ----
$sevenZipPaths = @(
    "$env:ProgramFiles\7-Zip\7z.exe",
    "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
)
$sevenZip = $sevenZipPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $sevenZip) { $sevenZip = (Get-Command 7z -ErrorAction SilentlyContinue).Source }

if ($sevenZip) {
    Write-Host "[OK] 7-Zip is already installed ($sevenZip)." -ForegroundColor Green
}
elseif ($haveWinget) {
    Write-Host "[MISSING] 7-Zip was not found."
    $answer = Read-Host "Install 7-Zip now via winget? (Y/N)"
    if ($answer -match '^[Yy]') {
        Write-Host "Installing 7-Zip..."
        winget install -e --id 7zip.7zip --accept-package-agreements --accept-source-agreements
        $sevenZip = $sevenZipPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
        if ($sevenZip) {
            Write-Host "[OK] 7-Zip installed." -ForegroundColor Green
        }
        else {
            Write-Host "[!] 7-Zip was installed but wasn't found at the expected location yet." -ForegroundColor Yellow
            Write-Host "    Close this window and run install.bat again to confirm." -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "Skipped. Download it yourself from https://www.7-zip.org/ and run install.bat again."
    }
}
else {
    Write-Host "[MISSING] 7-Zip was not found, and winget isn't available to install it automatically."
    Write-Host "Opening the 7-Zip download page - install it, then run install.bat again."
    Start-Process "https://www.7-zip.org/"
}
Write-Host ""

# ---- PowerShell 7 (optional) ----
# Windows PowerShell 5.1 (built into every Windows install, so this is never
# "missing" outright) implements the folder-browser popup with a decades-old
# dialog that's always light, no matter your Windows theme. PowerShell 7 uses
# a modern one that actually follows your Windows dark/light setting. Not
# required - the app falls back to the old picker automatically if this
# isn't installed - just nicer if you use dark mode.
$pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
if ($pwsh) {
    $pwshVersion = (pwsh -Command '$PSVersionTable.PSVersion.ToString()')
    Write-Host "[OK] PowerShell 7 is already installed ($pwshVersion) - the folder picker will match your Windows theme." -ForegroundColor Green
}
elseif ($haveWinget) {
    Write-Host "[OPTIONAL] PowerShell 7 was not found. Without it, the folder-browse popup will"
    Write-Host "           always be light-themed, even if the rest of this app is in dark mode."
    $answer = Read-Host "Install PowerShell 7 now via winget? (Y/N)"
    if ($answer -match '^[Yy]') {
        Write-Host "Installing PowerShell 7..."
        winget install -e --id Microsoft.PowerShell --accept-package-agreements --accept-source-agreements
        Refresh-Path
        $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
        if ($pwsh) {
            Write-Host "[OK] PowerShell 7 installed." -ForegroundColor Green
        }
        else {
            Write-Host "[!] PowerShell 7 was installed but this window can't see it yet." -ForegroundColor Yellow
            Write-Host "    That's fine - it'll be picked up next time the app is started." -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "Skipped - the app will keep using the older, light-only folder picker."
    }
}
else {
    Write-Host "[OPTIONAL] PowerShell 7 was not found, and winget isn't available to install it automatically."
    Write-Host "The app still works fine without it - the folder-browse popup will just always be light-themed."
}
Write-Host ""

if ($node -and $sevenZip) {
    Write-Host "Everything needed is installed. You can run start.bat now." -ForegroundColor Cyan
}
else {
    Write-Host "Once everything above shows [OK], run start.bat to launch the app." -ForegroundColor Cyan
}

Read-Host "Press Enter to close this window"
