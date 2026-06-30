import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/** Parse a CSV line respecting quoted fields */
export function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
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

function cleanText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function normalizeLines(text) {
  return stripBOM(text)
    .replace(/\r/g, '')
    .split('\n')
    .map(cleanText)
    .filter(Boolean);
}

function isShortSectionHeading(line) {
  return /\b(section\s+[b-z]|short\s*answer|theory|essay|structured)\b/i.test(line);
}

function isMcqSectionHeading(line) {
  return /\b(section\s+a|mcq|multiple\s*choice|objective)\b/i.test(line);
}

function isIgnorableHeading(line) {
  return /^(questions?|answers?|answer\s*key|examination|exam|networking|section\s+[a-z])\b/i.test(line);
}

function questionLine(line) {
  return line.match(/^(\d{1,4})[.)]\s*(.+)$/);
}

function answerLine(line) {
  return line.match(/^(\d{1,4})[.)]\s*(.*)$/);
}

function optionLine(line) {
  return line.match(/^([A-E])[\).:\-]\s*(.+)$/i);
}

function findOptionMarkers(text) {
  const markers = [];
  const regex = /(?:option\s+)?([A-E])[\).:\-]\s+/gi;
  let match = regex.exec(text);
  while (match) {
    const before = text[match.index - 1] || ' ';
    const startsCleanly = match.index === 0 || /[\s?!.,;:]/.test(before);
    if (startsCleanly) {
      markers.push({
        letter: match[1].toUpperCase(),
        index: match.index,
        end: regex.lastIndex,
      });
    }
    match = regex.exec(text);
  }
  return markers;
}

function parseInlineQuestion(body) {
  const markers = findOptionMarkers(body);
  if (markers.length < 2) return null;

  const questionText = cleanText(body.slice(0, markers[0].index).replace(/\boption\s*$/i, ''));
  const options = ['', '', '', '', ''];

  markers.forEach((marker, i) => {
    const next = markers[i + 1]?.index ?? body.length;
    const optionIndex = marker.letter.charCodeAt(0) - 65;
    options[optionIndex] = cleanText(body.slice(marker.end, next));
  });

  return {
    text: questionText,
    options,
  };
}

function makeQuestion({ text, options, sourceNumber, section, sequence }) {
  const cleanOptions = (options || []).map(cleanText);
  const nonEmptyOptions = cleanOptions.filter(Boolean);
  const type = nonEmptyOptions.length >= 2 && section !== 'short' ? 'mcq' : 'short';
  const sourceSection = type === 'short' ? 'short' : section;

  return {
    questionNumber: sequence,
    sourceNumber,
    sourceSection,
    text: cleanText(text),
    type,
    options: type === 'mcq' ? cleanOptions : [],
    correctIndex: '',
    correctAnswer: '',
    marks: 1,
  };
}

function parseStructuredQuestions(text) {
  const lines = normalizeLines(text);
  const questions = [];
  let section = 'mcq';
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    const parsedInline = parseInlineQuestion(current.text);
    const hasCollectedOptions = current.options.some(Boolean);
    if (parsedInline && !hasCollectedOptions && section !== 'short') {
      questions.push(
        makeQuestion({
          text: parsedInline.text,
          options: parsedInline.options,
          sourceNumber: current.sourceNumber,
          section,
          sequence: questions.length + 1,
        })
      );
    } else {
      questions.push(
        makeQuestion({
          text: current.text,
          options: current.options,
          sourceNumber: current.sourceNumber,
          section,
          sequence: questions.length + 1,
        })
      );
    }
    current = null;
  };

  for (const line of lines) {
    if (isShortSectionHeading(line)) {
      pushCurrent();
      section = 'short';
      continue;
    }
    if (isMcqSectionHeading(line)) {
      pushCurrent();
      section = 'mcq';
      continue;
    }

    const qMatch = questionLine(line);
    if (qMatch) {
      pushCurrent();
      current = {
        sourceNumber: Number(qMatch[1]),
        text: qMatch[2],
        options: ['', '', '', '', ''],
      };
      continue;
    }

    if (!current) continue;

    const oMatch = optionLine(line);
    if (oMatch && section !== 'short') {
      const optionIndex = oMatch[1].toUpperCase().charCodeAt(0) - 65;
      current.options[optionIndex] = cleanText(oMatch[2]);
      continue;
    }

    const lastOptionIndex = current.options.findLastIndex(Boolean);
    if (lastOptionIndex >= 0 && section !== 'short') {
      current.options[lastOptionIndex] = cleanText(`${current.options[lastOptionIndex]} ${line}`);
    } else {
      current.text = cleanText(`${current.text} ${line}`);
    }
  }

  pushCurrent();
  return questions.filter((q) => q.text);
}

/**
 * Resolve MCQ answer: letter (A-E), 0-based index, 1-based index (1-5), or option text.
 */
export function resolveMcqAnswer(options, rawAnswer) {
  const ans = String(rawAnswer ?? '').trim();
  if (!ans) return null;

  const opts = (options || []).map((o) => String(o ?? '').trim());
  const slotCount = Math.max(opts.length, 5);
  if (!opts.some((text) => text.length > 0)) return null;

  if (/^[A-Ea-e]$/.test(ans)) {
    const letterIndex = ans.toUpperCase().charCodeAt(0) - 65;
    return Math.max(0, Math.min(slotCount - 1, letterIndex));
  }

  if (/^\d+$/.test(ans)) {
    const n = parseInt(ans, 10);
    if (n >= 1 && n <= slotCount) return n - 1;
    if (n >= 0 && n < slotCount) return n;
  }

  const normAns = normalizeMatch(ans);
  const textIndex = opts.findIndex((text) => text.length > 0 && normalizeMatch(text) === normAns);
  if (textIndex >= 0) return textIndex;

  return null;
}

function detectQuestionsHeader(line) {
  const cols = parseCSVLine(line).map((c) => c.trim().toLowerCase());
  const looksLikeHeader = cols.some((c) =>
    /^(number|#|q|question|option|answer|correct|marks|points|score)/.test(c)
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
    else if (/^(optione|choicee|e)$/.test(col)) index.optionE = i;
    else if (/^(answer|correct|key|correctanswer)$/.test(col)) index.answer = i;
    else if (/^(marks|points|score|point)$/.test(col)) index.marks = i;
  });
  return index.question != null || index.optionA != null ? index : null;
}

function readOptionsFromRow(cols, header) {
  if (header?.optionA != null) {
    return [
      cols[header.optionA] ?? '',
      cols[header.optionB] ?? '',
      cols[header.optionC] ?? '',
      cols[header.optionD] ?? '',
      cols[header.optionE] ?? '',
    ].map((o) => String(o).trim());
  }
  return cols.slice(2, 7).map((o) => String(o).trim());
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

function parseQuestionsFromCsv(text) {
  const lines = normalizeLines(text);
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
    const answerRaw = header?.answer != null ? cols[header.answer] : (cols[7] ?? cols[6]);
    const marksRaw = header?.marks != null ? cols[header.marks] : (cols[8] ?? null);
    const marks = marksRaw != null ? parseFloat(marksRaw) || 1 : 1;
    const nonEmptyOpts = opts.filter(Boolean);

    let question = {
      questionNumber,
      sourceNumber: questionNumber,
      sourceSection: nonEmptyOpts.length >= 2 ? 'mcq' : 'short',
      text: qText,
      type: nonEmptyOpts.length >= 2 ? 'mcq' : 'short',
      options: nonEmptyOpts.length >= 2 ? opts : [],
      correctIndex: '',
      correctAnswer: '',
      marks,
    };
    question = applyAnswerToQuestion(question, answerRaw);
    questions.push(question);
  }

  return questions.sort((a, b) => a.questionNumber - b.questionNumber);
}

function looksLikeCsv(text) {
  const lines = normalizeLines(text);
  if (lines.length === 0) return false;
  if (detectQuestionsHeader(lines[0])) return true;
  const commaRows = lines.filter((line) => parseCSVLine(line).length >= 3).length;
  return commaRows >= Math.max(1, Math.ceil(lines.length * 0.6));
}

/**
 * Parse plain text from CSV, TXT, DOCX, or PDF into questions.
 */
export function parseQuestionsFromText(text) {
  if (looksLikeCsv(text)) return parseQuestionsFromCsv(text);
  return parseStructuredQuestions(text);
}

export async function extractTextFromDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

export async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    let lastY = null;
    let line = '';
    const pageLines = [];

    content.items.forEach((item) => {
      const y = Math.round(item.transform?.[5] ?? 0);
      if (lastY != null && Math.abs(y - lastY) > 3) {
        if (line.trim()) pageLines.push(line.trim());
        line = '';
      }
      line += `${line ? ' ' : ''}${item.str}`;
      lastY = y;
    });

    if (line.trim()) pageLines.push(line.trim());
    pages.push(pageLines.join('\n'));
  }

  return pages.join('\n');
}

export async function extractTextFromUpload(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx') || name.endsWith('.doc')) return extractTextFromDocx(file);
  if (name.endsWith('.pdf')) return extractTextFromPdf(file);
  return file.text();
}

/**
 * Parse DOCX file into plain text and then into questions.
 */
export async function parseQuestionsFromDocx(file) {
  return parseQuestionsFromText(await extractTextFromDocx(file));
}

export async function parseQuestionsUpload(file) {
  return parseQuestionsFromText(await extractTextFromUpload(file));
}

/**
 * Questions CSV: number, question, optionA-E, optional answer
 * Leave options empty for short-answer questions.
 */
export const parseQuestionsFile = parseQuestionsFromText;

function parseAnswerEntries(text) {
  const lines = normalizeLines(text);
  const entries = [];
  let section = 'any';
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    const answer = cleanText(current.parts.join(' '));
    if (answer) entries.push({ ...current, answer });
    current = null;
  };

  for (const line of lines) {
    if (isMcqSectionHeading(line)) {
      pushCurrent();
      section = 'mcq';
      continue;
    }
    if (isShortSectionHeading(line)) {
      pushCurrent();
      section = 'short';
      continue;
    }
    if (!current && isIgnorableHeading(line)) continue;

    const match = answerLine(line);
    if (match) {
      pushCurrent();
      current = {
        localNumber: Number(match[1]),
        section,
        parts: [match[2]],
      };
      continue;
    }

    if (current) current.parts.push(line);
  }

  pushCurrent();
  return entries;
}

function parseCsvAnswerMap(text) {
  const lines = normalizeLines(text);
  if (lines.length === 0) return null;
  const startRow = /^number|#|q|answer|correct/i.test(lines[0] ?? '') ? 1 : 0;
  const answerMap = {};
  let parsedRows = 0;

  for (let i = startRow; i < lines.length; i += 1) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 2) continue;
    const num = parseInt(stripBOM(cols[0] ?? ''), 10);
    const ans = (cols[1] ?? '').trim();
    if (!Number.isNaN(num) && ans !== '') {
      answerMap[num] = ans;
      parsedRows += 1;
    }
  }

  return parsedRows > 0 ? answerMap : null;
}

/**
 * Answers CSV/TXT/DOCX/PDF: number, answer or natural sectioned answer key.
 * MCQ: A/B/C/D/E, 0-4, 1-5, or matching option text. Short: exact text.
 */
export function applyAnswerKey(questions, text) {
  const csvMap = looksLikeCsv(text) ? parseCsvAnswerMap(text) : null;
  if (csvMap) {
    return questions.map((q, idx) => {
      const num = q.questionNumber ?? idx + 1;
      const ans = csvMap[num];
      if (ans == null || ans === '') return q;
      return applyAnswerToQuestion(q, ans);
    });
  }

  const entries = parseAnswerEntries(text);
  const mcqQuestions = questions.filter((q) => (q.type || 'mcq') === 'mcq');
  const shortQuestions = questions.filter((q) => (q.type || 'mcq') === 'short');
  const byQuestionNumber = new Map(questions.map((q, idx) => [q.questionNumber ?? idx + 1, idx]));
  const bySectionNumber = new Map();

  questions.forEach((q, idx) => {
    const key = `${q.sourceSection || q.type || 'any'}:${q.sourceNumber ?? q.questionNumber ?? idx + 1}`;
    bySectionNumber.set(key, idx);
  });

  const updated = [...questions];
  entries.forEach((entry) => {
    let targetIndex = null;

    if (entry.section === 'mcq') {
      const question = mcqQuestions[entry.localNumber - 1];
      targetIndex = questions.indexOf(question);
    } else if (entry.section === 'short') {
      const question = shortQuestions[entry.localNumber - 1];
      targetIndex = questions.indexOf(question);
    } else {
      targetIndex =
        bySectionNumber.get(`mcq:${entry.localNumber}`) ??
        bySectionNumber.get(`short:${entry.localNumber}`) ??
        byQuestionNumber.get(entry.localNumber) ??
        null;
    }

    if (targetIndex != null && targetIndex >= 0) {
      updated[targetIndex] = applyAnswerToQuestion(updated[targetIndex], entry.answer);
    }
  });

  return updated;
}

export async function applyAnswerKeyUpload(questions, file) {
  return applyAnswerKey(questions, await extractTextFromUpload(file));
}

export const QUESTIONS_CSV_TEMPLATE = `number,question,optionA,optionB,optionC,optionD,optionE,answer,marks
1,What is 2+2?,2,3,4,5,,C,2
2,Capital of Ghana?,,,,,,Accra,5
`;

export const ANSWERS_CSV_TEMPLATE = `number,answer
1,C
2,Accra
`;
