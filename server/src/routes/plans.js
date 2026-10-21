const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (_req, res) => {
    const plans = db.prepare('SELECT * FROM plans ORDER BY rank').all();
    res.json(plans);
  });

  return router;
};
