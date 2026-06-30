import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import { ACADEMIC_DATA, LEVELS, getDepartments, getFaculties } from '../utils/academicData';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning!';
  if (hour < 18) return 'Good afternoon!';
  return 'Good evening!';
};

const checkPasswordStrength = (password) => [
  { label: 'At least 6 characters', pass: password.length >= 6 },
  { label: 'Contains a number', pass: /\d/.test(password) },
  { label: 'Contains uppercase and lowercase', pass: /[A-Z]/.test(password) && /[a-z]/.test(password) },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'student',
    studentId: '',
    referenceNumber: '',
    college: '',
    faculty: '',
    department: '',
    level: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordRequirements, setPasswordRequirements] = useState(checkPasswordStrength(''));
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    setGreeting(getGreeting());
  }, []);

  useEffect(() => {
    setPasswordRequirements(checkPasswordStrength(form.password));
  }, [form.password]);

  const faculties = getFaculties(form.college);
  const departments = getDepartments(form.college, form.faculty);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await register(form);
      navigate(user.role === 'admin' ? '/admin' : '/student');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 420, paddingTop: '3rem' }}>
      <div className="glass-card" style={{ padding: '2rem', animation: 'fadeInUp 0.6s ease-out' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h1 className="page-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>
            {greeting}
          </h1>
          <ThemeToggle />
        </div>
        <p className="page-sub">Create your account</p>
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="label">Full name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>

          <div className="form-group" style={{ position: 'relative' }}>
            <label className="label">Password</label>
            <input
              className="input"
              type={showPassword ? 'text' : 'password'}
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '1rem',
                top: '2.35rem',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 700,
              }}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
            <div style={{ marginTop: '0.75rem' }}>
              {passwordRequirements.map((req) => (
                <div
                  key={req.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8rem',
                    marginBottom: '0.35rem',
                    color: req.pass ? 'var(--success)' : 'var(--muted)',
                  }}
                >
                  <span>{req.pass ? 'OK' : '--'}</span>
                  <span>{req.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="label">Role</label>
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="student">Student</option>
              <option value="admin">Instructor (Admin)</option>
            </select>
          </div>

          {form.role === 'student' && (
            <>
              <div className="form-group">
                <label className="label">Index number</label>
                <input
                  className="input"
                  maxLength={7}
                  value={form.studentId}
                  onChange={(e) => setForm({ ...form, studentId: e.target.value.toUpperCase().slice(0, 7) })}
                  required
                />
                <p style={{ marginTop: '0.35rem', color: 'var(--muted)', fontSize: '0.8rem' }}>
                  Required and unique. Maximum 7 characters.
                </p>
              </div>

              <div className="form-group">
                <label className="label">Reference number</label>
                <input
                  className="input"
                  inputMode="numeric"
                  maxLength={8}
                  pattern="\d{8}"
                  value={form.referenceNumber}
                  onChange={(e) =>
                    setForm({ ...form, referenceNumber: e.target.value.replace(/\D/g, '').slice(0, 8) })
                  }
                  required
                />
                <p style={{ marginTop: '0.35rem', color: 'var(--muted)', fontSize: '0.8rem' }}>
                  Required and unique. Must be exactly 8 digits.
                </p>
              </div>

              <div className="form-group">
                <label className="label">Level</label>
                <select
                  className="input"
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value })}
                  required
                >
                  <option value="">Select level</option>
                  {LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="label">College</label>
                <select
                  className="input"
                  value={form.college}
                  onChange={(e) => setForm({ ...form, college: e.target.value, faculty: '', department: '' })}
                  required
                >
                  <option value="">Select college</option>
                  {ACADEMIC_DATA.map((item) => (
                    <option key={item.college} value={item.college}>
                      {item.college}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="label">Faculty / School</label>
                <select
                  className="input"
                  value={form.faculty}
                  onChange={(e) => setForm({ ...form, faculty: e.target.value, department: '' })}
                  required
                  disabled={!form.college}
                >
                  <option value="">Select faculty or school</option>
                  {faculties.map((faculty) => (
                    <option key={faculty.name} value={faculty.name}>
                      {faculty.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="label">Department</label>
                <select
                  className="input"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  required
                  disabled={!form.faculty}
                >
                  <option value="">Select department</option>
                  {departments.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Creating...' : 'Register'}
          </button>
        </form>

        <p style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
