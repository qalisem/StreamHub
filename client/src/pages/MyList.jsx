import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function MyList() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/watchlist').then(setItems).catch((requestError) => setError(requestError.message));
  }, []);

  const remove = async (titleId) => {
    try {
      await api(`/watchlist/${titleId}`, { method: 'DELETE' });
      setItems((current) => current.filter((item) => item.titleId !== titleId));
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <main className="page">
      <h1>My List</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {!items.length ? <p className="empty">Your list is empty. Add titles you want to watch later.</p> : (
        <div className="grid">
          {items.map((item) => (
            <article className="tile-card" key={item.titleId}>
              <Link to={`/title/${item.titleId}`} className="tile">
                <span className="poster-wrap"><img src={item.posterUrl} alt={`${item.name} poster`} /></span>
                <div><strong>{item.name}</strong><span className="muted tier-label">{item.tier}</span></div>
              </Link>
              <button className="btn ghost small watchlist-toggle" onClick={() => remove(item.titleId)}>✓ In My List</button>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
