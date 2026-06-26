/**
 * Grade exam answers.
 * Scaled score = (correctCount / totalQuestions) * maxGradePoints
 * e.g. 140/200 correct, max 70 → (140/200)*70 = 49
 */

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ');
}

function isMcqCorrect(question, studentAnswer) {
  if (question.correctIndex == null || question.correctIndex === '') {
    return false;
  }
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

function getQuestionMarks(question) {
  const marks = Number(question.marks);
  return Number.isFinite(marks) && marks >= 0 ? marks : 1;
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
  if (idx == null || idx === '') return 'â€”';
  const letter = String.fromCharCode(65 + idx);
  const text = question.options?.[idx];
  return text ? `${letter}. ${text}` : letter;
}

function gradeExam(exam, studentAnswers) {
  const questions = exam.questions || [];
  const totalMarks = questions.reduce((sum, q) => sum + getQuestionMarks(q), 0);
  let earnedMarks = 0;

  const questionBreakdown = questions.map((q, index) => {
    const studentAnswer =
      studentAnswers.find((a) => a.questionIndex === index) || {
        questionIndex: index,
        selectedIndex: null,
        textAnswer: '',
      };
    const isCorrect = gradeAnswer(q, studentAnswer);
    const marks = getQuestionMarks(q);
    if (isCorrect) earnedMarks += marks;

    return {
      questionNumber: q.questionNumber ?? index + 1,
      questionIndex: index,
      isCorrect,
      marks,
      earnedMarks: isCorrect ? marks : 0,
      studentAnswer: getStudentAnswerLabel(q, studentAnswer),
      correctAnswer: getCorrectAnswerLabel(q),
      flagged: Boolean(studentAnswer.flagged),
    };
  });

  const maxGradePoints = exam.maxGradePoints ?? 100;
  const percentageScore = totalMarks > 0 ? Math.round((earnedMarks / totalMarks) * 10000) / 100 : 0;
  const scaledScore =
    totalMarks > 0
      ? Math.round(((earnedMarks / totalMarks) * maxGradePoints) * 100) / 100
      : 0;

  const totalQuestions = questions.length;
  const correctCount = questionBreakdown.filter((qb) => qb.isCorrect).length;

  return {
    earnedMarks,
    totalMarks,
    percentageScore,
    scaledScore,
    maxGradePoints,
    questionBreakdown,
    correctCount,
    totalQuestions,
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
