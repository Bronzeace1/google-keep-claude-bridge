@echo off
title Google Keep ^> Claude Bridge Server
echo  Bridge server starting...
echo  Keep this window open while using Claude.
echo.
"C:\Program Files\nodejs\node.exe" "C:\Users\jesse\ClaudeWorkSpace\google-keep-claude-bridge\mcp-server\server.js"
pause
