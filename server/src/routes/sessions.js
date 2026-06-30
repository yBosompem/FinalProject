const express = require('express');
const Exam = require('../models/Exam');
const ExamSession = require('../models/ExamSession');
const MonitoringEvent = require('../models/MonitoringEvent');
const { authenticate, requireRole } = require('../middleware/auth');
const { computeRiskScore, effectiveRiskDelta, shouldFlag } = require('../services/riskScore');
const { finalizeSession } = require('../services/finalizeSession');
const { getAdminExamIds, assertAdminOwnsSession, assertAdminOwnsExam } = require('../utils/adminScope');
const { getExamAvailability, assertExamAvailable } = require('../utils/examAvailability');

const router = express.Router();
const COMPLETED_STATUSES = ['submitted', 'expired'];

router.use(authenticate);

function markExpiredForList(session) {
  if (session?.status === 'in_progress' && new Date() > session.endsAt) {
    session.status = 'expired';
    session.submittedAt = session.submittedAt || session.endsAt;
  }
  return session;
}

async function finalizeIfExpired(session) {
  if (session?.status === 'in_progress' && new Date() > session.endsAt) {
    return finalizeSession(session._id, {
      answers: session.answers,
      status: 'expired',
      autoSubmit: true,
    });
  }
  return session;
}

function examMatchesStudent(exam, user) {
  return (
    exam.targetCollege === user.college &&
    exam.targetFaculty === user.faculty &&
    exam.targetDepartment === user.department &&
    Number(exam.targetLevel) === Number(user.level)
  );
}

function shuffleOrder(length) {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function getSessionQuestionOrder(exam, session) {
  const total = exam?.questions?.length || 0;
  const savedOrder = Array.isArray(session?.questionOrder) ? session.questionOrder : [];
  const validSavedOrder =
    savedOrder.length === total &&
    new Set(savedOrder).size === total &&
    savedOrder.every((index) => Number.isInteger(index) && index >= 0 && index < total);
  if (validSavedOrder) return savedOrder;
  return Array.from({ length: total }, (_, i) => i);
}

function studentExamPayload(exam, session) {
  const obj = exam.toObject ? exam.toObject() : { ...exam };
  const order = getSessionQuestionOrder(obj, session);
  obj.questions = order.map((originalIndex, displayIndex) => {
    const q = obj.questions[originalIndex] || {};
    return {
      originalIndex,
      questionNumber: displayIndex + 1,
      text: q.text,
      type: q.type || 'mcq',
      options: q.options || [],
    };
  });
  obj.shuffleQuestions = Boolean(obj.shuffleQuestions);
  return obj;
}

function sanitizeStudentSession(session) {
  const obj = session.toObject ? session.toObject() : { ...session };
  if (obj.exam?.questions) {
    obj.exam = studentExamPayload(obj.exam, obj);
  }
  return obj;
}

router.get('/', async (req, res) => {
  try {
    let filter;
    if (req.user.role === 'admin') {
      const examIds = await getAdminExamIds(req.user._id);
      filter = { exam: { $in: examIds } };
    } else {
      filter = { student: req.user._id };
    }
    const examFields = 'title durationMinutes showResultsToStudents examType';
    const sessions = await ExamSession.find(filter)
      .populate('exam', examFields)
      .populate('student', 'name email studentId referenceNumber college faculty department level')
      .sort({ createdAt: -1 });

    if (req.user.role === 'student') {
      return res.json(
        sessions.map((s) => {
          markExpiredForList(s);
          const obj = s.toObject();
          delete obj.scaledScore;
          delete obj.maxGradePoints;
          delete obj.examScore;
          delete obj.riskScore;
          delete obj.questionBreakdown;
          delete obj.alertCount;
          delete obj.isFlagged;
          delete obj.answers;
          if (!s.exam?.showResultsToStudents) {
            delete obj.correctCount;
            delete obj.totalQuestions;
          }
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
      .populate('student', 'name email studentId referenceNumber college faculty department level')
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
      .populate('student', 'name email studentId referenceNumber college faculty department level')
      .sort({ submittedAt: -1, createdAt: -1 });

    res.json({
      exam: {
        _id: exam._id,
        title: exam.title,
        examType: exam.examType,
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
    if (!exam || !exam.isPublished || !examMatchesStudent(exam, req.user)) {
      return res.status(404).json({ message: 'Exam not available' });
    }

    const availability = getExamAvailability(exam);

    const session = await ExamSession.findOne({
      exam: exam._id,
      student: req.user._id,
    }).sort({ createdAt: -1 });

    if (!session) {
      return res.json({
        canStart: availability.canStart,
        canResume: false,
        session: null,
        availabilityStatus: availability.status,
        availableFrom: availability.startsAt,
        availableUntil: availability.endsAt,
        message: availability.canStart ? undefined : availability.message,
      });
    }

    const currentSession = await finalizeIfExpired(session);
    if (currentSession.status === 'in_progress') {
      await currentSession.populate('exam');
      return res.json({
        canStart: true,
        canResume: true,
        session: sanitizeStudentSession(currentSession),
        availabilityStatus: availability.status,
        availableFrom: availability.startsAt,
        availableUntil: availability.endsAt,
      });
    }

    return res.json({
      canStart: false,
      canResume: false,
      session: currentSession,
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
      .populate('student', 'name email studentId referenceNumber college faculty department level');
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
    if (!exam || !exam.isPublished || !examMatchesStudent(exam, req.user)) {
      return res.status(404).json({ message: 'Exam not available' });
    }
    const { error: availabilityError } = assertExamAvailable(exam);
    if (availabilityError) {
      return res.status(403).json({ message: availabilityError });
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
      const currentSession = await finalizeIfExpired(existing);
      if (currentSession.status !== 'in_progress') {
        return res.status(403).json({
          message: 'This exam attempt has ended and cannot be resumed.',
        });
      }
      await currentSession.populate('exam');
      return res.json(sanitizeStudentSession(currentSession));
    }

    const endsAt = new Date(Date.now() + exam.durationMinutes * 60 * 1000);
    const questionOrder = exam.shuffleQuestions
      ? shuffleOrder(exam.questions.length)
      : Array.from({ length: exam.questions.length }, (_, i) => i);
    const session = await ExamSession.create({
      exam: exam._id,
      student: req.user._id,
      endsAt,
      questionOrder,
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
    res.status(201).json(sanitizeStudentSession(populated));
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
    if (req.user.role === 'student') {
      return res.json(sanitizeStudentSession(session));
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

    let sessionObj = finalized.toObject();
    if (req.user.role === 'student') {
      delete sessionObj.scaledScore;
      delete sessionObj.maxGradePoints;
      delete sessionObj.examScore;
      delete sessionObj.riskScore;
      delete sessionObj.questionBreakdown;
      delete sessionObj.alertCount;
      delete sessionObj.isFlagged;
      delete sessionObj.answers;
      if (!finalized.exam?.showResultsToStudents) {
        delete sessionObj.correctCount;
        delete sessionObj.totalQuestions;
      }
    }

    res.json({
      session: sessionObj,
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
      .populate('exam', 'title showResultsToStudents examType')
      .populate('student', 'name email studentId referenceNumber college faculty department level');

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

router.get('/:id/report', requireRole('admin'), async (req, res) => {
  try {
    const session = await ExamSession.findById(req.params.id)
      .populate('exam', 'title durationMinutes createdBy maxGradePoints examType')
      .populate('student', 'name email studentId referenceNumber college faculty department level');
    if (!session) return res.status(404).json({ message: 'Session not found' });

    if (!(await assertAdminOwnsSession(req.user._id, session))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const events = await MonitoringEvent.find({ session: session._id }).sort({
      createdAt: 1,
    });
    const riskScore = computeRiskScore(events);
    const normalizedEvents = events.map((event) => ({
      ...event.toObject(),
      riskDelta: effectiveRiskDelta(event),
    }));
    session.riskScore = riskScore;
    session.alertCount = normalizedEvents.filter((e) => e.riskDelta > 0).length;
    session.isFlagged = shouldFlag(riskScore, session.alertCount);
    await session.save();

    res.json({ session, events: normalizedEvents, riskScore });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
