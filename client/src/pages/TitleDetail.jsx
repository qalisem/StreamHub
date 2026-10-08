import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';

export default function TitleDetail() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api(`/titles/${id}`).then(setT).catch((e) => setError(e.message)); }, [id]);

  if (error) return <main className="page"><p className="error">{error}</p><Link to="/">Back to browse</Link></main>;
  if (!t) return <main className="page"><p className="muted">Loading...</p></main>;

  return (
    <main className="page detail">
      <img src={t.poster_url} alt={`${t.name} poster`} />
      <div>
        <Link to="/" className="muted">← Back to browse</Link>
        <h1>{t.name}</h1>
        <p className="meta">{t.year} · {t.type === 'movie' ? `${t.runtime} min` : 'Series'} · {t.genre} · ★ {t.rating}/10 · <span className="tier">{t.tier}</span></p>
        <p>{t.synopsis}</p>
        <p><strong>Cast:</strong> {t.cast_list}</p>
        <div className="actions">
          <button className="btn" onClick={() => alert('Playback is available once subscriptions launch in Sprint 2.')}>▶ Play</button>
          <button className="btn ghost" onClick={() => alert('Watchlist is planned for Sprint 3.')}>+ Watchlist</button>
        </div>
        {t.trailer_url
          ? <iframe title="Trailer" src={t.trailer_url} allowFullScreen />
          : <p className="muted">Trailer not available.</p>}
      </div>
    </main>
  );
}
