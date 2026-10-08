import { useEffect, useState } from 'react';
import { api } from '../api';

const BLANK = { name: '', type: 'movie', genre: '', year: new Date().getFullYear(), rating: '', runtime: '', synopsis: '', cast_list: '', poster_url: '', trailer_url: '', tier: 'basic' };

export default function Admin() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(BLANK);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState({ text: '', error: false });

  const load = () => api(`/titles?sort=az&q=${encodeURIComponent(q)}`).then((d) => setItems(d.items));
  useEffect(() => { load(); }, [q]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const clean = (f) => ({ ...f, year: Number(f.year), rating: f.rating === '' ? 0 : Number(f.rating), runtime: f.runtime === '' ? null : Number(f.runtime) });

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editing) await api(`/titles/${editing}`, { method: 'PUT', body: clean(form) });
      else await api('/titles', { method: 'POST', body: clean(form) });
      setMsg({ text: editing ? 'Title updated.' : 'Title added.', error: false });
      setForm(BLANK); setEditing(null); load();
    } catch (err) { setMsg({ text: err.message, error: true }); }
  };

  const edit = async (id) => {
    const t = await api(`/titles/${id}`);
    setForm(Object.fromEntries(Object.keys(BLANK).map((k) => [k, t[k] ?? ''])));
    setEditing(id); setMsg({ text: '', error: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (t) => {
    if (!confirm(`Remove "${t.name}" from the catalog?`)) return;
    await api(`/titles/${t.id}`, { method: 'DELETE' });
    setMsg({ text: 'Title removed.', error: false }); load();
  };

  return (
    <main className="page">
      <h1>Manage titles</h1>
      <form onSubmit={save} className="card form two-col">
        <label>Title *<input required value={form.name} onChange={set('name')} /></label>
        <label>Type *<select value={form.type} onChange={set('type')}><option value="movie">Movie</option><option value="show">Show</option></select></label>
        <label>Genre *<input required value={form.genre} onChange={set('genre')} /></label>
        <label>Year *<input type="number" required value={form.year} onChange={set('year')} /></label>
        <label>Rating (0-10)<input type="number" step="0.1" min="0" max="10" value={form.rating} onChange={set('rating')} /></label>
        <label>Runtime (min)<input type="number" value={form.runtime} onChange={set('runtime')} /></label>
        <label>Plan tier<select value={form.tier} onChange={set('tier')}><option>basic</option><option>standard</option><option>premium</option></select></label>
        <label>Cast<input value={form.cast_list} onChange={set('cast_list')} placeholder="Comma separated" /></label>
        <label>Poster URL<input value={form.poster_url} onChange={set('poster_url')} /></label>
        <label>Trailer URL<input value={form.trailer_url} onChange={set('trailer_url')} /></label>
        <label className="full">Synopsis<textarea rows="3" value={form.synopsis} onChange={set('synopsis')} /></label>
        <div className="full actions">
          <button className="btn">{editing ? 'Save changes' : 'Add title'}</button>
          {editing && <button type="button" className="link" onClick={() => { setEditing(null); setForm(BLANK); }}>Cancel</button>}
          {msg.text && <span className={msg.error ? 'error' : 'success'} role="status">{msg.text}</span>}
        </div>
      </form>

      <input className="search" placeholder="Search titles" value={q} onChange={(e) => setQ(e.target.value)} />
      <table className="table">
        <thead><tr><th>Title</th><th>Type</th><th>Genre</th><th>Year</th><th>Tier</th><th></th></tr></thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td><td>{t.type}</td><td>{t.genre}</td><td>{t.year}</td><td>{t.tier}</td>
              <td className="row-actions"><button className="link" onClick={() => edit(t.id)}>Edit</button><button className="link danger" onClick={() => remove(t)}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
