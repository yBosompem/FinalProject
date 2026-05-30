#!/bin/bash
# AI-Assisted Exam Monitor - Full System Startup Script (Linux/Mac)

echo ""
echo "========================================"
echo "  Secure Exam Monitor - Startup Script"
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed"
    echo "Please install Python from https://www.python.org/"
    exit 1
fi

echo "Node.js version: $(node --version)"
echo "Python version: $(python3 --version)"
echo ""

# Create a temporary directory for logs
LOGS_DIR="/tmp/exam-monitor-logs"
mkdir -p "$LOGS_DIR"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down services..."
    kill $SERVER_PID $AI_PID $CLIENT_PID 2>/dev/null
    exit
}

trap cleanup SIGINT SIGTERM

echo "Starting services..."
echo ""

# Start Backend Server
echo "[1/3] Starting Backend Server (http://localhost:5000)..."
cd server && npm run dev > "$LOGS_DIR/server.log" 2>&1 &
SERVER_PID=$!
sleep 2

# Start AI Service
echo "[2/3] Starting AI Service (http://localhost:8000)..."
cd ../ai-service && python3 -m uvicorn app:app --reload --host 0.0.0.0 --port 8000 > "$LOGS_DIR/ai.log" 2>&1 &
AI_PID=$!
sleep 2

# Start Frontend Client
echo "[3/3] Starting Frontend Client (http://localhost:5173)..."
cd ../client && npm run dev > "$LOGS_DIR/client.log" 2>&1 &
CLIENT_PID=$!

echo ""
echo "========================================"
echo "  Services Starting..."
echo "========================================"
echo ""
echo "Backend:    http://localhost:5000"
echo "AI Service: http://localhost:8000"
echo "Frontend:   http://localhost:5173"
echo ""
echo "Logs located in: $LOGS_DIR"
echo ""
echo "Services are running in the background."
echo "Press Ctrl+C to stop all services."
echo ""
echo "Demo Accounts:"
echo "  Admin: admin@university.edu / admin123"
echo "  Student: student@university.edu / student123"
echo ""

# Wait for all processes
wait
