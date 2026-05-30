@echo off
REM AI-Assisted Exam Monitor - Full System Startup Script
REM This script starts all three services: Server, AI, and Client

echo.
echo ========================================
echo  Secure Exam Monitor - Startup Script
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if Python is installed
where python >nul 2>nul
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python from https://www.python.org/
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo Python version:
python --version
echo.

REM Create startup terminals for each service
echo Starting services...
echo.

REM Start Backend Server
echo [1/3] Starting Backend Server (http://localhost:5000)...
start "Exam Monitor - Backend" cmd /k "cd server && npm run dev"
timeout /t 3 /nobreak

REM Start AI Service
echo [2/3] Starting AI Service (http://localhost:8000)...
start "Exam Monitor - AI Service" cmd /k "cd ai-service && python -m uvicorn app:app --reload --host 0.0.0.0 --port 8000"
timeout /t 3 /nobreak

REM Start Frontend Client
echo [3/3] Starting Frontend Client (http://localhost:5173)...
start "Exam Monitor - Frontend" cmd /k "cd client && npm run dev"

echo.
echo ========================================
echo  Services Starting...
echo ========================================
echo.
echo Backend:   http://localhost:5000
echo AI Service: http://localhost:8000
echo Frontend:  http://localhost:5173
echo.
echo Waiting for services to be ready...
timeout /t 5 /nobreak
echo.
echo All services should now be running!
echo Open http://localhost:5173 in your browser to access the application.
echo.
echo Demo Accounts:
echo   Admin: admin@university.edu / admin123
echo   Student: student@university.edu / student123
echo.
echo Press any key to exit this window (services will continue running)
pause >nul
