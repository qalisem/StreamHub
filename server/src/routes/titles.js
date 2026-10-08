const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');

const FIELDS = ['name', 'type', 'genre', 'year', 'rating', 'runtime', 'synopsis', 'cast_list', 'poster_url', 'trailer_url', 'tier'];
const SORTS = { newest: 'year DESC, id DESC', rating: 'rating DESC, name ASC', az: 'name COLLATE NOCASE ASC' };
const PAGE_SIZE = 20; // FR-2.4

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

module.exports = (db) => {
  const r = express.Router();
  const canEdit = [requireAuth, requireRole('admin', 'content_manager')];

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
      `SELECT id, name, type, genre, year, rating, poster_url, tier FROM titles WHERE ${clause} ORDER BY ${order} LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`
    ).all(params);
    res.json({ items, page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
  });

  r.get('/genres', (_req, res) => {
    res.json(db.prepare('SELECT DISTINCT genre FROM titles WHERE deleted = 0 ORDER BY genre').all().map((g) => g.genre));
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
