@echo off
echo Cleaning ASMR Player Database...
del /F /Q "%APPDATA%\com.asmr.player\library.db"
if exist "%APPDATA%\com.asmr.player\library.db-shm" del /F /Q "%APPDATA%\com.asmr.player\library.db-shm"
if exist "%APPDATA%\com.asmr.player\library.db-wal" del /F /Q "%APPDATA%\com.asmr.player\library.db-wal"
echo Database deleted.

echo Starting ASMR Player...
npm run tauri dev
