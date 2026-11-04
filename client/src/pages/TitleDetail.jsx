import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { isStaff, useAuth } from '../auth';

export default function TitleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [t, setT] = useState(null);
  const [error, setError] = useState('');
  const [playError, setPlayError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [positionSeconds, setPositionSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const positionRef = useRef(0);
  const [reviews, setReviews] = useState({ average: null, count: 0, reviews: [] });
  const [reviewForm, setReviewForm] = useState({ rating: 5, body: '' });
  const [reviewError, setReviewError] = useState('');

  useEffect(() => { api(`/titles/${id}`).then(setT).catch((e) => setError(e.message)); }, [id]);
  const loadReviews = () => api(`/titles/${id}/reviews`).then((data) => {
    setReviews(data);
    const own = data.reviews.find((review) => review.userId === user?.id);
    if (own) setReviewForm({ rating: own.rating, body: own.body });
  }).catch((e) => setReviewError(e.message));
  useEffect(() => { loadReviews(); }, [id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user) return setInWatchlist(false);
    api('/watchlist')
      .then((items) => setInWatchlist(items.some((item) => item.titleId === Number(id))))
      .catch(() => setInWatchlist(false));
  }, [id, user]);
  useEffect(() => {
    if (!user) {
      setPositionSeconds(0);
      positionRef.current = 0;
      return;
    }
    api('/history')
      .then((items) => {
        const saved = items.find((item) => item.titleId === Number(id));
        const position = saved?.positionSeconds || 0;
        setPositionSeconds(position);
        setDurationSeconds(saved?.durationSeconds || 0);
        positionRef.current = position;
      })
      .catch(() => {});
  }, [id, user]);

  const saveProgress = async (position = positionRef.current) => {
    if (!user || !t) return;
    try {
      const saved = await api(`/titles/${id}/progress`, { method: 'POST', body: { positionSeconds: position } });
      setPositionSeconds(saved.positionSeconds);
      setDurationSeconds(saved.durationSeconds);
      positionRef.current = saved.positionSeconds;
    } catch (requestError) {
      setPlaying(false);
      setPlayError(requestError.message);
    }
  };

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      const nextPosition = positionRef.current + 10;
      positionRef.current = nextPosition;
      setPositionSeconds(nextPosition);
      saveProgress(nextPosition);
    }, 10000);
    return () => {
      window.clearInterval(timer);
      saveProgress(positionRef.current);
    };
  }, [playing, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleWatchlist = async () => {
    if (!user) return navigate('/login');
    try {
      if (inWatchlist) await api(`/watchlist/${id}`, { method: 'DELETE' });
      else await api('/watchlist', { method: 'POST', body: { titleId: Number(id) } });
      setInWatchlist((current) => !current);
    } catch (requestError) {
      setPlayError(requestError.message);
    }
  };

  const play = async () => {
    if (!user) return navigate('/login');
    setPlayError('');
    try {
      await api(`/titles/${id}/play`, { method: 'POST' });
      if (!durationSeconds) setDurationSeconds(Number(t.runtime || 0) * 60);
      setPlaying(true);
    } catch (requestError) {
      setPlaying(false);
      setPlayError(requestError.message);
    }
  };

  const saveReview = async (event) => {
    event.preventDefault();
    setReviewError('');
    try {
      await api(`/titles/${id}/review`, { method: 'PUT', body: reviewForm });
      await loadReviews();
    } catch (requestError) { setReviewError(requestError.message); }
  };

  const deleteReview = async (reviewId, own = false) => {
    try {
      await api(own ? `/titles/${id}/review` : `/reviews/${reviewId}`, { method: 'DELETE' });
      if (own) setReviewForm({ rating: 5, body: '' });
      await loadReviews();
    } catch (requestError) { setReviewError(requestError.message); }
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
          <button className="btn ghost" onClick={toggleWatchlist}>{inWatchlist ? '✓ In My List' : '+ My List'}</button>
        </div>
        {playError && <p className="gate-error" role="alert">{playError} <Link to="/plans">See plans</Link></p>}
        {playing && (
          <section className="player" aria-label={`Now playing ${t.name}`}>
            <strong>Now playing {t.name}</strong>
            <p className="muted">Simulated playback · resumed at {Math.floor(positionSeconds / 60)}:{String(positionSeconds % 60).padStart(2, '0')}</p>
            <div className="progress"><span style={{ width: `${durationSeconds ? Math.min(100, positionSeconds * 100 / durationSeconds) : 0}%` }} /></div>
            <button className="btn ghost small" onClick={() => setPlaying(false)}>Pause</button>
          </section>
        )}
        {t.trailer_url
          ? <iframe title="Trailer" src={t.trailer_url} allowFullScreen />
          : <p className="muted">Trailer not available.</p>}
        <section className="reviews-section">
          <h2>Ratings and reviews</h2>
          <p className="review-average">{reviews.average == null ? 'No ratings yet' : `${reviews.average} ★ from ${reviews.count} ${reviews.count === 1 ? 'review' : 'reviews'}`}</p>
          {user ? (
            <form className="card form review-form" onSubmit={saveReview}>
              <label>Your rating
                <span className="star-picker">{[1, 2, 3, 4, 5].map((star) => <button type="button" className={star <= reviewForm.rating ? 'selected' : ''} onClick={() => setReviewForm({ ...reviewForm, rating: star })} key={star} aria-label={`${star} stars`}>★</button>)}</span>
              </label>
              <label>Review<textarea rows="4" maxLength="1000" value={reviewForm.body} onChange={(event) => setReviewForm({ ...reviewForm, body: event.target.value })} /></label>
              <div className="actions"><button className="btn">Save review</button>{reviews.reviews.some((review) => review.userId === user.id) && <button type="button" className="link danger" onClick={() => deleteReview(null, true)}>Delete my review</button>}</div>
            </form>
          ) : <p><Link to="/login">Log in</Link> to leave a rating.</p>}
          {reviewError && <p className="error" role="alert">{reviewError}</p>}
          <div className="review-list">{reviews.reviews.map((review) => (
            <article className="card" key={review.id}>
              <div className="review-heading"><strong>{review.displayName}</strong><span>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></div>
              {review.body && <p>{review.body}</p>}
              <span className="muted">{new Date(review.updatedAt).toLocaleDateString()}</span>
              {isStaff(user) && <button className="link danger" onClick={() => deleteReview(review.id)}>Remove</button>}
            </article>
          ))}</div>
        </section>
      </div>
    </main>
  );
}
