const express = require('express');
const { requireAuth } = require('../middleware/auth');

module.exports = (db, { now = () => new Date() } = {}) => {
  const router = express.Router();

  router.use(requireAuth);

  router.post('/', (req, res) => {
    const titleId = Number(req.body.titleId);
    const title = db.prepare('SELECT id FROM titles WHERE id = ? AND deleted = 0').get(titleId);
    if (!title) return res.status(404).json({ error: 'Title not found' });

    const result = db.prepare(`INSERT OR IGNORE INTO watchlist (user_id, title_id, added_at)
      VALUES (?, ?, ?)`).run(req.user.id, titleId, now().toISOString());
    res.status(result.changes ? 201 : 200).json({ titleId, added: Boolean(result.changes) });
  });

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT
        w.title_id AS titleId, t.name, t.poster_url AS posterUrl, t.tier, w.added_at AS addedAt
      FROM watchlist w JOIN titles t ON t.id = w.title_id
      WHERE w.user_id = ? AND t.deleted = 0
      ORDER BY w.added_at DESC, w.title_id DESC`).all(req.user.id);
    res.json(rows);
  });

  router.delete('/:titleId', (req, res) => {
    const result = db.prepare('DELETE FROM watchlist WHERE user_id = ? AND title_id = ?')
      .run(req.user.id, req.params.titleId);
    if (!result.changes) return res.status(404).json({ error: 'Title is not in your watchlist' });
    res.status(204).end();
  });

  return router;
};
