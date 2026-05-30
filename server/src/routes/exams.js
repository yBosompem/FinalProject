const express = require('express');
const Exam = require('../models/Exam');
const { authenticate, requireRole } = require('../middleware/auth');
const { assertAdminOwnsExam } = require('../utils/adminScope');

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    let filter;
    if (req.user.role === 'admin') {
      filter = { createdBy: req.user._id };
    } else {
      filter = { isPublished: true };
    }
    const exams = await Exam.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
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
    } else if (!exam.isPublished) {
      return res.status(403).json({ message: 'Exam not available' });
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
    } = req.body;

    const normalizedQuestions = (questions || []).map((q, i) => ({
      ...q,
      questionNumber: q.questionNumber ?? i + 1,
      type: q.type || (q.options?.length >= 2 ? 'mcq' : 'short'),
    }));

    const exam = await Exam.create({
      title,
      description,
      durationMinutes,
      rules,
      questions: normalizedQuestions,
      maxGradePoints: maxGradePoints ?? 100,
      isPublished: Boolean(isPublished),
      showResultsToStudents: Boolean(showResultsToStudents),
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

    const { createdBy, ...updates } = req.body;
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
