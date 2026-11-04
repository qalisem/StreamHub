const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');

const ROLES = ['subscriber', 'content_manager', 'admin'];

module.exports = (db) => {
  const router = express.Router();
  router.use(requireAuth, requireRole('admin'));

  const publicUser = (row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    active: Boolean(row.active),
    subscription: row.plan_code ? {
      plan: row.plan_code,
      status: row.subscription_status,
      periodEnd: row.period_end,
    } : null,
  });

  const userRow = (id) => db.prepare(`SELECT u.*,
      s.plan_code, s.status AS subscription_status, s.period_end
    FROM users u
    LEFT JOIN subscriptions s ON s.id = (
      SELECT id FROM subscriptions WHERE user_id = u.id ORDER BY id DESC LIMIT 1
    )
    WHERE u.id = ?`).get(id);

  router.get('/users', (req, res) => {
    const q = `%${String(req.query.q || '').trim()}%`;
    const rows = db.prepare(`SELECT u.*,
        s.plan_code, s.status AS subscription_status, s.period_end
      FROM users u
      LEFT JOIN subscriptions s ON s.id = (
        SELECT id FROM subscriptions WHERE user_id = u.id ORDER BY id DESC LIMIT 1
      )
      WHERE u.email LIKE ? OR u.display_name LIKE ?
      ORDER BY u.email COLLATE NOCASE`).all(q, q);
    res.json(rows.map(publicUser));
  });

  router.patch('/users/:id', (req, res) => {
    const existing = userRow(req.params.id);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    if (req.body.role !== undefined && !ROLES.includes(req.body.role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const isSelf = existing.id === req.user.id;
    if (isSelf && (req.body.active === false || (req.body.role && req.body.role !== 'admin'))) {
      return res.status(400).json({ error: 'You cannot deactivate or demote your own account' });
    }
    const active = req.body.active === undefined ? existing.active : (req.body.active ? 1 : 0);
    const role = req.body.role === undefined ? existing.role : req.body.role;
    db.prepare('UPDATE users SET active = ?, role = ? WHERE id = ?').run(active, role, existing.id);
    res.json(publicUser(userRow(existing.id)));
  });

  router.post('/users/:id/subscription/extend', (req, res) => {
    const days = req.body.days;
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      return res.status(400).json({ error: 'Days must be an integer from 1 to 90' });
    }
    const subscription = db.prepare(`SELECT * FROM subscriptions
      WHERE user_id = ? AND status IN ('active','cancelled','past_due') ORDER BY id DESC LIMIT 1`).get(req.params.id);
    if (!subscription) return res.status(404).json({ error: 'Current subscription not found' });
    const periodEnd = new Date(new Date(subscription.period_end).getTime() + days * 86400000).toISOString();
    db.prepare('UPDATE subscriptions SET period_end = ? WHERE id = ?').run(periodEnd, subscription.id);
    res.json({ subscription: { plan: subscription.plan_code, status: subscription.status, periodEnd } });
  });

  router.post('/users/:id/subscription/cancel', (req, res) => {
    const subscription = db.prepare(`SELECT * FROM subscriptions
      WHERE user_id = ? AND status IN ('active','past_due') ORDER BY id DESC LIMIT 1`).get(req.params.id);
    if (!subscription) return res.status(404).json({ error: 'Current subscription not found' });
    db.prepare("UPDATE subscriptions SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?").run(subscription.id);
    res.json({ subscription: { plan: subscription.plan_code, status: 'cancelled', periodEnd: subscription.period_end } });
  });

  router.put('/plans/:code', (req, res) => {
    const priceCents = req.body.priceCents;
    if (!Number.isInteger(priceCents) || priceCents <= 0) {
      return res.status(400).json({ error: 'Price must be a positive integer number of cents' });
    }
    const result = db.prepare('UPDATE plans SET price_cents = ? WHERE code = ?').run(priceCents, req.params.code);
    if (!result.changes) return res.status(404).json({ error: 'Plan not found' });
    res.json(db.prepare('SELECT * FROM plans WHERE code = ?').get(req.params.code));
  });

  return router;
};
