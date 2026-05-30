# System API Reference

## Base URLs
- Backend: `http://localhost:5000`
- AI Service: `http://localhost:8000`
- Frontend: `http://localhost:5173`

## Authentication

All protected endpoints require header:
```
Authorization: Bearer <JWT_TOKEN>
```

Tokens are obtained from login/register and stored in browser localStorage.

---

## Auth Endpoints

### Register User
```
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@university.edu",
  "password": "password123",
  "role": "student",        // or "admin"
  "studentId": "STU-2024-001"
}

Response (201):
{
  "user": {
    "_id": "...",
    "name": "John Doe",
    "email": "john@university.edu",
    "role": "student",
    "studentId": "STU-2024-001"
  },
  "token": "eyJhbGc..."
}
```

### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "student@university.edu",
  "password": "student123"
}

Response (200):
{
  "user": { ... },
  "token": "eyJhbGc..."
}
```

### Get Current User
```
GET /api/auth/me
Authorization: Bearer <TOKEN>

Response (200):
{
  "user": { ... }
}
```

---

## Exam Endpoints

### List All Exams
```
GET /api/exams
Authorization: Bearer <TOKEN>

Response (200):
[
  {
    "_id": "exam_id_1",
    "title": "CS Midterm",
    "description": "Computer Science Midterm Exam",
    "durationMinutes": 60,
    "rules": "Keep your face visible",
    "isPublished": true,
    "questions": [
      {
        "text": "What is 2+2?",
        "options": ["3", "4", "5", "6"],
        "correctIndex": 1
      }
    ],
    "createdBy": { "name": "Dr. Admin", "email": "admin@..." }
  }
]
```

### Get Exam by ID
```
GET /api/exams/<exam_id>
Authorization: Bearer <TOKEN>

Response (200): { exam object }
```

### Create Exam (Admin Only)
```
POST /api/exams
Authorization: Bearer <TOKEN>
Content-Type: application/json

{
  "title": "Sample Exam",
  "description": "Test exam",
  "durationMinutes": 30,
  "rules": "Keep your face visible",
  "questions": [
    {
      "text": "Question 1?",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0
    }
  ],
  "isPublished": true
}

Response (201): { exam object }
```

### Update Exam (Admin Only)
```
PUT /api/exams/<exam_id>
Authorization: Bearer <TOKEN>
Content-Type: application/json

{ ... exam updates ... }

Response (200): { updated exam object }
```

### Delete Exam (Admin Only)
```
DELETE /api/exams/<exam_id>
Authorization: Bearer <TOKEN>

Response (200):
{
  "message": "Exam deleted"
}
```

---

## Session Endpoints

### Start Exam Session (Student)
```
POST /api/sessions/start/<exam_id>
Authorization: Bearer <TOKEN>

Response (201):
{
  "_id": "session_id",
  "exam": { exam data },
  "student": { student data },
  "status": "in_progress",
  "startedAt": "2026-05-29T10:00:00Z",
  "endsAt": "2026-05-29T10:30:00Z",
  "riskScore": 0,
  "alertCount": 0,
  "isFlagged": false
}
```

### Get Session
```
GET /api/sessions/<session_id>
Authorization: Bearer <TOKEN>

Response (200): { session object }
```

### List My Sessions (Student) or All (Admin)
```
GET /api/sessions
Authorization: Bearer <TOKEN>

Response (200):
[
  { session object },
  { session object }
]
```

### Get Active Sessions (Admin Only)
```
GET /api/sessions/active
Authorization: Bearer <TOKEN>

Response (200):
[
  { session object },
  { session object }
]
```

### Save Answers
```
PATCH /api/sessions/<session_id>/answers
Authorization: Bearer <TOKEN>
Content-Type: application/json

{
  "answers": [
    { "questionIndex": 0, "selectedIndex": 1 },
    { "questionIndex": 1, "selectedIndex": 2 }
  ]
}

Response (200): { updated session object }
```

### Submit Exam
```
POST /api/sessions/<session_id>/submit
Authorization: Bearer <TOKEN>

Response (200):
{
  ...session object,
  "status": "submitted",
  "submittedAt": "2026-05-29T10:28:45Z"
}
```

### Get Session Report
```
GET /api/sessions/<session_id>/report
Authorization: Bearer <TOKEN>

Response (200):
{
  "session": { session object },
  "events": [ { event objects } ],
  "riskScore": 45
}
```

---

## Monitoring Endpoints

### Analyze Frame (Student)
```
POST /api/monitoring/analyze/<session_id>
Authorization: Bearer <TOKEN>
Content-Type: application/json

{
  "image": "data:image/jpeg;base64,<base64_encoded_image>"
}

Response (200):
{
  "detections": [
    {
      "type": "no_face",
      "triggered": true,
      "severity": "high",
      "message": "No face detected",
      "risk_delta": 18
    }
  ],
  "face_count": 0,
  "alerts": [ { created event objects } ],
  "riskScore": 18,
  "isFlagged": false
}
```

### Record Event (Student)
```
POST /api/monitoring/events/<session_id>
Authorization: Bearer <TOKEN>
Content-Type: application/json

{
  "type": "looking_away",
  "severity": "medium",
  "message": "Student looking away",
  "metadata": { "norm_dx": 0.5 }
}

Response (201):
{
  "event": { event object },
  "riskScore": 26,
  "isFlagged": false
}
```

### Get Events for Session
```
GET /api/monitoring/events/<session_id>
Authorization: Bearer <TOKEN>

Response (200):
[
  { event object },
  { event object }
]
```

### Get Flagged Sessions (Admin Only)
```
GET /api/monitoring/flagged
Authorization: Bearer <TOKEN>

Response (200):
[
  { session object with high risk score },
  { session object with high risk score }
]
```

---

## AI Service Endpoints

### Health Check
```
GET /health

Response (200):
{
  "status": "ok",
  "service": "ai-monitoring"
}
```

### Analyze Frame
```
POST /analyze
Content-Type: application/json

{
  "image": "data:image/jpeg;base64,<base64_image>",
  "session_id": "session_123"
}

Response (200):
{
  "face_count": 1,
  "detections": [
    {
      "type": "face_verified",
      "triggered": false,
      "severity": "low",
      "message": "Face detected",
      "risk_delta": 0,
      "metadata": {}
    }
  ],
  "frame_size": {
    "width": 640,
    "height": 480
  }
}
```

### Reset Session State
```
POST /reset/<session_id>

Response (200):
{
  "message": "Session state cleared"
}
```

---

## Detection Types & Risk Deltas

| Type | Severity | Risk Delta | Meaning |
|------|----------|-----------|---------|
| no_face | high | 18 | No face detected in frame |
| multiple_faces | high | 37.5 | More than one face (collaboration) |
| looking_away | medium | 8 | Face not centered in frame |
| unusual_movement | medium | 6 | Excessive motion detected |
| face_verified | low | 0 | Face detected (good) |
| monitoring_started | low | 0 | Session monitoring started |

---

## Error Responses

### 400 Bad Request
```json
{
  "message": "Email already registered"
}
```

### 401 Unauthorized
```json
{
  "message": "Invalid email or password"
}
```

### 403 Forbidden
```json
{
  "message": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "message": "Exam not found"
}
```

### 500 Internal Server Error
```json
{
  "message": "Internal server error"
}
```

### 502 Bad Gateway (AI Service Down)
```json
{
  "message": "AI analysis failed"
}
```

---

## Rate Limiting & Best Practices

- Frame analysis: Maximum once per 2.5 seconds
- API calls: No strict limit (add Redis for production)
- Database queries: Indexed for performance
- Large payloads: Keep under 10MB

---

## Testing with cURL

### 1. Register
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@university.edu",
    "password": "test123",
    "role": "student"
  }'
```

### 2. Login
```bash
RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@university.edu",
    "password": "student123"
  }')

TOKEN=$(echo $RESPONSE | jq -r '.token')
```

### 3. Get Exams
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/exams | jq .
```

### 4. Health Checks
```bash
curl http://localhost:5000/api/health
curl http://localhost:8000/health
```

---

## Useful Tools

- **Postman**: Import endpoints for GUI testing
- **cURL**: Command-line API testing
- **jq**: JSON parsing in terminal
- **MongoDB Compass**: Visual database management
- **Browser DevTools**: Network tab inspection

---

**Last Updated**: May 29, 2026
**Version**: 1.0.0
