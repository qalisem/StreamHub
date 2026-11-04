const express = require('express');
const { requireAuth } = require('../middleware/auth');

module.exports = (db) => {
  const router = express.Router();
  router.use(requireAuth);

  const rowsFor = (userId) => db.prepare(`SELECT
      h.title_id AS titleId, t.name, t.poster_url AS posterUrl,
      h.position_seconds AS positionSeconds, h.duration_seconds AS durationSeconds,
      h.updated_at AS updatedAt
    FROM watch_history h JOIN titles t ON t.id = h.title_id
    WHERE h.user_id = ? AND t.deleted = 0
    ORDER BY h.updated_at DESC, h.title_id DESC`).all(userId).map((row) => ({
    ...row,
    percent: row.durationSeconds > 0 ? Math.round(row.positionSeconds * 100 / row.durationSeconds) : 0,
  }));

  router.get('/continue', (req, res) => {
    const rows = rowsFor(req.user.id)
      .filter((row) => row.positionSeconds > 0 && row.positionSeconds < row.durationSeconds * 0.95)
      .slice(0, 10);
    res.json(rows);
  });

  router.get('/', (req, res) => res.json(rowsFor(req.user.id)));

  return router;
};
