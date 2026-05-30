import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import Layout, { NavItem } from '../../components/Layout';

function getAttemptState(examId, sessions) {
  const forExam = sessions.filter((s) => s.exam?._id === examId || s.exam === examId);
  if (forExam.some((s) => s.status === 'in_progress')) {
    return { type: 'resume' };
  }
  if (forExam.some((s) => ['submitted', 'expired'].includes(s.status))) {
    return { type: 'completed', session: forExam.find((s) => ['submitted', 'expired'].includes(s.status)) };
  }
  return { type: 'start' };
}

export default function StudentDashboard() {
  const location = useLocation();
  const [exams, setExams] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [resultsModal, setResultsModal] = useState(null);
  const [submitNotice, setSubmitNotice] = useState(location.state?.message || null);

  useEffect(() => {
    if (location.state?.submitted) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    Promise.all([api.getExams(), api.getSessions()])
      .then(([e, s]) => {
        setExams(e);
        setSessions(s);
      })
      .catch((err) => setError(err.message));
  }, []);

  const viewResults = async (sessionId) => {
    try {
      const data = await api.getStudentResults(sessionId);
      setResultsModal(data);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Layout
      nav={
        <>
          <NavItem to="/student">Exams</NavItem>
        </>
      }
    >
      <div className="container">
        <h1 className="page-title">My Examinations</h1>
        <p className="page-sub">
          Entire-screen sharing and webcam are required. Each exam can only be taken once.
        </p>

        {submitNotice && (
          <div className="alert alert-info">
            {submitNotice}
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        {resultsModal && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.75rem' }}>
              {resultsModal.allowed ? resultsModal.examTitle : 'Results'}
            </h3>
            {resultsModal.allowed ? (
              <p>
                Score:{' '}
                <strong>
                  {resultsModal.correctCount}/{resultsModal.totalQuestions}
                </strong>
              </p>
            ) : (
              <p style={{ color: 'var(--muted)' }}>{resultsModal.message}</p>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: '1rem' }}
              onClick={() => setResultsModal(null)}
            >
              Close
            </button>
          </div>
        )}

        <div className="grid-2">
          <section>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Available exams</h2>
            {exams.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>No published exams yet.</p>
            ) : (
              exams.map((exam) => {
                const attempt = getAttemptState(exam._id, sessions);
                return (
                  <div key={exam._id} className="card" style={{ marginBottom: '1rem' }}>
                    <h3>{exam.title}</h3>
                    <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0.5rem 0' }}>
                      {exam.durationMinutes} minutes · {exam.questions?.length || 0} questions
                    </p>
                    <p style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>{exam.description}</p>
                    {attempt.type === 'completed' ? (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span className="badge badge-success">Completed</span>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                          onClick={() => viewResults(attempt.session._id)}
                        >
                          View results
                        </button>
                      </div>
                    ) : (
                      <Link to={`/student/exam/${exam._id}`} className="btn btn-primary">
                        {attempt.type === 'resume' ? 'Resume exam' : 'Start exam'}
                      </Link>
                    )}
                  </div>
                );
              })
            )}
          </section>

          <section>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Past sessions</h2>
            {sessions.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>No sessions yet.</p>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Exam</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s._id}>
                        <td>{s.exam?.title}</td>
                        <td>
                          <span
                            className={`badge badge-${
                              s.status === 'submitted'
                                ? 'success'
                                : s.status === 'in_progress'
                                  ? 'warning'
                                  : 'danger'
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td>
                          {s.reportReady && s.correctCount != null
                            ? `${s.correctCount}/${s.totalQuestions}`
                            : '—'}
                        </td>
                        <td>
                          {['submitted', 'expired'].includes(s.status) && (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                              onClick={() => viewResults(s._id)}
                            >
                              Results
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}
