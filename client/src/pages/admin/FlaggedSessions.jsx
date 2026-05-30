import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import Layout, { NavItem } from '../../components/Layout';

export default function FlaggedSessions() {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    api.getFlagged().then(setSessions).catch(console.error);
  }, []);

  return (
    <Layout
      nav={
        <>
          <NavItem to="/admin">Dashboard</NavItem>
          <NavItem to="/admin/flagged">Flagged</NavItem>
        </>
      }
    >
      <div className="container">
        <h1 className="page-title">Flagged exam sessions</h1>
        <p className="page-sub">Sessions with elevated risk scores from AI monitoring</p>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Exam</th>
                <th>Status</th>
                <th>Risk score</th>
                <th>Alerts</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--muted)' }}>
                    No flagged sessions
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s._id}>
                    <td>{s.student?.name}</td>
                    <td>{s.exam?.title}</td>
                    <td>{s.status}</td>
                    <td>
                      <span className="badge badge-danger">{s.riskScore}</span>
                    </td>
                    <td>{s.alertCount ?? 0}</td>
                    <td>
                      <Link to={`/admin/report/${s._id}`}>Full report</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
