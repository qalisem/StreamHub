import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const EMPTY = { q: '', genre: '', type: '', yearFrom: '', yearTo: '', minRating: '', sort: 'newest' };

export default function Catalog() {
  const [filters, setFilters] = useState(EMPTY);
  const [query, setQuery] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [genres, setGenres] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => { api('/titles/genres').then(setGenres).catch(() => {}); }, []);

  useEffect(() => {
    const params = new URLSearchParams({ page });
    Object.entries(query).forEach(([k, v]) => v && params.set(k, v));
    api(`/titles?${params}`).then(setData).catch((e) => setError(e.message));
  }, [query, page]);

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const apply = (e) => { e.preventDefault(); setPage(1); setQuery(filters); };
  const reset = () => { setFilters(EMPTY); setQuery(EMPTY); setPage(1); };

  return (
    <main className="page">
      <form className="filters card" onSubmit={apply}>
        <input placeholder="Search titles or cast" value={filters.q} onChange={set('q')} aria-label="Search" />
        <select value={filters.genre} onChange={set('genre')} aria-label="Genre">
          <option value="">All genres</option>{genres.map((g) => <option key={g}>{g}</option>)}
        </select>
        <select value={filters.type} onChange={set('type')} aria-label="Type">
          <option value="">Movies and shows</option><option value="movie">Movies</option><option value="show">Shows</option>
        </select>
        <input type="number" placeholder="From year" value={filters.yearFrom} onChange={set('yearFrom')} aria-label="From year" />
        <input type="number" placeholder="To year" value={filters.yearTo} onChange={set('yearTo')} aria-label="To year" />
        <select value={filters.minRating} onChange={set('minRating')} aria-label="Minimum rating">
          <option value="">Any rating</option>{[6, 7, 8, 9].map((r) => <option key={r} value={r}>{r}+</option>)}
        </select>
        <select value={filters.sort} onChange={set('sort')} aria-label="Sort">
          <option value="newest">Newest</option><option value="rating">Top rated</option><option value="az">A to Z</option>
        </select>
        <button className="btn">Apply</button>
        <button type="button" className="link" onClick={reset}>Clear</button>
      </form>

      {error && <p className="error">{error}</p>}
      {data && (data.items.length === 0
        ? <p className="empty">No titles match your search. Try different filters.</p>
        : <>
            <p className="muted">{data.total} titles</p>
            <div className="grid">
              {data.items.map((t) => (
                <Link key={t.id} to={`/title/${t.id}`} className="tile">
                  <img src={t.poster_url} alt={`${t.name} poster`} loading="lazy" />
                  <div><strong>{t.name}</strong><span className="muted">{t.year} · {t.genre} · ★ {t.rating}</span></div>
                </Link>
              ))}
            </div>
            <div className="pager">
              <button className="btn small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {data.page} of {data.totalPages}</span>
              <button className="btn small" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </>)}
    </main>
  );
}
