@echo off
:: AI Image Processing Service — Windows startup script
:: Run this from the backend/ai_service/ directory
::
::   cd backend\ai_service
::   start-ai-service.bat

cd /d "%~dp0"

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not on PATH.
    pause
    exit /b 1
)

echo [AI Service] Installing / verifying dependencies...
pip install -r requirements.txt --quiet

echo [AI Service] Starting FastAPI on port 8001...
python main.py
