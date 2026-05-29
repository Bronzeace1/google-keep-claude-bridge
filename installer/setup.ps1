# Google Keep Sync for Claude - Installer
# Installs the bridge server, configures Claude automatically,
# and sets it to start on Windows login.

$ErrorActionPreference = "Stop"

$appName    = "KeepClaudeBridge"
$appDir     = "$env:APPDATA\$appName"
$nodeExe    = Join-Path $appDir "node.exe"
$bundleJs   = Join-Path $appDir "bundle.cjs"
$releaseBase = "https://github.com/Bronzeace1/google-keep-claude-bridge/releases/latest/download"

$claudeDesktopConfig = "$env:APPDATA\Claude\claude_desktop_config.json"
$claudeCodeConfig    = "$env:APPDATA\Claude\claude_code_config.json"

function Write-Step { param($msg) Write-Host "" ; Write-Host ">> $msg" -ForegroundColor Cyan }
function Write-OK   { param($msg) Write-Host "   OK: $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "   !! $msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "  Google Keep Sync for Claude - Installer" -ForegroundColor White
Write-Host "  ========================================" -ForegroundColor DarkGray
Write-Host ""

# Step 1: Create app folder
Write-Step "Creating app folder..."
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
Write-OK "Folder ready: $appDir"

# Step 2: Download node.exe
Write-Step "Downloading Node.js runtime (this may take a moment)..."
try {
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile("$releaseBase/node.exe", $nodeExe)
    Write-OK "Downloaded: $nodeExe"
} catch {
    Write-Host ""
    Write-Host "  ERROR: Could not download node.exe" -ForegroundColor Red
    Write-Host "  Check your internet connection and try again." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Step 3: Download bundle.cjs
Write-Step "Downloading bridge server..."
try {
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile("$releaseBase/bundle.cjs", $bundleJs)
    Write-OK "Downloaded: $bundleJs"
} catch {
    Write-Host ""
    Write-Host "  ERROR: Could not download bundle.cjs" -ForegroundColor Red
    Write-Host "  Check your internet connection and try again." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Step 4: Add to Windows startup
Write-Step "Setting up auto-start on Windows login..."
$regPath   = "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
$startCmd  = "`"$nodeExe`" `"$bundleJs`""
Set-ItemProperty -Path $regPath -Name $appName -Value $startCmd
Write-OK "Auto-start registered"

# Step 5: Configure Claude
Write-Step "Configuring Claude..."

function Add-McpConfig {
    param($configPath)
    $dir = Split-Path $configPath
    if (-not (Test-Path $dir)) {
        return
    }
    if (Test-Path $configPath) {
        try {
            $raw    = Get-Content $configPath -Raw
            $config = $raw | ConvertFrom-Json
            if (-not $config.mcpServers) {
                $config | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([PSCustomObject]@{})
            }
        } catch {
            Write-Warn "Could not parse existing config - creating fresh."
            $config = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
        }
    } else {
        $config = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
    }
    $config.mcpServers | Add-Member -NotePropertyName "google-keep-bridge" -NotePropertyValue ([PSCustomObject]@{
        command = $nodeExe
        args    = @($bundleJs)
    }) -Force
    $config | ConvertTo-Json -Depth 10 | Set-Content $configPath -Encoding UTF8
    Write-OK "Configured: $configPath"
}

Add-McpConfig $claudeDesktopConfig
Add-McpConfig $claudeCodeConfig

# Step 6: Start the bridge now
Write-Step "Starting bridge server..."
try {
    Start-Process -FilePath $nodeExe -ArgumentList "`"$bundleJs`"" -WindowStyle Hidden
    Start-Sleep -Seconds 2
    Write-OK "Bridge server is running"
} catch {
    Write-Warn "Could not start the bridge automatically."
    Write-Warn "It will start automatically the next time you log into Windows."
}

# Done
Write-Host ""
Write-Host "  ============================================" -ForegroundColor DarkGray
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "   1. Restart Claude (Desktop, Code, or Cowork)" -ForegroundColor Gray
Write-Host "   2. Open keep.google.com in Chrome" -ForegroundColor Gray
Write-Host "   3. Ask Claude: What notes do I have in Keep?" -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to close"
