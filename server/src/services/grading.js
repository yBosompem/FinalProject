/**
 * Grade exam answers.
 * Scaled score = (correctCount / totalQuestions) * maxGradePoints
 * e.g. 140/200 correct, max 70 → (140/200)*70 = 49
 */

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isMcqCorrect(question, studentAnswer) {
  if (studentAnswer.selectedIndex == null || studentAnswer.selectedIndex < 0) {
    return false;
  }
  return Number(studentAnswer.selectedIndex) === Number(question.correctIndex);
}

function isShortCorrect(question, studentAnswer) {
  const expected = normalizeText(question.correctAnswer);
  const given = normalizeText(studentAnswer.textAnswer);
  if (!expected || !given) return false;
  return expected === given;
}

function gradeAnswer(question, studentAnswer) {
  const type = question.type || 'mcq';
  if (type === 'short') {
    return isShortCorrect(question, studentAnswer);
  }
  return isMcqCorrect(question, studentAnswer);
}

function getStudentAnswerLabel(question, studentAnswer) {
  const type = question.type || 'mcq';
  if (type === 'short') {
    return studentAnswer.textAnswer?.trim() || '—';
  }
  const idx = studentAnswer.selectedIndex;
  if (idx == null || idx < 0) return '—';
  const letter = String.fromCharCode(65 + idx);
  const text = question.options?.[idx];
  return text ? `${letter}. ${text}` : letter;
}

function getCorrectAnswerLabel(question) {
  const type = question.type || 'mcq';
  if (type === 'short') {
    return question.correctAnswer ?? '—';
  }
  const idx = question.correctIndex;
  const letter = String.fromCharCode(65 + idx);
  const text = question.options?.[idx];
  return text ? `${letter}. ${text}` : letter;
}

function gradeExam(exam, studentAnswers) {
  const questions = exam.questions || [];
  const total = questions.length;
  let correctCount = 0;

  const questionBreakdown = questions.map((q, index) => {
    const studentAnswer =
      studentAnswers.find((a) => a.questionIndex === index) || {
        questionIndex: index,
        selectedIndex: null,
        textAnswer: '',
      };
    const isCorrect = gradeAnswer(q, studentAnswer);
    if (isCorrect) correctCount += 1;

    return {
      questionNumber: q.questionNumber ?? index + 1,
      questionIndex: index,
      isCorrect,
      studentAnswer: getStudentAnswerLabel(q, studentAnswer),
      correctAnswer: getCorrectAnswerLabel(q),
      flagged: Boolean(studentAnswer.flagged),
    };
  });

  const maxGradePoints = exam.maxGradePoints ?? 100;
  const percentageScore = total > 0 ? Math.round((correctCount / total) * 10000) / 100 : 0;
  const scaledScore =
    total > 0
      ? Math.round(((correctCount / total) * maxGradePoints) * 100) / 100
      : 0;

  return {
    correctCount,
    totalQuestions: total,
    percentageScore,
    scaledScore,
    maxGradePoints,
    questionBreakdown,
    gradedAnswers: studentAnswers.map((a) => {
      const q = questions[a.questionIndex];
      return {
        ...a,
        isCorrect: q ? gradeAnswer(q, a) : false,
      };
    }),
  };
}

module.exports = {
  gradeExam,
  gradeAnswer,
  normalizeText,
};
