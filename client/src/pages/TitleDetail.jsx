import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

export default function TitleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [t, setT] = useState(null);
  const [error, setError] = useState('');
  const [playError, setPlayError] = useState('');
  const [playing, setPlaying] = useState(false);

  useEffect(() => { api(`/titles/${id}`).then(setT).catch((e) => setError(e.message)); }, [id]);

  const play = async () => {
    if (!user) return navigate('/login');
    setPlayError('');
    try {
      await api(`/titles/${id}/play`, { method: 'POST' });
      setPlaying(true);
    } catch (requestError) {
      setPlaying(false);
      setPlayError(requestError.message);
    }
  };

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
          <button className="btn" onClick={play}>▶ Play</button>
          <button className="btn ghost" onClick={() => alert('Watchlist is planned for Sprint 3.')}>+ Watchlist</button>
        </div>
        {playError && <p className="gate-error" role="alert">{playError} <Link to="/plans">See plans</Link></p>}
        {playing && (
          <section className="player" aria-label={`Now playing ${t.name}`}>
            <strong>Now playing {t.name}</strong>
            <p className="muted">Simulated playback</p>
            <div className="progress"><span /></div>
          </section>
        )}
        {t.trailer_url
          ? <iframe title="Trailer" src={t.trailer_url} allowFullScreen />
          : <p className="muted">Trailer not available.</p>}
      </div>
    </main>
  );
}
