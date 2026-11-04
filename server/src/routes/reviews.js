const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');

module.exports = (db) => {
  const router = express.Router();
  router.delete('/:id', requireAuth, requireRole('admin', 'content_manager'), (req, res) => {
    const result = db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'Review not found' });
    res.status(204).end();
  });
  return router;
};
