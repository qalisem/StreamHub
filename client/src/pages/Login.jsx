import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try { await login(form.email, form.password); nav('/'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <main className="page narrow">
      <h1>Log in</h1>
      <form onSubmit={submit} className="card form">
        <label>Email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Password<input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Logging in...' : 'Log in'}</button>
        <p className="muted">No account? <Link to="/register">Sign up</Link></p>
      </form>
    </main>
  );
}
