@echo off
title Enterprise SaaS Admin Portal - Startup
echo ================================================
echo  Starting Enterprise SaaS Admin Portal
echo ================================================
echo.

:: Start Backend
echo [1/3] Starting Backend (port 5000)...
start "BACKEND" cmd /k "cd /d "%~dp0backend" && npm run dev"

:: Wait for backend to initialize
ping -n 5 127.0.0.1 > nul

:: Start AI Service
echo [2/3] Starting AI Service (port 8001)...
start "AI-SERVICE" cmd /k "cd /d "%~dp0backend\ai_service" && pip install -r requirements.txt -q && python main.py"

:: Wait for AI service to initialize
ping -n 5 127.0.0.1 > nul

:: Start Frontend
echo [3/3] Starting Frontend (port 5173)...
start "FRONTEND" cmd /k "cd /d "%~dp0" && npm run dev"

echo.
echo ================================================
echo  All services starting...
echo  Wait 15-20 seconds then open:
echo  http://localhost:5173
echo ================================================
echo.
pause
