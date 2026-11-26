import { Fragment, useEffect, useState } from 'react';
import { api } from '../api';

// Story 15: admin view of every email the system has sent (the outbox)
export default function AdminEmails() {
  const [to, setTo] = useState('');
  const [emails, setEmails] = useState([]);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/admin/emails?to=${encodeURIComponent(to)}`).then(setEmails).catch((e) => setError(e.message));
  }, [to]);

  return (
    <main className="page">
      <h1>Email outbox</h1>
      <p className="muted">Welcome, renewal reminder, payment failed, cancellation, expiry, and password emails, newest first.</p>
      <input className="search" placeholder="Filter by recipient" value={to} onChange={(e) => setTo(e.target.value)} />
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead><tr><th>Sent</th><th>To</th><th>Type</th><th>Subject</th></tr></thead>
        <tbody>
          {emails.map((m) => (
            <Fragment key={m.id}>
              <tr className="clickable" onClick={() => setOpen(open === m.id ? null : m.id)}>
                <td>{new Date(m.createdAt).toLocaleString()}</td><td>{m.toEmail}</td><td><span className="tier">{m.template.replace('_', ' ')}</span></td><td>{m.subject}</td>
              </tr>
              {open === m.id && <tr><td colSpan="4"><pre className="email-body">{m.body}</pre></td></tr>}
            </Fragment>
          ))}
          {!emails.length && <tr><td colSpan="4" className="muted">No emails yet.</td></tr>}
        </tbody>
      </table>
    </main>
  );
}
