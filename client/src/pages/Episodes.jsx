import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

// Story 23, FR-2.3: seasons and episodes on a show's detail page.
// Subscribers pick a season and play an episode; staff can add and remove episodes.
const BLANK = { season: 1, episode: 1, name: '', runtime: 45, synopsis: '' };
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function Episodes({ titleId, user, staff, onNeedLogin }) {
  const [seasons, setSeasons] = useState([]);
  const [season, setSeason] = useState(1);
  const [progress, setProgress] = useState({});
  const [playing, setPlaying] = useState(null);
  const [position, setPosition] = useState(0);
  const positionRef = useRef(0);
  const [error, setError] = useState('');
  const [form, setForm] = useState(BLANK);
  const [formMsg, setFormMsg] = useState({ text: '', error: false });

  const load = () => api(`/titles/${titleId}/episodes`).then((d) => {
    setSeasons(d.seasons);
    if (d.seasons.length && !d.seasons.some((s) => s.season === season)) setSeason(d.seasons[0].season);
  });
  const loadProgress = () => {
    if (!user) return setProgress({});
    api(`/titles/${titleId}/episodes/progress`)
      .then((rows) => setProgress(Object.fromEntries(rows.map((r) => [r.episodeId, r]))))
      .catch(() => setProgress({}));
  };
  useEffect(() => { load(); }, [titleId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadProgress(); }, [titleId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (episode, seconds) => {
    try {
      const saved = await api(`/titles/${titleId}/episodes/${episode.id}/progress`, { method: 'POST', body: { positionSeconds: seconds } });
      setProgress((p) => ({ ...p, [episode.id]: saved }));
    } catch (err) { setPlaying(null); setError(err.message); }
  };

  // Simulated playback: move 10 seconds forward every 10 seconds and save
  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      positionRef.current += 10;
      setPosition(positionRef.current);
      save(playing, positionRef.current);
    }, 10000);
    return () => { window.clearInterval(timer); save(playing, positionRef.current); };
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = async (episode) => {
    if (!user) return onNeedLogin();
    setError('');
    try {
      await api(`/titles/${titleId}/play`, { method: 'POST' });
      const saved = progress[episode.id];
      const start = saved && !saved.completed ? saved.positionSeconds : 0;
      positionRef.current = start; setPosition(start);
      setPlaying(episode);
    } catch (err) { setError(err.message); }
  };

  const addEpisode = async (e) => {
    e.preventDefault();
    try {
      const created = await api(`/titles/${titleId}/episodes`, { method: 'POST', body: { ...form, season: Number(form.season), episode: Number(form.episode), runtime: Number(form.runtime) } });
      setFormMsg({ text: `Added S${created.season}:E${created.episode} ${created.name}.`, error: false });
      setForm({ ...BLANK, season: created.season, episode: created.episode + 1 });
      setSeason(created.season); load();
    } catch (err) { setFormMsg({ text: err.message, error: true }); }
  };

  const removeEpisode = async (episode) => {
    if (!window.confirm(`Remove S${episode.season}:E${episode.episode} ${episode.name}?`)) return;
    await api(`/titles/${titleId}/episodes/${episode.id}`, { method: 'DELETE' });
    load();
  };

  const current = seasons.find((s) => s.season === season);
  return (
    <section className="episodes" aria-label="Episodes">
      <h2>Episodes</h2>
      {seasons.length > 0 ? (
        <div className="season-tabs" role="tablist">
          {seasons.map((s) => (
            <button key={s.season} role="tab" aria-selected={s.season === season} className={s.season === season ? 'active' : ''} onClick={() => setSeason(s.season)}>Season {s.season}</button>
          ))}
        </div>
      ) : <p className="muted">No episodes yet.</p>}
      {error && <p className="gate-error" role="alert">{error} <Link to="/plans">See plans</Link></p>}
      {playing && (
        <section className="player" aria-label={`Now playing ${playing.name}`}>
          <strong>Now playing S{playing.season}:E{playing.episode} {playing.name}</strong>
          <p className="muted">Simulated playback · {clock(position)} of {playing.runtime}:00</p>
          <div className="progress"><span style={{ width: `${Math.min(100, (position * 100) / (playing.runtime * 60))}%` }} /></div>
          <button className="btn ghost small" onClick={() => setPlaying(null)}>Pause</button>
        </section>
      )}
      <ol className="episode-list">
        {current?.episodes.map((ep) => {
          const p = progress[ep.id];
          const percent = p ? Math.round((p.positionSeconds * 100) / p.durationSeconds) : 0;
          return (
            <li key={ep.id} className="card episode">
              <div className="episode-main">
                <strong>{ep.episode}. {ep.name}</strong>
                <span className="muted">{ep.runtime} min{p?.completed ? ' · Watched' : percent ? ` · ${percent}% watched` : ''}</span>
                {ep.synopsis && <p className="muted">{ep.synopsis}</p>}
                {percent > 0 && <div className="progress"><span style={{ width: `${percent}%` }} /></div>}
              </div>
              <div className="episode-actions">
                <button className="btn small" onClick={() => play(ep)} aria-label={`Play episode ${ep.episode}`}>▶ {p && !p.completed && p.positionSeconds > 0 ? 'Resume' : 'Play'}</button>
                {staff && <button className="link danger" onClick={() => removeEpisode(ep)}>Remove</button>}
              </div>
            </li>
          );
        })}
      </ol>
      {staff && (
        <form className="card form two-col episode-form" onSubmit={addEpisode}>
          <strong className="full">Add an episode</strong>
          <label>Season<input type="number" min="1" max="99" required value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })} /></label>
          <label>Episode<input type="number" min="1" max="99" required value={form.episode} onChange={(e) => setForm({ ...form, episode: e.target.value })} /></label>
          <label>Episode name<input required maxLength="120" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Runtime (min)<input type="number" min="1" max="300" value={form.runtime} onChange={(e) => setForm({ ...form, runtime: e.target.value })} /></label>
          <label className="full">Synopsis<textarea rows="2" value={form.synopsis} onChange={(e) => setForm({ ...form, synopsis: e.target.value })} /></label>
          <div className="full actions"><button className="btn">Add episode</button>{formMsg.text && <span className={formMsg.error ? 'error' : 'success'} role="status">{formMsg.text}</span>}</div>
        </form>
      )}
    </section>
  );
}
