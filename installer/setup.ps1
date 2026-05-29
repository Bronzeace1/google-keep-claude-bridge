# ============================================================
# Google Keep Sync for Claude — Installer
# ============================================================
# Installs the bridge server, configures Claude automatically,
# and sets it to start on Windows login.
# ============================================================

$ErrorActionPreference = "Stop"

$appName    = "KeepClaudeBridge"
$appDir     = "$env:APPDATA\$appName"
$exeName    = "keep-bridge.exe"
$exePath    = "$appDir\$exeName"
$releaseUrl = "https://github.com/Bronzeace1/google-keep-claude-bridge/releases/latest/download/$exeName"

# Claude config paths
$claudeDesktopConfig = "$env:APPDATA\Claude\claude_desktop_config.json"
$claudeCodeConfig    = "$env:APPDATA\Claude\claude_code_config.json"

function Write-Step($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "   OK: $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "   !! $msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "  Google Keep Sync for Claude — Installer" -ForegroundColor White
Write-Host "  ========================================" -ForegroundColor DarkGray
Write-Host ""

# ── Step 1: Create app folder ────────────────────────────────────────────────
Write-Step "Creating app folder..."
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
Write-OK "Folder ready: $appDir"

# ── Step 2: Download keep-bridge.exe ────────────────────────────────────────
Write-Step "Downloading bridge server..."
try {
    Invoke-WebRequest -Uri $releaseUrl -OutFile $exePath -UseBasicParsing
    Write-OK "Downloaded: $exePath"
} catch {
    Write-Host "`n  ERROR: Could not download keep-bridge.exe" -ForegroundColor Red
    Write-Host "  Make sure you have an internet connection and try again." -ForegroundColor Red
    Read-Host "`n  Press Enter to exit"
    exit 1
}

# ── Step 3: Add to Windows startup (runs on login) ──────────────────────────
Write-Step "Setting up auto-start on Windows login..."
$regPath = "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
Set-ItemProperty -Path $regPath -Name $appName -Value "`"$exePath`""
Write-OK "Auto-start registered"

# ── Step 4: Configure Claude ─────────────────────────────────────────────────
Write-Step "Configuring Claude..."

$mcpEntry = @{
    "google-keep-bridge" = @{
        command = $exePath
        args    = @()
    }
}

function Add-McpConfig($configPath) {
    $dir = Split-Path $configPath
    if (-not (Test-Path $dir)) { return }

    $config = @{ mcpServers = @{} }
    if (Test-Path $configPath) {
        try {
            $raw = Get-Content $configPath -Raw
            $config = $raw | ConvertFrom-Json
            if (-not $config.mcpServers) { $config | Add-Member -NotePropertyName mcpServers -NotePropertyValue @{} }
        } catch {
            Write-Warn "Could not parse existing config at $configPath — creating fresh."
            $config = @{ mcpServers = @{} }
        }
    }

    $config.mcpServers."google-keep-bridge" = @{ command = $exePath; args = @() }

    $config | ConvertTo-Json -Depth 10 | Set-Content $configPath -Encoding UTF8
    Write-OK "Configured: $configPath"
}

Add-McpConfig $claudeDesktopConfig
Add-McpConfig $claudeCodeConfig

# ── Step 5: Start the bridge now ─────────────────────────────────────────────
Write-Step "Starting bridge server..."
Start-Process -FilePath $exePath -WindowStyle Hidden
Start-Sleep -Seconds 2
Write-OK "Bridge server is running"

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ============================================" -ForegroundColor DarkGray
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "   1. Restart Claude (Desktop, Code, or Cowork)" -ForegroundColor Gray
Write-Host "   2. Open keep.google.com in Chrome" -ForegroundColor Gray
Write-Host "   3. Ask Claude: 'What notes do I have in Keep?'" -ForegroundColor Gray
Write-Host ""
Read-Host "  Press Enter to close"
