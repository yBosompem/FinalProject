import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import StudentDashboard from './pages/student/StudentDashboard';
import ExamPage from './pages/student/ExamPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import CreateExam from './pages/admin/CreateExam';
import ActiveSessions from './pages/admin/ActiveSessions';
import FlaggedSessions from './pages/admin/FlaggedSessions';
import SessionReport from './pages/admin/SessionReport';
import ExamStudents from './pages/admin/ExamStudents';
import { useAuth } from './context/AuthContext';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        path="/student"
        element={
          <ProtectedRoute role="student">
            <StudentDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/exam/:examId"
        element={
          <ProtectedRoute role="student">
            <ExamPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute role="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/create-exam"
        element={
          <ProtectedRoute role="admin">
            <CreateExam />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/active"
        element={
          <ProtectedRoute role="admin">
            <ActiveSessions />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/flagged"
        element={
          <ProtectedRoute role="admin">
            <FlaggedSessions />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/report/:sessionId"
        element={
          <ProtectedRoute role="admin">
            <SessionReport />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/exam/:examId/students"
        element={
          <ProtectedRoute role="admin">
            <ExamStudents />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
