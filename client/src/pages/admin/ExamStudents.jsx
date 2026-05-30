import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import Layout, { NavItem } from '../../components/Layout';

export default function ExamStudents() {
  const { examId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    api
      .getExamSubmissions(examId)
      .then(setData)
      .catch((err) => setError(err.message));
  };

  useEffect(load, [examId]);

  const toggleResults = async () => {
    await api.updateExam(examId, {
      showResultsToStudents: !data.exam.showResultsToStudents,
    });
    load();
  };

  if (error) {
    return (
      <Layout nav={<NavItem to="/admin">Dashboard</NavItem>}>
        <div className="container">
          <div className="alert alert-error">{error}</div>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <div className="container" style={{ paddingTop: '4rem' }}>
        Loading…
      </div>
    );
  }

  const completed = data.sessions.filter((s) =>
    ['submitted', 'expired'].includes(s.status)
  );

  return (
    <Layout
      nav={
        <>
          <NavItem to="/admin">Dashboard</NavItem>
          <NavItem to={`/admin/exam/${examId}/students`}>Students</NavItem>
        </>
      }
    >
      <div className="container">
        <h1 className="page-title">{data.exam.title}</h1>
        <p className="page-sub">Students who took this exam — click a name for the full monitoring report</p>

        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <strong>Release results to students</strong>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
                When enabled, students can see their score after submitting.
              </p>
            </div>
            <button type="button" className="btn btn-primary" onClick={toggleResults}>
              {data.exam.showResultsToStudents ? 'Results visible' : 'Results hidden'}
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Student name</th>
                <th>Email</th>
                <th>Student ID</th>
                <th>Status</th>
                <th>Raw (Q&apos;s)</th>
                <th>Grade</th>
                <th>Risk</th>
                <th>Submitted</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              {data.sessions.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ color: 'var(--muted)' }}>
                    No students have started this exam yet.
                  </td>
                </tr>
              ) : (
                data.sessions.map((s) => (
                  <tr key={s._id}>
                    <td>
                      <strong>{s.student?.name}</strong>
                    </td>
                    <td>{s.student?.email}</td>
                    <td>{s.student?.studentId || '—'}</td>
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
                      {s.reportReady
                        ? `${s.correctCount ?? 0}/${s.totalQuestions ?? '—'}`
                        : '—'}
                    </td>
                    <td>
                      {s.reportReady
                        ? `${s.scaledScore ?? '—'} / ${s.maxGradePoints ?? data.exam.maxGradePoints ?? 100}`
                        : '—'}
                    </td>
                    <td>{s.riskScore ?? 0}</td>
                    <td>
                      {s.submittedAt
                        ? new Date(s.submittedAt).toLocaleString()
                        : '—'}
                    </td>
                    <td>
                      {['submitted', 'expired'].includes(s.status) ? (
                        <Link to={`/admin/report/${s._id}`}>View report</Link>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>In progress</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
          {completed.length} of {data.sessions.length} session(s) completed
        </p>
      </div>
    </Layout>
  );
}
