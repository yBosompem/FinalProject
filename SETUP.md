# AI-Assisted Secure Online Examination Monitoring System

## Project Overview

This is a complete implementation of an AI-assisted online examination monitoring system designed to detect suspicious student behavior during remote exams. The system consists of three main components:

1. **Backend Server (Node.js + Express + MongoDB)**
2. **Frontend Client (React + Vite)**
3. **AI Service (Python + FastAPI + OpenCV + TensorFlow)**

## Architecture

```
FinalProject/
├── server/                    # Node.js backend
│   ├── src/
│   │   ├── index.js          # Express server entry point
│   │   ├── config.js         # Configuration
│   │   ├── seed.js           # Database seeding
│   │   ├── middleware/       # Auth middleware
│   │   ├── models/           # MongoDB schemas
│   │   ├── routes/           # API endpoints
│   │   └── services/         # Business logic
│   └── package.json
│
├── client/                    # React frontend
│   ├── src/
│   │   ├── main.jsx          # React entry
│   │   ├── App.jsx           # Main app
│   │   ├── context/          # Auth context
│   │   ├── components/       # Reusable components
│   │   ├── pages/            # Page components
│   │   ├── api/              # API client
│   │   └── index.css         # Styles
│   └── package.json
│
└── ai-service/               # Python AI module
    ├── app.py                # FastAPI server
    ├── detector.py           # AI detection logic
    └── requirements.txt      # Python dependencies
```

## Prerequisites

- **Node.js** (v16+) - for server and client
- **Python** (3.9+) - for AI service
- **MongoDB** (local or remote) - database
- **Git** - for version control

## Installation

### 1. Clone/Navigate to project
```bash
cd c:\Users\KNUST\OneDrive\Desktop\FinalProject
```

### 2. Install dependencies
```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Install AI service dependencies
cd ../ai-service
pip install -r requirements.txt
```

### 3. Setup environment variables

All `.env` files are already created with default values:
- `server/.env` - Backend configuration
- `client/.env` - Frontend API configuration

**Note:** For production, update the JWT_SECRET in `server/.env`

### 4. Seed database (optional)
```bash
cd server
npm run seed
```

This creates demo accounts:
- **Admin**: admin@university.edu / admin123
- **Student**: student@university.edu / student123

## Running the System

### Option 1: Run All Services Manually

**Terminal 1 - Start MongoDB** (if local):
```powershell
mongod
```

**Terminal 2 - Start Backend Server**:
```powershell
cd server
npm run dev
```
Runs on http://localhost:5000

**Terminal 3 - Start AI Service**:
```powershell
cd ai-service
python -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
```
Runs on http://localhost:8000

**Terminal 4 - Start Frontend Client**:
```powershell
cd client
npm run dev
```
Runs on http://localhost:5173

### Option 2: Quick Start Script
```powershell
cd FinalProject
npm run install:all
npm run server  # In one terminal
npm run client  # In another terminal
npm run ai      # In another terminal
```

## Core Features

### 1. Student Interface
- Secure login/registration
- View available exams
- Take exams with real-time monitoring
- Automatic submission on timer expiry
- Real-time monitoring alerts

### 2. AI Monitoring Module
Detects:
- **No face detected** - Student left the frame (+12 risk)
- **Multiple faces** - Possible collaboration (+25 risk)
- **Looking away** - Frequent screen deviation (+8 risk)
- **Unusual movement** - Excessive motion (+6 risk)

### 3. Admin Dashboard
- Create and manage exams
- Monitor live exam sessions
- Review flagged sessions
- Access detailed monitoring reports
- View complete event logs for each session

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Sign in
- `GET /api/auth/me` - Get current user

### Exams
- `GET /api/exams` - List exams
- `GET /api/exams/:id` - Get exam details
- `POST /api/exams` - Create exam (admin only)
- `PUT /api/exams/:id` - Update exam
- `DELETE /api/exams/:id` - Delete exam

### Sessions
- `POST /api/sessions/start/:examId` - Start exam session
- `GET /api/sessions` - List user sessions
- `GET /api/sessions/active` - List active sessions (admin)
- `GET /api/sessions/:id` - Get session details
- `PATCH /api/sessions/:id/answers` - Save answers
- `POST /api/sessions/:id/submit` - Submit exam
- `GET /api/sessions/:id/report` - Get monitoring report

### Monitoring
- `POST /api/monitoring/analyze/:sessionId` - Analyze webcam frame
- `POST /api/monitoring/events/:sessionId` - Record event
- `GET /api/monitoring/events/:sessionId` - Get events
- `GET /api/monitoring/flagged` - Get flagged sessions (admin)

### AI Service
- `GET /health` - Health check
- `POST /analyze` - Analyze frame (with base64 image)
- `POST /reset/{session_id}` - Clear session state

## Risk Scoring System

Risk scores are calculated based on detected suspicious behaviors:

| Event | Severity | Risk Delta |
|-------|----------|-----------|
| No face | high | 18 |
| Multiple faces | high | 37.5 |
| Looking away | medium | 8 |
| Unusual movement | medium | 6 |

**Flagging Criteria:**
- Score ≥ 60 OR
- Alert count ≥ 8

## Database Models

### User
- `_id`: ObjectId
- `name`: String
- `email`: String (unique)
- `password`: String (hashed)
- `role`: 'student' | 'admin'
- `studentId`: String (optional)
- `timestamps`: Dates

### Exam
- `_id`: ObjectId
- `title`: String
- `description`: String
- `durationMinutes`: Number
- `rules`: String
- `questions`: Array of questions
- `isPublished`: Boolean
- `createdBy`: User reference
- `timestamps`: Dates

### ExamSession
- `_id`: ObjectId
- `exam`: Exam reference
- `student`: User reference
- `status`: 'in_progress' | 'submitted' | 'expired'
- `startedAt`: Date
- `endsAt`: Date
- `submittedAt`: Date
- `answers`: Array of answers
- `riskScore`: Number (0-100)
- `alertCount`: Number
- `isFlagged`: Boolean
- `timestamps`: Dates

### MonitoringEvent
- `_id`: ObjectId
- `session`: ExamSession reference
- `type`: Detection type
- `severity`: 'low' | 'medium' | 'high'
- `message`: String
- `metadata`: Object
- `riskDelta`: Number
- `timestamps`: Dates

## Testing

### Test Workflow
1. Open http://localhost:5173 in browser
2. Register as student or use demo account
3. Admin creates exams with questions
4. Student starts exam and answers questions
5. AI monitors webcam in real-time
6. Admin reviews flagged sessions and reports

### Demo Accounts
- **Admin**: admin@university.edu / admin123
- **Student**: student@university.edu / student123

### Monitoring Test
- Unusual movements trigger alerts
- Moving camera away triggers "looking away" alert
- Having another person in frame triggers "multiple faces" alert

## Troubleshooting

### MongoDB Connection Error
```
MongoDB connection failed: connect ECONNREFUSED
```
**Solution**: Start MongoDB or update `MONGODB_URI` in `server/.env`

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::5000
```
**Solution**: Change port in `.env` or kill process using the port

### AI Service Unavailable
```
AI service error: connect ECONNREFUSED
```
**Solution**: Ensure AI service is running on port 8000

### Webcam Access Denied
**Solution**: Grant camera permissions in browser security settings

### TensorFlow Installation Issues
```
pip install --upgrade tensorflow
```

## Performance Considerations

- **Webcam Analysis**: Captures every 2.5 seconds to balance accuracy and performance
- **Face Detection**: Uses OpenCV Haar Cascades for fast detection
- **Motion Analysis**: Frame differencing for computational efficiency
- **Risk Scoring**: Real-time calculation with persistence to database

## Security Features

- JWT authentication with 8-hour expiry
- Password hashing with bcryptjs
- CORS protection
- Role-based access control (RBAC)
- Session-specific monitoring isolation

## Deployment

### Production Checklist
- [ ] Change `JWT_SECRET` in server/.env
- [ ] Set `NODE_ENV=production`
- [ ] Use production MongoDB connection string
- [ ] Deploy server to cloud (Heroku, Railway, Render)
- [ ] Deploy client to CDN (Vercel, Netlify)
- [ ] Deploy AI service to separate compute (AWS Lambda, GCP Functions)
- [ ] Enable HTTPS everywhere
- [ ] Set proper CORS origins
- [ ] Configure firewall rules

## System Requirements

### Minimum (Development)
- 4GB RAM
- 2GB storage
- Modern browser with WebRTC support

### Recommended (Production)
- 8GB+ RAM
- SSD storage
- Multi-core processor
- Load balancer

## Future Enhancements

- Eye gaze tracking
- Keyboard/mouse activity monitoring
- Proctored exam recording
- Browser tab switching detection
- Mobile app support
- Advanced ML models
- Screen sharing detection
- Audio monitoring

## Support

For issues or questions, check:
1. Error messages in console
2. Terminal output of services
3. Browser DevTools Network tab
4. MongoDB logs

## License

This project is developed for educational purposes.

---

**Project Completed**: May 29, 2026
**Status**: Ready for Testing
