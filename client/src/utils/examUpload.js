/** Parse a CSV line respecting quoted fields */
export function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

/**
 * Questions CSV: number, question text, optionA, optionB, optionC, optionD
 * Leave options empty for short-answer questions.
 */
export function parseQuestionsFile(text) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const startRow = /^number|#|q/i.test(lines[0]) ? 1 : 0;
  const questions = [];

  for (let i = startRow; i < lines.length; i += 1) {
    const cols = parseCSVLine(lines[i]);
    const questionNumber = parseInt(cols[0], 10) || i - startRow + 1;
    const qText = cols[1] || '';
    const opts = cols.slice(2, 6).map((o) => o.trim()).filter(Boolean);

    if (opts.length >= 2) {
      questions.push({
        questionNumber,
        text: qText,
        type: 'mcq',
        options: opts,
        correctIndex: 0,
        correctAnswer: '',
      });
    } else {
      questions.push({
        questionNumber,
        text: qText,
        type: 'short',
        options: [],
        correctIndex: 0,
        correctAnswer: '',
      });
    }
  }

  return questions.sort((a, b) => a.questionNumber - b.questionNumber);
}

/**
 * Answers CSV: number, answer
 * MCQ: A/B/C/D or 0-3. Short: text answer.
 */
export function applyAnswerKey(questions, text) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const startRow = /^number|#|q/i.test(lines[0]) ? 1 : 0;
  const answerMap = {};

  for (let i = startRow; i < lines.length; i += 1) {
    const cols = parseCSVLine(lines[i]);
    const num = parseInt(cols[0], 10);
    const ans = (cols[1] ?? '').trim();
    if (!Number.isNaN(num)) answerMap[num] = ans;
  }

  return questions.map((q, idx) => {
    const num = q.questionNumber ?? idx + 1;
    const ans = answerMap[num];
    if (ans == null || ans === '') return q;

    if ((q.type || 'mcq') === 'short') {
      return { ...q, correctAnswer: ans };
    }

    let correctIndex = 0;
    if (/^[A-Da-d]$/.test(ans)) {
      correctIndex = ans.toUpperCase().charCodeAt(0) - 65;
    } else {
      correctIndex = parseInt(ans, 10);
      if (Number.isNaN(correctIndex)) correctIndex = 0;
    }
    return { ...q, correctIndex: Math.max(0, Math.min((q.options?.length || 4) - 1, correctIndex)) };
  });
}

export const QUESTIONS_CSV_TEMPLATE = `number,question,optionA,optionB,optionC,optionD
1,What is 2+2?,2,3,4,5
2,Capital of Ghana?,,,,
`;

export const ANSWERS_CSV_TEMPLATE = `number,answer
1,C
2,Accra
`;
