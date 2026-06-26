import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import Layout, { NavItem } from '../../components/Layout';
import { ACADEMIC_DATA, LEVELS, getDepartments, getFaculties } from '../../utils/academicData';
import {
  parseQuestionsUpload,
  applyAnswerKeyUpload,
  extractTextFromUpload,
  QUESTIONS_CSV_TEMPLATE,
  ANSWERS_CSV_TEMPLATE,
} from '../../utils/examUpload';

const emptyQuestion = (n = 1) => ({
  questionNumber: n,
  text: '',
  type: 'mcq',
  options: ['', '', '', ''],
  correctIndex: '',
  correctAnswer: '',
  marks: 1,
});

export default function CreateExam() {
  const navigate = useNavigate();
  const { examId } = useParams();
  const isEditMode = Boolean(examId);
  const [tab, setTab] = useState('setup');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [maxGradePoints, setMaxGradePoints] = useState(70);
  const [rules, setRules] = useState('Keep your face visible. Do not leave the frame.');
  const [showResultsToStudents, setShowResultsToStudents] = useState(false);
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [targetCollege, setTargetCollege] = useState('');
  const [targetFaculty, setTargetFaculty] = useState('');
  const [targetDepartment, setTargetDepartment] = useState('');
  const [targetLevel, setTargetLevel] = useState('');
  const [questions, setQuestions] = useState([emptyQuestion(1)]);
  const [error, setError] = useState('');
  const [uploadMsg, setUploadMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [bulkMarks, setBulkMarks] = useState(1);
  const [bulkMarkTarget, setBulkMarkTarget] = useState('all');
  const [bulkQuestionNumbers, setBulkQuestionNumbers] = useState('');

  useEffect(() => {
    if (!examId) return;
    api
      .getExam(examId)
      .then((exam) => {
        setTitle(exam.title || '');
        setDescription(exam.description || '');
        setDurationMinutes(exam.durationMinutes || 30);
        setMaxGradePoints(exam.maxGradePoints || 70);
        setRules(exam.rules || '');
        setShowResultsToStudents(Boolean(exam.showResultsToStudents));
        setAvailableFrom(exam.availableFrom ? String(exam.availableFrom).slice(0, 16) : '');
        setAvailableUntil(exam.availableUntil ? String(exam.availableUntil).slice(0, 16) : '');
        setTargetCollege(exam.targetCollege || '');
        setTargetFaculty(exam.targetFaculty || '');
        setTargetDepartment(exam.targetDepartment || '');
        setTargetLevel(exam.targetLevel ? String(exam.targetLevel) : '');
        setQuestions(
          (exam.questions?.length ? exam.questions : [emptyQuestion(1)]).map((q, i) => ({
            questionNumber: q.questionNumber ?? i + 1,
            text: q.text || '',
            type: q.type || 'mcq',
            options: q.type === 'short' ? [] : q.options?.length ? q.options : ['', '', '', ''],
            correctIndex: q.correctIndex == null ? '' : q.correctIndex,
            correctAnswer: q.correctAnswer || '',
            marks: q.marks ?? 1,
            hasAnswerKey:
              (q.type || 'mcq') === 'short'
                ? Boolean(q.correctAnswer)
                : q.correctIndex != null && q.correctIndex !== '',
          }))
        );
        if (exam.isPublished) {
          setUploadMsg('This exam is currently published. Unpublish it before editing questions.');
        }
      })
      .catch((err) => setError(err.message));
  }, [examId]);

  const updateQuestion = (index, field, value) => {
    setQuestions((qs) =>
      qs.map((q, i) => (i === index ? { ...q, [field]: value } : q))
    );
  };

  const updateOption = (qIndex, oIndex, value) => {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qIndex
          ? { ...q, options: q.options.map((o, j) => (j === oIndex ? value : o)) }
          : q
      )
    );
  };

  const processQuestionsFile = async (file) => {
    setIsParsing(true);
    try {
      const parsed = await parseQuestionsUpload(file);

      if (parsed.length === 0) {
        setError('No questions found in file.');
        return;
      }
      setQuestions(parsed);
      const keysFromFile = parsed.filter((q) => q.hasAnswerKey).length;

      setUploadMsg(
        keysFromFile > 0
          ? `Loaded ${parsed.length} question(s); ${keysFromFile} answer key(s) applied. Review the Answer Key tab.`
          : `Loaded ${parsed.length} question(s). Upload a separate answer key if the answers are in another file.`
      );
      setError('');
      setTab(keysFromFile >= parsed.length ? 'questions' : 'answers');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsParsing(false);
    }
  };

  const handleQuestionsUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processQuestionsFile(file);
    e.target.value = '';
  };

  const handleQuestionsDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processQuestionsFile(file);
  };

  const handleAnswersUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsing(true);
    applyAnswerKeyUpload(questions, file)
      .then((updated) => {
        const applied = updated.filter((q) => q.hasAnswerKey).length;
        setQuestions(updated);
        setUploadMsg(`Answer key applied to ${applied} of ${updated.length} question(s).`);
        setError('');
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setIsParsing(false);
        e.target.value = '';
      });
  };

  const handleRulesUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsing(true);
    try {
      const text = await extractTextFromUpload(file);
      const cleaned = String(text || '').trim();
      if (!cleaned) {
        setError('No readable rules were found in the uploaded file.');
        return;
      }
      setRules(cleaned);
      setUploadMsg('Rules loaded from file.');
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsParsing(false);
      e.target.value = '';
    }
  };

  const applyBulkMarks = () => {
    const markValue = Number(bulkMarks);
    if (!Number.isFinite(markValue) || markValue < 0) {
      setError('Enter a valid mark allocation.');
      return;
    }
    const selectedNumbers = new Set();
    if (bulkMarkTarget === 'specific') {
      bulkQuestionNumbers
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => {
          const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
          if (range) {
            const start = Number(range[1]);
            const end = Number(range[2]);
            for (let n = Math.min(start, end); n <= Math.max(start, end); n += 1) {
              selectedNumbers.add(n);
            }
            return;
          }
          const single = Number(part);
          if (Number.isFinite(single)) selectedNumbers.add(single);
        });
      if (selectedNumbers.size === 0) {
        setError('Enter question numbers such as 1, 3, 5-10.');
        return;
      }
    }
    setQuestions((qs) =>
      qs.map((q) =>
        bulkMarkTarget === 'all' ||
        (bulkMarkTarget === 'specific' && selectedNumbers.has(Number(q.questionNumber))) ||
        (q.type || 'mcq') === bulkMarkTarget
          ? { ...q, marks: markValue }
          : q
      )
    );
    setUploadMsg(
      `Applied ${markValue} mark(s) to ${
        bulkMarkTarget === 'all'
          ? 'all questions'
          : bulkMarkTarget === 'specific'
            ? `question(s): ${Array.from(selectedNumbers).sort((a, b) => a - b).join(', ')}`
            : `${bulkMarkTarget} questions`
      }.`
    );
    setError('');
  };

  const deleteQuestion = (indexToDelete) => {
    setQuestions((qs) => {
      const filtered = qs.filter((_, i) => i !== indexToDelete);
      return filtered.map((q, i) => ({
        ...q,
        questionNumber: i + 1,
      }));
    });
  };

  const calculateTotalMarks = () => {
    return questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (questions.length === 0) {
      setError('Add at least one question.');
      return;
    }
    if (!targetCollege || !targetFaculty || !targetDepartment || !targetLevel) {
      setError('Choose the target college, faculty, department, and level before creating the exam.');
      setTab('setup');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        title,
        description,
        durationMinutes: Number(durationMinutes),
        maxGradePoints: Number(maxGradePoints),
        rules,
        availableFrom: availableFrom || undefined,
        availableUntil: availableUntil || undefined,
        targetCollege,
        targetFaculty,
        targetDepartment,
        targetLevel: targetLevel || null,
        questions: questions.map((q, i) => ({
          questionNumber: q.questionNumber ?? i + 1,
          text: q.text,
          type: q.type || 'mcq',
          options: q.type === 'short' ? [] : q.options,
          correctIndex:
            q.correctIndex === '' || q.correctIndex == null ? null : Number(q.correctIndex),
          correctAnswer: q.correctAnswer || '',
          marks: q.marks === '' || q.marks == null ? 1 : Number(q.marks),
        })),
        isPublished: isEditMode ? false : true,
        showResultsToStudents,
      };
      if (isEditMode) {
        await api.updateExam(examId, payload);
      } else {
        await api.createExam(payload);
      }
      navigate('/admin');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'setup', label: 'Exam setup' },
    { id: 'questions', label: 'Questions' },
    { id: 'answers', label: 'Answer key' },
  ];
  const faculties = getFaculties(targetCollege);
  const departments = getDepartments(targetCollege, targetFaculty);

  return (
    <Layout
      nav={
        <>
          <NavItem to="/admin">Dashboard</NavItem>
          <NavItem to="/admin/create-exam">Create exam</NavItem>
        </>
      }
    >
      <div className="container" style={{ maxWidth: 900 }}>
        <h1 className="page-title">{isEditMode ? 'Edit examination' : 'Create examination'}</h1>
        <p className="page-sub">
          Upload questions and answers separately. Grading: (correct ÷ total questions) × grade scale.
        </p>

        {error && <div className="alert alert-error">{error}</div>}
        {uploadMsg && <div className="alert alert-info">{uploadMsg}</div>}

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`btn ${tab === t.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="card">
          {tab === 'setup' && (
            <>
              <div className="form-group">
                <label className="label">Title</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="label">Description</label>
                <textarea
                  className="input"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="label">Duration (minutes)</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="label">Grade out of (points)</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    list="grade-scale-options"
                    value={maxGradePoints}
                    onChange={(e) => setMaxGradePoints(e.target.value)}
                    required
                  />
                  <datalist id="grade-scale-options">
                    {[10, 20, 30, 40, 50, 60, 70, 100].map((value) => (
                      <option key={value} value={value} />
                    ))}
                  </datalist>
                  <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
                    Example: 140/200 correct → ({'{'}140/200{'}'}) × {maxGradePoints} ={' '}
                    {((140 / 200) * Number(maxGradePoints || 0)).toFixed(2)} points
                  </p>
                </div>
              </div>
              <div className="form-group">
                <label className="label">Rules</label>
                <textarea
                  className="input"
                  rows={2}
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                />
                <div style={{ marginTop: '0.6rem' }}>
                  <label className="label">Upload rules (CSV / DOCX / DOC / PDF)</label>
                  <input type="file" accept=".csv,.txt,.doc,.docx,.pdf" onChange={handleRulesUpload} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="label">Available from</label>
                  <input
                    className="input"
                    type="datetime-local"
                    value={availableFrom}
                    onChange={(e) => setAvailableFrom(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="label">Available until</label>
                  <input
                    className="input"
                    type="datetime-local"
                    value={availableUntil}
                    onChange={(e) => setAvailableUntil(e.target.value)}
                  />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showResultsToStudents}
                  onChange={(e) => setShowResultsToStudents(e.target.checked)}
                />
                Allow students to view graded results after submitting
              </label>
              <div className="card" style={{ background: 'var(--surface2)', marginTop: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Student routing</h3>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="label">Target college</label>
                    <select
                      className="input"
                      value={targetCollege}
                      onChange={(e) => {
                        setTargetCollege(e.target.value);
                        setTargetFaculty('');
                        setTargetDepartment('');
                      }}
                    >
                      <option value="">All colleges</option>
                      {ACADEMIC_DATA.map((item) => (
                        <option key={item.college} value={item.college}>
                          {item.college}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Target level</label>
                    <select
                      className="input"
                      value={targetLevel}
                      onChange={(e) => setTargetLevel(e.target.value)}
                    >
                      <option value="">All levels</option>
                      {LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="label">Target faculty / school</label>
                    <select
                      className="input"
                      value={targetFaculty}
                      onChange={(e) => {
                        setTargetFaculty(e.target.value);
                        setTargetDepartment('');
                      }}
                      disabled={!targetCollege}
                    >
                      <option value="">All faculties / schools</option>
                      {faculties.map((faculty) => (
                        <option key={faculty.name} value={faculty.name}>
                          {faculty.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Target department</label>
                    <select
                      className="input"
                      value={targetDepartment}
                      onChange={(e) => setTargetDepartment(e.target.value)}
                      disabled={!targetFaculty}
                    >
                      <option value="">All departments</option>
                      {departments.map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'questions' && (
            <>
              <div className="card" style={{ background: 'var(--surface2)', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Upload questions (CSV / DOCX / DOC / PDF)</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                  Supports CSV columns or normal documents with numbered questions, A-D options, and short-answer/theory
                  sections.
                </p>
                <div
                  style={{
                    border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border-strong)'}`,
                    borderRadius: '14px',
                    padding: '2rem',
                    textAlign: 'center',
                    background: dragOver ? 'rgba(10, 132, 255, 0.05)' : 'transparent',
                    transition: 'all 0.3s ease',
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleQuestionsDrop}
                >
                  {isParsing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                      <div style={{
                        width: '30px',
                        height: '30px',
                        border: '3px solid var(--muted)',
                        borderTopColor: 'var(--primary)',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                      }} />
                      <span>Parsing file...</span>
                    </div>
                  ) : (
                    <>
                      <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                        Drag & drop a CSV, DOCX, DOC, or PDF file here, or
                      </p>
                      <label
                        style={{
                          display: 'inline-block',
                          padding: '0.6rem 1.5rem',
                          background: 'var(--primary)',
                          color: 'white',
                          borderRadius: '999px',
                          cursor: 'pointer',
                          transition: 'all 0.3s ease',
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'scale(1.05)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      >
                        Browse
                        <input
                          type="file"
                          accept=".csv,.txt,.doc,.docx,.pdf"
                          onChange={handleQuestionsUpload}
                          style={{ display: 'none' }}
                        />
                      </label>
                    </>
                  )}
                </div>
                <details style={{ marginTop: '0.75rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>CSV template</summary>
                  <pre
                    style={{
                      marginTop: '0.5rem',
                      fontSize: '0.75rem',
                      overflow: 'auto',
                      padding: '0.5rem',
                      background: 'var(--bg)',
                      borderRadius: 6,
                    }}
                  >
                    {QUESTIONS_CSV_TEMPLATE}
                  </pre>
                </details>
              </div>

              <div className="card" style={{ background: 'var(--surface2)', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Mark allocation</h3>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ margin: 0, width: 140 }}>
                    <label className="label">Marks</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="0.5"
                      list="mark-allocation-options"
                      value={bulkMarks}
                      onChange={(e) => setBulkMarks(e.target.value)}
                    />
                    <datalist id="mark-allocation-options">
                      {[1, 2, 3, 4, 5, 10].map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  </div>
                  <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
                    <label className="label">Apply to</label>
                    <select
                      className="input"
                      value={bulkMarkTarget}
                      onChange={(e) => setBulkMarkTarget(e.target.value)}
                    >
                      <option value="all">All questions</option>
                      <option value="specific">Specific question numbers</option>
                      <option value="mcq">Multiple choice only</option>
                      <option value="short">Short answer only</option>
                    </select>
                  </div>
                  {bulkMarkTarget === 'specific' && (
                    <div className="form-group" style={{ margin: 0, minWidth: 220, flex: 1 }}>
                      <label className="label">Question numbers</label>
                      <input
                        className="input"
                        value={bulkQuestionNumbers}
                        onChange={(e) => setBulkQuestionNumbers(e.target.value)}
                        placeholder="Example: 1, 3, 5-10"
                      />
                    </div>
                  )}
                  <button type="button" className="btn btn-primary" onClick={applyBulkMarks}>
                    Apply marks
                  </button>
                </div>
              </div>

              {questions.map((q, qi) => (
                <div key={qi} className="card" style={{ marginBottom: '1rem', background: 'var(--surface2)' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ margin: 0, width: 80 }}>
                      <label className="label">Q#</label>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        value={q.questionNumber ?? qi + 1}
                        onChange={(e) => updateQuestion(qi, 'questionNumber', Number(e.target.value))}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0, width: 80 }}>
                      <label className="label">Marks</label>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        step="0.5"
                        value={q.marks ?? 1}
                        onChange={(e) =>
                          updateQuestion(qi, 'marks', e.target.value === '' ? '' : Number(e.target.value))
                        }
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 120 }}>
                      <label className="label">Type</label>
                      <select
                        className="input"
                        value={q.type || 'mcq'}
                        onChange={(e) => updateQuestion(qi, 'type', e.target.value)}
                      >
                        <option value="mcq">Multiple choice</option>
                        <option value="short">Short answer</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ color: 'var(--danger)', padding: '0.5rem 0.75rem' }}
                      onClick={() => deleteQuestion(qi)}
                    >
                      ✕ Delete
                    </button>
                  </div>
                  <div className="form-group">
                    <label className="label">Question text</label>
                    <input
                      className="input"
                      value={q.text}
                      onChange={(e) => updateQuestion(qi, 'text', e.target.value)}
                      required
                    />
                  </div>
                  {(q.type || 'mcq') === 'mcq' &&
                    q.options.map((opt, oi) => (
                      <div key={oi} className="form-group">
                        <label className="label">Option {String.fromCharCode(65 + oi)}</label>
                        <input
                          className="input"
                          value={opt}
                          onChange={(e) => updateOption(qi, oi, e.target.value)}
                        />
                      </div>
                    ))}
                </div>
              ))}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  setQuestions((qs) => [...qs, emptyQuestion((qs[qs.length - 1]?.questionNumber || qs.length) + 1)])
                }
              >
                + Add question manually
              </button>
            </>
          )}

          {tab === 'answers' && (
            <>
              <div className="card" style={{ background: 'var(--surface2)', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Upload answer key (CSV / DOCX / DOC / PDF)</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                  Columns: number, answer, or a normal answer document with MCQ answers and theory suggested answers.
                </p>
                <input type="file" accept=".csv,.txt,.doc,.docx,.pdf" onChange={handleAnswersUpload} />
                <details style={{ marginTop: '0.75rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>CSV template</summary>
                  <pre
                    style={{
                      marginTop: '0.5rem',
                      fontSize: '0.75rem',
                      overflow: 'auto',
                      padding: '0.5rem',
                      background: 'var(--bg)',
                      borderRadius: 6,
                    }}
                  >
                    {ANSWERS_CSV_TEMPLATE}
                  </pre>
                </details>
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Q#</th>
                      <th>Question</th>
                      <th>Type</th>
                      <th>Correct answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map((q, qi) => (
                      <tr key={qi}>
                        <td>{q.questionNumber ?? qi + 1}</td>
                        <td style={{ maxWidth: 280 }}>{q.text || '—'}</td>
                        <td>{q.type || 'mcq'}</td>
                        <td>
                          {(q.type || 'mcq') === 'short' ? (
                            <input
                              className="input"
                              value={q.correctAnswer || ''}
                              onChange={(e) => updateQuestion(qi, 'correctAnswer', e.target.value)}
                              placeholder="Correct text"
                            />
                          ) : (
                            <select
                              className="input"
                              value={q.correctIndex ?? ''}
                              onChange={(e) =>
                                updateQuestion(
                                  qi,
                                  'correctIndex',
                                  e.target.value === '' ? '' : Number(e.target.value)
                                )
                              }
                            >
                              <option value="">No answer selected</option>
                              {(q.options || []).map((opt, oi) => (
                                <option key={oi} value={oi}>
                                  {String.fromCharCode(65 + oi)}
                                  {opt ? `. ${opt.slice(0, 40)}` : ''}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem' }}>
            <div className="badge" style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}>
              Total marks: {calculateTotalMarks()}
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading
                ? 'Saving...'
                : `${isEditMode ? 'Save changes' : 'Create exam'} (${questions.length} questions, graded /${maxGradePoints})`}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
