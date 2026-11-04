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
