import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) return setReady(true);
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setReady(true));
  }, []);

  const save = ({ token, user }) => { localStorage.setItem('token', token); setUser(user); };
  const login = async (email, password) => save(await api('/auth/login', { method: 'POST', body: { email, password } }));
  const register = async (form) => save(await api('/auth/register', { method: 'POST', body: form }));
  const logout = () => { localStorage.removeItem('token'); setUser(null); };

  return <AuthContext.Provider value={{ user, ready, login, register, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export const isStaff = (u) => u && ['admin', 'content_manager'].includes(u.role);
