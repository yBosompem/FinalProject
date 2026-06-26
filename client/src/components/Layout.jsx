import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';

export default function Layout({ children, nav }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <header className="nav">
        <Link to="/" className="nav-brand">
          Secure Exam Monitor
        </Link>
        <nav className="nav-links">
          {nav}
          <Link
            to="/profile"
            style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}
            title="View profile"
          >
            {user?.name}
          </Link>
          <ThemeToggle />
          <button type="button" className="btn btn-ghost" onClick={handleLogout}>
            Logout
          </button>
        </nav>
      </header>
      <main>{children}</main>
    </>
  );
}

export function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => (isActive ? 'active' : undefined)}
      style={{ textDecoration: 'none' }}
    >
      {children}
    </NavLink>
  );
}
