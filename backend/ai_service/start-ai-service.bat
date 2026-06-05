@echo off
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8

echo [AI Service] Checking Python...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found on PATH.
    pause
    exit /b 1
)

echo [AI Service] Installing / verifying dependencies...
pip install -r requirements.txt --quiet

echo.
echo [AI Service] Starting on http://localhost:8001
echo [AI Service] Press Ctrl+C to stop.
echo.
python main.py
pause
