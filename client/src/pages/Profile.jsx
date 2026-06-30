import Layout, { NavItem } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';

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
  const { user, updateReferenceNumber } = useAuth();
  const home = user?.role === 'admin' ? '/admin' : '/student';
  const [referenceNumber, setReferenceNumber] = useState(user?.referenceNumber || '');
  const [savingReference, setSavingReference] = useState(false);
  const [referenceMsg, setReferenceMsg] = useState('');
  const [referenceError, setReferenceError] = useState('');

  useEffect(() => {
    setReferenceNumber(user?.referenceNumber || '');
  }, [user?.referenceNumber]);

  const saveReferenceNumber = async (e) => {
    e.preventDefault();
    setReferenceMsg('');
    setReferenceError('');
    if (!/^\d{8}$/.test(referenceNumber)) {
      setReferenceError('Reference number must be exactly 8 digits.');
      return;
    }
    setSavingReference(true);
    try {
      await updateReferenceNumber(referenceNumber);
      setReferenceMsg('Reference number saved. It will now show on result sheets.');
    } catch (err) {
      setReferenceError(err.message);
    } finally {
      setSavingReference(false);
    }
  };

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

        {user?.role === 'student' && (
          <form className="card" style={{ marginTop: '1.25rem' }} onSubmit={saveReferenceNumber}>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Reference number</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              This must be unique and exactly 8 digits. It appears on lecturer result sheets.
            </p>
            {referenceError && <div className="alert alert-error">{referenceError}</div>}
            {referenceMsg && <div className="alert alert-success">{referenceMsg}</div>}
            <div className="form-group">
              <label className="label">Reference number</label>
              <input
                className="input"
                inputMode="numeric"
                maxLength={8}
                pattern="\d{8}"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value.replace(/\D/g, '').slice(0, 8))}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={savingReference}>
              {savingReference ? 'Saving...' : 'Save reference number'}
            </button>
          </form>
        )}
      </div>
    </Layout>
  );
}
