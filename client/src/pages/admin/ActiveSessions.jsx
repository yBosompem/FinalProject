import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import Layout, { NavItem } from '../../components/Layout';

export default function ActiveSessions() {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    const load = () => api.getActiveSessions().then(setSessions).catch(console.error);
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <Layout
      nav={
        <>
          <NavItem to="/admin">Dashboard</NavItem>
          <NavItem to="/admin/active">Live sessions</NavItem>
        </>
      }
    >
      <div className="container">
        <h1 className="page-title">Ongoing exam sessions</h1>
        <p className="page-sub">Refreshes every 5 seconds</p>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Exam</th>
                <th>Started</th>
                <th>Risk</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: 'var(--muted)' }}>
                    No active sessions
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s._id}>
                    <td>
                      {s.student?.name}
                      <br />
                      <small style={{ color: 'var(--muted)' }}>{s.student?.email}</small>
                    </td>
                    <td>{s.exam?.title}</td>
                    <td>{new Date(s.startedAt).toLocaleString()}</td>
                    <td>
                      <span className={s.riskScore >= 60 ? 'badge badge-danger' : 'badge badge-success'}>
                        {s.riskScore ?? 0}
                      </span>
                    </td>
                    <td>
                      <Link to={`/admin/report/${s._id}`}>View report</Link>
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
