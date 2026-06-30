const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  questionNumber: { type: Number, min: 1 },
  text: { type: String, required: true },
  type: { type: String, enum: ['mcq', 'short'], default: 'mcq' },
  options: [{ type: String }],
  correctIndex: { type: Number, min: 0, default: null },
  correctAnswer: { type: String, default: '' },
  marks: { type: Number, min: 0, default: 1 },
});

const examSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    examType: {
      type: String,
      enum: ['midsemester', 'end_of_semester'],
      default: 'midsemester',
    },
    durationMinutes: { type: Number, required: true, min: 1 },
    rules: { type: String, default: 'Keep your face visible. Do not leave the frame.' },
    questions: [questionSchema],
    maxGradePoints: { type: Number, default: 100, min: 1 },
    isPublished: { type: Boolean, default: false },
    showResultsToStudents: { type: Boolean, default: false },
    allowScientificCalculator: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    availableFrom: { type: Date },
    availableUntil: { type: Date },
    targetCollege: { type: String, trim: true, default: '' },
    targetFaculty: { type: String, trim: true, default: '' },
    targetDepartment: { type: String, trim: true, default: '' },
    targetLevel: { type: Number, enum: [100, 200, 300, 400, 500, 600, null], default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Exam', examSchema);
