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
$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
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
$nodeVersion = & node --version
Write-OK "Node.js $nodeVersion found."

# ------------------------------------------------------------
# Step 2 — Install npm dependencies
# ------------------------------------------------------------
Write-Step "Installing server dependencies..."
$serverDir = Join-Path $ROOT "mcp-server"
Push-Location $serverDir
try {
    & npm install --silent 2>&1 | Out-Null
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
    command = "node"
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
node "$serverScript"
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
# Step 5 — Chrome extension setup
# ------------------------------------------------------------
Write-Step "Opening Chrome extension installer..."

$extensionDir = Join-Path $ROOT "extension"

Write-Host ""
Write-Host "  ----------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "   LAST STEP: Load the Chrome Extension (takes ~30 seconds)" -ForegroundColor White
Write-Host "  ----------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-Host "   Chrome will open to the Extensions page." -ForegroundColor White
Write-Host "   Follow these 3 steps:" -ForegroundColor White
Write-Host ""
Write-Host "   1. Toggle ON 'Developer mode' (top-right corner)" -ForegroundColor Yellow
Write-Host "   2. Click 'Load unpacked' (top-left)" -ForegroundColor Yellow
Write-Host "   3. Select this folder and click OK:" -ForegroundColor Yellow
Write-Host "      $extensionDir" -ForegroundColor Cyan
Write-Host ""

# Open File Explorer to the extension folder so they can copy-paste the path
Start-Process "explorer.exe" $extensionDir

# Open Chrome to the extensions page
$chromePaths = @(
    "$env:PROGRAMFILES\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:PROGRAMFILES(X86)}\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($chrome) {
    Start-Process $chrome "chrome://extensions/"
    Write-OK "Opened Chrome extensions page."
} else {
    Write-Warn "Chrome not found automatically. Please open Chrome and go to: chrome://extensions/"
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
