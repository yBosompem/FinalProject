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

export function stripBOM(text) {
  return String(text ?? '').replace(/^\uFEFF/, '');
}

function normalizeMatch(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Resolve MCQ answer: letter (A-D), 0-based index, 1-based index (1-4), or option text.
 */
export function resolveMcqAnswer(options, rawAnswer) {
  const ans = String(rawAnswer ?? '').trim();
  if (!ans) return null;

  const opts = (options || []).map((o) => String(o ?? '').trim());
  const slotCount = Math.max(opts.length, 4);
  if (!opts.some((text) => text.length > 0)) return null;

  if (/^[A-Da-d]$/.test(ans)) {
    const letterIndex = ans.toUpperCase().charCodeAt(0) - 65;
    return Math.max(0, Math.min(slotCount - 1, letterIndex));
  }

  if (/^\d+$/.test(ans)) {
    const n = parseInt(ans, 10);
    if (n >= 0 && n < slotCount) return n;
    if (n >= 1 && n <= slotCount) return n - 1;
  }

  const normAns = normalizeMatch(ans);
  const textIndex = opts.findIndex((text) => text.length > 0 && normalizeMatch(text) === normAns);
  if (textIndex >= 0) return textIndex;

  return null;
}

function detectQuestionsHeader(line) {
  const cols = parseCSVLine(line).map((c) => c.trim().toLowerCase());
  const looksLikeHeader = cols.some((c) =>
    /^(number|#|q|question|option|answer|correct)/.test(c)
  );
  if (!looksLikeHeader) return null;

  const index = {};
  cols.forEach((col, i) => {
    if (/^(number|#|qnum|questionnum|qno)$/.test(col)) index.number = i;
    else if (/^(question|text|prompt)$/.test(col)) index.question = i;
    else if (/^(optiona|choicea|a)$/.test(col)) index.optionA = i;
    else if (/^(optionb|choiceb|b)$/.test(col)) index.optionB = i;
    else if (/^(optionc|choicec|c)$/.test(col)) index.optionC = i;
    else if (/^(optiond|choiced|d)$/.test(col)) index.optionD = i;
    else if (/^(answer|correct|key|correctanswer)$/.test(col)) index.answer = i;
  });
  return index;
}

function readOptionsFromRow(cols, header) {
  if (header?.optionA != null) {
    return [
      cols[header.optionA] ?? '',
      cols[header.optionB] ?? '',
      cols[header.optionC] ?? '',
      cols[header.optionD] ?? '',
    ].map((o) => String(o).trim());
  }
  return cols.slice(2, 6).map((o) => String(o).trim());
}

function applyAnswerToQuestion(q, rawAnswer) {
  if (rawAnswer == null || String(rawAnswer).trim() === '') return q;

  if ((q.type || 'mcq') === 'short') {
    return { ...q, correctAnswer: String(rawAnswer).trim(), hasAnswerKey: true };
  }

  const resolved = resolveMcqAnswer(q.options, rawAnswer);
  if (resolved == null) return q;
  return { ...q, correctIndex: resolved, hasAnswerKey: true };
}

/**
 * Questions CSV: number, question, optionA–D, optional answer
 * Leave options empty for short-answer questions.
 */
export function parseQuestionsFile(text) {
  const lines = stripBOM(text)
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const header = detectQuestionsHeader(lines[0]);
  const startRow = header ? 1 : 0;
  const questions = [];

  for (let i = startRow; i < lines.length; i += 1) {
    const cols = parseCSVLine(lines[i]);
    const questionNumber =
      parseInt(stripBOM(cols[header?.number ?? 0] ?? ''), 10) || i - startRow + 1;
    const qText = cols[header?.question ?? 1] ?? '';
    const opts = readOptionsFromRow(cols, header);
    const answerRaw =
      header?.answer != null ? cols[header.answer] : cols[6];

    const nonEmptyOpts = opts.filter(Boolean);

    if (nonEmptyOpts.length >= 2) {
      let question = {
        questionNumber,
        text: qText,
        type: 'mcq',
        options: opts,
        correctIndex: 0,
        correctAnswer: '',
      };
      question = applyAnswerToQuestion(question, answerRaw);
      questions.push(question);
    } else {
      let question = {
        questionNumber,
        text: qText,
        type: 'short',
        options: [],
        correctIndex: 0,
        correctAnswer: '',
      };
      question = applyAnswerToQuestion(question, answerRaw);
      questions.push(question);
    }
  }

  return questions.sort((a, b) => a.questionNumber - b.questionNumber);
}

/**
 * Answers CSV: number, answer
 * MCQ: A/B/C/D, 0–3, 1–4, or matching option text. Short: exact text.
 */
export function applyAnswerKey(questions, text) {
  const lines = stripBOM(text)
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const startRow = /^number|#|q|answer|correct/i.test(lines[0] ?? '') ? 1 : 0;
  const answerMap = {};

  for (let i = startRow; i < lines.length; i += 1) {
    const cols = parseCSVLine(lines[i]);
    const num = parseInt(stripBOM(cols[0] ?? ''), 10);
    const ans = (cols[1] ?? '').trim();
    if (!Number.isNaN(num) && ans !== '') answerMap[num] = ans;
  }

  return questions.map((q, idx) => {
    const num = q.questionNumber ?? idx + 1;
    const ans = answerMap[num];
    if (ans == null || ans === '') return q;
    return applyAnswerToQuestion(q, ans);
  });
}

export const QUESTIONS_CSV_TEMPLATE = `number,question,optionA,optionB,optionC,optionD,answer
1,What is 2+2?,2,3,4,5,C
2,Capital of Ghana?,,,,
`;

export const ANSWERS_CSV_TEMPLATE = `number,answer
1,C
2,Accra
`;
