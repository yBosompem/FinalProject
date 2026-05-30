import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import Layout, { NavItem } from '../../components/Layout';
import {
  parseQuestionsFile,
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
  const [questions, setQuestions] = useState([emptyQuestion(1)]);
  const [error, setError] = useState('');
  const [uploadMsg, setUploadMsg] = useState('');
  const [loading, setLoading] = useState(false);

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

  const handleQuestionsUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseQuestionsFile(String(reader.result));
        if (parsed.length === 0) {
          setError('No questions found in file.');
          return;
        }
        setQuestions(parsed);
        setUploadMsg(`Loaded ${parsed.length} question(s). Set answers in the Answer Key tab.`);
        setError('');
        setTab('answers');
      } catch (err) {
        setError(err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAnswersUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const updated = applyAnswerKey(questions, String(reader.result));
        setQuestions(updated);
        setUploadMsg(`Answer key applied to ${updated.length} question(s).`);
        setError('');
      } catch (err) {
        setError(err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
        questions: questions.map((q, i) => ({
          questionNumber: q.questionNumber ?? i + 1,
          text: q.text,
          type: q.type || 'mcq',
          options: q.type === 'short' ? [] : q.options,
          correctIndex: Number(q.correctIndex) || 0,
          correctAnswer: q.correctAnswer || '',
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
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Upload questions (CSV)</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                  Columns: number, question, optionA, optionB, optionC, optionD. Leave options empty for
                  short-answer items.
                </p>
                <input type="file" accept=".csv,.txt" onChange={handleQuestionsUpload} />
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
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
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

          <button type="submit" className="btn btn-primary" style={{ marginTop: '1.5rem' }} disabled={loading}>
            {loading ? 'Saving…' : `Create exam (${questions.length} questions, graded /${maxGradePoints})`}
          </button>
        </form>
      </div>
    </Layout>
  );
}
