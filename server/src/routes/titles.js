const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { refreshSubscription } = require('../billing');

const FIELDS = ['name', 'type', 'genre', 'year', 'rating', 'runtime', 'synopsis', 'cast_list', 'poster_url', 'trailer_url', 'tier'];
const SORTS = { newest: 'year DESC, id DESC', rating: 'rating DESC, name ASC', az: 'name COLLATE NOCASE ASC' };
const PAGE_SIZE = 20; // FR-2.4
const TIER_RANKS = { basic: 1, standard: 2, premium: 3 };

function validate(body, partial = false) {
  const errors = [];
  const need = (f) => !partial || body[f] !== undefined;
  if (need('name') && !String(body.name || '').trim()) errors.push('name is required');
  if (need('type') && !['movie', 'show'].includes(body.type)) errors.push('type must be movie or show');
  if (need('genre') && !String(body.genre || '').trim()) errors.push('genre is required');
  if (need('year')) {
    const y = Number(body.year);
    if (!Number.isInteger(y) || y < 1888 || y > new Date().getFullYear() + 2) errors.push('year is invalid');
  }
  if (body.rating !== undefined && (isNaN(body.rating) || body.rating < 0 || body.rating > 10)) errors.push('rating must be 0 to 10');
  if (body.tier !== undefined && !['basic', 'standard', 'premium'].includes(body.tier)) errors.push('tier is invalid');
  return errors;
}

module.exports = (db, { now = () => new Date() } = {}) => {
  const r = express.Router();
  const canEdit = [requireAuth, requireRole('admin', 'content_manager')];
  const findTitle = db.prepare('SELECT * FROM titles WHERE id = ? AND deleted = 0');

  const access = (user, titleId) => {
    const title = findTitle.get(titleId);
    if (!title) return { status: 404, body: { error: 'Title not found' } };
    if (['admin', 'content_manager'].includes(user.role)) return { title };

    const subscription = refreshSubscription(db, user.id, now);
    if (!subscription || subscription.status === 'past_due') {
      return { status: 402, body: { error: 'Choose a plan to watch this title', requiredTier: title.tier } };
    }
    if (subscription.rank < TIER_RANKS[title.tier]) {
      return {
        status: 403,
        body: {
          error: `${title.tier[0].toUpperCase()}${title.tier.slice(1)} plan required`,
          requiredTier: title.tier,
          currentPlan: subscription.plan_code,
        },
      };
    }
    return { title, subscription };
  };

  // FR-2.4, 2.5, 2.6: browse, search, filter, sort, paginate
  r.get('/', (req, res) => {
    const where = ['deleted = 0'];
    const params = {};
    if (req.query.q) { where.push('(name LIKE @q OR cast_list LIKE @q)'); params.q = `%${req.query.q}%`; }
    if (req.query.genre) {
      const genres = String(req.query.genre).split(',').filter(Boolean);
      where.push(`genre IN (${genres.map((_, i) => `@g${i}`).join(',')})`);
      genres.forEach((g, i) => (params[`g${i}`] = g));
    }
    if (req.query.type) { where.push('type = @type'); params.type = req.query.type; }
    if (req.query.yearFrom) { where.push('year >= @yf'); params.yf = Number(req.query.yearFrom); }
    if (req.query.yearTo) { where.push('year <= @yt'); params.yt = Number(req.query.yearTo); }
    if (req.query.minRating) { where.push('rating >= @mr'); params.mr = Number(req.query.minRating); }

    const order = SORTS[req.query.sort] || SORTS.newest;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const clause = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS n FROM titles WHERE ${clause}`).get(params).n;
    const items = db.prepare(
      `SELECT id, name, type, genre, year, rating, poster_url, tier,
        (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE title_id = titles.id) AS review_average,
        (SELECT COUNT(*) FROM reviews WHERE title_id = titles.id) AS review_count
       FROM titles WHERE ${clause} ORDER BY ${order} LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`
    ).all(params);
    res.json({ items, page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
  });

  r.get('/genres', (_req, res) => {
    res.json(db.prepare('SELECT DISTINCT genre FROM titles WHERE deleted = 0 ORDER BY genre').all().map((g) => g.genre));
  });

  r.post('/:id/play', requireAuth, (req, res) => {
    const result = access(req.user, req.params.id);
    if (result.status) return res.status(result.status).json(result.body);
    res.json({ ok: true, title: result.title });
  });

  r.post('/:id/progress', requireAuth, (req, res) => {
    const result = access(req.user, req.params.id);
    if (result.status) return res.status(result.status).json(result.body);

    const requestedPosition = Number(req.body.positionSeconds);
    if (!Number.isFinite(requestedPosition)) {
      return res.status(400).json({ error: 'positionSeconds must be a number' });
    }
    const durationSeconds = Math.max(0, Number(result.title.runtime || 0) * 60);
    const positionSeconds = Math.round(Math.min(durationSeconds, Math.max(0, requestedPosition)));
    const completed = durationSeconds > 0 && positionSeconds >= durationSeconds * 0.95;
    db.prepare(`INSERT INTO watch_history
      (user_id, title_id, position_seconds, duration_seconds, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, title_id) DO UPDATE SET
        position_seconds = excluded.position_seconds,
        duration_seconds = excluded.duration_seconds,
        updated_at = excluded.updated_at`)
      .run(req.user.id, result.title.id, positionSeconds, durationSeconds, now().toISOString());
    res.json({ positionSeconds, durationSeconds, completed });
  });

  const reviewSummary = (titleId) => {
    const summary = db.prepare('SELECT ROUND(AVG(rating), 1) AS average, COUNT(*) AS count FROM reviews WHERE title_id = ?').get(titleId);
    const reviews = db.prepare(`SELECT r.id, r.user_id AS userId, r.rating, r.body,
        u.display_name AS displayName, r.created_at AS createdAt, r.updated_at AS updatedAt
      FROM reviews r JOIN users u ON u.id = r.user_id
      WHERE r.title_id = ? ORDER BY r.updated_at DESC, r.id DESC`).all(titleId);
    return { average: summary.average, count: summary.count, reviews };
  };

  r.get('/:id/reviews', (req, res) => {
    if (!findTitle.get(req.params.id)) return res.status(404).json({ error: 'Title not found' });
    res.json(reviewSummary(req.params.id));
  });

  r.put('/:id/review', requireAuth, (req, res) => {
    if (!findTitle.get(req.params.id)) return res.status(404).json({ error: 'Title not found' });
    const rating = req.body.rating;
    const body = String(req.body.body || '');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be a whole number from 1 to 5' });
    }
    if (body.length > 1000) return res.status(400).json({ error: 'Review must be at most 1000 characters' });
    const existing = db.prepare('SELECT id FROM reviews WHERE user_id = ? AND title_id = ?').get(req.user.id, req.params.id);
    const timestamp = now().toISOString();
    if (existing) {
      db.prepare('UPDATE reviews SET rating = ?, body = ?, updated_at = ? WHERE id = ?')
        .run(rating, body, timestamp, existing.id);
    } else {
      db.prepare(`INSERT INTO reviews (user_id, title_id, rating, body, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(req.user.id, req.params.id, rating, body, timestamp, timestamp);
    }
    const saved = reviewSummary(req.params.id).reviews.find((review) => review.userId === req.user.id);
    res.status(existing ? 200 : 201).json(saved);
  });

  r.delete('/:id/review', requireAuth, (req, res) => {
    const result = db.prepare('DELETE FROM reviews WHERE user_id = ? AND title_id = ?').run(req.user.id, req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'Review not found' });
    res.status(204).end();
  });

  // Story 23, FR-2.3: seasons and episodes
  const episodeJson = (e) => ({ id: e.id, season: e.season, episode: e.episode, name: e.name, runtime: e.runtime, synopsis: e.synopsis });
  const findEpisode = db.prepare('SELECT * FROM episodes WHERE id = ? AND title_id = ?');

  r.get('/:id/episodes', (req, res) => {
    const title = findTitle.get(req.params.id);
    if (!title) return res.status(404).json({ error: 'Title not found' });
    const rows = db.prepare('SELECT * FROM episodes WHERE title_id = ? ORDER BY season, episode').all(title.id);
    const seasons = [];
    for (const row of rows) {
      if (!seasons.length || seasons[seasons.length - 1].season !== row.season) seasons.push({ season: row.season, episodes: [] });
      seasons[seasons.length - 1].episodes.push(episodeJson(row));
    }
    res.json({ titleId: title.id, seasons });
  });

  r.post('/:id/episodes', ...canEdit, (req, res) => {
    const title = findTitle.get(req.params.id);
    if (!title) return res.status(404).json({ error: 'Title not found' });
    if (title.type !== 'show') return res.status(400).json({ error: 'Episodes can only be added to shows' });
    const season = Number(req.body.season);
    const episode = Number(req.body.episode);
    const name = String(req.body.name || '').trim();
    const runtime = req.body.runtime === undefined || req.body.runtime === '' ? 45 : Number(req.body.runtime);
    const errors = [];
    if (!Number.isInteger(season) || season < 1 || season > 99) errors.push('season must be a whole number from 1 to 99');
    if (!Number.isInteger(episode) || episode < 1 || episode > 99) errors.push('episode must be a whole number from 1 to 99');
    if (!name || name.length > 120) errors.push('name is required (up to 120 characters)');
    if (!Number.isInteger(runtime) || runtime < 1 || runtime > 300) errors.push('runtime must be 1 to 300 minutes');
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });
    if (db.prepare('SELECT id FROM episodes WHERE title_id = ? AND season = ? AND episode = ?').get(title.id, season, episode)) {
      return res.status(409).json({ error: `Season ${season}, episode ${episode} already exists` });
    }
    const info = db.prepare('INSERT INTO episodes (title_id, season, episode, name, runtime, synopsis) VALUES (?, ?, ?, ?, ?, ?)')
      .run(title.id, season, episode, name, runtime, String(req.body.synopsis || '').trim());
    res.status(201).json(episodeJson(db.prepare('SELECT * FROM episodes WHERE id = ?').get(info.lastInsertRowid)));
  });

  r.delete('/:id/episodes/:episodeId', ...canEdit, (req, res) => {
    const info = db.prepare('DELETE FROM episodes WHERE id = ? AND title_id = ?').run(req.params.episodeId, req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Episode not found' });
    res.status(204).end();
  });

  // Progress for each episode of a show, for the signed-in user
  r.get('/:id/episodes/progress', requireAuth, (req, res) => {
    const rows = db.prepare(`SELECT p.episode_id AS episodeId, p.position_seconds AS positionSeconds,
        p.duration_seconds AS durationSeconds, p.updated_at AS updatedAt
      FROM episode_progress p JOIN episodes e ON e.id = p.episode_id
      WHERE p.user_id = ? AND e.title_id = ?`).all(req.user.id, req.params.id);
    res.json(rows.map((row) => ({ ...row, completed: row.positionSeconds >= row.durationSeconds * 0.95 })));
  });

  // Watching an episode saves its own position and moves the show's Continue Watching entry to it
  r.post('/:id/episodes/:episodeId/progress', requireAuth, (req, res) => {
    const result = access(req.user, req.params.id);
    if (result.status) return res.status(result.status).json(result.body);
    const episode = findEpisode.get(req.params.episodeId, result.title.id);
    if (!episode) return res.status(404).json({ error: 'Episode not found' });
    const requested = Number(req.body.positionSeconds);
    if (!Number.isFinite(requested)) return res.status(400).json({ error: 'positionSeconds must be a number' });
    const durationSeconds = episode.runtime * 60;
    const positionSeconds = Math.round(Math.min(durationSeconds, Math.max(0, requested)));
    const updatedAt = now().toISOString();
    db.prepare(`INSERT INTO episode_progress (user_id, episode_id, position_seconds, duration_seconds, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, episode_id) DO UPDATE SET
        position_seconds = excluded.position_seconds, duration_seconds = excluded.duration_seconds, updated_at = excluded.updated_at`)
      .run(req.user.id, episode.id, positionSeconds, durationSeconds, updatedAt);
    db.prepare(`INSERT INTO watch_history (user_id, title_id, position_seconds, duration_seconds, updated_at, last_episode_id)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, title_id) DO UPDATE SET
        position_seconds = excluded.position_seconds, duration_seconds = excluded.duration_seconds,
        updated_at = excluded.updated_at, last_episode_id = excluded.last_episode_id`)
      .run(req.user.id, result.title.id, positionSeconds, durationSeconds, updatedAt, episode.id);
    res.json({ episodeId: episode.id, positionSeconds, durationSeconds, completed: positionSeconds >= durationSeconds * 0.95 });
  });

  // FR-2.7: detail page
  r.get('/:id', (req, res) => {
    const t = db.prepare('SELECT * FROM titles WHERE id = ? AND deleted = 0').get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Title not found' });
    res.json(t);
  });

  // FR-2.1: add title
  r.post('/', ...canEdit, (req, res) => {
    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });
    const data = Object.fromEntries(FIELDS.map((f) => [f, req.body[f] ?? null]));
    data.rating = data.rating ?? 0; data.tier = data.tier ?? 'basic';
    data.synopsis = data.synopsis ?? ''; data.cast_list = data.cast_list ?? '';
    const info = db.prepare(`INSERT INTO titles (${FIELDS.join(',')}) VALUES (${FIELDS.map((f) => '@' + f).join(',')})`).run(data);
    res.status(201).json(db.prepare('SELECT * FROM titles WHERE id = ?').get(info.lastInsertRowid));
  });

  // FR-2.2: edit title
  r.put('/:id', ...canEdit, (req, res) => {
    const existing = db.prepare('SELECT * FROM titles WHERE id = ? AND deleted = 0').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Title not found' });
    const errors = validate(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });
    const updates = FIELDS.filter((f) => req.body[f] !== undefined);
    if (updates.length) {
      db.prepare(`UPDATE titles SET ${updates.map((f) => `${f} = @${f}`).join(', ')} WHERE id = @id`)
        .run({ ...Object.fromEntries(updates.map((f) => [f, req.body[f]])), id: existing.id });
    }
    res.json(db.prepare('SELECT * FROM titles WHERE id = ?').get(existing.id));
  });

  // FR-2.2: soft delete
  r.delete('/:id', ...canEdit, (req, res) => {
    const info = db.prepare('UPDATE titles SET deleted = 1 WHERE id = ? AND deleted = 0').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Title not found' });
    res.status(204).end();
  });

  return r;
};
