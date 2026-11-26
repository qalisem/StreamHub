import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

// Story 15, FR-1.5: request a password reset email
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setMessage(''); setBusy(true);
    try { setMessage((await api('/auth/forgot', { method: 'POST', body: { email } })).message); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <main className="page narrow">
      <h1>Forgot password</h1>
      <form onSubmit={submit} className="card form">
        <p className="muted">Enter your account email and we will send you a link to reset your password. The link works once and expires in 30 minutes.</p>
        <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Sending...' : 'Send reset link'}</button>
        <p className="muted"><Link to="/login">Back to log in</Link></p>
      </form>
    </main>
  );
}
