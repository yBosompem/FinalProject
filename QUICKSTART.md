# Quick Start Guide - 5 Minutes to Running System

## Prerequisites Verification ✓
- Node.js installed: ✓
- Python 3.9+ installed: ✓
- All npm packages installed: ✓
- All Python packages installed: ✓
- .env files configured: ✓

## Step 1: Start MongoDB (if using local)

**Windows:**
```cmd
mongod
```

**macOS/Linux:**
```bash
mongod --dbpath /usr/local/var/mongodb
```

MongoDB will be running on `mongodb://127.0.0.1:27017`

## Step 2: Seed Database (Optional but Recommended)

This creates demo accounts and sample exams.

**Windows:**
```cmd
cd server
npm run seed
```

**macOS/Linux:**
```bash
cd server
npm run seed
```

Output:
```
Seed complete.
Admin:  admin@university.edu / admin123
Student: student@university.edu / student123
```

## Step 3: Start All Services

### Option A: Automated (Recommended for Windows)
```cmd
startup.bat
```

This will automatically open 3 terminals:
- Backend (Port 5000)
- AI Service (Port 8000)
- Frontend (Port 5173)

### Option B: Manual - Terminal 1 (Backend Server)
```cmd
cd server
npm run dev
```

Expected output:
```
MongoDB connected
API running on http://localhost:5000
```

### Option B: Manual - Terminal 2 (AI Service)
```cmd
cd ai-service
python -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Expected output:
```
Uvicorn running on http://0.0.0.0:8000
```

### Option B: Manual - Terminal 3 (Frontend Client)
```cmd
cd client
npm run dev
```

Expected output:
```
  VITE v5.4.8  ready in 234 ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

## Step 4: Access the Application

1. Open browser to **http://localhost:5173**
2. You should see the login page

## Step 5: Quick Test

### Test as Admin
1. Click "Sign in"
2. Email: `admin@university.edu`
3. Password: `admin123`
4. Click "Sign in"
5. Should see Admin Dashboard

### Test as Student
1. Click "Logout"
2. Click "Sign in"
3. Email: `student@university.edu`
4. Password: `student123`
5. Click "Sign in"
6. Should see available exams (if seed was run)

## Service Status

| Service | URL | Status |
|---------|-----|--------|
| Frontend | http://localhost:5173 | ✓ Running |
| Backend API | http://localhost:5000/api/health | ✓ Running |
| AI Service | http://localhost:8000/health | ✓ Running |
| MongoDB | mongodb://127.0.0.1:27017 | ✓ Running |

## Health Check Commands

```bash
# Check Backend
curl http://localhost:5000/api/health

# Check AI Service
curl http://localhost:8000/health

# Both should return {"status":"ok"}
```

## First Time Usage

### 1. Create an Exam (as Admin)
- Navigate to "Create exam"
- Add title, questions, duration
- Click "Create & publish exam"

### 2. Take an Exam (as Student)
- Login as student
- Click on available exam
- Grant webcam permission
- Answer questions
- Submit exam

### 3. Review Results (as Admin)
- Go to "Flagged sessions" or "Live sessions"
- Click on session to see monitoring report
- View AI-detected suspicious activities
- Check risk score

## Troubleshooting

### Port Already in Use
```bash
# Kill process on port 5000 (Windows)
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Kill process on port 5000 (Mac/Linux)
lsof -ti:5000 | xargs kill -9
```

### MongoDB Connection Failed
- Ensure MongoDB is running
- Or update `MONGODB_URI` in `server/.env` to cloud MongoDB

### Webcam Not Working
- Grant browser permissions
- Check in browser settings: Settings → Privacy & security → Site settings → Camera

### Can't Install Python Packages
```bash
pip install --upgrade pip
cd ai-service
pip install -r requirements.txt
```

## Files Modified/Created

```
FinalProject/
├── .env                          # Root environment
├── server/
│   ├── .env                      # Backend config
│   └── node_modules/             # Installed packages
├── client/
│   ├── .env                      # Frontend config
│   └── node_modules/             # Installed packages
├── ai-service/
│   └── (Python packages installed in site-packages)
├── startup.bat                   # Windows startup script
├── startup.sh                    # Linux/Mac startup script
├── SETUP.md                      # Full setup documentation
├── TESTING.md                    # Testing guide
└── QUICKSTART.md                 # This file
```

## Demo Features to Test

✓ **Authentication**: Register and login
✓ **Exam Management**: Create and publish exams
✓ **Real-time Monitoring**: Webcam detection during exams
✓ **AI Detection**: Multiple face, looking away, unusual movement alerts
✓ **Risk Scoring**: Automatic risk score calculation
✓ **Admin Dashboard**: View active and flagged sessions
✓ **Session Reports**: Detailed monitoring event logs
✓ **Responsive UI**: Works on desktop and tablet

## Next Steps

1. Read [SETUP.md](SETUP.md) for detailed architecture
2. Read [TESTING.md](TESTING.md) for complete test scenarios
3. Review API endpoints in [SETUP.md](SETUP.md)
4. Explore database models in [SETUP.md](SETUP.md)
5. Deploy to production (see deployment section in SETUP.md)

## Support

- **Backend Issues**: Check `server` terminal for errors
- **AI Issues**: Check `ai-service` terminal for errors
- **Frontend Issues**: Check browser console (F12) for errors
- **Database Issues**: Verify MongoDB is running

## Performance Notes

- Initial page load: ~2-3 seconds
- Frame analysis: Every 2.5 seconds
- Database operations: Optimized with indexes
- Real-time updates: WebSocket-ready (can be added)

---

**Status**: ✅ Ready to use
**Last Updated**: May 29, 2026
**Version**: 1.0.0
