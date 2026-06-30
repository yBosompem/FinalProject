import Layout, { NavItem } from '../components/Layout';
import { useAuth } from '../context/AuthContext';

function Detail({ label, value }) {
  return (
    <div className="card" style={{ background: 'var(--surface2)' }}>
      <span style={{ display: 'block', color: 'var(--muted)', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
        {label}
      </span>
      <strong>{value || 'Not provided'}</strong>
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const home = user?.role === 'admin' ? '/admin' : '/student';

  return (
    <Layout
      nav={
        <>
          <NavItem to={home}>Dashboard</NavItem>
          <NavItem to="/profile">Profile</NavItem>
        </>
      }
    >
      <div className="container" style={{ maxWidth: 900 }}>
        <h1 className="page-title">Profile</h1>
        <p className="page-sub">Your registration details.</p>

        <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Detail label="Full name" value={user?.name} />
          <Detail label="Email" value={user?.email} />
          <Detail label="Role" value={user?.role === 'admin' ? 'Lecturer / Instructor' : 'Student'} />
          {user?.role === 'student' && <Detail label="Index number" value={user?.studentId} />}
          {user?.role === 'student' && <Detail label="Reference number" value={user?.referenceNumber} />}
          <Detail label="College" value={user?.college} />
          <Detail label="Faculty / School" value={user?.faculty} />
          <Detail label="Department" value={user?.department} />
          <Detail label="Level" value={user?.level} />
        </div>
      </div>
    </Layout>
  );
}
