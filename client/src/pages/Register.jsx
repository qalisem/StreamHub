import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(form.password)) return setError('Password needs 8+ characters with a letter and a number');
    setError(''); setBusy(true);
    try { await register(form); nav('/'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <main className="page narrow">
      <h1>Create your account</h1>
      <form onSubmit={submit} className="card form">
        <label>Display name<input required value={form.displayName} onChange={set('displayName')} /></label>
        <label>Email<input type="email" required value={form.email} onChange={set('email')} /></label>
        <label>Password<input type="password" required value={form.password} onChange={set('password')} />
          <small className="muted">At least 8 characters, with a letter and a number</small></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Creating...' : 'Sign up'}</button>
        <p className="muted">Already have an account? <Link to="/login">Log in</Link></p>
      </form>
    </main>
  );
}
