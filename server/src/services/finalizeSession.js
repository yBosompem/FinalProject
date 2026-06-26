const ExamSession = require('../models/ExamSession');
const MonitoringEvent = require('../models/MonitoringEvent');
const { computeRiskScore, shouldFlag } = require('./riskScore');
const { gradeExam } = require('./grading');

async function finalizeSession(sessionId, { answers, status = 'submitted', autoSubmit = false } = {}) {
  const session = await ExamSession.findById(sessionId).populate('exam');
  if (!session) throw new Error('Session not found');

  if (answers && Array.isArray(answers)) {
    session.answers = answers;
  }

  const exam = session.exam;
  const grading = gradeExam(exam, session.answers);

  session.answers = grading.gradedAnswers;
  session.correctCount = grading.correctCount;
  session.totalQuestions = grading.totalQuestions;
  session.examScore = grading.percentageScore;
  session.scaledScore = grading.scaledScore;
  session.maxGradePoints = grading.maxGradePoints;
  session.questionBreakdown = grading.questionBreakdown;
  session.status = status;
  session.submittedAt = new Date();

  const events = await MonitoringEvent.find({ session: session._id })
    .select('type severity riskDelta')
    .lean();
  session.riskScore = computeRiskScore(events);
  session.alertCount = events.filter((e) => e.riskDelta > 0).length;
  session.isFlagged = shouldFlag(session.riskScore, session.alertCount);
  session.reportReady = true;

  await session.save();

  await MonitoringEvent.create({
    session: session._id,
    type: 'exam_submitted',
    severity: 'low',
    message: autoSubmit
      ? 'Exam auto-submitted when time expired'
      : 'Exam submitted by student',
    riskDelta: 0,
    metadata: {
      examScore: session.examScore,
      scaledScore: session.scaledScore,
      maxGradePoints: session.maxGradePoints,
      correctCount: session.correctCount,
      totalQuestions: session.totalQuestions,
      autoSubmit,
    },
  });

  return ExamSession.findById(sessionId)
    .populate('exam', 'title showResultsToStudents maxGradePoints')
    .populate('student', 'name email studentId');
}

module.exports = { finalizeSession };
