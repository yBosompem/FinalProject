import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(({ user: u }) => setUser(u))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { user: u, token } = await api.login({ email, password });
    localStorage.setItem('token', token);
    setUser(u);
    return u;
  };

  const register = async (data) => {
    const { user: u, token } = await api.register(data);
    localStorage.setItem('token', token);
    setUser(u);
    return u;
  };

  const updateReferenceNumber = async (referenceNumber) => {
    const { user: u } = await api.updateReferenceNumber(referenceNumber);
    setUser(u);
    return u;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, updateReferenceNumber, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
