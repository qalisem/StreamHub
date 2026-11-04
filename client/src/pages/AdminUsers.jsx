import { useEffect, useState } from 'react';
import { api } from '../api';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadUsers = () => api(`/admin/users?q=${encodeURIComponent(query)}`).then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { loadUsers(); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api('/plans').then(setPlans).catch((e) => setError(e.message)); }, []);

  const updateUser = async (id, body) => {
    setError(''); setMessage('');
    try {
      await api(`/admin/users/${id}`, { method: 'PATCH', body });
      setMessage('User updated.');
      loadUsers();
    } catch (requestError) { setError(requestError.message); }
  };

  const extend = async (user) => {
    const days = Number(window.prompt(`How many days should ${user.email}'s subscription be extended?`, '7'));
    if (!days) return;
    try {
      await api(`/admin/users/${user.id}/subscription/extend`, { method: 'POST', body: { days } });
      setMessage(`Extended ${user.email}'s subscription by ${days} days.`); setError(''); loadUsers();
    } catch (requestError) { setError(requestError.message); }
  };

  const cancel = async (user) => {
    if (!window.confirm(`Cancel ${user.email}'s subscription at period end?`)) return;
    try {
      await api(`/admin/users/${user.id}/subscription/cancel`, { method: 'POST' });
      setMessage(`Cancelled ${user.email}'s subscription.`); setError(''); loadUsers();
    } catch (requestError) { setError(requestError.message); }
  };

  const savePrice = async (plan, price) => {
    try {
      const updated = await api(`/admin/plans/${plan.code}`, { method: 'PUT', body: { priceCents: Number(price) } });
      setPlans((current) => current.map((item) => item.code === plan.code ? updated : item));
      setMessage(`${plan.name} price updated.`); setError('');
    } catch (requestError) { setError(requestError.message); }
  };

  return (
    <main className="page admin-users">
      <h1>Manage users and plans</h1>
      {message && <p className="success" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <section className="card">
        <h2>Plan prices</h2>
        <div className="price-editors">
          {plans.map((plan) => <PriceEditor plan={plan} key={plan.code} onSave={savePrice} />)}
        </div>
      </section>
      <input className="search" placeholder="Search email or display name" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>User</th><th>Role</th><th>Active</th><th>Subscription</th><th>Actions</th></tr></thead>
          <tbody>{users.map((user) => (
            <tr key={user.id}>
              <td><strong>{user.displayName}</strong><br /><span className="muted">{user.email}</span></td>
              <td><select value={user.role} onChange={(event) => updateUser(user.id, { role: event.target.value })}><option value="subscriber">Subscriber</option><option value="content_manager">Content manager</option><option value="admin">Admin</option></select></td>
              <td><label className="active-toggle"><input type="checkbox" checked={user.active} onChange={(event) => updateUser(user.id, { active: event.target.checked })} /> {user.active ? 'Active' : 'Deactivated'}</label></td>
              <td>{user.subscription ? <>{user.subscription.plan} · {user.subscription.status}<br /><span className="muted">to {new Date(user.subscription.periodEnd).toLocaleDateString()}</span></> : <span className="muted">No plan</span>}</td>
              <td className="row-actions"><button className="link" disabled={!user.subscription} onClick={() => extend(user)}>Extend</button><button className="link danger" disabled={!user.subscription} onClick={() => cancel(user)}>Cancel</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </main>
  );
}

function PriceEditor({ plan, onSave }) {
  const [price, setPrice] = useState(plan.price_cents);
  useEffect(() => setPrice(plan.price_cents), [plan.price_cents]);
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSave(plan, price); }}>
      <label>{plan.name}<input type="number" min="1" step="1" value={price} onChange={(event) => setPrice(event.target.value)} aria-label={`${plan.name} price in cents`} /></label>
      <button className="btn small">Save</button>
    </form>
  );
}
