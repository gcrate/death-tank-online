@echo off
echo Stopping existing node processes...
taskkill /F /IM node.exe 2>nul
timeout /t 1 /nobreak >nul

echo Starting server...
start "Death Tank Server" cmd /k "cd /d %~dp0server && npx tsx watch src/index.ts"

timeout /t 1 /nobreak >nul

echo Starting client...
start "Death Tank Client" cmd /k "cd /d %~dp0client && npx vite"

echo Done. Server on ws://localhost:8080, client on http://localhost:3000
