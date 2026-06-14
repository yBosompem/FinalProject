import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import Layout, { NavItem } from '../../components/Layout';
import {
  parseQuestionsFile,
  parseQuestionsFromDocx,
  applyAnswerKey,
  QUESTIONS_CSV_TEMPLATE,
  ANSWERS_CSV_TEMPLATE,
} from '../../utils/examUpload';

const emptyQuestion = (n = 1) => ({
  questionNumber: n,
  text: '',
  type: 'mcq',
  options: ['', '', '', ''],
  correctIndex: 0,
  correctAnswer: '',
  marks: 1,
});

export default function CreateExam() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('setup');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [maxGradePoints, setMaxGradePoints] = useState(70);
  const [rules, setRules] = useState('Keep your face visible. Do not leave the frame.');
  const [showResultsToStudents, setShowResultsToStudents] = useState(false);
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [questions, setQuestions] = useState([emptyQuestion(1)]);
  const [error, setError] = useState('');
  const [uploadMsg, setUploadMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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
      let parsed;
      if (file.name.endsWith('.docx')) {
        parsed = await parseQuestionsFromDocx(file);
      } else {
        const text = await file.text();
        parsed = parseQuestionsFile(text);
      }

      if (parsed.length === 0) {
        setError('No questions found in file.');
        return;
      }
      setQuestions(parsed);
      const keysFromFile = parsed.filter((q) => q.hasAnswerKey).length;

      setUploadMsg(
        keysFromFile > 0
          ? `Loaded ${parsed.length} question(s); ${keysFromFile} answer key(s) applied. Review the Answer Key tab.`
          : `Loaded ${parsed.length} question(s). Add an "answer" column to your CSV or upload a separate answer key.`
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
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const updated = applyAnswerKey(questions, String(reader.result));
        const applied = updated.filter((q) => q.hasAnswerKey).length;
        setQuestions(updated);
        setUploadMsg(`Answer key applied to ${applied} of ${updated.length} question(s).`);
        setError('');
      } catch (err) {
        setError(err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
    setLoading(true);
    try {
      await api.createExam({
        title,
        description,
        durationMinutes: Number(durationMinutes),
        maxGradePoints: Number(maxGradePoints),
        rules,
        availableFrom: availableFrom || undefined,
        availableUntil: availableUntil || undefined,
        questions: questions.map((q, i) => ({
          questionNumber: q.questionNumber ?? i + 1,
          text: q.text,
          type: q.type || 'mcq',
          options: q.type === 'short' ? [] : q.options,
          correctIndex:
            q.correctIndex === '' || q.correctIndex == null ? 0 : Number(q.correctIndex),
          correctAnswer: q.correctAnswer || '',
          marks: Number(q.marks) || 1,
        })),
        isPublished: true,
        showResultsToStudents,
      });
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
        <h1 className="page-title">Create examination</h1>
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
                    value={maxGradePoints}
                    onChange={(e) => setMaxGradePoints(e.target.value)}
                    required
                  />
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
            </>
          )}

          {tab === 'questions' && (
            <>
              <div className="card" style={{ background: 'var(--surface2)', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Upload questions (CSV / DOCX)</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                  Columns: number, question, optionA–optionD, answer (optional), marks (optional). Use A–D, 1–4, or option
                  text for MCQ answers. Leave options empty for short-answer items.
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
                        Drag & drop a CSV or DOCX file here, or
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
                          accept=".csv,.txt,.docx"
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
                        value={q.marks ?? 1}
                        onChange={(e) => updateQuestion(qi, 'marks', Number(e.target.value))}
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
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Upload answer key (CSV)</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                  Columns: number, answer. MCQ: use A–D or 0–3. Short answer: exact text.
                </p>
                <input type="file" accept=".csv,.txt" onChange={handleAnswersUpload} />
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
                              value={q.correctIndex ?? 0}
                              onChange={(e) => updateQuestion(qi, 'correctIndex', Number(e.target.value))}
                            >
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
              {loading ? 'Saving…' : `Create exam (${questions.length} questions, graded /${maxGradePoints})`}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
