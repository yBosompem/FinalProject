const mongoose = require('mongoose');

const breakdownSchema = new mongoose.Schema({
  questionNumber: Number,
  questionIndex: Number,
  isCorrect: Boolean,
  studentAnswer: String,
  correctAnswer: String,
  flagged: Boolean,
});

const answerSchema = new mongoose.Schema({
  questionIndex: { type: Number, required: true },
  selectedIndex: { type: Number, default: null },
  textAnswer: { type: String, default: '' },
  flagged: { type: Boolean, default: false },
  isCorrect: { type: Boolean, default: null },
});

const examSessionSchema = new mongoose.Schema(
  {
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['in_progress', 'submitted', 'expired'],
      default: 'in_progress',
    },
    startedAt: { type: Date, default: Date.now },
    endsAt: { type: Date, required: true },
    submittedAt: { type: Date },
    answers: [answerSchema],
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    alertCount: { type: Number, default: 0 },
    isFlagged: { type: Boolean, default: false },
    examScore: { type: Number, default: null },
    scaledScore: { type: Number, default: null },
    maxGradePoints: { type: Number, default: null },
    correctCount: { type: Number, default: null },
    totalQuestions: { type: Number, default: null },
    questionBreakdown: [breakdownSchema],
    reportReady: { type: Boolean, default: false },
    hasRecording: { type: Boolean, default: false },
    recordingPath: { type: String, default: '' },
  },
  { timestamps: true }
);

examSessionSchema.index({ exam: 1, student: 1 });
examSessionSchema.index({ exam: 1, student: 1, status: 1 });

module.exports = mongoose.model('ExamSession', examSessionSchema);
