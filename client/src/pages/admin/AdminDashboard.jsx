import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import Layout, { NavItem } from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';

const getTimeBasedGreeting = (name) => {
  const hour = new Date().getHours();
  let greeting = '';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 18) greeting = 'Good afternoon';
  else greeting = 'Good evening';
  return `${greeting}, ${name || 'Instructor'}!`;
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const [exams, setExams] = useState([]);
  const [active, setActive] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [error, setError] = useState('');

  const load = () => {
    Promise.all([api.getExams(), api.getActiveSessions(), api.getFlagged()])
      .then(([e, a, f]) => {
        setExams(e);
        setActive(a);
        setFlagged(f);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const togglePublish = async (exam) => {
    await api.updateExam(exam._id, { isPublished: !exam.isPublished });
    load();
  };

  const toggleResults = async (exam) => {
    await api.updateExam(exam._id, {
      showResultsToStudents: !exam.showResultsToStudents,
    });
    load();
  };

  return (
    <Layout
      nav={
        <>
          <NavItem to="/admin">Dashboard</NavItem>
          <NavItem to="/admin/create-exam">Create exam</NavItem>
          <NavItem to="/admin/active">Live sessions</NavItem>
          <NavItem to="/admin/flagged">Flagged</NavItem>
        </>
      }
    >
      <div className="container">
        <h1 className="page-title">{getTimeBasedGreeting(user?.name)}</h1>
        <p className="page-sub">Manage exams, view every student submission, and release results</p>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="grid-2" style={{ marginBottom: '2rem' }}>
          <div className="card">
            <h3>Active sessions</h3>
            <p style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem' }}>{active.length}</p>
            <Link to="/admin/active" style={{ fontSize: '0.9rem' }}>
              View live →
            </Link>
          </div>
          <div className="card">
            <h3>Flagged sessions</h3>
            <p style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem', color: 'var(--danger)' }}>
              {flagged.length}
            </p>
            <Link to="/admin/flagged" style={{ fontSize: '0.9rem' }}>
              Review reports →
            </Link>
          </div>
        </div>

        <h2 style={{ marginBottom: '1rem' }}>Examinations</h2>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Duration</th>
                <th>Questions</th>
                <th>Status</th>
                <th>Results</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr key={exam._id}>
                  <td>{exam.title}</td>
                  <td>{exam.durationMinutes} min</td>
                  <td>{exam.questions?.length || 0}</td>
                  <td>
                    <span className={`badge ${exam.isPublished ? 'badge-success' : 'badge-warning'}`}>
                      {exam.isPublished ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                      onClick={() => toggleResults(exam)}
                    >
                      {exam.showResultsToStudents ? 'Visible' : 'Hidden'}
                    </button>
                  </td>
                  <td style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <Link
                      to={`/admin/exam/${exam._id}/students`}
                      className="btn btn-primary"
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                    >
                      Results
                    </Link>
                    {!exam.isPublished && (
                      <Link
                        to={`/admin/exam/${exam._id}/edit`}
                        className="btn btn-ghost"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                      >
                        Edit
                      </Link>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                      onClick={() => togglePublish(exam)}
                    >
                      {exam.isPublished ? 'Unpublish' : 'Publish'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
