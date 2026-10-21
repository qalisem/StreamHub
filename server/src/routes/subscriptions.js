const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { charge } = require('../payments');

const DAY_MS = 86400000;

module.exports = (db, { now = () => new Date() } = {}) => {
  const router = express.Router();
  const getPlan = db.prepare('SELECT * FROM plans WHERE code = ?');
  const getCurrent = db.prepare(`SELECT
      s.*,
      p.name AS plan_name, p.price_cents, p.quality, p.screens, p.rank,
      pp.name AS pending_name, pp.price_cents AS pending_price_cents,
      pp.quality AS pending_quality, pp.screens AS pending_screens, pp.rank AS pending_rank
    FROM subscriptions s
    JOIN plans p ON p.code = s.plan_code
    LEFT JOIN plans pp ON pp.code = s.pending_plan_code
    WHERE s.user_id = ? AND s.status IN ('active','cancelled','past_due')`);

  const planJson = (code, name, priceCents, quality, screens, rank) => ({
    code, name, price_cents: priceCents, quality, screens, rank,
  });

  const serialize = (subscription) => {
    if (!subscription) return null;
    return {
      id: subscription.id,
      status: subscription.status,
      plan: planJson(subscription.plan_code, subscription.plan_name, subscription.price_cents,
        subscription.quality, subscription.screens, subscription.rank),
      cardLast4: subscription.card_last4,
      startedAt: subscription.started_at,
      periodEnd: subscription.period_end,
      cancelledAt: subscription.cancelled_at,
      pendingPlan: subscription.pending_plan_code
        ? planJson(subscription.pending_plan_code, subscription.pending_name, subscription.pending_price_cents,
          subscription.pending_quality, subscription.pending_screens, subscription.pending_rank)
        : null,
    };
  };

  router.get('/subscription', requireAuth, (req, res) => {
    res.json({ subscription: serialize(getCurrent.get(req.user.id)) });
  });

  router.post('/subscription', requireAuth, (req, res) => {
    const plan = getPlan.get(String(req.body.planCode || '').toLowerCase());
    if (!plan) return res.status(400).json({ error: 'Choose a valid plan' });
    if (getCurrent.get(req.user.id)) return res.status(409).json({ error: 'You already have a current plan' });

    let payment;
    try {
      payment = charge(req.body.card, now);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const createdAt = now();
    if (payment.status === 'declined') {
      db.prepare(`INSERT INTO payments
        (user_id, subscription_id, plan_code, amount_cents, card_last4, status, description, created_at)
        VALUES (?, NULL, ?, ?, ?, 'declined', ?, ?)`)
        .run(req.user.id, plan.code, plan.price_cents, payment.last4,
          `Declined ${plan.name} subscription`, createdAt.toISOString());
      return res.status(402).json({ error: 'Payment was declined' });
    }

    const periodEnd = new Date(createdAt.getTime() + 30 * DAY_MS);
    const createSubscription = db.transaction(() => {
      const result = db.prepare(`INSERT INTO subscriptions
        (user_id, plan_code, status, card_last4, started_at, period_end)
        VALUES (?, ?, 'active', ?, ?, ?)`)
        .run(req.user.id, plan.code, payment.last4, createdAt.toISOString(), periodEnd.toISOString());
      db.prepare(`INSERT INTO payments
        (user_id, subscription_id, plan_code, amount_cents, card_last4, status, description, created_at)
        VALUES (?, ?, ?, ?, ?, 'succeeded', ?, ?)`)
        .run(req.user.id, result.lastInsertRowid, plan.code, plan.price_cents, payment.last4,
          `${plan.name} subscription`, createdAt.toISOString());
      return getCurrent.get(req.user.id);
    });

    res.status(201).json({ subscription: serialize(createSubscription()) });
  });

  return router;
};
