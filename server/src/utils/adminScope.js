const Exam = require('../models/Exam');

async function getAdminExamIds(adminId) {
  return Exam.find({ createdBy: adminId }).distinct('_id');
}

async function assertAdminOwnsExam(adminId, examId) {
  const exam = await Exam.findOne({ _id: examId, createdBy: adminId });
  return exam;
}

async function assertAdminOwnsSession(adminId, session) {
  const exam = await Exam.findById(session.exam);
  if (!exam || exam.createdBy.toString() !== adminId.toString()) {
    return false;
  }
  return true;
}

module.exports = { getAdminExamIds, assertAdminOwnsExam, assertAdminOwnsSession };
