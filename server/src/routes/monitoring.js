const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ExamSession = require('../models/ExamSession');
const MonitoringEvent = require('../models/MonitoringEvent');
const { authenticate, requireRole } = require('../middleware/auth');
const { analyzeFrame } = require('../services/aiClient');
const { deltaForEvent, computeRiskScore, shouldFlag } = require('../services/riskScore');
const { getAdminExamIds, assertAdminOwnsSession } = require('../utils/adminScope');

const router = express.Router();
const UPLOADS_ROOT = path.join(__dirname, '../../uploads/recordings');

if (!fs.existsSync(UPLOADS_ROOT)) {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(UPLOADS_ROOT, req.params.sessionId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, _file, cb) => cb(null, 'proctoring.webm'),
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
});

router.use(authenticate);

async function assertSessionAccess(sessionId, user) {
  const session = await ExamSession.findById(sessionId).populate('exam');
  if (!session) return { error: { status: 404, message: 'Session not found' } };

  if (user.role === 'student') {
    if (session.student.toString() !== user._id.toString()) {
      return { error: { status: 403, message: 'Access denied' } };
    }
    if (session.status !== 'in_progress') {
      return { error: { status: 403, message: 'This exam session has ended.' } };
    }
  } else if (!(await assertAdminOwnsSession(user._id, session))) {
    return { error: { status: 403, message: 'Access denied' } };
  }

  return { session };
}

async function recordEvents(session, detections) {
  const created = [];
  for (const d of detections) {
    if (!d.triggered) continue;
    const riskDelta = d.risk_delta ?? deltaForEvent(d.type, d.severity);
    const event = await MonitoringEvent.create({
      session: session._id,
      type: d.type,
      severity: d.severity || 'medium',
      message: d.message || '',
      metadata: d.metadata || {},
      riskDelta,
    });
    created.push(event);
  }

  if (created.length > 0) {
    const allEvents = await MonitoringEvent.find({ session: session._id });
    session.riskScore = computeRiskScore(allEvents);
    session.alertCount = allEvents.filter((e) => e.riskDelta > 0).length;
    session.isFlagged = shouldFlag(session.riskScore, session.alertCount);
    await session.save();
  }

  return created;
}

const STUDENT_EVENT_TYPES = [
  'screen_share_started',
  'screen_share_stopped',
  'screen_share_not_monitor',
  'external_device_connected',
  'voice_detected',
  'whispering_detected',
  'tab_hidden',
  'window_blur',
];

router.post('/analyze/:sessionId', requireRole('student'), async (req, res) => {
  try {
    const { session, error } = await assertSessionAccess(req.params.sessionId, req.user);
    if (error) return res.status(error.status).json({ message: error.message });

    const { image, screenImage } = req.body;
    if (!image) return res.status(400).json({ message: 'Image required (base64)' });

    const aiResult = await analyzeFrame(image, session._id.toString());
    let allDetections = aiResult.detections || [];

    if (screenImage) {
      const screenResult = await analyzeFrame(screenImage, `${session._id.toString()}_screen`);
      allDetections = allDetections.concat(screenResult.detections || []);
    }

    const created = await recordEvents(session, allDetections);

    const updated = await ExamSession.findById(session._id);
    res.json({
      detections: allDetections,
      face_count: aiResult.face_count,
      alerts: created,
      riskScore: updated.riskScore,
      isFlagged: updated.isFlagged,
    });
  } catch (err) {
    res.status(502).json({ message: err.message || 'AI analysis failed' });
  }
});

router.post('/events/:sessionId', async (req, res) => {
  try {
    const session = await ExamSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ message: 'Session not found' });

    if (req.user.role === 'student') {
      if (session.student.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
      if (session.status !== 'in_progress') {
        return res.status(403).json({ message: 'Session ended' });
      }
      if (!STUDENT_EVENT_TYPES.includes(req.body.type)) {
        return res.status(400).json({ message: 'Invalid event type' });
      }
    } else if (!(await assertAdminOwnsSession(req.user._id, session))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { type, severity, message, metadata } = req.body;
    const riskDelta = deltaForEvent(type, severity);
    const event = await MonitoringEvent.create({
      session: session._id,
      type,
      severity: severity || 'medium',
      message: message || '',
      metadata: metadata || {},
      riskDelta,
    });

    const allEvents = await MonitoringEvent.find({ session: session._id });
    session.riskScore = computeRiskScore(allEvents);
    session.alertCount = allEvents.filter((e) => e.riskDelta > 0).length;
    session.isFlagged = shouldFlag(session.riskScore, session.alertCount);
    await session.save();

    res.status(201).json({ event, riskScore: session.riskScore, isFlagged: session.isFlagged });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post(
  '/recording/:sessionId',
  requireRole('student'),
  upload.single('recording'),
  async (req, res) => {
    try {
      const session = await ExamSession.findById(req.params.sessionId);
      if (!session || session.student.toString() !== req.user._id.toString()) {
        return res.status(404).json({ message: 'Session not found' });
      }
      if (!req.file) {
        return res.status(400).json({ message: 'Recording file required' });
      }

      session.hasRecording = true;
      session.recordingPath = req.file.path;
      await session.save();

      await MonitoringEvent.create({
        session: session._id,
        type: 'recording_saved',
        severity: 'low',
        message: 'Proctoring recording saved for instructor review',
        riskDelta: 0,
        metadata: { size: req.file.size },
      });

      res.json({ message: 'Recording uploaded', hasRecording: true });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

router.get('/recording/:sessionId', requireRole('admin'), async (req, res) => {
  try {
    const session = await ExamSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (!(await assertAdminOwnsSession(req.user._id, session))) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (!session.hasRecording || !session.recordingPath) {
      return res.status(404).json({ message: 'No recording for this session' });
    }
    if (!fs.existsSync(session.recordingPath)) {
      return res.status(404).json({ message: 'Recording file missing on server' });
    }

    res.sendFile(path.resolve(session.recordingPath));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/events/:sessionId', async (req, res) => {
  try {
    const session = await ExamSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ message: 'Session not found' });

    if (req.user.role === 'student') {
      if (session.student.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
    } else if (!(await assertAdminOwnsSession(req.user._id, session))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const events = await MonitoringEvent.find({ session: session._id }).sort({
      createdAt: -1,
    });
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/flagged', requireRole('admin'), async (req, res) => {
  try {
    const examIds = await getAdminExamIds(req.user._id);
    const sessions = await ExamSession.find({
      exam: { $in: examIds },
      $or: [{ isFlagged: true }, { riskScore: { $gte: 55 } }],
    })
      .populate('exam', 'title')
      .populate('student', 'name email studentId college faculty department level')
      .sort({ riskScore: -1 });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
