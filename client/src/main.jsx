import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth, isStaff } from './auth';
import Login from './pages/Login';
import Register from './pages/Register';
import Catalog from './pages/Catalog';
import TitleDetail from './pages/TitleDetail';
import Admin from './pages/Admin';
import Plans from './pages/Plans';
import Account from './pages/Account';
import './styles.css';

function Nav() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <header className="nav">
      <Link to="/" className="brand">StreamHub</Link>
      <nav>
        <Link to="/">Browse</Link>
        <Link to="/plans">Plans</Link>
        {isStaff(user) && <Link to="/admin">Manage titles</Link>}
        {user ? (
          <>
            <Link to="/account">Account</Link>
            <span className="muted">Hi, {user.displayName}</span>
            <button className="link" onClick={() => { logout(); nav('/login'); }}>Log out</button>
          </>
        ) : (
          <>
            <Link to="/login">Log in</Link>
            <Link to="/register" className="btn small">Sign up</Link>
          </>
        )}
      </nav>
    </header>
  );
}

function StaffOnly({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" />;
  return isStaff(user) ? children : <p className="page">You do not have access to this page.</p>;
}

function LoggedInOnly({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? children : <Navigate to="/login" />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Nav />
        <Routes>
          <Route path="/" element={<Catalog />} />
          <Route path="/title/:id" element={<TitleDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/account" element={<LoggedInOnly><Account /></LoggedInOnly>} />
          <Route path="/admin" element={<StaffOnly><Admin /></StaffOnly>} />
          <Route path="*" element={<p className="page">Page not found.</p>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
