const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

function createApp(db, { now = () => new Date(), uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads') } = {}) {
  const app = express();
  app.use(cors());
  app.use('/api/titles/:id/poster', express.json({ limit: '3mb' })); // Story 24: room for a 2 MB image
  app.use(express.json());
  app.use('/uploads', express.static(uploadDir), (_req, res) => res.status(404).end());
  app.use(require('./middleware/auth').rejectDeactivated(db));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', require('./routes/auth')(db, { now }));
  app.use('/api/plans', require('./routes/plans')(db));
  app.use('/api', require('./routes/subscriptions')(db, { now }));
  app.use('/api/watchlist', require('./routes/watchlist')(db, { now }));
  app.use('/api/history', require('./routes/history')(db));
  app.use('/api/admin', require('./routes/admin')(db));
  app.use('/api/reviews', require('./routes/reviews')(db));
  app.use('/api/titles', require('./routes/titles')(db, { now, uploadDir }));

  // Serve the built React client in production
  const dist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });
  return app;
}

module.exports = { createApp };
