const express = require('express');
const Exam = require('../models/Exam');
const ExamSession = require('../models/ExamSession');
const MonitoringEvent = require('../models/MonitoringEvent');
const { authenticate, requireRole } = require('../middleware/auth');
const { computeRiskScore, shouldFlag } = require('../services/riskScore');
const { finalizeSession } = require('../services/finalizeSession');
const { getAdminExamIds, assertAdminOwnsSession, assertAdminOwnsExam } = require('../utils/adminScope');

const router = express.Router();
const COMPLETED_STATUSES = ['submitted', 'expired'];

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    let filter;
    if (req.user.role === 'admin') {
      const examIds = await getAdminExamIds(req.user._id);
      filter = { exam: { $in: examIds } };
    } else {
      filter = { student: req.user._id };
    }
    const examFields = 'title durationMinutes showResultsToStudents';
    const sessions = await ExamSession.find(filter)
      .populate('exam', examFields)
      .populate('student', 'name email studentId')
      .sort({ createdAt: -1 });

    if (req.user.role === 'student') {
      return res.json(
        sessions.map((s) => {
          const obj = s.toObject();
          delete obj.scaledScore;
          delete obj.maxGradePoints;
          delete obj.examScore;
          delete obj.riskScore;
          delete obj.questionBreakdown;
          delete obj.alertCount;
          delete obj.isFlagged;
          delete obj.answers;
          return obj;
        })
      );
    }
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/active', requireRole('admin'), async (req, res) => {
  try {
    const examIds = await getAdminExamIds(req.user._id);
    const sessions = await ExamSession.find({
      status: 'in_progress',
      exam: { $in: examIds },
    })
      .populate('exam', 'title')
      .populate('student', 'name email studentId')
      .sort({ startedAt: -1 });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/by-exam/:examId', requireRole('admin'), async (req, res) => {
  try {
    const exam = await assertAdminOwnsExam(req.user._id, req.params.examId);
    if (!exam) return res.status(403).json({ message: 'You can only view your own exams' });

    const sessions = await ExamSession.find({ exam: exam._id })
      .populate('student', 'name email studentId')
      .sort({ submittedAt: -1, createdAt: -1 });

    res.json({
      exam: {
        _id: exam._id,
        title: exam.title,
        showResultsToStudents: exam.showResultsToStudents,
        maxGradePoints: exam.maxGradePoints,
      },
      sessions,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/exam/:examId/status', requireRole('student'), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam || !exam.isPublished) {
      return res.status(404).json({ message: 'Exam not available' });
    }

    const session = await ExamSession.findOne({
      exam: exam._id,
      student: req.user._id,
    }).sort({ createdAt: -1 });

    if (!session) {
      return res.json({ canStart: true, canResume: false, session: null });
    }

    if (session.status === 'in_progress') {
      return res.json({ canStart: true, canResume: true, session });
    }

    return res.json({
      canStart: false,
      canResume: false,
      session,
      message: 'You have already completed this exam and cannot access it again.',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const session = await ExamSession.findById(req.params.id)
      .populate('exam')
      .populate('student', 'name email studentId');
    if (!session) return res.status(404).json({ message: 'Session not found' });

    if (req.user.role === 'student') {
      if (session.student._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
      if (COMPLETED_STATUSES.includes(session.status)) {
        return res.status(403).json({
          message: 'This exam session has ended. You cannot access the quiz again.',
        });
      }
    } else if (!(await assertAdminOwnsSession(req.user._id, session))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/start/:examId', requireRole('student'), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam || !exam.isPublished) {
      return res.status(404).json({ message: 'Exam not available' });
    }

    const completed = await ExamSession.findOne({
      exam: exam._id,
      student: req.user._id,
      status: { $in: COMPLETED_STATUSES },
    });
    if (completed) {
      return res.status(403).json({
        message: 'You have already completed this exam and cannot start it again.',
      });
    }

    const existing = await ExamSession.findOne({
      exam: exam._id,
      student: req.user._id,
      status: 'in_progress',
    });
    if (existing) {
      return res.json(existing);
    }

    const endsAt = new Date(Date.now() + exam.durationMinutes * 60 * 1000);
    const session = await ExamSession.create({
      exam: exam._id,
      student: req.user._id,
      endsAt,
      answers: exam.questions.map((_, i) => ({
        questionIndex: i,
        selectedIndex: null,
        textAnswer: '',
        flagged: false,
      })),
    });

    await MonitoringEvent.create({
      session: session._id,
      type: 'monitoring_started',
      severity: 'low',
      message: 'Exam monitoring started',
      riskDelta: 0,
    });

    const populated = await session.populate('exam');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id/answers', requireRole('student'), async (req, res) => {
  try {
    const session = await ExamSession.findById(req.params.id);
    if (!session || session.student.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: 'Session not found' });
    }
    if (session.status !== 'in_progress') {
      return res.status(403).json({ message: 'This exam session has ended.' });
    }
    if (new Date() > session.endsAt) {
      const finalized = await finalizeSession(session._id, {
        answers: req.body.answers || session.answers,
        status: 'expired',
        autoSubmit: true,
      });
      return res.status(403).json({
        message: 'Exam time has expired. Your answers were auto-submitted.',
        session: finalized,
      });
    }

    const { answers } = req.body;
    if (Array.isArray(answers)) {
      session.answers = answers;
      await session.save();
    }
    res.json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/submit', requireRole('student'), async (req, res) => {
  try {
    const session = await ExamSession.findById(req.params.id);
    if (!session || session.student.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: 'Session not found' });
    }
    if (COMPLETED_STATUSES.includes(session.status)) {
      return res.status(403).json({ message: 'This exam has already been submitted.' });
    }

    const { answers, autoSubmit } = req.body || {};
    const status =
      autoSubmit && new Date() > session.endsAt ? 'expired' : 'submitted';

    const finalized = await finalizeSession(session._id, {
      answers: answers || session.answers,
      status,
      autoSubmit: Boolean(autoSubmit),
    });

    res.json({
      session: finalized,
      message: autoSubmit
        ? 'Exam auto-submitted. Monitoring report sent to your instructor.'
        : 'Exam submitted. Monitoring report sent to your instructor.',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id/results', requireRole('student'), async (req, res) => {
  try {
    const session = await ExamSession.findById(req.params.id)
      .populate('exam', 'title showResultsToStudents')
      .populate('student', 'name email');

    const studentId = session.student._id?.toString() || session.student.toString();
    if (!session || studentId !== req.user._id.toString()) {
      return res.status(404).json({ message: 'Session not found' });
    }
    if (!COMPLETED_STATUSES.includes(session.status)) {
      return res.status(400).json({ message: 'Exam is not finished yet' });
    }
    if (!session.exam.showResultsToStudents) {
      return res.json({
        allowed: false,
        message: 'Your instructor has not released results for this exam yet.',
      });
    }

    res.json({
      allowed: true,
      examTitle: session.exam.title,
      correctCount: session.correctCount,
      totalQuestions: session.totalQuestions,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id/report', async (req, res) => {
  try {
    const session = await ExamSession.findById(req.params.id)
      .populate('exam', 'title durationMinutes createdBy maxGradePoints')
      .populate('student', 'name email studentId');
    if (!session) return res.status(404).json({ message: 'Session not found' });

    if (req.user.role === 'student') {
      if (session.student._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
    } else if (!(await assertAdminOwnsSession(req.user._id, session))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const events = await MonitoringEvent.find({ session: session._id }).sort({
      createdAt: 1,
    });
    const riskScore = computeRiskScore(events);
    session.riskScore = riskScore;
    session.isFlagged = shouldFlag(riskScore, events.filter((e) => e.riskDelta > 0).length);
    await session.save();

    res.json({ session, events, riskScore });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
