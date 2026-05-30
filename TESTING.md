# Testing Guide - AI-Assisted Exam Monitor

## Pre-Test Checklist

- [ ] All services running (Server, AI, Client)
- [ ] MongoDB is running
- [ ] Browser is modern (Chrome, Firefox, Edge, Safari)
- [ ] Webcam is connected and working
- [ ] Microphone permissions are enabled

## Endpoint Health Check

```bash
# Check Backend
curl http://localhost:5000/api/health
# Expected: {"status":"ok"}

# Check AI Service
curl http://localhost:8000/health
# Expected: {"status":"ok","service":"ai-monitoring"}
```

## Test Scenario 1: Registration and Login

### Steps
1. Navigate to http://localhost:5173
2. Click "Register"
3. Fill in details:
   - Name: Test Student
   - Email: test@university.edu
   - Password: test123456
   - Role: Student
   - Student ID: STU-2024-TEST
4. Click "Register"
5. You should be redirected to Student Dashboard

### Expected Results
- Registration successful
- Token saved to localStorage
- Redirected to /student
- User appears in database

---

## Test Scenario 2: Admin Exam Creation

### Login as Admin
1. Go back to login page
2. Email: admin@university.edu
3. Password: admin123
4. Click "Sign in"

### Create Exam
1. Navigate to "Create exam"
2. Fill in exam details:
   - Title: "Sample Assessment"
   - Description: "Test exam for monitoring"
   - Duration: 10 minutes
   - Rules: "Keep your face visible"
3. Add 3 questions:
   - Q1: "What is 2+2?" Options: 3, 4, 5, 6 (Correct: 4)
   - Q2: "What is the capital of France?" Options: London, Paris, Berlin, Madrid (Correct: Paris)
   - Q3: "What year was Python created?" Options: 1989, 1990, 1991, 1992 (Correct: 1991)
4. Click "Create & publish exam"

### Expected Results
- Exam appears in Admin Dashboard
- Exam is published and visible to students
- Questions are stored correctly

---

## Test Scenario 3: Student Exam Participation

### Login as Student
1. Use the test student account created earlier
2. Navigate to "My Examinations"

### Start Exam
1. Click "Start exam" on the Sample Assessment
2. Grant webcam permission when prompted
3. Should see:
   - Exam timer (10 minutes)
   - Question display area
   - Webcam feed on the right
   - AI Monitoring status

### Take Exam
1. Answer all questions
2. Click "Next" to navigate between questions
3. Answer questions:
   - Q1: Select "4"
   - Q2: Select "Paris"
   - Q3: Select "1991"
4. Click "Submit exam"

### Expected Results
- Timer counts down correctly
- Webcam monitoring active
- All answers saved
- Exam submitted successfully
- Redirected back to dashboard

---

## Test Scenario 4: AI Monitoring Detection

### Test "No Face" Alert
1. Start an exam
2. Move away from the webcam
3. After 2-3 frames, should see alert
4. Risk score increases

### Test "Looking Away" Alert
1. Position face near edge of frame
2. Keep it there for a few frames
3. Should trigger "Looking away" alert after ~5 seconds
4. Risk score increases (+8)

### Test "Multiple Faces" Alert
1. Start exam with another person
2. Both faces in frame
3. Should trigger immediately
4. Risk score increases (+25)

### Test "Unusual Movement" Alert
1. Make excessive/rapid movements
2. Should trigger within seconds
3. Risk score increases (+6)

### Expected Results
- Alerts appear in real-time
- Risk score updates
- Alerts logged in database
- Visual feedback in UI

---

## Test Scenario 5: Admin Review Dashboard

### Login as Admin
1. Return to admin account
2. Go to Admin Dashboard

### Check Dashboard Stats
1. **Active Sessions**: Should show 0 (student finished)
2. **Flagged Sessions**: Depends on risk level

### View Session Report
1. If exam was flagged (risk > 60), click on it
2. Should see:
   - Risk score: X/100
   - Student name and email
   - Session duration
   - Complete event log with timestamps
   - Risk deltas for each event

### Check Active Sessions
1. Start a new exam in another browser/incognito
2. Go to Admin Dashboard → "Live sessions"
3. Should see the active session
4. Page refreshes every 5 seconds

### Check Flagged Sessions
1. Go to "Flagged" section
2. Should list sessions with risk > 60
3. Click on any to see detailed report

### Expected Results
- Dashboard stats accurate
- Reports display correctly
- Event logs complete
- Real-time updates work

---

## Test Scenario 6: API Testing with cURL

### Register User
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "API Test User",
    "email": "apitest@test.edu",
    "password": "apitest123",
    "role": "student"
  }'
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "apitest@test.edu",
    "password": "apitest123"
  }'
```

### Get Current User
```bash
TOKEN="<your-token-from-login>"
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/auth/me
```

### Get All Exams
```bash
curl http://localhost:5000/api/exams
```

### Start Exam Session
```bash
EXAM_ID="<exam-id-from-exams>"
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/sessions/start/$EXAM_ID
```

---

## Test Scenario 7: AI Service Direct Test

### Test AI Analysis Endpoint
```bash
# Create a test image (or use existing webcam capture)
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/jpeg;base64,<base64-image-data>",
    "session_id": "test-session"
  }'
```

### Expected Response
```json
{
  "face_count": 1,
  "detections": [
    {
      "type": "face_verified",
      "triggered": false,
      "severity": "low",
      "message": "Face detected and centered",
      "risk_delta": 0
    }
  ],
  "frame_size": {
    "width": 640,
    "height": 480
  }
}
```

---

## Performance Testing

### Load Testing
1. Create 5 exams
2. Have 10 concurrent students start exams
3. Monitor:
   - Server CPU/Memory
   - MongoDB performance
   - AI service response time

### Stress Testing
1. Continuous frame analysis for 30 minutes
2. Monitor memory leaks
3. Check for stuck processes

---

## Error Scenarios

### Test: Exam Timeout
1. Start exam
2. Let timer reach 0
3. Exam should auto-submit
4. Status should show "expired"

### Test: No Webcam Permission
1. Deny camera access
2. Should show error message
3. Cannot proceed with exam

### Test: Lost Internet Connection
1. Start exam
2. Disconnect network briefly
3. Reconnect
4. Session should resume
5. Unsaved answers preserved

### Test: Invalid Token
1. Manually delete token from localStorage
2. Try to access protected page
3. Should redirect to login

---

## Database Inspection

### Check Users
```bash
mongo
use exam_monitor
db.users.find()
```

### Check Exams
```bash
db.exams.find().pretty()
```

### Check Sessions
```bash
db.examsessions.find().pretty()
```

### Check Events
```bash
db.monitoringevents.find({session: ObjectId("<session-id>")}).pretty()
```

---

## Browser DevTools Testing

### Check Network Requests
1. Open DevTools (F12)
2. Go to Network tab
3. Perform actions
4. Verify:
   - API calls are successful (200, 201)
   - Request/response bodies are correct
   - No CORS errors

### Check Console
1. Should have no errors
2. Warnings are acceptable
3. Log monitoring events

### Check Application
1. localStorage should contain:
   - `token`: JWT token
2. Cookies should be clean

---

## Success Criteria

✅ All features working
✅ No console errors
✅ Responsive UI
✅ Real-time updates
✅ AI monitoring accurate
✅ Reports generate correctly
✅ Performance acceptable
✅ Database operations correct

---

## Common Issues and Solutions

### Issue: Webcam not detected
**Solution**: Check browser permissions in Settings

### Issue: AI service timeout
**Solution**: Ensure AI service is running on port 8000

### Issue: Exam not appearing for student
**Solution**: Check if exam is published (`isPublished: true`)

### Issue: Risk score not updating
**Solution**: Check if monitoring frames are being analyzed

### Issue: MongoDB connection fails
**Solution**: Start MongoDB or update connection string

---

## Test Completion Checklist

- [ ] Registration and login working
- [ ] Admin can create exams
- [ ] Student can take exams
- [ ] Webcam monitoring active
- [ ] AI detections working
- [ ] Risk score calculating
- [ ] Alerts displaying
- [ ] Admin dashboard functional
- [ ] Session reports generated
- [ ] API endpoints tested
- [ ] No console errors
- [ ] Database operations correct
- [ ] Performance acceptable

---

**All tests completed successfully!** 🎉
