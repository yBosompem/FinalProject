# AI-Assisted Secure Online Examination Monitoring System

A full-stack platform for conducting timed online exams with real-time AI webcam monitoring. Built per final-year project specification: **React**, **Node.js**, **MongoDB**, **Python**, **OpenCV**, and **TensorFlow**.

## Features

### Student interface
- Secure login and registration
- View and start published examinations
- Timed exam with MCQ questions
- Auto-submit when timer expires
- Live webcam monitoring with on-screen alerts and risk score

### AI monitoring module
- Face detection (OpenCV Haar cascades)
- Multiple faces in frame
- Looking away from screen (face position heuristics)
- Unusual movement (frame differencing + TensorFlow motion scoring)
- Events forwarded to API with cumulative risk score

### Admin dashboard
- Create exams with questions, duration, and rules
- Publish/unpublish exams
- Monitor ongoing sessions
- Review flagged sessions and full suspicious-activity logs

## Project structure

```
FinalProject/
├── client/          # React (Vite)
├── server/          # Node.js + Express + MongoDB
├── ai-service/      # Python FastAPI + OpenCV + TensorFlow
└── README.md
```

## Prerequisites

- **Node.js** 18+
- **MongoDB** running locally (or Atlas URI in `.env`)
- **Python** 3.10+

## Quick setup (Windows)

1. Install [Node.js](https://nodejs.org) and [MongoDB](https://www.mongodb.com/try/download/community), then start MongoDB.
2. From the project folder in PowerShell:

```powershell
.\setup.ps1
```

3. Start three terminals (see below).

> **Tip:** If `npm install` is very slow, move the project out of OneDrive (e.g. `C:\Projects\FinalProject`) and run setup again.

## Setup (manual)

### 1. MongoDB

Start MongoDB locally, or set `MONGODB_URI` in `server/.env`.

### 2. Backend

```powershell
cd server
copy .env.example .env
npm install
npm run seed
npm run dev
```

API: `http://localhost:5000`

### 3. AI service

```powershell
cd ai-service
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements-lite.txt
# Optional full TensorFlow stack (slower install):
# pip install -r requirements.txt
python -m uvicorn app:app --reload --port 8000
```

AI: `http://localhost:8000`

### 4. Frontend

```powershell
cd client
npm install
npm run dev
```

App: `http://localhost:5173`

## Run all services (3 terminals)

| Terminal | Command |
|----------|---------|
| 1 — API | `cd server` → `npm run dev` |
| 2 — AI | `cd ai-service` → `.\venv\Scripts\activate` → `python -m uvicorn app:app --reload --port 8000` |
| 3 — UI | `cd client` → `npm run dev` |

## Demo accounts (after seed)

| Role    | Email                   | Password    |
|---------|-------------------------|-------------|
| Admin   | admin@university.edu    | admin123    |
| Student | student@university.edu  | student123  |

## Demo flow

1. Sign in as **student** → start the sample midterm exam.
2. Allow webcam access; monitoring runs every ~2.5 seconds.
3. Sign in as **admin** (another browser/incognito) → view **Live sessions** and **Flagged** reports.

## Risk scoring

| Event type         | Base points |
|--------------------|-------------|
| No face            | 12          |
| Multiple faces     | 25          |
| Looking away       | 8           |
| Unusual movement   | 6           |

Sessions are **flagged** when risk score ≥ 60 or alert count ≥ 8.

## API overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Register |
| GET | `/api/exams` | List exams |
| POST | `/api/exams` | Create exam (admin) |
| POST | `/api/sessions/start/:examId` | Start session |
| POST | `/api/monitoring/analyze/:sessionId` | Analyze webcam frame |
| GET | `/api/monitoring/flagged` | Flagged sessions (admin) |
| GET | `/api/sessions/:id/report` | Full monitoring report |

## Environment variables

**server/.env**

```
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/exam_monitor
JWT_SECRET=QWERTYUIOPASDFGHJKLZXCVBNM1234567890
AI_SERVICE_URL=http://127.0.0.1:8000
CLIENT_URL=http://localhost:5173
```

## License

Academic project — KNUST Final Year Project.
