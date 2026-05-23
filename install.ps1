# ============================================================
#  Google Keep → Claude Bridge  |  Installer
#  Run via install.bat — do not run directly.
# ============================================================

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot   # folder where install.ps1 lives (the repo root)

function Write-Step  { param($msg) Write-Host "`n  >> $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "     [OK] $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "     [!]  $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "`n  [ERROR] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "  ============================================" -ForegroundColor DarkCyan
Write-Host "   Google Keep > Claude Bridge  |  Installer " -ForegroundColor White
Write-Host "  ============================================" -ForegroundColor DarkCyan

# ------------------------------------------------------------
# Step 1 — Check Node.js
# ------------------------------------------------------------
Write-Step "Checking for Node.js..."

# Check PATH first, then fall back to common install locations
$nodeExe = $null
$nodeOnPath = Get-Command node -ErrorAction SilentlyContinue
if ($nodeOnPath) {
    $nodeExe = "node"
} else {
    $commonPaths = @(
        "C:\Program Files\nodejs\node.exe",
        "C:\Program Files (x86)\nodejs\node.exe",
        "$env:APPDATA\nvm\current\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
    )
    $found = $commonPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($found) {
        $nodeExe = $found
        # Also add npm path for the install step
        $npmExe = Join-Path (Split-Path $found) "npm.cmd"
    }
}

if (-not $nodeExe) {
    Write-Fail "Node.js is not installed."
    Write-Host ""
    Write-Host "     Please install Node.js first:" -ForegroundColor Yellow
    Write-Host "     https://nodejs.org  (click the LTS button)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "     After installing, run install.bat again." -ForegroundColor Yellow
    Start-Process "https://nodejs.org"
    Read-Host "`n  Press Enter to exit"
    exit 1
}

$nodeVersion = & $nodeExe --version
Write-OK "Node.js $nodeVersion found."

# ------------------------------------------------------------
# Step 2 — Install npm dependencies
# ------------------------------------------------------------
Write-Step "Installing server dependencies..."
$serverDir = Join-Path $ROOT "mcp-server"

# Resolve npm path alongside node
if (-not $npmExe) {
    $npmExe = Get-Command npm -ErrorAction SilentlyContinue
    if ($npmExe) { $npmExe = "npm" }
    else {
        $npmExe = Join-Path (Split-Path $nodeExe) "npm.cmd"
    }
}

Push-Location $serverDir
try {
    & $npmExe install --silent 2>&1 | Out-Null
    Write-OK "Dependencies installed."
} catch {
    Write-Fail "npm install failed: $_"
    exit 1
} finally {
    Pop-Location
}

# ------------------------------------------------------------
# Step 3 — Configure Claude Desktop
# ------------------------------------------------------------
Write-Step "Configuring Claude Desktop..."

$claudeConfigDir  = Join-Path $env:APPDATA "Claude"
$claudeConfigFile = Join-Path $claudeConfigDir "claude_desktop_config.json"
$serverScript     = Join-Path $ROOT "mcp-server\server.js"
# JSON needs forward slashes or escaped backslashes
$serverScriptJson = $serverScript.Replace("\", "\\")

# Read existing config or start fresh
if (Test-Path $claudeConfigFile) {
    $raw = Get-Content $claudeConfigFile -Raw
    try {
        $config = $raw | ConvertFrom-Json
    } catch {
        Write-Warn "Existing claude_desktop_config.json is not valid JSON. Backing it up and starting fresh."
        Copy-Item $claudeConfigFile "$claudeConfigFile.backup"
        $config = [PSCustomObject]@{}
    }
} else {
    New-Item -ItemType Directory -Force -Path $claudeConfigDir | Out-Null
    $config = [PSCustomObject]@{}
}

# Add mcpServers block if missing
if (-not $config.PSObject.Properties["mcpServers"]) {
    $config | Add-Member -NotePropertyName "mcpServers" -NotePropertyValue ([PSCustomObject]@{})
}

# Add or update our entry
$entry = [PSCustomObject]@{
    command = $nodeExe
    args    = @($serverScript)
}
if ($config.mcpServers.PSObject.Properties["google-keep-bridge"]) {
    $config.mcpServers."google-keep-bridge" = $entry
    Write-OK "Updated existing google-keep-bridge entry."
} else {
    $config.mcpServers | Add-Member -NotePropertyName "google-keep-bridge" -NotePropertyValue $entry
    Write-OK "Added google-keep-bridge to Claude Desktop config."
}

$config | ConvertTo-Json -Depth 10 | Set-Content $claudeConfigFile -Encoding utf8
Write-OK "Saved to: $claudeConfigFile"

# ------------------------------------------------------------
# Step 4 — Create desktop shortcut to start the bridge server
# ------------------------------------------------------------
Write-Step "Creating desktop shortcut..."

$shortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "Start Keep Bridge.lnk"
$startScript  = Join-Path $ROOT "start-server.bat"

# Write a small start-server.bat next to install.bat
@"
@echo off
title Google Keep ^> Claude Bridge Server
echo  Bridge server starting...
echo  Keep this window open while using Claude.
echo.
"$nodeExe" "$serverScript"
pause
"@ | Set-Content $startScript -Encoding utf8

$shell    = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath       = $startScript
$shortcut.WorkingDirectory = $ROOT
$shortcut.Description      = "Start the Google Keep to Claude bridge server"
$shortcut.Save()

Write-OK "Shortcut created on your Desktop: 'Start Keep Bridge'"

# ------------------------------------------------------------
# Step 5 — Browser extension setup (Chrome and/or Edge)
# ------------------------------------------------------------
Write-Step "Detecting browsers and opening extension installer..."

$extensionDir = Join-Path $ROOT "extension"

# Locate Chrome
$chromePaths = @(
    "$env:PROGRAMFILES\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:PROGRAMFILES(X86)}\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

# Locate Edge (pre-installed on Windows 10/11)
$edgePaths = @(
    "${env:PROGRAMFILES(X86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:PROGRAMFILES\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)
$edge = $edgePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

# Also try registry for both browsers
if (-not $chrome) {
    $chrome = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" -ErrorAction SilentlyContinue).'(Default)'
}
if (-not $edge) {
    $edge = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" -ErrorAction SilentlyContinue).'(Default)'
}

Write-Host ""
Write-Host "  ----------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "   LAST STEP: Load the Extension into your browser(s)" -ForegroundColor White
Write-Host "  ----------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-Host "   For EACH browser window that opens:" -ForegroundColor White
Write-Host ""
Write-Host "   1. Toggle ON 'Developer mode' (top-right corner)" -ForegroundColor Yellow
Write-Host "   2. Click 'Load unpacked' (top-left)" -ForegroundColor Yellow
Write-Host "   3. Select this folder and click OK:" -ForegroundColor Yellow
Write-Host "      $extensionDir" -ForegroundColor Cyan
Write-Host ""

# Open File Explorer to the extension folder
Start-Process "explorer.exe" $extensionDir

$browsersFound = 0

if ($chrome) {
    Start-Process $chrome "chrome://extensions/"
    Write-OK "Opened Chrome extensions page."
    $browsersFound++
} else {
    Write-Warn "Chrome not found. Download it at https://google.com/chrome if you want it."
}

if ($edge) {
    Start-Sleep -Milliseconds 800   # slight delay so windows don't overlap
    Start-Process $edge "edge://extensions/"
    Write-OK "Opened Edge extensions page."
    $browsersFound++
} else {
    Write-Warn "Edge not found. It comes pre-installed on Windows 10/11."
}

if ($browsersFound -eq 0) {
    Write-Warn "No browser found automatically."
    Write-Host "     Please open Chrome or Edge and navigate to:" -ForegroundColor Yellow
    Write-Host "       Chrome: chrome://extensions/" -ForegroundColor Yellow
    Write-Host "       Edge:   edge://extensions/" -ForegroundColor Yellow
}

# ------------------------------------------------------------
# Done
# ------------------------------------------------------------
Write-Host ""
Write-Host "  ============================================" -ForegroundColor DarkCyan
Write-Host "   Installation complete!" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "  HOW TO USE:" -ForegroundColor White
Write-Host "   1. Double-click 'Start Keep Bridge' on your Desktop" -ForegroundColor Gray
Write-Host "   2. Open keep.google.com in Chrome" -ForegroundColor Gray
Write-Host "   3. Restart Claude Desktop" -ForegroundColor Gray
Write-Host "   4. Ask Claude: 'What notes do I have in Keep?'" -ForegroundColor Gray
Write-Host ""
