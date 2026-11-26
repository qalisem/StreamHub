import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';

// Story 15, FR-1.5: set a new password from the emailed link
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) return setError('Passwords do not match');
    try { setMessage((await api('/auth/reset', { method: 'POST', body: { token, password: form.password } })).message); }
    catch (err) { setError(err.message); }
  };

  if (!token) return <main className="page narrow"><p className="error">This reset link is missing its token.</p><Link to="/forgot-password">Request a new link</Link></main>;
  return (
    <main className="page narrow">
      <h1>Choose a new password</h1>
      {message ? (
        <div className="card"><p className="success" role="status">{message}</p><Link className="btn" to="/login">Log in</Link></div>
      ) : (
        <form onSubmit={submit} className="card form">
          <label>New password<input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <label>Confirm new password<input type="password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></label>
          <p className="muted">At least 8 characters with a letter and a number.</p>
          {error && <p className="error" role="alert">{error} {error.includes('expired') && <Link to="/forgot-password">Request a new link</Link>}</p>}
          <button className="btn">Reset password</button>
        </form>
      )}
    </main>
  );
}
