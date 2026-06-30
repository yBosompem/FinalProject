import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import Layout, { NavItem } from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';

const getTimeBasedGreeting = (name) => {
  const hour = new Date().getHours();
  let greeting = '';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 18) greeting = 'Good afternoon';
  else greeting = 'Good evening';
  return `${greeting}, ${name || 'Student'}!`;
};

function getAttemptState(examId, sessions) {
  const forExam = sessions.filter((s) => s.exam?._id === examId || s.exam === examId);
  if (forExam.some((s) => ['submitted', 'expired'].includes(s.status))) {
    return { type: 'completed', session: forExam.find((s) => ['submitted', 'expired'].includes(s.status)) };
  }
  if (forExam.some((s) => s.status === 'in_progress')) {
    return { type: 'resume' };
  }
  return { type: 'start' };
}

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getAvailabilityState(exam, now) {
  const startsAt = exam.availableFrom ? new Date(exam.availableFrom) : null;
  const endsAt = exam.availableUntil ? new Date(exam.availableUntil) : null;

  if (startsAt && now < startsAt) {
    return {
      type: 'pending',
      label: 'Pending',
      detail: `Opens ${formatDateTime(startsAt)}`,
    };
  }

  if (endsAt && now > endsAt) {
    return {
      type: 'closed',
      label: 'Closed',
      detail: `Closed ${formatDateTime(endsAt)}`,
    };
  }

  return {
    type: 'available',
    label: 'Available',
    detail: endsAt ? `Closes ${formatDateTime(endsAt)}` : '',
  };
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const [exams, setExams] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState('');
  const [resultsModal, setResultsModal] = useState(null);
  const [submitNotice, setSubmitNotice] = useState(location.state?.message || null);
  const [activeTab, setActiveTab] = useState('available');

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

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
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
        <h1 className="page-title">{getTimeBasedGreeting(user?.name)}</h1>
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

        <div className="student-dashboard-tabs">
          <button
            className={`btn ${activeTab === 'available' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.95rem' }}
            onClick={() => setActiveTab('available')}
          >
            Available & Upcoming
          </button>
          <button
            className={`btn ${activeTab === 'completed' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.95rem' }}
            onClick={() => setActiveTab('completed')}
          >
            Completed Sessions
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'available' && (
          <section className="student-exam-list">
            {exams.length === 0 ? (
              <p className="empty-state">No published exams yet.</p>
            ) : (
              exams.map((exam) => {
                const attempt = getAttemptState(exam._id, sessions);
                const availability = getAvailabilityState(exam, now);
                return (
                  <div key={exam._id} className="card student-exam-card">
                    <div className="student-exam-main">
                      <h3>{exam.title}</h3>
                      <div className="student-exam-meta">
                        <span>{exam.durationMinutes} minutes</span>
                        <span>{exam.questionCount ?? exam.questions?.length ?? 0} questions</span>
                        {availability.detail && <span>{availability.detail}</span>}
                      </div>
                      {exam.description && <p className="student-exam-description">{exam.description}</p>}
                    </div>
                    <div className="student-exam-action">
                      {attempt.type === 'completed' ? (
                        <>
                          <span className="badge badge-success">Completed</span>
                          {attempt.session?.exam?.showResultsToStudents ? (
                            <button
                              type="button"
                              className="btn btn-ghost student-exam-small-action"
                              onClick={() => viewResults(attempt.session._id)}
                            >
                              View results
                            </button>
                          ) : (
                            <span className="student-exam-muted">Results hidden</span>
                          )}
                        </>
                      ) : attempt.type === 'resume' ? (
                        <Link to={`/student/exam/${exam._id}`} className="btn btn-primary">
                          Resume exam
                        </Link>
                      ) : availability.type === 'available' ? (
                        <Link to={`/student/exam/${exam._id}`} className="btn btn-primary">
                          Start exam
                        </Link>
                      ) : (
                        <button type="button" className="btn btn-ghost" disabled>
                          {availability.label}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </section>
        )}

        {activeTab === 'completed' && (
          <section>
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
                          {s.exam?.showResultsToStudents && s.reportReady && s.correctCount != null
                            ? `${s.correctCount}/${s.totalQuestions}`
                            : '—'}
                        </td>
                        <td>
                          {['submitted', 'expired'].includes(s.status) && (
                            s.exam?.showResultsToStudents ? (
                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                onClick={() => viewResults(s._id)}
                              >
                                Results
                              </button>
                            ) : (
                              <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Hidden</span>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}
