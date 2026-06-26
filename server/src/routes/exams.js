const express = require('express');
const Exam = require('../models/Exam');
const { authenticate, requireRole } = require('../middleware/auth');
const { assertAdminOwnsExam } = require('../utils/adminScope');
const { getExamAvailability, assertExamAvailable } = require('../utils/examAvailability');

const router = express.Router();

router.use(authenticate);

function studentTargetFilter(user) {
  return {
    isPublished: true,
    targetCollege: user.college || '__no_college__',
    targetFaculty: user.faculty || '__no_faculty__',
    targetDepartment: user.department || '__no_department__',
    targetLevel: Number(user.level) || -1,
  };
}

function examMatchesStudent(exam, user) {
  return (
    exam.targetCollege === user.college &&
    exam.targetFaculty === user.faculty &&
    exam.targetDepartment === user.department &&
    Number(exam.targetLevel) === Number(user.level)
  );
}

function normalizeTargeting(body) {
  return {
    targetCollege: body.targetCollege || '',
    targetFaculty: body.targetFaculty || '',
    targetDepartment: body.targetDepartment || '',
    targetLevel: body.targetLevel ? Number(body.targetLevel) : null,
  };
}

function validateTargeting(body) {
  const target = normalizeTargeting(body);
  if (!target.targetCollege || !target.targetFaculty || !target.targetDepartment || !target.targetLevel) {
    return {
      error: 'Choose a target college, faculty, department, and level before publishing this exam.',
    };
  }
  return { target };
}

function validateAvailability(body) {
  if (!body.availableFrom || !body.availableUntil) return null;
  if (new Date(body.availableFrom) >= new Date(body.availableUntil)) {
    return 'Availability end time must be after the start time.';
  }
  return null;
}

function normalizeQuestions(questions) {
  return (questions || []).map((q, i) => {
    const type = q.type || (q.options?.length >= 2 ? 'mcq' : 'short');
    const marks = Number(q.marks);
    return {
      ...q,
      questionNumber: q.questionNumber ?? i + 1,
      type,
      options: type === 'short' ? [] : q.options || [],
      correctIndex:
        q.correctIndex === '' || q.correctIndex == null ? null : Number(q.correctIndex),
      correctAnswer: q.correctAnswer || '',
      marks: Number.isFinite(marks) && marks >= 0 ? marks : 1,
    };
  });
}

router.get('/', async (req, res) => {
  try {
    let filter;
    if (req.user.role === 'admin') {
      filter = { createdBy: req.user._id };
    } else {
      filter = studentTargetFilter(req.user);
    }
    const exams = await Exam.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    if (req.user.role === 'student') {
      return res.json(
        exams.map((exam) => {
          const obj = exam.toObject();
          const availability = getExamAvailability(obj);
          obj.questionCount = obj.questions?.length || 0;
          obj.availabilityStatus = availability.status;
          obj.canStartNow = availability.canStart;
          obj.availabilityMessage = availability.message;
          delete obj.questions;
          return obj;
        })
      );
    }
    res.json(exams);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).populate('createdBy', 'name email');
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    if (req.user.role === 'admin') {
      if (exam.createdBy._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You can only access exams you created' });
      }
    } else if (!exam.isPublished || !examMatchesStudent(exam, req.user)) {
      return res.status(403).json({ message: 'Exam not available' });
    } else {
      const { error } = assertExamAvailable(exam);
      if (error) return res.status(403).json({ message: error });
    }

    const payload = exam.toObject();
    if (req.user.role === 'student') {
      payload.questions = payload.questions.map((q, i) => ({
        questionNumber: q.questionNumber ?? i + 1,
        text: q.text,
        type: q.type || 'mcq',
        options: q.options || [],
      }));
    }
    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const {
      title,
      description,
      durationMinutes,
      rules,
      questions,
      isPublished,
      showResultsToStudents,
      maxGradePoints,
      availableFrom,
      availableUntil,
    } = req.body;

    const normalizedQuestions = normalizeQuestions(questions);
    const { target, error: targetError } = validateTargeting(req.body);
    if (targetError) return res.status(400).json({ message: targetError });
    const availabilityError = validateAvailability(req.body);
    if (availabilityError) return res.status(400).json({ message: availabilityError });

    const exam = await Exam.create({
      title,
      description,
      durationMinutes,
      rules,
      questions: normalizedQuestions,
      maxGradePoints: maxGradePoints ?? 100,
      isPublished: Boolean(isPublished),
      showResultsToStudents: Boolean(showResultsToStudents),
      availableFrom: availableFrom || undefined,
      availableUntil: availableUntil || undefined,
      ...target,
      createdBy: req.user._id,
    });
    res.status(201).json(exam);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const owned = await assertAdminOwnsExam(req.user._id, req.params.id);
    if (!owned) return res.status(403).json({ message: 'You can only edit exams you created' });

    const { createdBy, targetLevel, ...rest } = req.body;
    const updates = {
      ...rest,
      ...(Array.isArray(req.body.questions) ? { questions: normalizeQuestions(req.body.questions) } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body, 'targetLevel')
        ? { targetLevel: targetLevel ? Number(targetLevel) : null }
        : {}),
    };
    if (updates.isPublished) {
      const merged = { ...owned.toObject(), ...updates };
      const { error: targetError } = validateTargeting(merged);
      if (targetError) return res.status(400).json({ message: targetError });
      const availabilityError = validateAvailability(merged);
      if (availabilityError) return res.status(400).json({ message: availabilityError });
    }
    const exam = await Exam.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    res.json(exam);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const owned = await assertAdminOwnsExam(req.user._id, req.params.id);
    if (!owned) return res.status(403).json({ message: 'You can only delete exams you created' });

    await Exam.findByIdAndDelete(req.params.id);
    res.json({ message: 'Exam deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
